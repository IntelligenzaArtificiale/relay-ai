import type { AgentEvent, ProviderId } from '../core/types.js';
import { renderOnboarding } from './screens/onboarding.js';
import { renderWorkspace } from './screens/workspace.js';
import { patchChatRun } from './screens/chat.js';
import type { ChatAttachment, ChatDraft, SavedChatAttachment, SectionId, StreamRun, UiRuntime, WorkspaceViewState } from './types.js';

interface VsCodeApi<T> {
  postMessage(message: unknown): void;
  getState(): T | undefined;
  setState(state: T): void;
}

declare function acquireVsCodeApi<T = unknown>(): VsCodeApi<T>;

interface PersistedUiState {
  section: SectionId;
  search: string;
  selectedRuleId?: string;
  onboardingStep: number;
  drafts?: Record<string, string | { text?: string }>;
  expandedPanels?: string[];
  expandedProjects?: string[];
  projectsVisibleLimit?: number;
  projectSearch?: string;
  unseenByConversation?: Record<string, 'done' | 'error'>;
}

interface RelayBootBridge {
  vscode: VsCodeApi<PersistedUiState>;
  pendingMessages: unknown[];
  mainReady: boolean;
  startedAt: number;
}

declare global {
  interface Window {
    __relayBootBridge?: RelayBootBridge;
    __relayRendered?: boolean;
  }
}

const VALID_SECTIONS: readonly SectionId[] = ['chat', 'projects', 'agents', 'usage', 'rules', 'mcp', 'automations', 'remote', 'diagnostics', 'settings'];

const bootBridge = window.__relayBootBridge;
const vscode = bootBridge?.vscode ?? acquireVsCodeApi<PersistedUiState>();
const rootElement = document.querySelector<HTMLDivElement>('#app');
if (!rootElement) throw new Error('Relay root element not found.');
const root: HTMLDivElement = rootElement;
const persisted = safePersistedState(vscode.getState());
let toastSequence = 0;
let renderScheduled = false;
let renderTimer: number | undefined;
const bootStartedAt = Date.now();
let lastRenderError = '';
let bootFailure = '';
let bootTicker: number | undefined;
let transientFocus: { id: string; start?: number; end?: number } | undefined;
const pendingRunPatches = new Set<string>();
let runPatchFrame: number | undefined;
const attachmentRequests = new Map<string, { resolve: (files: SavedChatAttachment[]) => void; reject: (error: Error) => void }>();

const runtime: UiRuntime = {
  state: null,
  section: normalizeSection(persisted?.section),
  onboardingStep: persisted?.onboardingStep ?? 0,
  search: persisted?.search ?? '',
  ...(persisted?.selectedRuleId ? { selectedRuleId: persisted.selectedRuleId } : {}),
  streams: new Map(),
  drafts: normalizeDrafts(persisted?.drafts),
  scrollByConversation: {},
  scrollBySection: {},
  historyOpen: false,
  usageOpen: false,
  pendingComposerFocus: false,
  expandedPanels: new Set(persisted?.expandedPanels ?? []),
  expandedProjects: new Set(),
  projectsVisibleLimit: persisted?.projectsVisibleLimit ?? 5,
  projectSearch: persisted?.projectSearch ?? '',
  unseen: { ...(persisted?.unseenByConversation ?? {}) },
  post(message: unknown) { vscode.postMessage(message); },
  setSection(section: SectionId) {
    captureTransientUi();
    runtime.section = normalizeSection(section);
    runtime.historyOpen = false;
    runtime.usageOpen = false;
    persistUi();
    render();
  },
  render: render,
  saveAttachments
};

