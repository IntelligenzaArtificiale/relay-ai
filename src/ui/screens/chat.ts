import type {
  ConversationMessage,
  DelegationRecord,
  DelegationTaskRecord,
  ModelOption,
  ProviderId,
  UsageBucket,
  UsageSnapshot
} from '../../core/types.js';
import {
  agentGlyph,
  button,
  compactProviderVersion,
  el,
  formatClock,
  formatPercent,
  formatReset,
  icon,
  iconButton,
  providerGlyph,
  providerLabel
} from '../dom.js';
import { renderMarkdown } from '../markdown.js';
import { groupSkillsByName } from '../../core/skill-utils.js';
import { compactGroup, compactWindow, preferredUsageBucket, usageReferenceLabel, withPreferredUsage } from '../../services/usage-selection.js';
import type { ChatAttachment, ChatDraft, SavedChatAttachment, StreamRun, UiRuntime } from '../types.js';


interface CachedMessageNode { signature: string; node: HTMLElement }
interface CachedStreamMarkdown { parsedText: string; parsedAt: number; node: HTMLElement }
const messageNodeCache = new Map<string, CachedMessageNode>();
const streamMarkdownCache = new Map<string, CachedStreamMarkdown>();
const STREAM_MARKDOWN_INTERVAL_MS = 250;
const MAX_MESSAGE_CACHE = 600;

const MAX_CHAT_ATTACHMENTS = 10;
const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.pdf', '.txt', '.md', '.markdown', '.json', '.jsonl', '.xml', '.yaml', '.yml', '.csv',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.sass', '.less', '.html', '.htm', '.py', '.java', '.kt', '.kts', '.go', '.rs', '.c', '.h', '.cpp', '.hpp', '.cs', '.php', '.rb', '.swift', '.sql', '.graphql', '.gql', '.toml', '.ini', '.conf', '.env', '.log', '.zip', '.gz', '.tgz', '.tar', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
]);

function draftFor(runtime: UiRuntime, conversationId: string): ChatDraft {
  return runtime.drafts[conversationId] ??= { text: '', attachments: [] };
}

function attachmentExtension(name: string): string {
  const match = /\.[^.]+$/.exec(name.toLowerCase());
  return match?.[0] ?? '';
}

