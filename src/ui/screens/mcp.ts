import type { McpAuthType, McpScope, McpServerRecord, ProviderId } from '../../core/types.js';
import { MCP_TEMPLATES } from '../../core/types.js';
import { button, el, icon, iconButton, providerGlyph } from '../dom.js';
import type { UiRuntime } from '../types.js';

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'antigravity', label: 'Antigravity' }
];

interface McpDraft {
  editing?: { provider: ProviderId; name: string; scope: McpScope };
  name: string;
  target: string;
  scope: McpScope;
  providers: ProviderId[];
  headersText: string;
  bearerToken: string;
  oauthClientId: string;
  oauthClientSecret: string;
}

export function renderMcp(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const local = runtime as any;
  const page = el('section', 'content-page mcp-page');

  const draft: McpDraft | undefined = local.mcpDraft;
  const servers = state.mcp.servers as McpServerRecord[];

  const header = el('header', 'page-header mcp-header');
  const copy = el('div');
  copy.append(el('span', 'eyebrow', 'Context protocol'), el('h1', '', 'MCP'));
  copy.append(el('p', '', 'Server MCP remoti collegati ai provider Relay tramite URL. Nessuna configurazione locale, nessun segreto in chiaro.'));
  header.append(copy);
  page.append(header);

  if (draft) {
    page.append(renderMcpEditor(runtime, draft));
    return page;
  }

  if (state.mcp.errors.length) {
    const warning = el('section', 'mcp-warning');
    warning.append(icon('warning', 17));
    const warningCopy = el('div');
    warningCopy.append(el('strong', '', 'Alcuni provider non hanno restituito l’inventario'));
    for (const item of state.mcp.errors) warningCopy.append(el('span', '', `${providerName(item.provider)}: ${item.message}`));
    warning.append(warningCopy);
    page.append(warning);
  }

  const toolbar = el('div', 'mcp-toolbar');
  const sync = iconButton('refresh', 'Sincronizza server MCP', 'icon-button mcp-toolbar__sync');
  sync.addEventListener('click', () => runtime.post({ type: 'refreshMcp' }));
  toolbar.append(sync);

  const add = button('button button--primary button--small mcp-toolbar__add');
  add.append(icon('plus', 14), el('span', '', 'Server'));
  add.addEventListener('click', () => {
    local.mcpDraft = emptyDraft(state);
    runtime.render();
  });
  toolbar.append(add);

  if (servers.length) {
    const search = el('label', 'agents-search mcp-toolbar__search');
    search.append(icon('search', 15));
    const input = el('input') as HTMLInputElement;
    input.placeholder = 'Cerca server, host o provider';
    input.value = local.mcpSearch ?? '';
    input.addEventListener('input', () => {
      local.mcpSearch = input.value;
      runtime.render();
    });
    search.append(input);
    toolbar.append(search);
  }
  page.append(toolbar);
  page.append(renderMcpTemplatesSection(runtime));

  if (!servers.length) {
    const empty = el('section', 'agents-empty mcp-empty');
    empty.append(icon('workflow', 24));
    empty.append(el('strong', '', 'Collega un server MCP remoto o seleziona un template.'));
    const start = button('button button--primary button--small', '');
    start.append(icon('plus', 14), el('span', '', 'Server'));
    start.addEventListener('click', () => {
      local.mcpDraft = emptyDraft(state);
      runtime.render();
    });
    empty.append(start);
    page.append(empty);
    return page;
  }

  const query = String(local.mcpSearch ?? '').trim().toLowerCase();
  const filtered = servers.filter((server) => !query || [server.name, server.target, providerName(server.provider), hostOf(server.target)]
    .some((value) => String(value ?? '').toLowerCase().includes(query)));

  const grid = el('div', 'agents-grid mcp-grid');
  if (!filtered.length) {
    const noMatch = el('div', 'agents-empty');
    noMatch.append(icon('search', 22), el('strong', '', 'Nessun server trovato'), el('span', '', 'Modifica la ricerca.'));
    grid.append(noMatch);
  }
  for (const server of filtered) grid.append(renderMcpCard(runtime, server));
  page.append(grid);
  return page;
}