document.addEventListener('pointerdown', (event) => {
  const target = event.target as Node | null;
  const openPicker = document.querySelector<HTMLDetailsElement>('details.composer-picker[open]');
  const pickerMenu = target instanceof Element ? target.closest<HTMLElement>('[data-picker-menu-owner]') : null;
  if (openPicker && target && !openPicker.contains(target) && pickerMenu?.dataset.pickerMenuOwner !== openPicker.dataset.picker) {
    openPicker.open = false;
  }
  const openMenu = document.querySelector<HTMLDetailsElement>('details.conversation-menu[open]');
  if (openMenu && target && !openMenu.contains(target)) openMenu.open = false;
  if (runtime.usageOpen && target) {
    const element = target instanceof Element ? target : target.parentElement;
    if (!element?.closest('.usage-popover, .composer-usage-button')) {
      runtime.usageOpen = false;
      scheduleRender();
    }
  }
});


document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const link = target?.closest<HTMLElement>('[data-relay-resource]');
  if (!link?.dataset.relayResource) return;
  event.preventDefault();
  runtime.post({ type: 'openFile', payload: { path: link.dataset.relayResource } });
});

window.addEventListener('error', (event) => {
  if (/ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/i.test(event.message ?? '')) {
    event.preventDefault();
    return;
  }
  reportUiError(event.error ?? new Error(event.message));
});
window.addEventListener('unhandledrejection', (event) => {
  reportUiError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
});
bootTicker = window.setInterval(() => {
  if (!runtime.state) scheduleRender();
  else if (bootTicker !== undefined) { window.clearInterval(bootTicker); bootTicker = undefined; }
}, 1_800);

let readyAcknowledged = false;

function receiveHostMessage(message: any): void {
  if (message?.type === 'webviewAck') {
    readyAcknowledged = true;
    return;
  }
  if (message?.type === 'state') {
    applyState(message.payload as WorkspaceViewState);
  } else if (message?.type === 'usageState') {
    applyUsageState(message.payload as Pick<WorkspaceViewState, 'usage' | 'usageRefreshing'>);
  } else if (message?.type === 'agentEvent') {
    applyAgentEvent(message.payload as AgentEvent);
  } else if (message?.type === 'uiCommand') {
    applyUiCommand(message.payload?.action);
  } else if (message?.type === 'attachmentsSaved') {
    const requestId = String(message.payload?.requestId ?? '');
    const pending = attachmentRequests.get(requestId);
    if (pending) {
      attachmentRequests.delete(requestId);
      if (message.payload?.error) pending.reject(new Error(String(message.payload.error)));
      else pending.resolve(Array.isArray(message.payload?.files) ? message.payload.files as SavedChatAttachment[] : []);
    }
  } else if (message?.type === 'skillImportPreview') {
    (runtime as any).skillImportPreview = message.payload;
    scheduleRender();
  } else if (message?.type === 'initializationError') {
    bootFailure = String(message.payload?.message ?? 'Avvio Relay non completato.');
    scheduleRender();
  } else if (message?.type === 'notice') {
    const toast = { ...message.payload, id: ++toastSequence };
    runtime.toast = toast;
    scheduleRender();
    const id = toast.id;
    setTimeout(() => {
      if (runtime.toast?.id === id) {
        delete runtime.toast;
        scheduleRender();
      }
    }, message.payload.level === 'error' ? 8000 : 4500);
  }
}

window.addEventListener('message', (event) => receiveHostMessage(event.data));
if (bootBridge) {
  bootBridge.mainReady = true;
  for (const message of bootBridge.pendingMessages.splice(0)) receiveHostMessage(message);
}

const announceReady = () => runtime.post({ type: 'webviewReady' });
announceReady();
const readyRetry = window.setInterval(() => {
  if (readyAcknowledged) {
    window.clearInterval(readyRetry);
    return;
  }
  announceReady();
}, 500);
window.setTimeout(() => window.clearInterval(readyRetry), 10_000);