function attachmentAllowed(file: File): boolean {
  if (file.type.startsWith('image/') || file.type.startsWith('text/')) return true;
  if (['application/pdf', 'application/json', 'application/xml', 'application/zip', 'application/gzip', 'application/x-tar', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'].includes(file.type)) return true;
  return ATTACHMENT_EXTENSIONS.has(attachmentExtension(file.name));
}

function attachmentId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function attachmentPreview(file: File): string | undefined {
  if (!file.type.startsWith('image/') || typeof URL.createObjectURL !== 'function') return undefined;
  return URL.createObjectURL(file);
}

function revokeAttachment(attachment: ChatAttachment): void {
  if (attachment.previewUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(attachment.previewUrl);
}

function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${Math.round(size / (1024 * 1024) * 10) / 10} MB`;
}

function addDraftFiles(runtime: UiRuntime, conversationId: string, files: File[]): void {
  const draft = draftFor(runtime, conversationId);
  for (const file of files) {
    if (draft.attachments.length >= MAX_CHAT_ATTACHMENTS) {
      runtime.toast = { id: Date.now(), level: 'warning', message: `Puoi allegare al massimo ${MAX_CHAT_ATTACHMENTS} file per messaggio.` };
      break;
    }
    const attachment: ChatAttachment = {
      id: attachmentId(),
      name: file.name || 'allegato',
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      file
    };
    if (file.size > MAX_CHAT_ATTACHMENT_BYTES) attachment.error = 'Il file supera il limite di 20 MB.';
    else if (!attachmentAllowed(file)) attachment.error = 'Tipo di file non consentito in questa versione.';
    else attachment.previewUrl = attachmentPreview(file);
    draft.attachments.push(attachment);
  }
  runtime.render();
}

function attachmentPrompt(prompt: string, files: SavedChatAttachment[]): string {
  const lines = files.map((file) => `- ${file.localPath} (${file.name}, ${file.mimeType}, ${file.size} byte)`);
  const block = `## Allegati\n${lines.join('\n')}`;
  return prompt ? `${prompt}\n\n${block}` : `Analizza gli allegati forniti.\n\n${block}`;
}


export function renderChat(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const page = el('section', 'chat-page');
  page.append(renderConversationHeader(runtime));

  const scroll = el('div', 'message-scroll');
  const content = el('div', 'message-content');
  const rootsRendered = new Set<string>();
  const visibleDelegations = state.conversation.delegations.filter(delegationIsVisible);
  const delegationsByRoot = groupDelegations(visibleDelegations);
  const primaryStreams = visiblePrimaryStreams(runtime);
  pruneRenderCaches(state.conversation.messages.map((message) => message.id), primaryStreams.map((run) => run.runId));

  if (state.conversation.messages.length === 0 && primaryStreams.length === 0 && visibleDelegations.length === 0) {
    content.append(renderEmptyState(runtime));
  } else {
    for (const message of state.conversation.messages) {
      content.append(renderMessage(runtime, message));
      if (message.role === 'user' && message.runId) {
        const delegations = delegationsByRoot.get(message.runId) ?? [];
        for (const delegation of delegations) content.append(renderDelegation(runtime, delegation));
        if (delegations.length) rootsRendered.add(message.runId);
      }
    }
    for (const delegation of visibleDelegations) {
      if (!rootsRendered.has(delegation.rootRunId)) content.append(renderDelegation(runtime, delegation));
    }
    for (const run of primaryStreams) content.append(renderStream(runtime, run));
  }

  scroll.append(content);
  page.append(scroll, renderComposer(runtime));
  return page;
}

export function patchChatRun(runtime: UiRuntime, runId: string): boolean {
  if (!runtime.state || runtime.section !== 'chat') return false;
  const stream = runtime.streams.get(runId);
  if (!stream) return false;
  const scroll = document.querySelector<HTMLElement>('.message-scroll');
  const distance = scroll ? scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop : Number.POSITIVE_INFINITY;
  const stickToBottom = distance < 96;

  const delegation = runtime.state.conversation.delegations
    .find((entry) => entry.tasks.some((task) => task.id === runId));
  const task = delegation?.tasks.find((entry) => entry.id === runId);
  if (task) {
    const current = document.querySelector<HTMLElement>(`[data-delegation-task-id="${cssEscape(runId)}"]`);
    if (delegation && !delegationIsVisible(delegation)) {
      current?.closest('.delegation-card')?.remove();
      return true;
    }
    if (!current) return false;
    current.replaceWith(renderDelegationTask(runtime, task));
  } else {
    const current = document.querySelector<HTMLElement>(`[data-stream-run-id="${cssEscape(runId)}"]`);
    const next = renderStream(runtime, stream);
    if (current) current.replaceWith(next);
    else {
      const content = document.querySelector<HTMLElement>('.message-content');
      if (!content || stream.conversationId !== runtime.state.conversation.id) return false;
      content.append(next);
    }
  }

  if (scroll && stickToBottom) scroll.scrollTop = scroll.scrollHeight;
  return true;
}

function cssEscape(value: string): string {
  const css = (globalThis as any).CSS;
  return css?.escape ? css.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, (entry) => `\${entry}`);
}

function renderConversationHeader(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const header = el('header', 'conversation-header conversation-header--minimal');
  const title = el('div', 'conversation-heading');
  const headingButton = button('conversation-title-button');
  headingButton.append(el('h1', '', state.conversation.title));
  headingButton.title = 'Rinomina conversazione';
  headingButton.addEventListener('click', () => runtime.post({ type: 'renameConversation', payload: { id: state.conversation.id } }));
  title.append(headingButton);

  const subtitle = el('div', 'conversation-subtitle');
  const activeAgent = (state.agents ?? []).find((agent: any) => agent.id === state.conversation.agentId && agent.enabled);
  if (activeAgent) {
    subtitle.append(agentGlyph(activeAgent.name), el('span', 'agent-entity-name', activeAgent.name));
  } else {
    subtitle.append(providerGlyph(state.conversation.provider), el('span', '', providerLabel(state.conversation.provider)));
    const modelLabel = selectedModel(state.conversation.provider, state.conversation.model, runtime)?.label;
    if (modelLabel) subtitle.append(el('span', 'meta-separator', '·'), el('span', '', modelLabel));
    if (state.conversation.reasoning && state.conversation.reasoning !== 'auto') {
      subtitle.append(el('span', 'meta-separator', '·'), el('span', '', state.conversation.reasoning));
    }
  }
  if (state.workspace.cwd) subtitle.append(el('span', 'meta-separator', '·'), el('span', 'conversation-path', state.workspace.name));
  title.append(subtitle);
  header.append(title);
  return header;
}

function renderEmptyState(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const section = el('section', 'empty-chat');
  const visual = el('div', 'empty-chat__visual');
  visual.append(icon('sparkle', 30));
  section.append(visual);
  section.append(el('h2', '', state.workspace.cwd ? `Lavora su ${state.workspace.name}` : 'Apri un progetto e inizia'));
  section.append(el('p', '', 'Scegli l’agente e il modello più adatti. Relay mantiene sessioni, regole e deleghe nello stesso contesto.'));
  const suggestions = el('div', 'prompt-suggestions');
  const prompts = state.workspace.cwd
    ? [
        'Analizza la codebase e spiegami com’è organizzata',
        'Fammi le domande necessarie prima di sviluppare una nuova funzionalità',
        'Individua i rischi tecnici principali senza modificare file'
      ]
    : ['Apri una cartella di progetto per iniziare'];
  for (const prompt of prompts) {
    const item = button('prompt-suggestion');
    item.append(el('span', '', prompt), icon('arrowUp', 14));
    item.addEventListener('click', () => {
      if (!state.workspace.cwd) runtime.post({ type: 'openProject' });
      else {
        draftFor(runtime, state.conversation.id).text = prompt;
        runtime.pendingComposerFocus = true;
        runtime.render();
      }
    });
    suggestions.append(item);
  }
  section.append(suggestions);
  return section;
}

function renderMessage(runtime: UiRuntime, message: ConversationMessage): HTMLElement {
  const agentSignature = (runtime.state!.agents ?? []).map((agent: any) => `${agent.id}:${agent.name}`).join('|');
  const recoverySignature = runtime.state!.providers.filter((provider) => provider.healthState === 'ready' && provider.connected !== false).map((provider) => provider.id).join('|');
  const signature = `${message.role}|${message.text.length}|${message.text}|${message.error ? 1 : 0}|${message.provider ?? ''}|${message.model ?? ''}|${message.reasoning ?? ''}|${message.agentId ?? ''}|${message.agentName ?? ''}|${agentSignature}|${recoverySignature}`;
  const cached = messageNodeCache.get(message.id);
  if (cached?.signature === signature) return cached.node;
  let rendered: HTMLElement;
  if (message.role === 'user') {
    const wrapper = el('article', 'message message--user');
    const bubble = el('div', 'user-bubble');
    bubble.append(renderMarkdown(message.text, { agents: runtime.state!.agents }));
    wrapper.append(bubble, el('time', 'message-time', formatClock(message.createdAt)));
    rendered = wrapper;
    cacheMessageNode(message.id, signature, rendered);
    return rendered;
  }

  const wrapper = el('article', `message message--assistant ${message.error ? 'is-error' : ''} ${message.agentId ? 'is-agent-message' : ''}`);
  const rail = el('div', 'assistant-rail');
  rail.append(message.agentId ? agentGlyph(message.agentName) : providerGlyph(message.provider ?? 'codex'));
  wrapper.append(rail);
  const body = el('div', 'assistant-body');
  const meta = el('header', 'assistant-meta');
  meta.append(el('strong', message.agentId ? 'agent-entity-name' : '', message.agentName || providerLabel(message.provider ?? 'codex')));
  if (!message.agentId && message.model) meta.append(el('span', '', message.model));
  if (!message.agentId && message.reasoning) meta.append(el('span', '', message.reasoning));
  meta.append(el('time', '', formatClock(message.createdAt)));
  body.append(meta, renderMarkdown(message.text, { agents: runtime.state!.agents }));
  const actions = el('div', 'message-actions');
  const copy = iconButton('copy', 'Copia risposta', 'message-action');
  copy.addEventListener('click', async () => {
    await copyToClipboard(message.text);
    copy.classList.add('is-done');
    copy.replaceChildren(icon('check', 14));
    copy.title = 'Copiato';
    setTimeout(() => {
      if (!copy.isConnected) return;
      copy.classList.remove('is-done');
      copy.replaceChildren(icon('copy', 14));
      copy.title = 'Copia risposta';
    }, 1600);
  });
  const continueWith = button('message-action message-action--text');
  continueWith.append(icon('arrowUp', 13), el('span', '', `Continua con ${message.agentName || providerLabel(message.provider ?? 'codex')}`));
  continueWith.addEventListener('click', () => {
    if (message.agentId) runtime.post({ type: 'selectAgent', payload: { agentId: message.agentId } });
    else {
      const provider = message.provider ?? 'codex';
      const model = message.model ?? defaultModel(provider, runtime)?.id ?? 'auto';
      runtime.post({ type: 'setSelection', payload: { provider, model, reasoning: message.reasoning ?? 'auto', permission: runtime.state!.conversation.permission } });
    }
    runtime.pendingComposerFocus = true;
  });
  actions.append(copy, continueWith);
  if (message.error) {
    const diagnostics = button('message-action message-action--text is-error-action');
    diagnostics.append(icon('diagnostics', 13), el('span', '', 'Apri diagnostica'));
    diagnostics.addEventListener('click', () => runtime.setSection('diagnostics'));
    actions.append(diagnostics);
    if (message.runId) {
      const recoveryProvider = firstRecoveryProvider(runtime, message.provider ?? 'codex');
      if (recoveryProvider) {
        const resolve = button('message-action message-action--text message-action--recovery');
        resolve.title = `Apre una nuova chat con ${providerLabel(recoveryProvider.id)} e invia la diagnosi con accesso completo`;
        resolve.append(icon('sparkle', 13), el('span', '', 'Risolvi'));
        resolve.addEventListener('click', () => runtime.post({ type: 'resolveRunError', payload: { runId: message.runId } }));
        actions.append(resolve);
      } else {
        actions.append(el('span', 'message-recovery-unavailable', 'Nessun altro provider disponibile'));
      }
      for (const provider of runtime.state!.providers.filter((entry) => entry.healthState === 'ready' && entry.connected !== false && entry.id !== message.provider)) {
        const failover = button('message-action message-action--text message-action--failover');
        failover.append(icon('arrowUp', 13), el('span', '', `Continua con ${providerLabel(provider.id)}`));
        failover.addEventListener('click', () => runtime.post({ type: 'continueFailedRun', payload: { runId: message.runId, provider: provider.id } }));
        actions.append(failover);
      }
    }
  }
  body.append(actions);
  wrapper.append(body);
  rendered = wrapper;
  cacheMessageNode(message.id, signature, rendered);
  return rendered;
}


function cacheMessageNode(id: string, signature: string, node: HTMLElement): void {
  messageNodeCache.delete(id);
  messageNodeCache.set(id, { signature, node });
  while (messageNodeCache.size > MAX_MESSAGE_CACHE) {
    const oldest = messageNodeCache.keys().next().value as string | undefined;
    if (!oldest) break;
    messageNodeCache.delete(oldest);
  }
}

function pruneRenderCaches(messageIds: string[], runIds: string[]): void {
  const messages = new Set(messageIds);
  const runs = new Set(runIds);
  for (const id of messageNodeCache.keys()) if (!messages.has(id)) messageNodeCache.delete(id);
  for (const id of streamMarkdownCache.keys()) if (!runs.has(id)) streamMarkdownCache.delete(id);
}

function renderStreamMarkdown(runtime: UiRuntime, run: StreamRun): HTMLElement {
  const now = Date.now();
  let cached = streamMarkdownCache.get(run.runId);
  const terminal = ['completed', 'failed', 'cancelled'].includes(run.phase);
  const mustParse = !cached
    || run.text.length < cached.parsedText.length
    || !run.text.startsWith(cached.parsedText)
    || terminal
    || now - cached.parsedAt >= STREAM_MARKDOWN_INTERVAL_MS;
  if (mustParse) {
    cached = { parsedText: run.text, parsedAt: now, node: renderMarkdown(run.text, { agents: runtime.state!.agents }) };
    streamMarkdownCache.set(run.runId, cached);
  }
  const container = el('div', 'stream-markdown');
  container.append(cached.node);
  const tail = run.text.slice(cached.parsedText.length);
  if (tail) container.append(el('span', 'stream-markdown__tail', tail));
  return container;
}

function renderStream(runtime: UiRuntime, run: StreamRun): HTMLElement {
  const wrapper = el('article', `message message--assistant message--stream ${run.error ? 'is-error' : ''} ${run.agentId ? 'is-agent-message' : ''}`);
  wrapper.dataset.streamRunId = run.runId;
  const rail = el('div', 'assistant-rail');
  rail.append(run.agentId ? agentGlyph(run.agentName) : providerGlyph(run.provider));
  wrapper.append(rail);
  const body = el('div', 'assistant-body');
  const meta = el('header', 'assistant-meta');
  meta.append(el('strong', run.agentId ? 'agent-entity-name' : '', run.agentName || providerLabel(run.provider)));
  if (!run.agentId && run.model) meta.append(el('span', '', run.model));
  if (!run.agentId && run.reasoning) meta.append(el('span', '', run.reasoning));
  const live = el('span', `live-state phase-${run.phase}`);
  live.append(el('span', 'live-state__dot'), el('span', '', run.error ? 'Errore' : run.phase === 'cancelled' ? 'Interrotto' : 'In corso'));
  meta.append(live);
  body.append(meta);

  if (run.text) body.append(renderStreamMarkdown(runtime, run));
  body.append(renderRunBar(runtime, run));

  if (run.activities.length > 0) {
    const panelKey = `activity:${run.runId}`;
    const details = el('details', 'activity-details') as HTMLDetailsElement;
    details.open = runtime.expandedPanels.has(panelKey);
    details.addEventListener('toggle', () => {
      if (details.open) runtime.expandedPanels.add(panelKey);
      else runtime.expandedPanels.delete(panelKey);
    });
    const summary = el('summary');
    summary.append(el('span', '', lastActivityLabel(run)), icon('chevronDown', 14));
    details.append(summary);
    const list = el('div', 'activity-list');
    for (const activity of run.activities.slice(-12)) {
      const row = el('div', 'activity-row');
      row.append(el('span', 'activity-row__dot'));
      const copy = el('div');
      copy.append(el('strong', '', activity.title));
      if (activity.detail) copy.append(el('span', '', activity.detail));
      row.append(copy);
      list.append(row);
    }
    details.append(list);
    body.append(details);
  }
  wrapper.append(body);
  return wrapper;
}

function renderRunBar(runtime: UiRuntime, run: StreamRun): HTMLElement {
  const progress = el('div', `run-progress phase-${run.phase}`);
  const pulse = el('span', 'run-pulse');
  progress.append(pulse);
  const copy = el('div', 'run-progress__copy');
  copy.append(el('strong', '', run.error || run.status || phaseLabel(run.phase)));
  const detail = el('span', 'run-progress__detail');
  detail.append(el('span', '', phaseLabel(run.phase)), el('span', 'meta-separator', '·'));
  const elapsed = el('span', '', elapsedLabel(run.startedAt));
  if (!['completed', 'failed', 'cancelled'].includes(run.phase)) elapsed.dataset.elapsedStart = String(run.startedAt);
  detail.append(elapsed);
  copy.append(detail);
  progress.append(copy);
  if (run.error || run.phase === 'failed') {
    const recoveryProvider = firstRecoveryProvider(runtime, run.provider);
    if (recoveryProvider) {
      const resolve = button('button button--secondary button--small run-recovery');
      resolve.title = `Apre una nuova chat con ${providerLabel(recoveryProvider.id)} e invia la diagnosi con accesso completo`;
      resolve.append(icon('sparkle', 13), el('span', '', 'Risolvi'));
      resolve.addEventListener('click', () => runtime.post({ type: 'resolveRunError', payload: { runId: run.rootRunId ?? run.runId } }));
      progress.append(resolve);
    } else {
      progress.append(el('span', 'message-recovery-unavailable', 'Nessun altro provider disponibile'));
    }
  } else if (!['completed', 'cancelled'].includes(run.phase)) {
    const stop = iconButton('stop', 'Interrompi esecuzione', 'run-stop');
    stop.addEventListener('click', () => runtime.post({ type: 'cancelRun', payload: { runId: run.rootRunId ?? run.runId } }));
    progress.append(stop);
  }
  return progress;
}

function renderDelegation(runtime: UiRuntime, delegation: DelegationRecord): HTMLElement {
  const state = runtime.state!;
  const pending = state.pendingDelegations.find((entry) => entry.id === delegation.id);
  const card = el('section', `delegation-card is-${delegation.status}`);
  const header = el('header', 'delegation-card__header');
  const visual = el('span', 'delegation-card__visual');
  visual.append(icon('sparkle', 16));
  const copy = el('div', 'delegation-card__heading');
  copy.append(el('strong', '', `${providerLabel(delegation.requestedBy)} ha richiesto ${delegation.tasks.length} ${delegation.tasks.length === 1 ? 'delega' : 'deleghe'}`));
  copy.append(el('span', '', delegation.reason || (delegation.strategy === 'parallel' ? 'Esecuzione parallela coordinata da Relay' : 'Esecuzione sequenziale coordinata da Relay')));
  header.append(visual, copy, delegationStatus(delegation.status));
  card.append(header);

  const tasks = el('div', 'delegation-task-list');
  for (const task of delegation.tasks) tasks.append(renderDelegationTask(runtime, task));
  card.append(tasks);

  if (pending) {
    const approval = el('div', 'delegation-approval');
    const text = el('div');
    text.append(el('strong', '', 'Conferma richiesta'), el('span', '', 'Relay avvierà gli agenti indicati usando modelli, permessi e isolamento mostrati sopra.'));
    const actions = el('div');
    const reject = button('button button--ghost button--small', 'Rifiuta');
    reject.addEventListener('click', () => runtime.post({ type: 'rejectDelegation', payload: { id: delegation.id } }));
    const approve = button('button button--primary button--small', 'Avvia deleghe');
    approve.addEventListener('click', () => runtime.post({ type: 'approveDelegation', payload: { id: delegation.id } }));
    actions.append(reject, approve);
    approval.append(text, actions);
    card.append(approval);
  }
  return card;
}

function renderDelegationTask(runtime: UiRuntime, task: DelegationTaskRecord): HTMLElement {
  const active = runtime.state!.activeRuns.find((run) => run.id === task.id);
  const stream = runtime.streams.get(task.id);
  // Agent events arrive before the next full state snapshot. Overlay the live
  // stream on the persisted run so child cards can show permission/rate-limit/
  // completion immediately without rebuilding the entire workspace.
  const livePhase = stream?.phase ?? active?.phase;
  const liveStatus = stream?.status ?? active?.status;
  const liveProvider = stream?.provider ?? active?.provider;
  const liveModel = stream?.model ?? active?.model;
  const liveStartedAt = stream?.startedAt ?? (active ? Date.parse(active.startedAt) : undefined);
  const liveActivities = stream?.activities ?? active?.activities ?? [];
  const liveFailure = stream?.failure ?? active?.failure;
  const hasLiveRun = Boolean(stream || active);
  const panelKey = `delegation-task:${task.id}`;
  const row = el('details', `delegation-task is-${task.status}`) as HTMLDetailsElement;
  row.dataset.delegationTaskId = task.id;
  row.open = runtime.expandedPanels.has(panelKey);
  row.addEventListener('toggle', () => {
    if (row.open) runtime.expandedPanels.add(panelKey);
    else runtime.expandedPanels.delete(panelKey);
  });
  const summary = el('summary', 'delegation-task__summary');
  summary.append(providerGlyph(task.provider));
  const copy = el('span', 'delegation-task__copy');
  copy.append(el('strong', '', task.label));
  const meta = [
    task.model,
    task.reasoning,
    task.complexity === 'light' ? 'leggero' : task.complexity === 'complex' ? 'complesso' : task.complexity === 'standard' ? 'standard' : '',
    task.permission === 'read-only' ? 'sola lettura' : task.permission === 'workspace-write' ? 'workspace' : 'accesso completo'
  ].filter(Boolean).join(' · ');
  copy.append(el('small', '', meta));
  summary.append(copy);
  const status = el('span', `task-status is-${task.status}`);
  if (hasLiveRun && livePhase && !['completed', 'failed', 'cancelled', 'rate-limited', 'permission-denied'].includes(livePhase)) status.append(el('span', 'task-status__pulse'));
  status.append(el('span', '', taskStatusLabel(task.status, liveStatus)));
  summary.append(status, icon('chevronDown', 14));
  row.append(summary);

  const body = el('div', 'delegation-task__body');
  const promptDetails = el('details', 'delegation-task__prompt-details') as HTMLDetailsElement;
  const promptSummary = el('summary', 'delegation-task__prompt-summary');
  promptSummary.append(icon('code', 13), el('span', '', 'Prompt delegato'), el('small', '', `${task.prompt.length.toLocaleString('it-IT')} caratteri`), icon('chevronDown', 13));
  promptDetails.append(promptSummary, el('div', 'delegation-task__prompt', task.prompt));
  body.append(promptDetails);
  if (hasLiveRun && livePhase && liveStatus && liveProvider) {
    const live = el('div', `delegation-task__live phase-${livePhase}`);
    const liveCopy = el('div', 'delegation-task__live-copy');
    liveCopy.append(el('strong', '', liveStatus || phaseLabel(livePhase)));
    const last = liveActivities.at(-1);
    const hasOutput = Boolean(stream?.text || active?.partialOutput);
    liveCopy.append(el('span', '', last?.detail || last?.title || (hasOutput ? 'Output ricevuto, elaborazione in corso.' : 'Processo vivo · in attesa del primo output.')));
    const liveMeta = el('div', 'delegation-task__live-meta');
    liveMeta.append(el('span', '', providerLabel(liveProvider)));
    if (liveModel) liveMeta.append(el('span', 'meta-separator', '·'), el('span', '', liveModel));
    if (liveStartedAt !== undefined && Number.isFinite(liveStartedAt)) {
      liveMeta.append(el('span', 'meta-separator', '·'));
      const elapsed = el('span', '', elapsedLabel(liveStartedAt));
      if (!['completed', 'failed', 'cancelled'].includes(livePhase)) elapsed.dataset.elapsedStart = String(liveStartedAt);
      liveMeta.append(elapsed);
    }
    const terminal = ['completed', 'failed', 'cancelled', 'rate-limited', 'permission-denied'].includes(livePhase);
    live.append(terminal ? icon(livePhase === 'completed' ? 'check' : 'warning', 13) : el('span', 'task-status__pulse'), liveCopy, liveMeta);
    body.append(live);
    if (liveFailure?.resetAt) body.append(el('p', 'delegation-task__failure-note', `Limite attivo · reset ${liveFailure.resetAt}`));
  }
  if (task.routingReason || task.dependsOn?.length || task.files?.length) {
    const routing = el('div', 'delegation-task__routing');
    const badges = el('div', 'delegation-task__badges');
    badges.append(el('span', `delegation-badge permission-${task.permission}`, task.permission === 'danger-full-access' ? 'Accesso completo' : task.permission === 'workspace-write' ? 'Workspace' : 'Sola lettura'));
    if (task.complexity) badges.append(el('span', 'delegation-badge', task.complexity === 'light' ? 'Leggero' : task.complexity === 'complex' ? 'Complesso' : 'Standard'));
    if (task.dependsOn?.length) badges.append(el('span', 'delegation-badge', `Dopo ${task.dependsOn.length} task`));
    routing.append(badges);
    if (task.files?.length) {
      const files = el('div', 'delegation-scope-badges');
      for (const path of task.files.slice(0, 4)) files.append(el('span', 'delegation-file-badge', path));
      if (task.files.length > 4) files.append(el('span', 'delegation-file-badge is-more', `+${task.files.length - 4}`));
      routing.append(files);
    }
    if (task.routingReason) {
      const reason = el('details', 'delegation-routing-details') as HTMLDetailsElement;
      const summary = el('summary');
      summary.append(el('span', '', 'Perché questa delega'), icon('chevronDown', 12));
      reason.append(summary, el('p', '', task.routingReason));
      routing.append(reason);
    }
    body.append(routing);
  }
  if (stream?.text) {
    const output = el('div', 'delegation-task__output');
    output.append(el('span', 'section-label', 'Output in corso'), renderMarkdown(stream.text, { agents: runtime.state!.agents }));
    body.append(output);
  } else if (task.resultText) {
    const output = el('div', 'delegation-task__output');
    output.append(el('span', 'section-label', 'Risultato'), renderMarkdown(task.resultText, { agents: runtime.state!.agents }));
    body.append(output);
  }
  if (task.changedFiles?.length) {
    const files = el('div', 'delegation-task__files');
    files.append(el('span', '', `${task.changedFiles.length} file modificati`));
    const links = el('div', 'delegation-task__file-links');
    for (const path of task.changedFiles.slice(0, 8)) {
      const link = button('delegation-file-link', path);
      link.dataset.relayResource = path;
      link.title = 'Apri nell’editor';
      links.append(link);
    }
    files.append(links);
    body.append(files);
  }
  if (task.error) body.append(el('p', 'delegation-task__error', task.error));
  if (hasLiveRun && livePhase && !['completed', 'failed', 'cancelled', 'rate-limited', 'permission-denied'].includes(livePhase)) {
    const stop = button('delegation-task__stop');
    stop.append(icon('stop', 13), el('span', '', 'Interrompi'));
    stop.addEventListener('click', (event) => {
      event.preventDefault();
      runtime.post({ type: 'cancelRun', payload: { runId: stream?.rootRunId ?? active?.rootRunId ?? stream?.runId ?? active?.id ?? task.id } });
    });
    body.append(stop);
  }
  row.append(body);
  return row;
}

function renderComposer(runtime: UiRuntime): HTMLElement {
  const state = runtime.state! as any;
  const selectedAgent = Array.isArray(state.agents) ? state.agents.find((agent: any) => agent.id === state.conversation.agentId && agent.enabled) : undefined;
  const provider = selectedAgent?.provider ?? state.conversation.provider;
  const providerStatus = state.providers.find((entry: any) => entry.id === provider);
  const models = providerStatus?.models ?? [];
  const modelValue = selectedAgent?.model ?? state.conversation.model ?? state.preferences.providerDefaults[provider].model ?? 'auto';
  const model = models.find((entry) => entry.id === modelValue) ?? models.find((entry) => entry.isDefault) ?? models[0];
  const reasoningOptions = model?.reasoning ?? [];
  const reasoningValue = state.conversation.reasoning ?? model?.defaultReasoning ?? 'auto';
  const activeRoot = state.activeRuns.find((run) => run.conversationId === state.conversation.id && run.kind !== 'delegation');

  let selectedProvider = provider;
  let selectedAgentId = selectedAgent?.id as string | undefined;
  let selectedModel = modelValue;
  let selectedReasoning = reasoningValue;
  let selectedPermission = state.conversation.permission;

  const dock = el('div', 'composer-dock');
  const composer = el('form', `composer ${activeRoot ? 'is-running' : ''}`);
  const textarea = el('textarea', 'composer-input') as HTMLTextAreaElement;
  textarea.id = 'relay-composer-input';
  textarea.rows = 1;
  const draft = draftFor(runtime, state.conversation.id);
  textarea.value = draft.text;
  textarea.placeholder = selectedAgent ? `Scrivi a ${selectedAgent.name}…` : 'Scrivi qui, usa @ per menzionare';
  textarea.disabled = !state.workspace.cwd || !providerStatus?.available;
  const fileInput = el('input', 'composer-file-input') as HTMLInputElement;
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.tabIndex = -1;
  fileInput.setAttribute('aria-hidden', 'true');
  fileInput.addEventListener('change', () => {
    addDraftFiles(runtime, state.conversation.id, Array.from(fileInput.files ?? []));
    fileInput.value = '';
  });
  const attachments = renderAttachmentTray(runtime, state.conversation.id, draft);
  const mentionPanel = el('div', 'mention-panel');
  mentionPanel.hidden = true;
  let mentionIndex = 0;
  let mentionOptions: MentionOption[] = [];
  const closeMentions = () => {
    mentionPanel.hidden = true;
    mentionOptions = [];
    mentionIndex = 0;
  };
  const selectMention = (option: MentionOption) => {
    const start = runtime.mentionStart ?? textarea.selectionStart;
    const end = textarea.selectionStart;
    textarea.value = `${textarea.value.slice(0, start)}${option.token} ${textarea.value.slice(end)}`;
    const cursor = start + option.token.length + 1;
    textarea.setSelectionRange(cursor, cursor);
    draft.text = textarea.value;
    if (option.kind === 'provider' && start === 0) {
      const mentionedProvider = option.token.slice(1) as ProviderId;
      const mentionedModel = defaultModel(mentionedProvider, runtime)?.id ?? 'auto';
      selectedAgentId = undefined;
      runtime.post({
        type: 'setSelection',
        payload: { provider: mentionedProvider, model: mentionedModel, reasoning: 'auto', permission: selectedPermission }
      });
    }
    closeMentions();
    resizeTextarea(textarea);
    textarea.focus();
  };
  const updateMentions = () => {
    const cursor = textarea.selectionStart;
    const prefix = textarea.value.slice(0, cursor);
    const match = prefix.match(/(?:^|\s)([@/])([^\s@/]*)$/);
    if (!match || match.index === undefined) {
      closeMentions();
      return;
    }
    runtime.mentionStart = match.index + (match[0].startsWith(' ') ? 1 : 0);
    const trigger = (match[1] === '/' ? '/' : '@') as '@' | '/';
    const query = (match[2] ?? '').toLowerCase();
    mentionOptions = buildMentionOptions(runtime, query, trigger).slice(0, 14);
    mentionIndex = Math.min(mentionIndex, Math.max(0, mentionOptions.length - 1));
    renderMentionPanel(mentionPanel, mentionOptions, mentionIndex, selectMention);
  };
  textarea.addEventListener('input', () => {
    draft.text = textarea.value;
    resizeTextarea(textarea);
    updateMentions();
  });
  textarea.addEventListener('paste', (event) => {
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    addDraftFiles(runtime, state.conversation.id, files);
  });
  composer.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    composer.classList.add('is-dragging');
  });
  composer.addEventListener('dragleave', (event) => {
    if (event.relatedTarget instanceof Node && composer.contains(event.relatedTarget)) return;
    composer.classList.remove('is-dragging');
  });
  composer.addEventListener('drop', (event) => {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    composer.classList.remove('is-dragging');
    addDraftFiles(runtime, state.conversation.id, files);
  });
  textarea.addEventListener('keydown', (event) => {
    if (!mentionPanel.hidden && mentionOptions.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        mentionIndex = (mentionIndex + 1) % mentionOptions.length;
        renderMentionPanel(mentionPanel, mentionOptions, mentionIndex, selectMention);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        mentionIndex = (mentionIndex - 1 + mentionOptions.length) % mentionOptions.length;
        renderMentionPanel(mentionPanel, mentionOptions, mentionIndex, selectMention);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMentions();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const option = mentionOptions[mentionIndex];
        if (option) selectMention(option);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!activeRoot) composer.requestSubmit();
    }
  });
  textarea.addEventListener('click', updateMentions);
  textarea.addEventListener('blur', () => window.setTimeout(closeMentions, 80));
  composer.append(fileInput, attachments, textarea, mentionPanel);

  const toolbar = el('div', 'composer-toolbar');
  const attach = button('composer-attachment-button composer-icon-only');
  attach.append(icon('plus', 15));
  attach.setAttribute('aria-label', 'Aggiungi allegati');
  attach.title = 'Allega file, trascina qui oppure incolla un’immagine';
  attach.disabled = Boolean(activeRoot);
  attach.addEventListener('click', () => fileInput.click());
  toolbar.append(attach);
  const controls = el('div', 'composer-controls');
  const visibleAgents = Array.isArray(state.agents)
    ? state.agents.filter((agent: any) => agent.enabled && agent.visibleInChat !== false && (agent.globalVisible !== false || agent.projectIds?.includes(state.workspace.id)))
    : [];
  controls.append(composerPicker({
    id: 'provider',
    label: selectedAgent ? selectedAgent.name : 'Provider',
    leading: selectedAgent ? agentGlyph(selectedAgent.name) : providerGlyph(provider),
    value: selectedAgent ? `agent:${selectedAgent.id}` : provider,
    wide: Boolean(selectedAgent),
    options: [
      ...visibleAgents.map((agent: any) => {
        const agentProvider = state.providers.find((entry: any) => entry.id === agent.provider);
        return {
          value: `agent:${agent.id}`,
          label: agent.name,
          description: agentProvider?.connected === false
            ? `${agent.specialization || providerLabel(agent.provider)} · provider scollegato`
            : `${agent.specialization || 'Agente custom'} · ${providerLabel(agent.provider)}`,
          disabled: !agentProvider?.available || agentProvider?.connected === false
        };
      }),
      ...state.providers.map((entry: any) => ({
        value: entry.id,
        label: entry.label,
        description: entry.connected === false ? 'Scollegato da Relay' : entry.available ? compactProviderVersion(entry.version) : 'Non disponibile',
        disabled: !entry.available || entry.connected === false
      }))
    ],
    iconOnly: !selectedAgent,
    onChange: (value) => {
      if (value.startsWith('agent:')) {
        selectedAgentId = value.slice('agent:'.length);
        runtime.post({ type: 'selectAgent', payload: { agentId: selectedAgentId } });
        return;
      }
      selectedAgentId = undefined;
      selectedProvider = value as ProviderId;
      selectedModel = defaultModel(selectedProvider, runtime)?.id ?? 'auto';
      selectedReasoning = 'auto';
      runtime.post({ type: 'setSelection', payload: { provider: selectedProvider, model: selectedModel, reasoning: selectedReasoning, permission: selectedPermission } });
    }
  }));

  if (!selectedAgent) {
    controls.append(composerPicker({
      id: 'model',
      label: 'Modello',
      leading: icon('sparkle', 14),
      value: modelValue,
      wide: true,
      options: [
        { value: 'auto', label: 'Automatico', description: 'Usa il default configurato per il provider' },
        ...models.filter((entry) => entry.id !== 'auto').map((entry) => ({
          value: entry.id,
          label: entry.label,
          ...(entry.description ? { description: entry.description } : {})
        }))
      ],
      onChange: (value) => {
        selectedModel = value;
        selectedReasoning = 'auto';
        runtime.post({ type: 'setSelection', payload: { provider: selectedProvider, model: selectedModel, reasoning: selectedReasoning, permission: selectedPermission } });
      }
    }));

    controls.append(composerPicker({
      id: 'reasoning',
      label: 'Thinking',
      leading: icon('gauge', 14),
      value: reasoningValue,
      disabled: reasoningOptions.length === 0,
      options: [
        { value: 'auto', label: 'Automatico', description: model?.defaultReasoning ? `Default: ${model.defaultReasoning}` : 'Scelta del provider' },
        ...reasoningOptions.map((entry) => ({ value: entry.id, label: entry.label, ...(entry.description ? { description: entry.description } : {}) }))
      ],
      onChange: (value) => {
        selectedReasoning = value;
        runtime.post({ type: 'setSelection', payload: { provider: selectedProvider, model: selectedModel, reasoning: selectedReasoning, permission: selectedPermission } });
      }
    }));
  }

  controls.append(composerPicker({
    id: 'permission',
    label: 'Accesso',
    leading: icon('lock', 15),
    value: state.conversation.permission,
    iconOnly: true,
    options: [
      { value: 'read-only', label: 'Sola lettura', description: 'Analizza senza modificare file' },
      { value: 'workspace-write', label: 'Workspace', description: 'Può modificare il progetto aperto' },
      { value: 'danger-full-access', label: 'Accesso completo', description: 'Può operare fuori dal workspace e Relay tenta di approvare consensi browser e terminale' }
    ],
    onChange: (value) => {
      // window.confirm is inert inside the sandboxed VS Code webview, so the
      // dangerous option is confirmed with an inline, explicit step instead.
      if (value === 'danger-full-access') {
        runtime.pendingFullAccess = true;
        runtime.render();
        return;
      }
      delete runtime.pendingFullAccess;
      selectedPermission = value as typeof selectedPermission;
      runtime.post({ type: 'setPermission', payload: { permission: selectedPermission } });
    }
  }));

  if (runtime.pendingFullAccess) {
    const confirm = el('div', 'composer-confirm');
    const copy = el('div', 'composer-confirm__copy');
    copy.append(el('strong', '', 'Consentire l\u2019accesso completo?'));
    copy.append(el('span', '', 'L\u2019agente potr\u00e0 operare anche fuori dal workspace aperto.'));
    const actions = el('div', 'composer-confirm__actions');
    const cancel = button('button button--ghost button--small', 'Annulla');
    cancel.addEventListener('click', () => { delete runtime.pendingFullAccess; runtime.render(); });
    const allow = button('button button--danger-ghost button--small', 'Consenti');
    allow.addEventListener('click', () => {
      delete runtime.pendingFullAccess;
      selectedPermission = 'danger-full-access';
      runtime.post({ type: 'setPermission', payload: { permission: 'danger-full-access' } });
      runtime.render();
    });
    actions.append(cancel, allow);
    confirm.append(icon('shield', 15), copy, actions);
    composer.append(confirm);
  }

  controls.append(composerPicker({
    id: 'delegation',
    label: 'Deleghe',
    leading: icon('workflow', 15),
    value: state.conversation.delegationPolicy,
    iconOnly: true,
    alignRight: true,
    options: [
      { value: 'confirm', label: 'Chiedi conferma', description: 'Mostra il piano prima di avviare altri agenti' },
      { value: 'automatic', label: 'Automatiche', description: 'L’agente può delegare senza interrompere il flusso' },
      { value: 'disabled', label: 'Disattivate', description: 'Nessuna delega agente-agente' }
    ],
    onChange: (value) => runtime.post({ type: 'setDelegationPolicy', payload: { policy: value } })
  }));

  const usage = button('composer-usage-button composer-icon-only');
  const currentUsage = usageForModel(state.usage.find((entry) => entry.provider === provider), model?.family ?? model?.label);
  usage.append(icon('gauge', 14), el('span', `composer-status-dot ${usageHealth(currentUsage?.remainingFraction)}`));
  usage.setAttribute('aria-label', 'Utilizzo e limiti provider');
  usage.title = currentUsage?.available
    ? `${providerLabel(provider)} · ${formatPercent(currentUsage.remainingFraction)} disponibile · ${formatReset(currentUsage.resetsAt)}`
    : 'Utilizzo e limiti provider';
  usage.addEventListener('click', (event) => {
    event.preventDefault();
    runtime.usageOpen = !runtime.usageOpen;
    runtime.render();
  });
  controls.append(usage);
  toolbar.append(controls);

  const send = button(`composer-send ${activeRoot ? 'is-stop' : ''}`);
  send.type = activeRoot ? 'button' : 'submit';
  send.append(icon(activeRoot ? 'stop' : 'arrowUp', 18));
  send.setAttribute('aria-label', activeRoot ? 'Interrompi esecuzione' : 'Invia messaggio');
  send.title = activeRoot ? 'Interrompi esecuzione' : 'Invia (Enter)';
  send.disabled = !activeRoot && textarea.disabled;
  if (activeRoot) {
    send.addEventListener('click', (event) => {
      event.preventDefault();
      runtime.post({ type: 'cancelRun', payload: { runId: activeRoot.rootRunId ?? activeRoot.id } });
    });
  }
  toolbar.append(send);
  composer.append(toolbar);

  composer.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (activeRoot || draft.sending) return;
    const prompt = textarea.value.trim();
    const validAttachments = draft.attachments.filter((attachment) => !attachment.error && !attachment.consumed && attachment.file);
    if ((!prompt && validAttachments.length === 0) || textarea.disabled) return;
    if (draft.attachments.some((attachment) => Boolean(attachment.error))) {
      runtime.toast = { id: Date.now(), level: 'warning', message: 'Rimuovi o sostituisci gli allegati non validi prima di inviare.' };
      runtime.render();
      return;
    }
    draft.sending = true;
    validAttachments.forEach((attachment) => { attachment.consumed = true; });
    send.disabled = true;
    try {
      const saved = validAttachments.length ? await runtime.saveAttachments(validAttachments) : [];
      const providerPrompt = saved.length ? attachmentPrompt(prompt, saved) : prompt;
      const displayPrompt = prompt || `Allegati: ${validAttachments.map((attachment) => attachment.name).join(', ')}`;
      runtime.scrollByConversation[state.conversation.id] = { top: 0, stickToBottom: true };
      runtime.post({
        type: 'sendMessage',
        payload: { provider: selectedProvider, agentId: selectedAgentId, model: selectedModel, reasoning: selectedReasoning, permission: selectedPermission, prompt: providerPrompt, displayPrompt }
      });
      for (const attachment of validAttachments) revokeAttachment(attachment);
      draft.text = '';
      draft.sending = false;
      draft.attachments = draft.attachments.filter((attachment) => !validAttachments.includes(attachment));
      textarea.value = '';
      resizeTextarea(textarea);
      runtime.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      draft.sending = false;
      for (const attachment of validAttachments) {
        attachment.consumed = false;
        attachment.error = message;
      }
      runtime.toast = { id: Date.now(), level: 'error', message };
      send.disabled = false;
      runtime.render();
    }
  });

  dock.append(composer);
  if (runtime.usageOpen) dock.append(renderUsagePopover(runtime));
  const footer = el('div', 'composer-footer');
  const left = el('span');
  if (activeRoot) left.textContent = `${(activeRoot as any).agentName || providerLabel(activeRoot.provider)} sta lavorando · ${phaseLabel(activeRoot.phase)}`;
  else left.textContent = state.conversation.delegationPolicy === 'automatic' ? 'Deleghe automatiche attive' : state.conversation.delegationPolicy === 'disabled' ? 'Deleghe disattivate' : 'Le deleghe richiedono conferma';
  footer.append(left);
  if (activeRoot) {
    // The chat keeps working in background: make the parallel path one click away.
    const parallel = button('composer-parallel-hint');
    parallel.append(icon('plus', 12), el('span', '', 'Nuova chat in parallelo'));
    parallel.title = 'Questa chat continua in background. Apri un\u2019altra chat per un nuovo task.';
    parallel.addEventListener('click', () => runtime.post({ type: 'newConversation', payload: { provider: state.conversation.provider } }));
    footer.append(parallel);
  } else {
    footer.append(el('span', '', 'Enter invia · Shift+Enter va a capo'));
  }
  dock.append(footer);
  requestAnimationFrame(() => resizeTextarea(textarea));
  const observer = new ResizeObserver(([entry]) => {
    const width = entry?.contentRect.width ?? dock.clientWidth;
    dock.classList.toggle('is-compact', width < 520);
    dock.classList.toggle('is-micro', width < 360);
  });
  observer.observe(dock);
  return dock;
}