function renderMcpTemplatesSection(runtime: UiRuntime): HTMLElement {
  const section = el('section', 'mcp-templates-section');
  const header = el('header', 'mcp-templates-header');
  header.append(el('strong', '', 'Template consigliati'), el('span', '', 'Configurazione automatica dei server MCP nativi'));
  section.append(header);

  const grid = el('div', 'agents-grid mcp-templates-grid');
  for (const tpl of MCP_TEMPLATES) {
    const card = el('article', 'agent-card agent-card--compact mcp-template-card');
    const top = el('div', 'agent-card-compact__top');
    const identity = el('div', 'agent-card__identity');
    identity.append(icon('workflow', 18));
    const titleGroup = el('div');
    titleGroup.append(el('strong', '', tpl.name), el('span', 'agent-card__subtitle', tpl.vendor));
    identity.append(titleGroup);
    top.append(identity);

    const actions = el('div', 'agent-card-compact__actions');
    const configBtn = button('button button--primary button--small');
    configBtn.append(icon('plus', 13), el('span', '', 'Configura'));
    configBtn.addEventListener('click', () => {
      const state = runtime.state!;
      const availableProviders = state.providers
        .filter((p) => p.available && tpl.supportedProviders.includes(p.id))
        .map((p) => p.id);
      runtime.post({
        type: 'addMcp',
        payload: {
          name: tpl.id,
          transport: tpl.transport,
          command: tpl.command,
          args: tpl.args,
          target: tpl.target || tpl.command || '',
          scope: 'global',
          providers: availableProviders.length ? availableProviders : ['claude']
        }
      });
    });
    actions.append(configBtn);
    top.append(actions);
    card.append(top);

    const meta = el('div', 'agent-card-compact__meta');
    meta.append(el('span', 'agent-card-compact__pill', tpl.description));
    card.append(meta);
    grid.append(card);
  }
  section.append(grid);
  return section;
}

function renderMcpCard(runtime: UiRuntime, server: McpServerRecord): HTMLElement {
  const local = runtime as any;
  const identityKey = `mcp:${server.provider}:${server.scope}:${server.name}`;
  const expanded = runtime.expandedPanels.has(identityKey);
  const card = el('article', `agent-card agent-card--compact mcp-card ${server.enabled ? '' : 'is-disabled'}`);

  const top = el('div', 'agent-card-compact__top');
  const identity = el('div', 'agent-card__identity mcp-card__identity');
  identity.append(providerGlyph(server.provider));
  const status = el('span', `mcp-status-dot is-${server.status ?? 'unknown'}`);
  status.title = server.status === 'connected' ? 'Connesso' : server.status === 'failed' ? 'Connessione fallita' : 'Stato non verificato';
  const copyBlock = el('div', 'agent-card-compact__copy');
  copyBlock.append(el('strong', '', server.name));
  copyBlock.append(el('span', 'mcp-card__host', hostOf(server.target)));
  identity.append(status, copyBlock);
  top.append(identity);

  const actions = el('div', 'agent-card-compact__actions');
  const toggle = el('label', 'mcp-toggle');
  toggle.title = server.enabled ? `Disattiva ${server.name}` : `Attiva ${server.name}`;
  const toggleInput = el('input') as HTMLInputElement;
  toggleInput.type = 'checkbox';
  toggleInput.checked = server.enabled;
  toggleInput.setAttribute('aria-label', toggle.title);
  toggleInput.addEventListener('change', () => runtime.post({
    type: 'toggleMcp',
    payload: { provider: server.provider, name: server.name, scope: server.scope, enabled: toggleInput.checked }
  }));
  toggle.append(toggleInput, el('span'));
  actions.append(toggle);

  const edit = iconButton('edit', `Modifica ${server.name}`, 'agent-card-icon-action');
  edit.addEventListener('click', () => {
    local.mcpDraft = draftFromServer(server);
    runtime.render();
  });
  const verify = iconButton('shield', `Verifica connessione ${server.name}`, 'agent-card-icon-action');
  verify.addEventListener('click', () => runtime.post({
    type: 'verifyMcp',
    payload: { provider: server.provider, name: server.name, scope: server.scope }
  }));
  const remove = iconButton('trash', `Elimina ${server.name}`, 'agent-card-icon-action agent-card-icon-action--danger');
  remove.addEventListener('click', () => runtime.post({
    type: 'removeMcp',
    payload: { provider: server.provider, name: server.name, scope: server.scope }
  }));
  const toggleExpand = iconButton('chevronDown', expanded ? `Comprimi dettagli ${server.name}` : `Espandi dettagli ${server.name}`, 'agent-card-icon-action mcp-card__expand');
  toggleExpand.setAttribute('aria-expanded', String(expanded));
  if (expanded) toggleExpand.classList.add('is-open');
  toggleExpand.addEventListener('click', () => {
    if (expanded) runtime.expandedPanels.delete(identityKey);
    else runtime.expandedPanels.add(identityKey);
    runtime.render();
  });
  actions.append(edit, verify, remove, toggleExpand);
  top.append(actions);
  card.append(top);

  const meta = el('div', 'agent-card-compact__meta');
  meta.append(el('span', 'agent-card-compact__pill', providerName(server.provider)));
  meta.append(el('span', 'agent-card-compact__pill', server.scope === 'global' ? 'Globale' : 'Progetto'));
  meta.append(el('span', 'agent-card-compact__pill', authTypeLabel(server)));
  card.append(meta);

  if (expanded) card.append(renderMcpCardDetail(runtime, server));
  return card;
}