// Live clocks for running jobs. A full re-render every second would fight the
// user's scroll position and focus, so tick only the elapsed labels in place.
window.setInterval(() => {
  const labels = document.querySelectorAll<HTMLElement>('[data-elapsed-start]');
  for (const label of labels) {
    const startedAt = Number(label.dataset.elapsedStart);
    if (!Number.isFinite(startedAt)) continue;
    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    label.textContent = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
}, 1000);

render();

function applyState(state: WorkspaceViewState): void {
  (window as any).__relayRendered = true;
  captureTransientUi();
  const previousConversationId = runtime.state?.conversation.id;
  const wasOnboarded = runtime.state?.onboardingComplete ?? state.onboardingComplete;
  runtime.state = state;
  bootFailure = '';
  if (bootTicker !== undefined) { window.clearInterval(bootTicker); bootTicker = undefined; }
  if (wasOnboarded && !state.onboardingComplete) runtime.onboardingStep = 0;

  const persistedRunIds = new Set(state.conversation.messages.filter((message) => message.role === 'assistant').map((message) => message.runId).filter(Boolean));
  const activeIds = new Set(state.activeRuns.map((run) => run.id));
  for (const [runId, stream] of runtime.streams) {
    if (persistedRunIds.has(runId) && !activeIds.has(runId)) runtime.streams.delete(runId);
    else if (!activeIds.has(runId) && isTerminalPhase(stream.phase)) runtime.streams.delete(runId);
  }

  for (const run of state.activeRuns) {
    // Failures are surfaced through state snapshots rather than a dedicated
    // error event: badge them for background conversations here.
    if (run.kind !== 'delegation' && run.phase === 'failed' && run.conversationId !== state.conversation.id) {
      runtime.unseen[run.conversationId] = 'error';
    }
    const existing = runtime.streams.get(run.id);
    if (existing) {
      existing.status = run.status;
      existing.phase = run.phase;
      existing.provider = run.provider;
      existing.conversationId = run.conversationId;
      if (run.kind) existing.kind = run.kind; else delete existing.kind;
      if (run.parentRunId) existing.parentRunId = run.parentRunId; else delete existing.parentRunId;
      if (run.rootRunId) existing.rootRunId = run.rootRunId; else delete existing.rootRunId;
      if (run.taskLabel) existing.taskLabel = run.taskLabel; else delete existing.taskLabel;
      if (run.model) existing.model = run.model; else delete existing.model;
      if (run.reasoning) existing.reasoning = run.reasoning; else delete existing.reasoning;
      if ((run as any).agentId) existing.agentId = String((run as any).agentId); else delete existing.agentId;
      if ((run as any).agentName) existing.agentName = String((run as any).agentName); else delete existing.agentName;
      if (run.error) existing.error = run.error; else delete existing.error;
      if (run.failure) existing.failure = run.failure; else delete existing.failure;
      existing.activities = run.activities.map((activity) => ({
        title: activity.title,
        ...(activity.detail ? { detail: activity.detail } : {})
      }));
      continue;
    }
    runtime.streams.set(run.id, {
      runId: run.id,
      conversationId: run.conversationId,
      provider: run.provider,
      text: '',
      status: run.status,
      phase: run.phase,
      activities: run.activities.map((activity) => ({ title: activity.title, ...(activity.detail ? { detail: activity.detail } : {}) })),
      startedAt: new Date(run.startedAt).getTime(),
      ...(run.error ? { error: run.error } : {}),
      ...(run.model ? { model: run.model } : {}),
      ...(run.reasoning ? { reasoning: run.reasoning } : {}),
      ...((run as any).agentId ? { agentId: String((run as any).agentId) } : {}),
      ...((run as any).agentName ? { agentName: String((run as any).agentName) } : {}),
      ...(run.kind ? { kind: run.kind } : {}),
      ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
      ...(run.rootRunId ? { rootRunId: run.rootRunId } : {}),
      ...(run.taskLabel ? { taskLabel: run.taskLabel } : {})
    });
  }

  if (previousConversationId !== state.conversation.id && !runtime.scrollByConversation[state.conversation.id]) {
    runtime.scrollByConversation[state.conversation.id] = { top: 0, stickToBottom: true };
  }
  // The visible conversation is by definition "seen": clear its completion badge
  // and drop badges for conversations that no longer exist.
  if (runtime.unseen[state.conversation.id]) delete runtime.unseen[state.conversation.id];
  const knownIds = new Set(state.conversations.map((conversation) => conversation.id));
  for (const id of Object.keys(runtime.unseen)) {
    if (!knownIds.has(id)) delete runtime.unseen[id];
  }
  persistUi();
  scheduleRender();
}

function applyUsageState(payload: Pick<WorkspaceViewState, 'usage' | 'usageRefreshing'>): void {
  if (!runtime.state) return;
  runtime.state = {
    ...runtime.state,
    usage: payload.usage,
    usageRefreshing: payload.usageRefreshing
  };
  // Usage polling must not tear down forms in Settings or Rules. Re-render only
  // screens that visibly expose live quota information.
  if (!runtime.state.onboardingComplete || runtime.section === 'usage' || (runtime.section === 'chat' && runtime.usageOpen)) scheduleRender();
}

function applyAgentEvent(event: AgentEvent): void {
  const run = ensureStream(event.runId);
  if (event.type === 'status') {
    run.status = event.message;
    run.phase = event.phase ?? run.phase;
  } else if (event.type === 'delta') {
    appendVisibleStreamText(run, event.text);
    if (run.delegationProtocolHidden) {
      run.phase = 'delegating';
      run.status = 'Preparazione della delega…';
    } else {
      run.phase = 'working';
      run.status = 'Risposta in corso…';
    }
  } else if (event.type === 'replace') {
    replaceVisibleStreamText(run, event.text);
    run.phase = run.delegationProtocolHidden ? 'delegating' : 'working';
    if (run.delegationProtocolHidden) run.status = 'Preparazione della delega…';
  } else if (event.type === 'activity') {
    run.phase = 'working';
    run.status = event.title;
    run.activities.push({ title: event.title, ...(event.detail ? { detail: event.detail } : {}) });
    run.activities = run.activities.slice(-30);
  } else if (event.type === 'error') {
    run.failure = event.failure;
    run.error = event.failure?.message ?? event.message;
    run.status = event.failure?.message ?? event.message;
    run.phase = event.failure?.category === 'rate-limit' ? 'rate-limited' : event.failure?.category === 'permission-denied' ? 'permission-denied' : event.failure?.category === 'authentication' ? 'authentication' : 'failed';
  } else if (event.type === 'complete') {
    run.phase = 'completed';
    run.status = 'Completato';
    flushVisibleStreamBuffer(run);
    if (!run.text && !run.delegationProtocolHidden) replaceVisibleStreamText(run, event.result.text);
    if (event.result.model) run.model = event.result.model;
  }

  // Micro-notification: a primary job finishing while the user is looking at
  // another conversation earns a quiet "unseen" badge on that chat.
  if ((event.type === 'complete' || event.type === 'error') && run.kind !== 'delegation' && run.conversationId) {
    if (run.conversationId !== runtime.state?.conversation.id) {
      runtime.unseen[run.conversationId] = event.type === 'error' ? 'error' : 'done';
      persistUi();
    }
  }

  const snapshot = runtime.scrollByConversation[run.conversationId];
  if (!snapshot || snapshot.stickToBottom) {
    runtime.scrollByConversation[run.conversationId] = { top: snapshot?.top ?? 0, stickToBottom: true };
  }
  if (runtime.state?.onboardingComplete && runtime.section === 'chat') scheduleRunPatch(event.runId);
  else if (event.type !== 'delta') scheduleRender();
}

function scheduleRunPatch(runId: string): void {
  pendingRunPatches.add(runId);
  if (runPatchFrame !== undefined) return;
  runPatchFrame = requestAnimationFrame(() => {
    runPatchFrame = undefined;
    let fallback = false;
    for (const id of pendingRunPatches) {
      if (!patchChatRun(runtime, id)) fallback = true;
    }
    pendingRunPatches.clear();
    if (fallback) scheduleRender();
  });
}


const DELEGATION_PROTOCOL_OPEN = '<relay-delegate>';

function appendVisibleStreamText(run: StreamRun, delta: string): void {
  if (run.delegationProtocolHidden || !delta) return;
  const combined = `${run.delegationProtocolBuffer ?? ''}${delta}`;
  const openAt = combined.indexOf(DELEGATION_PROTOCOL_OPEN);
  if (openAt >= 0) {
    run.text += combined.slice(0, openAt);
    run.delegationProtocolBuffer = '';
    run.delegationProtocolHidden = true;
    return;
  }
  const retained = delegationProtocolPrefixLength(combined);
  run.text += retained > 0 ? combined.slice(0, -retained) : combined;
  run.delegationProtocolBuffer = retained > 0 ? combined.slice(-retained) : '';
}

function replaceVisibleStreamText(run: StreamRun, text: string): void {
  run.text = '';
  run.delegationProtocolBuffer = '';
  run.delegationProtocolHidden = false;
  appendVisibleStreamText(run, text);
}

function flushVisibleStreamBuffer(run: StreamRun): void {
  if (!run.delegationProtocolHidden && run.delegationProtocolBuffer) run.text += run.delegationProtocolBuffer;
  run.delegationProtocolBuffer = '';
}

function isTerminalPhase(phase: string | undefined): boolean {
  return phase === 'completed'
    || phase === 'failed'
    || phase === 'cancelled'
    || phase === 'rate-limited'
    || phase === 'permission-denied'
    || phase === 'authentication';
}

function delegationProtocolPrefixLength(text: string): number {
  const max = Math.min(text.length, DELEGATION_PROTOCOL_OPEN.length - 1);
  for (let length = max; length > 0; length -= 1) {
    if (DELEGATION_PROTOCOL_OPEN.startsWith(text.slice(-length))) return length;
  }
  return 0;
}

function applyUiCommand(action: string | undefined): void {
  if (action === 'open-chat') {
    runtime.section = 'chat';
    runtime.historyOpen = false;
    runtime.usageOpen = false;
  } else if (action === 'focus-composer') {
    runtime.section = 'chat';
    runtime.pendingComposerFocus = true;
  } else if (action === 'open-history') {
    runtime.historyOpen = true;
  } else if (action === 'open-projects') {
    runtime.section = 'projects';
    runtime.historyOpen = false;
    runtime.usageOpen = false;
  } else if (action === 'open-agents') {
    runtime.section = 'agents';
    runtime.historyOpen = false;
    runtime.usageOpen = false;
  } else if (action === 'open-usage') {
    runtime.section = 'usage';
    runtime.historyOpen = false;
    runtime.usageOpen = false;
  } else if (action === 'open-remote') {
    runtime.section = 'remote';
    runtime.historyOpen = false;
    runtime.usageOpen = false;
  } else if (action === 'close-rule') {
    delete runtime.ruleDraft;
    delete runtime.selectedRuleId;
  } else if (action === 'reset-ui') {
    resetUiState();
    return;
  }
  persistUi();
  scheduleRender();
}

function ensureStream(runId: string): StreamRun {
  const existing = runtime.streams.get(runId);
  if (existing) return existing;
  const active = runtime.state?.activeRuns.find((run) => run.id === runId);
  const provider = active?.provider ?? runtime.state?.conversation.provider ?? 'codex';
  const created: StreamRun = {
    runId,
    conversationId: active?.conversationId ?? runtime.state?.conversation.id ?? '',
    provider: provider as ProviderId,
    text: '',
    status: active?.status ?? 'Avvio agente…',
    phase: active?.phase ?? 'connecting',
    activities: [],
    startedAt: active ? new Date(active.startedAt).getTime() : Date.now(),
    ...(active?.model ? { model: active.model } : {}),
    ...(active?.reasoning ? { reasoning: active.reasoning } : {}),
    ...((active as any)?.agentId ? { agentId: String((active as any).agentId) } : {}),
    ...((active as any)?.agentName ? { agentName: String((active as any).agentName) } : {}),
    ...(active?.kind ? { kind: active.kind } : {}),
    ...(active?.parentRunId ? { parentRunId: active.parentRunId } : {}),
    ...(active?.rootRunId ? { rootRunId: active.rootRunId } : {}),
    ...(active?.taskLabel ? { taskLabel: active.taskLabel } : {})
  };
  runtime.streams.set(runId, created);
  return created;
}

function scheduleRender(delayMs = 0): void {
  if (renderScheduled && delayMs > 0) return;
  if (renderTimer !== undefined) window.clearTimeout(renderTimer);
  renderScheduled = true;
  const execute = () => {
    renderTimer = undefined;
    requestAnimationFrame(() => {
      renderScheduled = false;
      render();
    });
  };
  if (delayMs > 0) renderTimer = window.setTimeout(execute, delayMs);
  else execute();
}

function render(): void {
  try {
    captureTransientUi();
    for (const menu of Array.from(document.body.querySelectorAll<HTMLElement>(':scope > [data-picker-menu-owner]'))) menu.remove();
    root.replaceChildren();
    if (!runtime.state) {
      root.append(renderBootScreen());
      return;
    }
    runtime.section = normalizeSection(runtime.section);
    root.append(runtime.state.onboardingComplete ? renderWorkspace(runtime) : renderOnboarding(runtime));
    runtime.renderedConversationId = runtime.state.conversation.id;
    lastRenderError = '';
    restoreTransientUi();
  } catch (error) {
    renderFailure(error);
  }
}

function renderBootScreen(): HTMLElement {
  const loading = document.createElement('main');
  loading.className = `boot-screen${bootFailure ? ' has-error' : ''}`;
  const stage = Math.floor((Date.now() - bootStartedAt) / 1800) % 3;
  const messages = ['Avvio workspace e storage…', 'Verifica provider locali…', 'Preparazione interfaccia…'];
  loading.innerHTML = '<div class="boot-orbit" aria-hidden="true"><span></span><span></span><span></span><span></span><i></i></div><div class="boot-copy"><strong>Relay</strong><p>'+(bootFailure ? 'Avvio parziale' : messages[stage])+'</p><div class="boot-progress"><span></span></div></div>';
  if (bootFailure || Date.now() - bootStartedAt > 7_000) {
    const recovery = document.createElement('section');
    recovery.className = 'boot-recovery';
    const text = document.createElement('span');
    text.textContent = bootFailure || 'Il caricamento sta richiedendo più del previsto. Relay può aprirsi anche se un controllo opzionale è lento.';
    const retry = document.createElement('button');
    retry.className = 'button button--secondary button--small';
    retry.textContent = 'Riprova';
    retry.addEventListener('click', () => {
      bootFailure = '';
      runtime.post({ type: 'initialize' });
      scheduleRender();
    });
    const reset = document.createElement('button');
    reset.className = 'button button--ghost button--small';
    reset.textContent = 'Ripristina interfaccia';
    reset.addEventListener('click', resetUiState);
    recovery.append(text, retry, reset);
    loading.append(recovery);
  }
  return loading;
}

function renderFailure(error: unknown): void {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const signature = `${normalized.name}:${normalized.message}:${normalized.stack ?? ''}`;
  if (signature !== lastRenderError) {
    lastRenderError = signature;
    reportUiError(normalized);
  }
  root.replaceChildren();
  const failure = document.createElement('main');
  failure.className = 'ui-failure-screen';
  const mark = document.createElement('div');
  mark.className = 'ui-failure-mark';
  mark.textContent = '!';
  const title = document.createElement('strong');
  title.textContent = 'Relay non è riuscito a mostrare questa schermata';
  const message = document.createElement('p');
  message.textContent = normalized.message || 'Stato dell’interfaccia non valido.';
  const actions = document.createElement('div');
  actions.className = 'ui-failure-actions';
  const reset = document.createElement('button');
  reset.className = 'button button--primary';
  reset.textContent = 'Ripristina interfaccia';
  reset.addEventListener('click', resetUiState);
  const diagnostics = document.createElement('button');
  diagnostics.className = 'button button--secondary';
  diagnostics.textContent = 'Apri Diagnostica';
  diagnostics.addEventListener('click', () => { runtime.section = 'diagnostics'; persistUi(); scheduleRender(); });
  actions.append(reset, diagnostics);
  failure.append(mark, title, message, actions);
  root.append(failure);
}

function resetUiState(): void {
  vscode.setState({ section: 'chat', search: '', onboardingStep: 0 });
  runtime.section = 'chat';
  runtime.search = '';
  runtime.onboardingStep = 0;
  runtime.drafts = {};
  runtime.expandedPanels.clear();
  runtime.expandedProjects.clear();
  runtime.projectsVisibleLimit = 5;
  runtime.projectSearch = '';
  runtime.unseen = {};
  delete runtime.selectedRuleId;
  delete runtime.ruleDraft;
  delete runtime.remoteTab;
  delete runtime.remoteHistoryPage;
  lastRenderError = '';
  runtime.post({ type: 'initialize' });
  scheduleRender();
}

function reportUiError(error: Error): void {
  runtime.post({ type: 'reportUiError', payload: { message: error.message, stack: error.stack ?? '' } });
}

function normalizeSection(value: unknown): SectionId {
  return VALID_SECTIONS.includes(value as SectionId) ? value as SectionId : 'chat';
}

function safePersistedState(value: PersistedUiState | undefined): PersistedUiState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return {
    section: normalizeSection(value.section),
    search: typeof value.search === 'string' ? value.search : '',
    onboardingStep: Number.isFinite(value.onboardingStep) ? Math.max(0, Math.floor(value.onboardingStep)) : 0,
    ...(typeof value.selectedRuleId === 'string' ? { selectedRuleId: value.selectedRuleId } : {}),
    ...(value.drafts && typeof value.drafts === 'object' ? { drafts: value.drafts } : {}),
    ...(Array.isArray(value.expandedPanels) ? { expandedPanels: value.expandedPanels.filter((entry): entry is string => typeof entry === 'string') } : {}),
    ...(Number.isFinite(value.projectsVisibleLimit) ? { projectsVisibleLimit: Math.max(1, Math.floor(value.projectsVisibleLimit!)) } : {}),
    ...(typeof value.projectSearch === 'string' ? { projectSearch: value.projectSearch } : {}),
    ...(value.unseenByConversation && typeof value.unseenByConversation === 'object' ? { unseenByConversation: value.unseenByConversation } : {})
  };
}