function renderAttachmentTray(runtime: UiRuntime, conversationId: string, draft: ChatDraft): HTMLElement {
  const tray = el('div', 'composer-attachments');
  tray.hidden = draft.attachments.length === 0;
  for (const attachment of draft.attachments) {
    const chip = el('div', `composer-attachment ${attachment.error ? 'is-error' : ''} ${attachment.consumed ? 'is-busy' : ''}`);
    chip.title = attachment.name;
    const visual = el('span', 'composer-attachment__visual');
    const fallback = el('span', 'composer-attachment__icon');
    fallback.append(icon(attachment.error ? 'warning' : 'folder', 15));
    if (attachment.previewUrl) {
      const image = el('img', 'composer-attachment__preview') as HTMLImageElement;
      image.src = attachment.previewUrl;
      image.alt = `Anteprima ${attachment.name}`;
      image.decoding = 'async';
      fallback.hidden = true;
      image.addEventListener('error', () => {
        image.hidden = true;
        fallback.hidden = false;
      }, { once: true });
      visual.append(image, fallback);
    } else {
      visual.append(fallback);
    }
    chip.append(visual);
    const copy = el('span', 'composer-attachment__copy');
    copy.append(el('strong', '', attachment.name), el('small', '', attachment.error || formatAttachmentSize(attachment.size)));
    chip.append(copy);
    const remove = iconButton('close', `Rimuovi ${attachment.name}`, 'composer-attachment__remove');
    remove.disabled = Boolean(attachment.consumed);
    remove.addEventListener('click', () => {
      revokeAttachment(attachment);
      draft.attachments = draft.attachments.filter((entry) => entry.id !== attachment.id);
      runtime.drafts[conversationId] = draft;
      runtime.render();
    });
    chip.append(remove);
    tray.append(chip);
  }
  return tray;
}