function renderMcpCardDetail(runtime: UiRuntime, server: McpServerRecord): HTMLElement {
  const detail = el('div', 'mcp-card-detail');
  detail.append(detailRow('URL', server.target));
  detail.append(detailRow('Stato connessione', server.status === 'connected' ? 'Connesso' : server.status === 'failed' ? 'Connessione fallita' : 'Non verificato'));
  detail.append(detailRow('Autenticazione', authTypeLabel(server)));
  detail.append(detailRow('Provider collegato', providerName(server.provider)));
  detail.append(detailRow('Ultimo test', server.lastTestedAt ? new Date(server.lastTestedAt).toLocaleString('it-IT') : 'Mai eseguito'));
  if (server.lastError) detail.append(detailRow('Ultimo errore', server.lastError, true));
  const test = button('button button--secondary button--small mcp-card-detail__test');
  test.append(icon('shield', 13), el('span', '', 'Testa connessione'));
  test.addEventListener('click', () => runtime.post({
    type: 'verifyMcp',
    payload: { provider: server.provider, name: server.name, scope: server.scope }
  }));
  detail.append(test);
  return detail;
}

function detailRow(label: string, value: string, danger = false): HTMLElement {
  const row = el('div', `mcp-card-detail__row ${danger ? 'is-danger' : ''}`);
  row.append(el('span', 'mcp-card-detail__label', label), el('span', 'mcp-card-detail__value', value));
  return row;
}

