const { JSDOM } = require('jsdom');
const fs = require('fs');

const dom = new JSDOM('<!doctype html><html><body data-surface="editor"><div id="app"></div></body></html>', {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'https://relay.local/'
});
const { window } = dom;

let persisted;
const posted = [];
window.acquireVsCodeApi = () => ({
  postMessage: (m) => posted.push(m),
  getState: () => persisted,
  setState: (s) => { persisted = s; }
});
if (!window.ResizeObserver) {
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
const createdObjectUrls = [];
const revokedObjectUrls = [];
window.URL.createObjectURL = (file) => {
  const value = `blob:relay-${createdObjectUrls.length + 1}-${file.name}`;
  createdObjectUrls.push(value);
  return value;
};
window.URL.revokeObjectURL = (value) => { revokedObjectUrls.push(value); };
if (!window.File.prototype.arrayBuffer) window.File.prototype.arrayBuffer = async function () { return new Uint8Array(Math.max(1, Math.min(this.size || 1, 32))).buffer; };

const code = fs.readFileSync('dist/webview.js', 'utf8');
window.eval(code);

const providers = ['codex', 'claude', 'antigravity', 'copilot'].map((id, index) => ({
  id,
  label: id[0].toUpperCase() + id.slice(1),
  available: true,
  version: '1.0.0',
  authenticated: true,
  models: [{
    id: `${id}-model`,
    label: `${id} model`,
    isDefault: true,
    reasoning: [{ id: 'high', label: 'High' }],
    defaultReasoning: 'high'
  }],
  ...(index === 2 ? { nativeBridgeAvailable: false, cliAvailable: true } : {})
}));

const providerDefaults = Object.fromEntries(providers.map((p) => [p.id, { model: 'auto', reasoning: 'auto', permission: 'workspace-write', delegationModel: 'relay-auto' }]));

const conversationA = {
  id: 'conv-a', projectId: 'proj-1', title: 'Chat A', provider: 'codex',
  model: 'auto', reasoning: 'auto', permission: 'workspace-write', delegationPolicy: 'confirm',
  messages: [{ role: 'user', text: 'ciao', runId: 'run-a', createdAt: new Date().toISOString() }],
  delegations: [], providerSessions: {}, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString()
};

const summaries = [
  { id: 'conv-a', projectId: 'proj-1', title: 'Chat A', provider: 'codex', pinned: false, archived: false, messageCount: 1, updatedAt: new Date().toISOString() },
  { id: 'conv-b', projectId: 'proj-1', title: 'Chat B', provider: 'claude', pinned: false, archived: false, messageCount: 3, updatedAt: new Date().toISOString() },
  { id: 'conv-c', projectId: 'proj-1', title: 'Chat C', provider: 'copilot', pinned: false, archived: false, messageCount: 2, updatedAt: new Date().toISOString() }
];

const baseState = {
  workspace: { id: 'proj-1', name: 'demo', cwd: '/tmp/demo', isGit: true },
  projects: [{ id: 'proj-1', name: 'demo', path: '/tmp/demo', isGit: true, lastOpenedAt: new Date().toISOString() }],
  providers,
  usage: [],
  conversation: conversationA,
  conversations: summaries,
  archivedConversations: [],
  rules: [],
  agents: [],
  scheduler: { active: [], queued: [], maxParallel: 3 },
  activeRuns: [
    { id: 'run-a', conversationId: 'conv-a', provider: 'codex', permission: 'workspace-write', phase: 'working', status: 'Risposta in corso…', startedAt: new Date(Date.now() - 65000).toISOString(), updatedAt: new Date().toISOString(), activities: [], kind: 'primary', rootRunId: 'run-a', depth: 0 },
    { id: 'run-b', conversationId: 'conv-b', provider: 'claude', permission: 'workspace-write', phase: 'connecting', status: 'Connessione…', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), activities: [], kind: 'primary', rootRunId: 'run-b', depth: 0 }
  ],
  pendingDelegations: [],
  projectConversations: {},
  projectArchivedConversations: {},
  diagnostics: [],
  preferences: {
    defaultProvider: 'codex', delegationPolicy: 'confirm', exposeUsageToAgents: true,
    privacyShield: false, quotaWarningThreshold: 0.25, quotaCriticalThreshold: 0.1, providerDefaults
  },
  onboardingComplete: true,
  usageRefreshing: false,
  contextItems: [{ kind: 'file', relativePath: 'src/index.ts' }],
  antigravityUsageBridge: { enabled: false, available: false },
  remoteAccess: { enabled: false, activeSessions: [], platform: 'linux', computerName: 'demo-pc', diagnostics: [], urls: [] },
  privacyShieldSetup: { provisioned: false, phase: 'idle' },
  systemReadiness: {
    checkedAt: new Date().toISOString(), platform: 'linux', arch: 'x64',
    components: [
      { id: 'runtime', label: 'Runtime Relay', state: 'ready', version: 'v22', detail: 'Integrato', requiredFor: ['Remoto'], installable: false },
      { id: 'git', label: 'Git', state: 'ready', version: 'git 2.45', detail: 'Pronto', requiredFor: ['Worktree'], installable: true },
      { id: 'node', label: 'Node.js esterno', state: 'missing', detail: 'Non rilevato', requiredFor: ['CLI'], installable: true },
      { id: 'npm', label: 'npm', state: 'missing', detail: 'Non rilevato', requiredFor: ['CLI'], installable: true },
      { id: 'curl', label: 'curl', state: 'ready', version: 'curl 8', detail: 'Pronto', requiredFor: ['CLI'], installable: true },
      { id: 'browser', label: 'Browser', state: 'ready', detail: 'Pronto', requiredFor: ['Browser'], installable: true }
    ],
    features: {
      remote: { ready: true, title: 'Accesso remoto', detail: 'Runtime integrato', missing: [] },
      parallelWrites: { ready: true, title: 'Scritture parallele isolate', detail: 'Git pronto', missing: [] },
      browserAutomation: { ready: true, title: 'Browser Agent', detail: 'Browser pronto', missing: [] }
    }
  }
};