function renderUsagePopover(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const popover = el('section', 'usage-popover');
  const header = el('header');
  const copy = el('div');
  copy.append(el('strong', '', 'Utilizzo provider'), el('span', '', 'Dati aggiornati dalle CLI locali'));
  const close = iconButton('close', 'Chiudi', 'usage-popover__close');
  close.addEventListener('click', () => { runtime.usageOpen = false; runtime.render(); });
  header.append(copy, close);
  popover.append(header);
  const list = el('div', 'usage-popover__list');
  for (const provider of state.providers) {
    const modelReference = usageModelReference(runtime, provider.id);
    const rawUsage = state.usage.find((entry) => entry.provider === provider.id);
    const usage = withPreferredUsage(provider.id, rawUsage, modelReference);
    const primaryBucket = preferredUsageBucket(provider.id, rawUsage?.buckets, modelReference);
    list.append(renderUsageRow(runtime, provider.id, usage, primaryBucket));
  }
  popover.append(list);
  const footer = button('usage-popover__footer');
  footer.append(icon('gauge', 14), el('span', '', 'Apri dettagli e policy di consumo'), icon('arrowUp', 13));
  footer.addEventListener('click', () => {
    runtime.usageOpen = false;
    runtime.setSection('usage');
  });
  popover.append(footer);
  return popover;
}