function renderMcpEditor(runtime: UiRuntime, draft: McpDraft): HTMLElement {
  const local = runtime as any;
  const form = el('form', 'agent-editor mcp-editor');
  const top = el('header', 'agent-editor__header');
  const heading = el('div');
  heading.append(el('h2', '', draft.editing ? (draft.name || 'Server MCP') : 'Nuovo server MCP'));
  heading.append(el('p', '', 'Solo server MCP remoti raggiungibili via URL. Nessuna configurazione stdio o locale.'));
  const close = button('button button--ghost button--small');
  close.append(icon('close', 14), el('span', '', 'Chiudi'));
  close.addEventListener('click', () => closeEditor(runtime));
  top.append(heading, close);
  form.append(top);

  const body = el('section', 'agent-editor-section');
  const bodyInner = el('div', 'agent-editor-section__body');
  const grid = el('div', 'agent-form-grid agent-form-grid--two');
  grid.append(textField('Nome', 'es. github-remote', draft.name, 80, (value) => { draft.name = value; }, true));
  grid.append(textField('URL del server MCP remoto', 'https://…', draft.target, 2000, (value) => { draft.target = value; }, true));
  bodyInner.append(grid);

  const providersBlock = el('div', 'agent-field');
  providersBlock.append(el('span', 'agent-field__label', 'Provider collegati'), el('small', '', 'Multi-select: il server viene pubblicato su ciascun provider selezionato.'));
  const providerGrid = el('div', 'provider-target-grid');
  const providerInputs: HTMLInputElement[] = [];
  const selected = new Set<ProviderId>(draft.providers);
  const lockedProvider = draft.editing?.provider;
  for (const provider of PROVIDERS) {
    const status = runtime.state!.providers.find((entry) => entry.id === provider.id);
    const locked = Boolean(lockedProvider) && provider.id !== lockedProvider;
    const label = el('label', `provider-target ${selected.has(provider.id) ? 'is-selected' : ''} ${(!status?.available || locked) ? 'is-disabled' : ''}`);
    const input = el('input') as HTMLInputElement;
    input.type = 'checkbox';
    input.value = provider.id;
    input.checked = selected.has(provider.id);
    input.disabled = !status?.available || locked;
    input.addEventListener('change', () => label.classList.toggle('is-selected', input.checked));
    providerInputs.push(input);
    label.append(input, providerGlyph(provider.id), el('span', '', provider.label));
    providerGrid.append(label);
  }
  providersBlock.append(providerGrid);
  bodyInner.append(providersBlock);
  body.append(bodyInner);
  form.append(body);

  const auth = el('details', 'agent-advanced') as HTMLDetailsElement;
  auth.open = runtime.expandedPanels.has('mcp:auth');
  const authSummary = el('summary', 'agent-advanced__summary');
  authSummary.append(el('span', '', 'Autenticazione'), el('small', '', 'OAuth, header HTTP e bearer token · facoltativo'), icon('chevronDown', 15));
  auth.append(authSummary);
  auth.addEventListener('toggle', () => {
    if (auth.open) runtime.expandedPanels.add('mcp:auth');
    else runtime.expandedPanels.delete('mcp:auth');
  });
  const authBody = el('div', 'agent-advanced__body');
  const authGrid = el('div', 'agent-form-grid agent-form-grid--two');
  authGrid.append(textField('OAuth Client ID', 'Facoltativo', draft.oauthClientId, 400, (value) => { draft.oauthClientId = value; }));
  const secretField = textField('OAuth Client Secret', 'Facoltativo · mascherato', draft.oauthClientSecret, 400, (value) => { draft.oauthClientSecret = value; });
  (secretField.querySelector('input') as HTMLInputElement).type = 'password';
  authGrid.append(secretField);
  const bearerField = textField('Bearer token', 'Facoltativo · mascherato', draft.bearerToken, 2000, (value) => { draft.bearerToken = value; });
  (bearerField.querySelector('input') as HTMLInputElement).type = 'password';
  authGrid.append(bearerField);
  authBody.append(authGrid);
  const headersField = textAreaField('Header HTTP', 'Una coppia Chiave=Valore per riga', draft.headersText, 2000, 3, (value) => { draft.headersText = value; });
  (headersField.querySelector('textarea') as HTMLTextAreaElement).classList.add('is-secret-masked');
  authBody.append(headersField);
  auth.append(authBody);
  form.append(auth);

  const actions = el('footer', 'agent-editor__actions');
  const verify = button('button button--secondary');
  verify.append(icon('shield', 15), el('span', '', 'Verifica connessione'));
  verify.addEventListener('click', () => {
    const check = validateDraft(draft);
    if (check) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: check } });
      return;
    }
    runtime.post({ type: 'verifyMcp', payload: draftPayload(draft) });
  });
  const save = button('button button--primary');
  save.type = 'submit';
  save.append(icon('check', 15), el('span', '', draft.editing ? 'Salva modifiche' : 'Salva server'));
  actions.append(verify, save);
  form.append(actions);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const check = validateDraft(draft);
    if (check) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: check } });
      return;
    }
    runtime.post({ type: 'addMcp', payload: draftPayload(draft) });
    closeEditor(runtime);
  });

  return form;
}

function draftPayload(draft: McpDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    target: draft.target.trim(),
    scope: draft.scope,
    providers: draft.providers,
    authType: inferAuthType(draft),
    headers: parseMapLines(draft.headersText),
    bearerToken: draft.bearerToken.trim(),
    oauthClientId: draft.oauthClientId.trim(),
    oauthClientSecret: draft.oauthClientSecret.trim()
  };
}