function normalizeDrafts(value: PersistedUiState['drafts'] | undefined): Record<string, ChatDraft> {
  const result: Record<string, ChatDraft> = {};
  if (!value || typeof value !== 'object') return result;
  for (const [conversationId, draft] of Object.entries(value)) {
    if (typeof draft === 'string') result[conversationId] = { text: draft, attachments: [] };
    else if (draft && typeof draft === 'object') result[conversationId] = { text: typeof draft.text === 'string' ? draft.text : '', attachments: [] };
  }
  return result;
}

function ensureDraft(conversationId: string): ChatDraft {
  return runtime.drafts[conversationId] ??= { text: '', attachments: [] };
}

async function saveAttachments(attachments: ChatAttachment[]): Promise<SavedChatAttachment[]> {
  const payload = await Promise.all(attachments.map(async (attachment) => {
    if (!attachment.file) throw new Error(`Il file ${attachment.name} non è più disponibile nella bozza.`);
    return {
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      bytes: new Uint8Array(await attachment.file.arrayBuffer())
    };
  }));
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      attachmentRequests.delete(requestId);
      reject(new Error('Salvataggio degli allegati non completato entro 30 secondi.'));
    }, 30_000);
    attachmentRequests.set(requestId, {
      resolve(files) { window.clearTimeout(timeout); resolve(files); },
      reject(error) { window.clearTimeout(timeout); reject(error); }
    });
    try {
      runtime.post({ type: 'saveChatAttachments', payload: { requestId, attachments: payload } });
    } catch (error) {
      window.clearTimeout(timeout);
      attachmentRequests.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function captureTransientUi(): void {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    if (active.id) transientFocus = { id: active.id, start: active.selectionStart ?? undefined, end: active.selectionEnd ?? undefined };
  } else if (active instanceof HTMLElement && active.id) {
    transientFocus = { id: active.id };
  }
  const sectionScroll = document.querySelector<HTMLElement>('.content-page');
  if (sectionScroll && runtime.section !== 'chat') runtime.scrollBySection[runtime.section] = sectionScroll.scrollTop;
  const conversationId = runtime.renderedConversationId ?? runtime.state?.conversation.id;
  if (!conversationId) return;
  const textarea = document.querySelector<HTMLTextAreaElement>('#relay-composer-input');
  if (textarea) ensureDraft(conversationId).text = textarea.value;
  const scroll = document.querySelector<HTMLElement>('.message-scroll');
  if (scroll) {
    const distance = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
    runtime.scrollByConversation[conversationId] = {
      top: scroll.scrollTop,
      stickToBottom: distance < 96
    };
  }
}