function renderUsageRow(runtime: UiRuntime, provider: ProviderId, usage: UsageSnapshot | undefined, primaryBucket: UsageBucket | undefined): HTMLElement {
  const row = el('div', `usage-popover__row ${usage?.buckets?.length ? 'has-buckets' : ''}`);
  row.append(providerGlyph(provider));
  const body = el('div', 'usage-popover__body');
  const headline = el('div', 'usage-popover__headline');
  const copy = el('div', 'usage-popover__copy');
  copy.append(el('strong', '', providerLabel(provider)));
  const buckets = usage?.buckets?.filter((bucket) => bucket.remainingFraction !== undefined || bucket.used !== undefined) ?? [];
  copy.append(el('span', '', usage?.available
    ? provider === 'antigravity'
      ? `${buckets.length}/4 finestre rilevate${buckets.length < 4 ? ' · dato parziale' : ''} · riferimento ${usageReferenceLabel(provider, primaryBucket)}`
      : buckets.length > 1 ? `${buckets.length} finestre / fasce rilevate` : formatReset(usage.resetsAt)
    : provider === 'copilot' ? 'Collega GitHub per leggere il consumo mensile' : 'Il provider non espone un limite leggibile'));
  headline.append(copy);
  const metric = el('div', 'usage-popover__metric');
  metric.append(el('strong', '', usage?.available ? formatUsageMetric(usage) : '—'), el('span', '', usage?.available ? usageMetricLabel(provider, usage, primaryBucket) : 'non disponibile'));
  headline.append(metric);
  body.append(headline);

  if (buckets.length > 1 || (buckets.length === 1 && buckets[0].group)) {
    const bucketGrid = el('div', 'usage-popover__buckets');
    for (const bucket of buckets.slice(0, 6)) bucketGrid.append(renderUsageBucket(bucket));
    body.append(bucketGrid);
  } else if (usage?.available && usage.remainingFraction !== undefined) {
    const bar = el('div', 'usage-popover__bar');
    const fill = el('span', usageHealth(usage.remainingFraction));
    fill.style.width = `${Math.round(usage.remainingFraction * 100)}%`;
    bar.append(fill);
    body.append(bar);
  }
  if (provider === 'copilot' && !usage?.available) {
    const connect = button('usage-popover__connect', 'Collega dati mensili');
    connect.addEventListener('click', (event) => {
      event.stopPropagation();
      runtime.usageOpen = false;
      runtime.post({ type: 'configureCopilotUsage' });
      runtime.render();
    });
    body.append(connect);
  } else if (provider === 'antigravity' && usage?.available && buckets.length < 4) {
    const retry = button('usage-popover__connect', 'Riprova lettura completa');
    retry.addEventListener('click', (event) => {
      event.stopPropagation();
      runtime.post({ type: 'refreshUsage' });
    });
    body.append(retry);
  }
  row.append(body);
  return row;
}