function inferAuthType(draft: McpDraft): McpAuthType {
  if (draft.oauthClientId.trim() || draft.oauthClientSecret.trim()) return 'oauth';
  if (draft.bearerToken.trim()) return 'bearer';
  if (draft.headersText.trim()) return 'headers';
  return 'none';
}

function validateDraft(draft: McpDraft): string | undefined {
  if (!draft.name.trim()) return 'Inserisci un nome per il server MCP.';
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(draft.name.trim())) return 'Il nome può contenere solo lettere, numeri, punto, trattino o underscore.';
  if (!draft.target.trim()) return 'Inserisci l’URL del server MCP remoto.';
  let url: URL;
  try { url = new URL(draft.target.trim()); }
  catch { return 'L’URL del server MCP non è valido.'; }
  if (!['http:', 'https:'].includes(url.protocol)) return 'Sono supportati solo URL http o https.';
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol === 'http:' && !isLocalhost) return 'HTTPS è obbligatorio per host remoti (eccetto localhost).';
  if (!draft.providers.length) return 'Seleziona almeno un provider.';
  return undefined;
}

function textField(label: string, hint: string, value: string, maxLength: number, onInput: (value: string) => void, required = false): HTMLElement {
  const field = el('label', 'agent-field');
  field.append(el('span', 'agent-field__label', label), el('small', '', hint));
  const input = el('input', 'agent-input') as HTMLInputElement;
  input.value = value;
  input.maxLength = maxLength;
  input.required = required;
  input.autocomplete = 'off';
  input.addEventListener('input', () => onInput(input.value));
  field.append(input);
  return field;
}

function textAreaField(label: string, hint: string, value: string, maxLength: number, rows: number, onInput: (value: string) => void): HTMLElement {
  const field = el('label', 'agent-field');
  field.append(el('span', 'agent-field__label', label), el('small', '', hint));
  const input = el('textarea', 'agent-textarea') as HTMLTextAreaElement;
  input.value = value;
  input.maxLength = maxLength;
  input.rows = rows;
  input.spellcheck = false;
  input.addEventListener('input', () => onInput(input.value));
  field.append(input);
  return field;
}

function emptyDraft(state: any): McpDraft {
  const preferred = PROVIDERS.find((entry) => state.providers.find((status: any) => status.id === entry.id && status.available));
  return {
    name: '',
    target: '',
    scope: state.workspace?.id ? 'project' : 'global',
    providers: preferred ? [preferred.id] : [],
    headersText: '',
    bearerToken: '',
    oauthClientId: '',
    oauthClientSecret: ''
  };
}

function draftFromServer(server: McpServerRecord): McpDraft {
  return {
    editing: { provider: server.provider, name: server.name, scope: server.scope },
    name: server.name,
    target: server.target,
    scope: server.scope,
    providers: [server.provider],
    headersText: mapToLines(server.headers),
    bearerToken: server.bearerToken ?? '',
    oauthClientId: server.oauthClientId ?? '',
    oauthClientSecret: server.oauthClientSecret ?? ''
  };
}

function closeEditor(runtime: UiRuntime): void {
  const local = runtime as any;
  local.mcpDraft = undefined;
  runtime.render();
}

function authTypeLabel(server: McpServerRecord): string {
  if (server.authType === 'oauth') return 'OAuth';
  if (server.authType === 'bearer') return 'Bearer token';
  if (server.authType === 'headers' || server.headers) return 'Header HTTP';
  return 'Nessuna auth';
}

function hostOf(target: string): string {
  try { return new URL(target).host; } catch { return target; }
}

function providerName(id: ProviderId): string { return PROVIDERS.find((entry) => entry.id === id)?.label ?? id; }

function mapToLines(value?: Record<string, string>): string { return Object.entries(value ?? {}).map(([key, item]) => `${key}=${item}`).join('\n'); }

function parseMapLines(value: string): Record<string, string> {
  return Object.fromEntries(value.split(/\r?\n/).map((line) => {
    const index = line.indexOf('=');
    return index > 0 ? [line.slice(0, index).trim(), line.slice(index + 1)] : ['', ''];
  }).filter(([key]) => key));
}