function restoreTransientUi(): void {
  const sectionScroll = document.querySelector<HTMLElement>('.content-page');
  const sectionTop = runtime.scrollBySection[runtime.section];
  if (sectionScroll && runtime.section !== 'chat' && sectionTop !== undefined) {
    sectionScroll.scrollTop = Math.min(sectionTop, Math.max(0, sectionScroll.scrollHeight - sectionScroll.clientHeight));
    sectionScroll.addEventListener('scroll', () => { runtime.scrollBySection[runtime.section] = sectionScroll.scrollTop; }, { passive: true });
  }
  const conversationId = runtime.state?.conversation.id;
  if (!conversationId) return;
  const scroll = document.querySelector<HTMLElement>('.message-scroll');
  const snapshot = runtime.scrollByConversation[conversationId];
  if (scroll && snapshot) {
    // Restore before the browser paints. Deferring this by one animation frame
    // made the chat visibly jump to the top and then back to the bottom.
    if (snapshot.stickToBottom) scroll.scrollTop = scroll.scrollHeight;
    else scroll.scrollTop = Math.min(snapshot.top, Math.max(0, scroll.scrollHeight - scroll.clientHeight));
    scroll.addEventListener('scroll', () => {
      const distance = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
      runtime.scrollByConversation[conversationId] = { top: scroll.scrollTop, stickToBottom: distance < 96 };
    }, { passive: true });
  }
  const textarea = document.querySelector<HTMLTextAreaElement>('#relay-composer-input');
  if (textarea && runtime.pendingComposerFocus) {
    runtime.pendingComposerFocus = false;
    transientFocus = undefined;
    requestAnimationFrame(() => textarea.focus({ preventScroll: true }));
    return;
  }
  const focus = transientFocus;
  transientFocus = undefined;
  if (!focus) return;
  const node = document.getElementById(focus.id);
  if (!(node instanceof HTMLElement)) return;
  node.focus({ preventScroll: true });
  if ((node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) && focus.start !== undefined) {
    const end = focus.end ?? focus.start;
    node.setSelectionRange(Math.min(focus.start, node.value.length), Math.min(end, node.value.length));
  }
}

function persistUi(): void {
  vscode.setState({
    section: runtime.section,
    search: runtime.search,
    onboardingStep: runtime.onboardingStep,
    drafts: Object.fromEntries(Object.entries(runtime.drafts).map(([id, draft]) => [id, { text: draft.text }])),
    expandedPanels: [...runtime.expandedPanels],
    projectsVisibleLimit: runtime.projectsVisibleLimit,
    projectSearch: runtime.projectSearch,
    unseenByConversation: runtime.unseen,
    ...(runtime.selectedRuleId ? { selectedRuleId: runtime.selectedRuleId } : {})
  });
}

window.addEventListener('beforeunload', () => {
  for (const draft of Object.values(runtime.drafts)) for (const attachment of draft.attachments) if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
  if (bootTicker !== undefined) window.clearInterval(bootTicker);
  if (runPatchFrame !== undefined) cancelAnimationFrame(runPatchFrame);
});