function renderUsageBucket(bucket: UsageBucket): HTMLElement {
  const item = el('div', 'usage-popover__bucket');
  const label = el('span', 'usage-popover__bucket-label');
  if (bucket.used !== undefined) {
    const meta = [compactGroup(bucket.group), compactWindow(bucket)].filter((value, index, values) => value && values.indexOf(value) === index).join(' · ');
    label.append(el('strong', '', bucket.label), el('small', '', meta));
  } else {
    label.append(el('strong', '', compactGroup(bucket.group) || bucket.label), el('small', '', compactWindow(bucket)));
  }
  const value = el('span', `usage-popover__bucket-value ${usageHealth(bucket.remainingFraction)}`);
  value.textContent = bucket.remainingFraction !== undefined
    ? formatPercent(bucket.remainingFraction)
    : bucket.used !== undefined
      ? `${compactNumber(bucket.used)} ${compactUsageUnit(bucket.unit)}`.trim()
      : '—';
  item.append(label, value);
  if (bucket.resetsAt) item.title = formatReset(bucket.resetsAt);
  return item;
}

function formatUsageMetric(usage: UsageSnapshot): string {
  if (usage.remainingFraction !== undefined) return formatPercent(usage.remainingFraction);
  const total = usage.buckets?.find((bucket) => bucket.id.includes('total')) ?? usage.buckets?.[0];
  if (total?.used !== undefined) return compactNumber(total.used);
  return '—';
}