function dispatch(message) {
  window.dispatchEvent(new window.MessageEvent('message', { data: message }));
}
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 60));
}
const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => [...window.document.querySelectorAll(selector)];

let failures = 0;
function check(name, condition) {
  if (condition) console.log('  PASS', name);
  else { failures += 1; console.log('  FAIL', name); }
}

(async () => {
  console.log('boot recovery + first state');
  dispatch({ type: 'initializationError', payload: { message: 'storage test failure' } });
  await flush();
  check('initialization error produces actionable recovery UI', Boolean($('.boot-recovery')) && window.document.body.textContent.includes('storage test failure'));
  dispatch({ type: 'state', payload: baseState });
  await flush();
  check('webviewReady posted', posted.some((m) => m.type === 'webviewReady'));
  check('workspace rendered', Boolean($('.workspace-app')));
  check('composer rendered', Boolean($('#relay-composer-input')));

  console.log('job model — topbar + library');
  check('topbar jobs pill shows 2', $('.topbar-jobs')?.textContent.includes('2 in corso'));
  check('running badge on background chat B', Boolean($('.conversation-item.is-job-running .conversation-item__status.is-running')));
  check('running subtitle on chat B', $$('.conversation-item').some((item) => item.textContent.includes('Chat B') && item.textContent.includes('In esecuzione…')));
  check('live elapsed label present', Boolean($('[data-elapsed-start]')));

  console.log('run bar in active chat');
  check('stream run bar rendered', Boolean($('.run-progress')));
  check('stop control rendered', Boolean($('.run-stop')));
  check('parallel hint in footer', Boolean($('.composer-parallel-hint')));

  console.log('incremental streaming keeps workspace and message DOM identity');
  const workspaceBeforeDeltas = $('.workspace-app');
  const userMessageBeforeDeltas = $('.message--user');
  const composerBeforeDeltas = $('#relay-composer-input');
  const streamScroll = $('.message-scroll');
  Object.defineProperty(streamScroll, 'scrollHeight', { configurable: true, value: 2000 });
  Object.defineProperty(streamScroll, 'clientHeight', { configurable: true, value: 500 });
  streamScroll.scrollTop = 200;
  composerBeforeDeltas.value = 'bozza stabile';
  composerBeforeDeltas.focus();
  composerBeforeDeltas.setSelectionRange(4, 8);
  for (let index = 0; index < 100; index += 1) {
    dispatch({ type: 'agentEvent', payload: { type: 'delta', runId: 'run-a', text: `delta-${index} ` } });
  }
  await new Promise((resolve) => setTimeout(resolve, 120));
  check('workspace root is not recreated for 100 deltas', $('.workspace-app') === workspaceBeforeDeltas);
  check('completed user message keeps DOM identity', $('.message--user') === userMessageBeforeDeltas);
  check('composer node and draft survive 100 deltas', $('#relay-composer-input') === composerBeforeDeltas && composerBeforeDeltas.value === 'bozza stabile');
  check('composer focus and caret survive 100 deltas', window.document.activeElement === composerBeforeDeltas && composerBeforeDeltas.selectionStart === 4 && composerBeforeDeltas.selectionEnd === 8);
  check('reader scroll position is not forced to bottom', streamScroll.scrollTop === 200);

  console.log('stream protocol hiding + caret preservation');
  const typing = $('#relay-composer-input');
  typing.value = 'abcdef';
  typing.focus();
  typing.setSelectionRange(2, 4);
  dispatch({ type: 'state', payload: JSON.parse(JSON.stringify(baseState)) });
  await flush();
  const restoredTyping = $('#relay-composer-input');
  check('focused composer survives state re-render', window.document.activeElement === restoredTyping);
  check('composer caret selection survives state re-render', restoredTyping.selectionStart === 2 && restoredTyping.selectionEnd === 4);
  dispatch({ type: 'agentEvent', payload: { type: 'delta', runId: 'run-a', text: 'Analisi iniziale <relay-del' } });
  dispatch({ type: 'agentEvent', payload: { type: 'delta', runId: 'run-a', text: 'egate>{"tasks":[]}' } });
  await new Promise((resolve) => setTimeout(resolve, 140));
  check('delegation protocol is hidden as soon as its opening tag completes', !window.document.body.textContent.includes('<relay-delegate>') && !window.document.body.textContent.includes('tasks'));
  check('visible text before delegation protocol is preserved', window.document.body.textContent.includes('Analisi iniziale'));
  check('stream switches to delegation status without waiting for closing tag', window.document.body.textContent.includes('Preparazione della delega'));

  console.log('delegation visibility follows child run phases');
  const delegationState = JSON.parse(JSON.stringify(baseState));
  delegationState.conversation = {
    ...conversationA,
    messages: [{ role: 'user', text: 'Analizza e delega il controllo', runId: 'root-delegation', createdAt: new Date().toISOString() }],
    delegations: [{
      id: 'delegation-1', rootRunId: 'root-delegation', requestedBy: 'codex', strategy: 'sequential', status: 'running',
      createdAt: new Date().toISOString(), depth: 0, reason: 'Verifica specializzata',
      tasks: [{
        id: 'child-delegation', provider: 'claude', label: 'Controllo specializzato', prompt: 'Analizza il codice',
        permission: 'read-only', status: 'running', model: 'sonnet', reasoning: 'high', complexity: 'complex'
      }]
    }]
  };
  delegationState.activeRuns = [
    { id: 'root-delegation', conversationId: 'conv-a', provider: 'codex', permission: 'workspace-write', phase: 'delegating', status: 'Delega in corso', startedAt: new Date(Date.now() - 25_000).toISOString(), updatedAt: new Date().toISOString(), activities: [], kind: 'primary', rootRunId: 'root-delegation', depth: 0 },
    { id: 'child-delegation', conversationId: 'conv-a', provider: 'claude', permission: 'read-only', phase: 'waiting-first-output', status: 'In attesa del primo output…', startedAt: new Date(Date.now() - 15_000).toISOString(), updatedAt: new Date().toISOString(), activities: [{ title: 'Processo avviato', detail: 'Claude Code è vivo' }], kind: 'delegation', rootRunId: 'root-delegation', parentRunId: 'root-delegation', taskLabel: 'Controllo specializzato', model: 'sonnet', depth: 1 }
  ];
  dispatch({ type: 'state', payload: delegationState });
  await flush();
  check('delegation card identifies primary and delegated providers', $('.delegation-card')?.textContent.includes('Codex') && $('.delegation-task')?.textContent.includes('Claude') && $('.delegation-task')?.textContent.includes('sonnet'));
  check('delegation prompt is collapsed behind a compact summary', Boolean($('.delegation-task__prompt-details')) && !$('.delegation-task__prompt-details').open && $('.delegation-task__prompt-summary')?.textContent.includes('Prompt delegato'));
  check('delegation card shows phase, last activity and elapsed heartbeat', $('.delegation-task__live')?.textContent.includes('In attesa del primo output') && $('.delegation-task__live')?.textContent.includes('Claude Code è vivo') && Boolean($('.delegation-task__live [data-elapsed-start]')));
  dispatch({ type: 'agentEvent', payload: { type: 'delta', runId: 'child-delegation', text: 'Output parziale verificato.' } });
  await flush();
  check('delegation card exposes partial child output', $('.delegation-task__output')?.textContent.includes('Output parziale verificato'));
  dispatch({ type: 'agentEvent', payload: { type: 'error', runId: 'child-delegation', message: 'Permesso negato', failure: { provider: 'claude', category: 'permission-denied', message: 'Permesso negato', retryable: false, suggestedActions: ['review-permissions'] } } });
  await flush();
  check('delegation card exposes permission denial without hiding primary run', $('.delegation-task__live')?.textContent.includes('Permesso negato') && Boolean($('.run-progress')));
  dispatch({ type: 'agentEvent', payload: { type: 'error', runId: 'child-delegation', message: 'Limite raggiunto', failure: { provider: 'claude', category: 'rate-limit', message: 'Limite raggiunto', resetAt: '02:10 Europe/Rome', retryable: true, suggestedActions: ['continue-other-provider'] } } });
  await flush();
  check('delegation card exposes rate limit and reset time', $('.delegation-task__live')?.textContent.includes('Limite raggiunto') && $('.delegation-task__failure-note')?.textContent.includes('02:10 Europe/Rome'));
  dispatch({ type: 'agentEvent', payload: { type: 'complete', runId: 'child-delegation', result: { runId: 'child-delegation', provider: 'claude', text: 'Completato', model: 'sonnet' } } });
  await flush();
  check('delegation child completion patches only its card', $('.delegation-task__live')?.textContent.includes('Completato') && $('.workspace-app')?.isConnected);
  const completedDelegationState = JSON.parse(JSON.stringify(delegationState));
  completedDelegationState.conversation.messages.push({ role: 'assistant', text: 'Risultato finale integrato.', runId: 'root-delegation', provider: 'codex', createdAt: new Date().toISOString() });
  completedDelegationState.conversation.delegations[0].status = 'completed';
  completedDelegationState.conversation.delegations[0].tasks[0].status = 'completed';
  completedDelegationState.activeRuns = [];
  dispatch({ type: 'state', payload: completedDelegationState });
  await flush();
  check('completed delegations disappear once the final answer is available', !$('.delegation-card') && window.document.body.textContent.includes('Risultato finale integrato.'));
  dispatch({ type: 'state', payload: baseState });
  await flush();

  console.log('background completion → unseen badge');
  dispatch({ type: 'agentEvent', payload: { type: 'complete', runId: 'run-b', result: { text: 'fatto', provider: 'claude' } } });
  const stateAfterB = JSON.parse(JSON.stringify(baseState));
  stateAfterB.activeRuns = stateAfterB.activeRuns.filter((run) => run.id !== 'run-b');
  dispatch({ type: 'state', payload: stateAfterB });
  await flush();
  check('unseen done badge on chat B', Boolean($('.conversation-item.is-job-done .conversation-item__status.is-done')));
  check('done subtitle on chat B', $$('.conversation-item').some((item) => item.textContent.includes('Chat B') && item.textContent.includes('Completata · da leggere')));
  check('topbar unseen dot', Boolean($('.topbar-unseen-dot')));
  check('jobs pill now 1', $('.topbar-jobs')?.textContent.includes('1 in corso'));
  check('unseen persisted', persisted?.unseenByConversation?.['conv-b'] === 'done');

  console.log('failed background run via state snapshot');
  const stateWithFail = JSON.parse(JSON.stringify(stateAfterB));
  stateWithFail.activeRuns.push({ id: 'run-c', conversationId: 'conv-c', provider: 'copilot', permission: 'workspace-write', phase: 'failed', status: 'Errore', error: 'boom', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), activities: [], kind: 'primary', rootRunId: 'run-c', depth: 0 });
  dispatch({ type: 'state', payload: stateWithFail });
  await flush();
  check('unseen error badge on chat C', Boolean($('.conversation-item.is-job-error .conversation-item__status.is-error')));

  console.log('opening chat B clears its badge');
  const itemB = $$('.conversation-item__main').find((node) => node.textContent.includes('Chat B'));
  itemB.click();
  check('selectConversation posted', posted.some((m) => m.type === 'selectConversation' && m.payload.id === 'conv-b'));
  const stateOnB = JSON.parse(JSON.stringify(stateWithFail));
  stateOnB.conversation = { ...conversationA, id: 'conv-b', title: 'Chat B', provider: 'claude' };
  dispatch({ type: 'state', payload: stateOnB });
  await flush();
  check('badge for B cleared', !$$('.conversation-item').some((item) => item.textContent.includes('Chat B') && item.classList.contains('is-job-done')));
  check('unseen cleared from persistence', !persisted?.unseenByConversation?.['conv-b']);
  check('error badge on C survives', Boolean($('.conversation-item.is-job-error')));

  console.log('full-access inline confirm');
  const stateIdle = JSON.parse(JSON.stringify(stateOnB));
  stateIdle.activeRuns = [];
  dispatch({ type: 'state', payload: stateIdle });
  await flush();
  const permissionPicker = $('details.composer-picker[data-picker="permission"]');
  permissionPicker.open = true;
  permissionPicker.dispatchEvent(new window.Event('toggle'));
  await flush();
  const fullAccess = $$('[data-picker-menu-owner="permission"] .composer-picker__item').find((item) => item.textContent.includes('Accesso completo'));
  fullAccess.click();
  await flush();
  check('inline confirm rendered', Boolean($('.composer-confirm')));
  check('no setSelection yet for full access', !posted.some((m) => m.type === 'setSelection' && m.payload.permission === 'danger-full-access'));
  $$('.composer-confirm__actions button').find((b) => b.textContent === 'Consenti').click();
  await flush();
  check('setPermission posted after confirm', posted.some((m) => m.type === 'setPermission' && m.payload.permission === 'danger-full-access'));
  check('confirm dismissed', !$('.composer-confirm'));

  console.log('settings accordion');
  const settingsButtons = $$('.primary-nav__item');
  settingsButtons[settingsButtons.length - 1].click();
  await flush();
  const accordions = $$('details.settings-accordion');
  check('four settings accordions', accordions.length === 4);
  check('custom agents removed from settings', !window.document.body.textContent.includes('Agenti custom'));
  check('only first open by default', accordions[0].open && accordions.slice(1).every((a) => !a.open));
  accordions[1].open = true;
  accordions[1].dispatchEvent(new window.Event('toggle'));
  await flush();
  const delegationSelect = $('.provider-default-field select');
  const providerFields = $$('.provider-default-field');
  check('provider settings expose four labelled defaults', providerFields.length === providers.length * 4);
  const codexDelegation = providerFields.find((field) => field.textContent.includes('Deleghe'))?.querySelector('select');
  check('delegation default offers Relay smart routing', Boolean(codexDelegation && [...codexDelegation.options].some((option) => option.value === 'relay-auto')));
  if (codexDelegation) {
    codexDelegation.value = 'codex-model';
    codexDelegation.dispatchEvent(new window.Event('change', { bubbles: true }));
  }
  check('delegation model update is posted independently', posted.some((m) => m.type === 'updateProviderDefaults' && m.payload.delegationModel === 'codex-model'));
  accordions[1].open = true;
  accordions[1].dispatchEvent(new window.Event('toggle'));
  accordions[0].open = false;
  accordions[0].dispatchEvent(new window.Event('toggle'));
  settingsButtons[0].click();
  await flush();
  settingsButtons[settingsButtons.length - 1].click();
  await flush();
  const reopened = $$('details.settings-accordion');
  check('accordion state persists across navigation', !reopened[0].open && reopened[1].open);

  console.log('non-chat streaming leaves settings DOM and section scroll untouched');
  const settingsPageBeforeDeltas = $('.content-page');
  const accordionBeforeDeltas = $('details.settings-accordion');
  Object.defineProperty(settingsPageBeforeDeltas, 'scrollHeight', { configurable: true, value: 1800 });
  Object.defineProperty(settingsPageBeforeDeltas, 'clientHeight', { configurable: true, value: 500 });
  settingsPageBeforeDeltas.scrollTop = 460;
  for (let index = 0; index < 20; index += 1) {
    dispatch({ type: 'agentEvent', payload: { type: 'delta', runId: 'settings-stream', text: `background-${index} ` } });
  }
  await new Promise((resolve) => setTimeout(resolve, 130));
  check('settings page is not rebuilt for background deltas', $('.content-page') === settingsPageBeforeDeltas && accordionBeforeDeltas === $('details.settings-accordion') && accordionBeforeDeltas.isConnected);
  check('settings scroll remains stable during background deltas', settingsPageBeforeDeltas.scrollTop === 460);
  $('.primary-nav__item[title="Chat"]')?.click();
  await flush();
  check('background stream text is complete on return to chat', $('.message--stream')?.textContent.includes('background-19'));

  console.log('desktop attachment draft, validation, cleanup and guarded send');
  const attachmentTextarea = $('#relay-composer-input');
  attachmentTextarea.value = 'Controlla questa immagine';
  attachmentTextarea.dispatchEvent(new window.Event('input', { bubbles: true }));
  const image = new window.File([new Uint8Array([1, 2, 3, 4])], 'schermata.png', { type: 'image/png' });
  const pasteImage = new window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(pasteImage, 'clipboardData', { value: { files: [image] } });
  attachmentTextarea.dispatchEvent(pasteImage);
  await flush();
  check('pasted image creates an attachment chip and preview', Boolean($('.composer-attachment')) && createdObjectUrls.length === 1);
  check('clipboard preview uses its blob URL', $('.composer-attachment__preview')?.getAttribute('src') === createdObjectUrls[0]);
  const composerChildren = Array.from($('.composer').children);
  check('attachment cards render above the textarea', composerChildren.indexOf($('.composer-attachments')) < composerChildren.indexOf($('#relay-composer-input')));
  check('attachment trigger is a clean icon-only control', !$('.composer-attachment-button')?.textContent.trim() && $('.composer-attachment-button')?.getAttribute('aria-label') === 'Aggiungi allegati');
  const attachmentChipBeforeState = $('.composer-attachment');
  dispatch({ type: 'state', payload: stateIdle });
  await flush();
  check('attachment survives a state-driven render with draft text intact', Boolean($('.composer-attachment')) && $('#relay-composer-input').value === 'Controlla questa immagine');
  $('.composer-attachment__remove')?.click();
  await flush();
  check('attachment removal revokes its object URL', !$('.composer-attachment') && revokedObjectUrls.includes(createdObjectUrls[0]));

  const oversizedTextarea = $('#relay-composer-input');
  oversizedTextarea.value = 'bozza da preservare';
  oversizedTextarea.dispatchEvent(new window.Event('input', { bubbles: true }));
  const oversized = new window.File([new Uint8Array([9])], 'troppo-grande.png', { type: 'image/png' });
  Object.defineProperty(oversized, 'size', { configurable: true, value: 21 * 1024 * 1024 });
  const pasteOversized = new window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(pasteOversized, 'clipboardData', { value: { files: [oversized] } });
  oversizedTextarea.dispatchEvent(pasteOversized);
  await flush();
  check('oversized file shows a readable per-file error', $('.composer-attachment.is-error')?.textContent.includes('20 MB'));
  check('oversized file does not erase the text draft', $('#relay-composer-input').value === 'bozza da preservare');
  $('.composer-attachment__remove')?.click();
  await flush();

  const sendTextarea = $('#relay-composer-input');
  sendTextarea.value = 'Analizza il file';
  sendTextarea.dispatchEvent(new window.Event('input', { bubbles: true }));
  const textFile = new window.File(['relay'], 'specifiche.md', { type: 'text/markdown' });
  const pasteText = new window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(pasteText, 'dataTransfer', { value: { files: [textFile], types: ['Files'] } });
  $('.composer')?.dispatchEvent(pasteText);
  await flush();
  const formBeforeSave = $('.composer-dock form, form.composer');
  const saveCountBefore = posted.filter((m) => m.type === 'saveChatAttachments').length;
  formBeforeSave.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  formBeforeSave.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  const saveMessages = posted.filter((m) => m.type === 'saveChatAttachments').slice(saveCountBefore);
  check('double submit produces one attachment save request', saveMessages.length === 1);
  const saveRequest = saveMessages[0];
  dispatch({ type: 'attachmentsSaved', payload: { requestId: saveRequest.payload.requestId, files: [{ id: saveRequest.payload.attachments[0].id, name: 'specifiche.md', mimeType: 'text/markdown', size: 5, localPath: '/tmp/relay/attachments/id-specifiche.md' }] } });
  await new Promise((resolve) => setTimeout(resolve, 120));
  const attachmentSend = posted.filter((m) => m.type === 'sendMessage').at(-1);
  check('provider prompt receives the local attachment block', attachmentSend?.payload.prompt.includes('## Allegati') && attachmentSend.payload.prompt.includes('/tmp/relay/attachments/id-specifiche.md'));
  check('display prompt stays human-readable without leaking the injected block', attachmentSend?.payload.displayPrompt === 'Analizza il file');
  check('sent attachment is consumed and removed from the draft', !$('.composer-attachment'));

  console.log('dedicated agents studio');
  const agentsNav = $('.primary-nav__item[title="Agenti"]');
  agentsNav.click();
  await flush();
  check('agents has dedicated page', Boolean($('.agents-page')));
  check('agents not rendered as settings accordion', !Boolean($('.agents-page details.settings-accordion')));
  $('.agents-header .button--primary').click();
  await flush();
  check('inline agent editor rendered', Boolean($('.agent-editor__form')));
  check('MCP controls are temporarily hidden from agents', !$('.agent-editor__form').textContent.includes('MCP'));
  check('agent advanced options are collapsed by default', Boolean($('.agent-advanced')) && !$('.agent-advanced').open);
  const agentName = $('.agent-editor__form input.agent-input');
  agentName.value = 'Code Reviewer';
  agentName.dispatchEvent(new window.Event('input', { bubbles: true }));
  const agentPermission = $$('.agent-editor__form select').find((select) => [...select.options].some((option) => option.value === 'read-only') && [...select.options].some((option) => option.value === 'workspace-write'));
  check('agent editor exposes read-only, workspace and full-access modes', Boolean(agentPermission) && [...agentPermission.options].some((option) => option.value === 'danger-full-access'));
  agentPermission.value = 'workspace-write';
  agentPermission.dispatchEvent(new window.Event('change', { bubbles: true }));
  $('.agent-editor__form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  check('saveAgent posted from inline form', posted.some((m) => m.type === 'saveAgent' && m.payload.name === 'Code Reviewer'));
  check('agent filesystem permission is persisted', posted.some((m) => m.type === 'saveAgent' && m.payload.name === 'Code Reviewer' && m.payload.permission === 'workspace-write'));
  settingsButtons[4].click();
  await flush();
  $('.rules-header .button--primary')?.click();
  await flush();
  check('rule advanced options are collapsed by default', Boolean($('.rule-advanced')) && !$('.rule-advanced').open);
  check('no native createAgent prompt posted', !posted.some((m) => m.type === 'createAgent' || m.type === 'editAgent'));

  console.log('sidebar direct icon navigation');
  window.document.body.dataset.surface = 'sidebar';
  dispatch({ type: 'state', payload: stateIdle });
  await flush();
  check('overflow section menu removed', !Boolean($('.sidebar-section-menu')));
  check('text Agent Studio shortcut removed', !Boolean($('.sidebar-agents-shortcut')));
  check('all nine primary section icons are direct in header', $$('.topbar-section-nav__item').length === 9);
  $('.topbar-section-nav__item[title="Agenti"]')?.click();
  await flush();
  check('header Agent Studio icon opens agents', Boolean($('.agents-page')));
  dispatch({ type: 'uiCommand', payload: { action: 'open-agents' } });
  await flush();
  check('open-agents UI command opens dedicated page', Boolean($('.agents-page')));
  $('.topbar-section-nav__item[title="Remoto"]')?.click();
  await flush();
  check('remote page is reachable from header icon', Boolean($('.remote-page')));
  check('remote preflight shows integrated runtime', Boolean($('.remote-preflight')) && $('.remote-page')?.textContent.includes('Runtime'));
  $('.remote-page .button--primary')?.click();
  check('start remote action posted', posted.some((m) => m.type === 'startRemoteAccess'));

  $('.topbar-section-nav__item[title="Diagnostica"]')?.click();
  await flush();
  check('diagnostics exposes setup readiness wizard', Boolean($('.readiness-panel')) && $$('.readiness-component').length >= 5);
  $('.readiness-component.is-missing .button')?.click();
  check('missing component install action posted', posted.some((m) => m.type === 'installSystemComponent'));
  window.document.body.dataset.surface = 'editor';

  console.log('usage popup uses selected five-hour pool and clear Copilot labels');
  const usageState = JSON.parse(JSON.stringify(baseState));
  usageState.activeRuns = [];
  usageState.conversation = {
    ...conversationA,
    provider: 'antigravity',
    model: 'Gemini 3.5 Flash (High)'
  };
  const antigravityProvider = usageState.providers.find((provider) => provider.id === 'antigravity');
  antigravityProvider.models = [
    { id: 'auto', label: 'Automatico', isDefault: true, family: 'multi-provider', reasoning: [] },
    { id: 'Gemini 3.5 Flash (High)', label: 'Gemini 3.5 Flash · High', family: 'Gemini', reasoning: [] },
    { id: 'Claude Sonnet 4.6 (Thinking)', label: 'Claude Sonnet 4.6 · Thinking', family: 'Claude and GPT', reasoning: [] }
  ];
  const copilotProvider = usageState.providers.find((provider) => provider.id === 'copilot');
  copilotProvider.models = [
    { id: 'auto', label: 'Automatico', isDefault: true, reasoning: [] },
    { id: 'gpt-5.4', label: 'GPT 5.4', reasoning: [{ id: 'high', label: 'High' }] },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', reasoning: [] }
  ];
  copilotProvider.capabilities = { modelInventorySource: 'cli-help', modelAccessMode: 'explicit' };
  usageState.usage = [
    {
      provider: 'codex', available: true, remainingFraction: 0.80, updatedAt: new Date().toISOString(),
      buckets: [
        { id: 'codex-five', label: '5 ore', group: 'Codex', kind: 'five-hour', remainingFraction: 0.80 },
        { id: 'codex-weekly', label: 'Settimanale', group: 'Codex', kind: 'weekly', remainingFraction: 0.45 }
      ]
    },
    {
      provider: 'antigravity', available: true, remainingFraction: 0.07, updatedAt: new Date().toISOString(),
      buckets: [
        { id: 'gemini-weekly', label: 'Settimanale', group: 'Gemini', kind: 'weekly', remainingFraction: 0.30 },
        { id: 'gemini-five', label: '5 ore', group: 'Gemini', kind: 'five-hour', remainingFraction: 1 },
        { id: 'other-weekly', label: 'Settimanale', group: 'Claude e GPT', kind: 'weekly', remainingFraction: 0.07 },
        { id: 'other-five', label: '5 ore', group: 'Claude e GPT', kind: 'five-hour', remainingFraction: 0.97 }
      ]
    },
    {
      provider: 'copilot', available: true, updatedAt: new Date().toISOString(),
      buckets: [
        { id: 'credits-total', label: 'Totale mese', group: 'Crediti AI', kind: 'monthly', used: 42.91, unit: 'credits' },
        { id: 'credits-model-gpt-5-4', label: 'GPT-5.4', group: 'AI Credits per modello', kind: 'monthly', used: 37.89, unit: 'credits' },
        { id: 'credits-model-claude-sonnet-4-6', label: 'Claude Sonnet 4.6', group: 'AI Credits per modello', kind: 'monthly', used: 5.02, unit: 'credits' },
        { id: 'requests-total', label: 'Totale mese', group: 'Richieste premium', kind: 'monthly', used: 0, unit: 'requests' }
      ]
    }
  ];
  dispatch({ type: 'state', payload: usageState });
  dispatch({ type: 'uiCommand', payload: { action: 'open-chat' } });
  await flush();
  const gaugeButton = $('.composer-usage-button');
  gaugeButton?.click();
  await flush();
  const antigravityRow = $$('.usage-popover__row').find((row) => row.textContent.includes('Antigravity'));
  check('all four Antigravity buckets visible in popup', antigravityRow?.querySelectorAll('.usage-popover__bucket').length === 4);
  check('selected Gemini five-hour pool drives Antigravity headline', antigravityRow?.querySelector('.usage-popover__metric')?.textContent.includes('100%') && antigravityRow.textContent.includes('Gemini · 5 ore'));
  const codexRow = $$('.usage-popover__row').find((row) => row.textContent.includes('Codex'));
  check('Codex uses the same grouped window UI', codexRow?.querySelectorAll('.usage-popover__bucket').length === 2 && codexRow.textContent.includes('5 ore') && codexRow.textContent.includes('settimana'));
  const copilotRow = $$('.usage-popover__row').find((row) => row.textContent.includes('GitHub Copilot'));
  check('Copilot total is separated from per-model credits', copilotRow?.textContent.includes('Totale mese') && copilotRow.textContent.includes('GPT-5.4') && copilotRow.textContent.includes('Claude Sonnet 4.6'));

  const claudePoolState = JSON.parse(JSON.stringify(usageState));
  claudePoolState.conversation.model = 'Claude Sonnet 4.6 (Thinking)';
  dispatch({ type: 'state', payload: claudePoolState });
  dispatch({ type: 'uiCommand', payload: { action: 'open-chat' } });
  await flush();
  const gaugeButton2 = $('.composer-usage-button');
  gaugeButton2?.click();
  await flush();
  const antigravityRow2 = $$('.usage-popover__row').find((row) => row.textContent.includes('Antigravity'));
  check('selected Claude/GPT five-hour pool drives Antigravity headline', antigravityRow2?.querySelector('.usage-popover__metric')?.textContent.includes('97%') && antigravityRow2.textContent.includes('Claude/GPT · 5 ore'));

  $('.usage-popover__footer')?.click();
  await flush();
  check('Copilot model inventory is visible in usage details', $('.capacity-model-access')?.textContent.includes('GPT 5.4') && $('.capacity-model-access')?.textContent.includes('Gemini 3.5 Flash'));

  console.log('agent entity and readable mentions');
  const chatNav = $$('.primary-nav__item')[0];
  if (chatNav) chatNav.click();
  await flush();
  const agentState = JSON.parse(JSON.stringify(stateIdle));
  agentState.agents = [{
    id: 'agent-clock', name: 'Orologio', bio: 'Ora locale', specialization: 'Tempo', provider: 'codex',
    model: 'codex-model', reasoning: 'high', enabled: true, canDelegate: false, visibleInChat: true,
    globalVisible: true, projectIds: [], mcpServers: [], taskCount: 2,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  }];
  agentState.conversation = {
    ...conversationA,
    agentId: 'agent-clock',
    messages: [{ role: 'user', text: 'chiedi a @Orologio', provider: 'codex', agentId: 'agent-clock', agentName: 'Orologio', createdAt: new Date().toISOString() }]
  };
  dispatch({ type: 'state', payload: agentState });
  await flush();
  check('selected agent has dedicated glyph', Boolean($('.conversation-subtitle .agent-glyph')));
  check('selected agent hides model picker', !Boolean($('details.composer-picker[data-picker="model"]')));
  check('selected agent hides reasoning picker', !Boolean($('details.composer-picker[data-picker="reasoning"]')));
  check('selected agent name is visible', $('.conversation-subtitle')?.textContent.includes('Orologio'));
  check('agent mention renders as a styled chip', Boolean($('.mention-chip--agent')) && $('.mention-chip--agent')?.textContent.includes('@Orologio'));
  const composer = $('#relay-composer-input');
  composer.value = '@oro';
  composer.setSelectionRange(4, 4);
  composer.dispatchEvent(new window.Event('input', { bubbles: true }));
  await flush();
  const selectionPostsBeforeMention = posted.filter((message) => message.type === 'selectAgent').length;
  const agentMention = $$('.mention-option').find((item) => item.textContent.includes('Orologio'));
  if (agentMention) agentMention.click();
  check('mention autocomplete inserts readable agent name', composer.value.includes('@Orologio'));
  check('mention autocomplete keeps the current provider primary', posted.filter((message) => message.type === 'selectAgent').length === selectionPostsBeforeMention);

  console.log('ticker updates elapsed labels in place');
  settingsButtons[0].click();
  const stateTicking = JSON.parse(JSON.stringify(baseState));
  dispatch({ type: 'state', payload: stateTicking });
  await flush();
  const label = $('[data-elapsed-start]');
  const before = label.textContent;
  label.dataset.elapsedStart = String(Date.now() - 3_600_000);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  check('elapsed label ticked without re-render', label.isConnected && label.textContent !== before && /m /.test(label.textContent));

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECKS FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error('SMOKE CRASH:', error); process.exit(1); });