function usageMetricLabel(provider: ProviderId, usage: UsageSnapshot, primaryBucket: UsageBucket | undefined): string {
  if (usage.remainingFraction !== undefined) return usageReferenceLabel(provider, primaryBucket);
  const total = usage.buckets?.find((bucket) => bucket.id.includes('total')) ?? usage.buckets?.[0];
  return total?.unit ? compactUsageUnit(total.unit) : usageReferenceLabel(provider, primaryBucket);
}

function compactUsageGroup(group: string | undefined): string {
  if (!group) return 'Totale';
  const normalized = group.toLowerCase();
  if (normalized.includes('gemini')) return 'Gemini';
  if (normalized.includes('claude') || normalized.includes('gpt')) return 'Claude/GPT';
  if (normalized.includes('copilot')) return 'Copilot';
  return group.length > 18 ? `${group.slice(0, 17)}…` : group;
}

function compactUsageWindow(bucket: UsageBucket): string {
  if (bucket.kind === 'five-hour') return '5 ore';
  if (bucket.kind === 'weekly') return 'settimana';
  if (bucket.kind === 'monthly') return 'mese';
  if (bucket.kind === 'daily') return 'giorno';
  if (bucket.kind === 'session') return 'sessione';
  return bucket.label || 'quota';
}

function compactUsageUnit(unit: string | undefined): string {
  if (unit === 'requests') return 'richieste';
  if (unit === 'credits') return 'crediti';
  if (unit === 'tokens') return 'token';
  return unit ?? '';
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: value >= 100 ? 0 : 2 }).format(value);
}

interface MentionOption {
  kind: 'provider' | 'agent' | 'file' | 'directory' | 'rule' | 'conversation' | 'skill';
  label: string;
  detail: string;
  token: string;
}

function buildMentionOptions(runtime: UiRuntime, query: string, trigger: '@' | '/' = '@'): MentionOption[] {
  const state = runtime.state!;
  const normalized = query.replace(/^[@/]/, '').toLowerCase();
  const options: MentionOption[] = [];
  if (trigger === '/') {
    const seen = new Set<string>();
    for (const skill of state.skills.items) {
      const key = skill.name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      options.push({ kind: 'skill', label: skill.name, detail: skill.description, token: `/${skill.name}` });
    }
    if (!normalized) return options.sort(mentionSort);
    return options
      .filter((option) => `${option.label} ${option.detail}`.toLowerCase().includes(normalized))
      .sort((a, b) => mentionScore(a, normalized) - mentionScore(b, normalized) || mentionSort(a, b));
  }
  for (const provider of state.providers.filter((entry: any) => entry.available && entry.connected !== false)) {
    options.push({
      kind: 'provider',
      label: provider.label,
      detail: provider.models.length ? `${provider.models.length} modelli disponibili` : 'Provider locale',
      token: `@${provider.id}`
    });
  }
  for (const agent of (Array.isArray((state as any).agents) ? (state as any).agents : []).filter((entry: any) => entry.enabled && entry.visibleInChat !== false && (entry.globalVisible !== false || entry.projectIds?.includes(state.workspace.id)))) {
    options.push({
      kind: 'agent',
      label: agent.name,
      detail: `Target di delega · ${providerLabel(agent.provider)}${agent.specialization ? ` · ${agent.specialization}` : ''}`,
      token: /^[A-Za-z0-9_À-ÖØ-öø-ÿ-]+$/.test(agent.name) ? `@${agent.name}` : `@\"${agent.name}\"`
    });
  }
  for (const item of state.contextItems) {
    options.push({
      kind: item.kind,
      label: item.relativePath,
      detail: item.kind === 'file' ? 'File del progetto' : 'Directory del progetto',
      token: item.kind === 'file' ? `@file[${item.relativePath}]` : `@dir[${item.relativePath}]`
    });
  }
  for (const rule of state.rules.filter((entry) => entry.enabled)) {
    options.push({ kind: 'rule', label: rule.name, detail: 'Regola attiva', token: `@rule[${rule.id}]` });
  }
  for (const conversation of state.conversations) {
    options.push({ kind: 'conversation', label: conversation.title, detail: `${conversation.messageCount} messaggi`, token: `@chat[${conversation.id}]` });
  }
  if (!normalized) return options.sort(mentionSort);
  return options
    .filter((option) => `${option.label} ${option.detail} ${option.kind}`.toLowerCase().includes(normalized))
    .sort((a, b) => mentionScore(a, normalized) - mentionScore(b, normalized) || mentionSort(a, b));
}

function renderMentionPanel(
  panel: HTMLElement,
  options: MentionOption[],
  selectedIndex: number,
  onSelect: (option: MentionOption) => void
): void {
  panel.replaceChildren();
  if (!options.length) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const groups = new Map<MentionOption['kind'], MentionOption[]>();
  for (const option of options) groups.set(option.kind, [...(groups.get(option.kind) ?? []), option]);
  let absoluteIndex = 0;
  for (const [kind, values] of groups) {
    panel.append(el('span', 'mention-panel__group', mentionKindLabel(kind)));
    for (const option of values) {
      const index = absoluteIndex++;
      const item = button(`mention-option ${index === selectedIndex ? 'is-selected' : ''}`);
      const visual = el('span', 'mention-option__icon');
      if (kind === 'provider') visual.append(providerGlyph(option.token.slice(1)));
      else if (kind === 'agent') visual.append(agentGlyph(option.label));
      else visual.append(icon(kind === 'file' ? 'code' : kind === 'directory' ? 'folder' : kind === 'rule' || kind === 'skill' ? 'rules' : 'chat', 15));
      const copy = el('span', 'mention-option__copy');
      copy.append(el('strong', '', option.label), el('small', '', option.detail));
      item.append(visual, copy);
      item.addEventListener('mousedown', (event) => event.preventDefault());
      item.addEventListener('click', () => onSelect(option));
      panel.append(item);
    }
  }
}

function mentionKindLabel(kind: MentionOption['kind']): string {
  if (kind === 'provider') return 'Provider';
  if (kind === 'agent') return 'Agenti custom';
  if (kind === 'file') return 'File';
  if (kind === 'directory') return 'Directory';
  if (kind === 'rule') return 'Skills';
  if (kind === 'skill') return 'Skill';
  return 'Conversazioni';
}

function mentionSort(a: MentionOption, b: MentionOption): number {
  const order: Record<MentionOption['kind'], number> = { skill: 0, provider: 1, agent: 2, file: 3, directory: 4, rule: 5, conversation: 6 };
  return order[a.kind] - order[b.kind] || a.label.localeCompare(b.label);
}

function mentionScore(option: MentionOption, query: string): number {
  const label = option.label.toLowerCase();
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  return 2;
}

interface ComposerPickerOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

function composerPicker(options: {
  id: string;
  label: string;
  leading: Node;
  value: string;
  options: ComposerPickerOption[];
  disabled?: boolean;
  wide?: boolean;
  alignRight?: boolean;
  iconOnly?: boolean;
  onChange(value: string): void;
}): HTMLElement {
  const details = el('details', `composer-picker ${options.wide ? 'is-wide' : ''} ${options.alignRight ? 'align-right' : ''} ${options.iconOnly ? 'is-icon-only' : ''}`);
  details.dataset.picker = options.id;
  if (options.disabled) details.classList.add('is-disabled');
  const selected = options.options.find((entry) => entry.value === options.value) ?? options.options[0];
  const summary = el('summary', 'composer-picker__trigger');
  summary.append(options.leading);
  if (!options.iconOnly) summary.append(el('span', 'composer-picker__value', selected?.label ?? options.label), icon('chevronDown', 13));
  summary.title = options.label;
  if (options.disabled) summary.setAttribute('aria-disabled', 'true');
  details.append(summary);

  const menu = el('div', `composer-picker__menu ${options.wide ? 'is-wide' : ''}`);
  menu.dataset.pickerMenuOwner = options.id;
  menu.append(el('div', 'composer-picker__title', options.label));
  for (const entry of options.options) {
    const item = button(`composer-picker__item ${entry.value === options.value ? 'is-selected' : ''}`);
    item.disabled = Boolean(entry.disabled);
    const itemCopy = el('span', 'composer-picker__item-copy');
    itemCopy.append(el('strong', '', entry.label));
    if (entry.description) itemCopy.append(el('small', '', entry.description));
    item.append(itemCopy);
    if (entry.value === options.value) item.append(icon('check', 15));
    item.addEventListener('click', (event) => {
      event.preventDefault();
      details.open = false;
      if (entry.disabled || entry.value === options.value) return;
      options.onChange(entry.value);
    });
    menu.append(item);
  }
  details.append(menu);
  const restoreMenu = () => {
    if (menu.parentElement !== details) details.append(menu);
    menu.style.removeProperty('top');
    menu.style.removeProperty('bottom');
    menu.style.removeProperty('left');
    menu.style.removeProperty('right');
    menu.style.removeProperty('width');
  };
  details.addEventListener('toggle', () => {
    if (!details.open) {
      restoreMenu();
      return;
    }
    for (const open of Array.from(document.querySelectorAll<HTMLDetailsElement>('details.composer-picker[open]'))) {
      if (open !== details) open.open = false;
    }
    document.body.append(menu);
    requestAnimationFrame(() => positionPickerMenu(summary, menu));
  });
  return details;
}

function positionPickerMenu(trigger: HTMLElement, menu: HTMLElement): void {
  const rect = trigger.getBoundingClientRect();
  const margin = 10;
  const preferredWidth = menu.classList.contains('is-wide') ? 350 : 300;
  const width = Math.min(preferredWidth, Math.max(210, window.innerWidth - margin * 2));
  const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.left));
  const availableAbove = Math.max(0, rect.top - margin);
  const availableBelow = Math.max(0, window.innerHeight - rect.bottom - margin);
  const openAbove = availableAbove >= 180 || availableAbove >= availableBelow;
  const maxHeight = Math.max(140, Math.min(420, (openAbove ? availableAbove : availableBelow) - 8));
  menu.style.position = 'fixed';
  menu.style.zIndex = '10000';
  menu.style.width = `${width}px`;
  menu.style.maxHeight = `${maxHeight}px`;
  menu.style.left = `${left}px`;
  menu.style.right = 'auto';
  if (openAbove) {
    menu.style.top = 'auto';
    menu.style.bottom = `${Math.max(margin, window.innerHeight - rect.top + 7)}px`;
  } else {
    menu.style.bottom = 'auto';
    menu.style.top = `${Math.min(window.innerHeight - margin, rect.bottom + 7)}px`;
  }
}

function visiblePrimaryStreams(runtime: UiRuntime): StreamRun[] {
  const state = runtime.state!;
  const assistantRunIds = new Set(
    state.conversation.messages
      .filter((message) => message.role === 'assistant')
      .map((message) => message.runId)
      .filter(Boolean)
  );
  const streams = new Map<string, StreamRun>();

  for (const run of runtime.streams.values()) {
    if (run.conversationId !== state.conversation.id || run.kind === 'delegation') continue;
    streams.set(run.runId, run);
  }

  // State updates may arrive before the first streaming event. Synthesize a visible
  // run immediately so the user always gets progress and a working Stop control.
  for (const run of state.activeRuns) {
    if (run.conversationId !== state.conversation.id || run.kind === 'delegation' || streams.has(run.id)) continue;
    streams.set(run.id, {
      runId: run.id,
      conversationId: run.conversationId,
      provider: run.provider,
      text: '',
      status: run.status,
      phase: run.phase,
      activities: run.activities.map((activity) => ({ title: activity.title, ...(activity.detail ? { detail: activity.detail } : {}) })),
      startedAt: new Date(run.startedAt).getTime(),
      ...(run.kind ? { kind: run.kind } : {}),
      ...(run.rootRunId ? { rootRunId: run.rootRunId } : {}),
      ...(run.model ? { model: run.model } : {}),
      ...(run.reasoning ? { reasoning: run.reasoning } : {}),
      ...(run.error ? { error: run.error } : {})
    });
  }

  return [...streams.values()].filter((run) =>
    !assistantRunIds.has(run.runId) || run.phase !== 'completed'
  );
}

function delegationIsVisible(delegation: DelegationRecord): boolean {
  if (delegation.status === 'pending-approval' || delegation.status === 'running') return true;
  return delegation.tasks.some((task) => ['pending', 'queued', 'running'].includes(task.status));
}

function groupDelegations(delegations: DelegationRecord[]): Map<string, DelegationRecord[]> {
  const map = new Map<string, DelegationRecord[]>();
  for (const delegation of delegations) {
    const values = map.get(delegation.rootRunId) ?? [];
    values.push(delegation);
    map.set(delegation.rootRunId, values);
  }
  return map;
}

function firstRecoveryProvider(runtime: UiRuntime, failedProvider: ProviderId) {
  return runtime.state!.providers.find((provider) => provider.id !== failedProvider && provider.healthState === 'ready' && provider.connected !== false);
}

function selectedModel(provider: ProviderId, modelId: string | undefined, runtime: UiRuntime): ModelOption | undefined {
  const models = runtime.state?.providers.find((entry) => entry.id === provider)?.models ?? [];
  return models.find((model) => model.id === modelId) ?? models.find((model) => model.isDefault) ?? models[0];
}

function defaultModel(provider: ProviderId, runtime: UiRuntime): ModelOption | undefined {
  const models = runtime.state?.providers.find((entry) => entry.id === provider)?.models ?? [];
  return models.find((model) => model.isDefault) ?? models[0];
}

function elapsedLabel(startedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function phaseLabel(phase: string): string {
  if (phase === 'queued') return 'In coda';
  if (phase === 'connecting') return 'Connessione';
  if (phase === 'starting-session') return 'Avvio sessione';
  if (phase === 'starting-turn') return 'Avvio richiesta';
  if (phase === 'waiting-first-output') return 'Attesa del primo output';
  if (phase === 'delegating') return 'Coordinamento deleghe';
  if (phase === 'awaiting-approval') return 'In attesa di conferma';
  if (phase === 'integrating') return 'Integrazione risultati';
  if (phase === 'cancelled') return 'Interrotto';
  if (phase === 'failed') return 'Errore';
  return 'Elaborazione';
}

function lastActivityLabel(run: StreamRun): string {
  const last = run.activities.at(-1);
  return last ? `${last.title} · ${run.activities.length} attività` : `${run.activities.length} attività`;
}

function delegationStatus(status: DelegationRecord['status']): HTMLElement {
  const node = el('span', `delegation-status is-${status}`);
  if (status === 'running' || status === 'pending-approval') node.append(el('span', 'task-status__pulse'));
  node.append(el('span', '', status === 'pending-approval' ? 'Da confermare' : status === 'running' ? 'In corso' : status === 'completed' ? 'Completata' : status === 'cancelled' ? 'Annullata' : 'Errore'));
  return node;
}

function taskStatusLabel(status: DelegationTaskRecord['status'], activeStatus?: string): string {
  if (activeStatus && (status === 'running' || status === 'queued')) return activeStatus;
  if (status === 'pending') return 'In attesa';
  if (status === 'queued') return 'In coda';
  if (status === 'running') return 'In corso';
  if (status === 'completed') return 'Completata';
  if (status === 'cancelled') return 'Annullata';
  return 'Errore';
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const temporary = el('textarea') as HTMLTextAreaElement;
  temporary.value = text;
  temporary.style.position = 'fixed';
  temporary.style.opacity = '0';
  document.body.append(temporary);
  temporary.select();
  document.execCommand('copy');
  temporary.remove();
}

function resizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(220, Math.max(42, textarea.scrollHeight))}px`;
}

function usageForModel(usage: UsageSnapshot | undefined, modelFamilyOrLabel: string | undefined): UsageSnapshot | undefined {
  return usage ? withPreferredUsage(usage.provider, usage, modelFamilyOrLabel) : usage;
}

function usageModelReference(runtime: UiRuntime, provider: ProviderId): string | undefined {
  const state = runtime.state!;
  const activeAgent = state.conversation.agentId
    ? state.agents.find((agent) => agent.id === state.conversation.agentId && agent.provider === provider)
    : undefined;
  const configured = activeAgent?.model ?? (state.conversation.provider === provider
    ? state.conversation.model
    : state.preferences.providerDefaults[provider]?.model);
  const status = state.providers.find((entry) => entry.id === provider);
  const model = status?.models.find((entry) => entry.id === configured)
    ?? status?.models.find((entry) => entry.isDefault);
  if (configured && configured !== 'auto') return model?.family ?? model?.label ?? configured;
  return model?.id === 'auto' ? undefined : model?.family ?? model?.label;
}

function usageHealth(remaining: number | undefined): string {
  if (remaining === undefined) return 'is-unknown';
  if (remaining <= 0.15) return 'is-critical';
  if (remaining <= 0.35) return 'is-warning';
  return 'is-healthy';
}
