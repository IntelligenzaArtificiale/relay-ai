import type { McpServerRecord, ProviderId } from '../../core/types.js';
import { button, el, icon, iconButton, providerGlyph } from '../dom.js';
import type { UiRuntime } from '../types.js';

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'copilot', label: 'GitHub Copilot' },
  { id: 'antigravity', label: 'Antigravity' }
];

export function renderMcp(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const local = runtime as any;
  const page = el('section', 'content-page mcp-page');
  const header = el('header', 'page-header mcp-header');
  const copy = el('div');
  copy.append(el('span', 'eyebrow', 'Context protocol'), el('h1', '', 'MCP'));
  copy.append(el('p', '', 'Inventario unificato dei server MCP configurati nei provider. Toggle reversibili e definizioni tradotte senza esporre segreti.'));
  const actions = el('div', 'mcp-header__actions');
  const refresh = button('button button--secondary');
  refresh.append(icon('refresh', 15), el('span', '', 'Aggiorna'));
  refresh.addEventListener('click', () => runtime.post({ type: 'refreshMcp' }));
  const add = button('button button--primary');
  add.append(icon('plus', 15), el('span', '', 'Aggiungi server'));
  add.addEventListener('click', () => {
    local.mcpEditorDraft = emptyDraft();
    runtime.render();
  });
  actions.append(refresh, add);
  header.append(copy, actions);
  page.append(header);

  if (state.mcp.errors.length) {
    const warning = el('section', 'mcp-warning');
    warning.append(icon('warning', 17));
    const warningCopy = el('div');
    warningCopy.append(el('strong', '', 'Alcuni provider non hanno restituito l’inventario'));
    for (const item of state.mcp.errors) warningCopy.append(el('span', '', `${providerName(item.provider)}: ${item.message}`));
    warning.append(warningCopy);
    page.append(warning);
  }

  if (local.mcpEditorDraft) page.append(renderMcpEditor(runtime, local.mcpEditorDraft));

  const servers = state.mcp.servers;
  if (!servers.length) {
    const empty = el('section', 'mcp-empty');
    empty.append(icon('workflow', 28), el('h2', '', 'Nessun server MCP'), el('p', '', 'Aggiungi un server stdio o HTTP e pubblicalo su uno o più provider.'));
    page.append(empty);
    return page;
  }

  const groups = el('div', 'mcp-groups');
  for (const provider of PROVIDERS) {
    const providerServers = servers.filter((server) => server.provider === provider.id);
    const status = state.providers.find((entry) => entry.id === provider.id);
    if (!status?.available && !providerServers.length) continue;
    const section = el('section', 'mcp-provider-group');
    const groupHeader = el('header', 'mcp-provider-group__header');
    groupHeader.append(providerGlyph(provider.id));
    const headingCopy = el('div');
    headingCopy.append(el('strong', '', provider.label), el('span', '', `${providerServers.length} server · ${status?.available ? 'provider disponibile' : 'provider non disponibile'}`));
    groupHeader.append(headingCopy, el('span', `status-pill ${status?.available ? 'is-ready' : 'is-muted'}`, status?.available ? 'Pronto' : 'Offline'));
    section.append(groupHeader);
    const list = el('div', 'mcp-server-list');
    for (const server of providerServers) list.append(renderMcpCard(runtime, server));
    if (!providerServers.length) list.append(el('div', 'mcp-provider-empty', 'Nessun server configurato per questo provider.'));
    section.append(list);
    groups.append(section);
  }
  page.append(groups);
  return page;
}

function renderMcpCard(runtime: UiRuntime, server: McpServerRecord): HTMLElement {
  const local = runtime as any;
  const card = el('article', `mcp-card ${server.enabled ? '' : 'is-disabled'}`);
  const main = el('div', 'mcp-card__main');
  const status = el('span', `mcp-status-dot is-${server.status ?? 'unknown'}`);
  status.title = server.status === 'connected' ? 'Connesso' : server.status === 'failed' ? 'Connessione fallita' : 'Stato non esposto';
  const copy = el('div', 'mcp-card__copy');
  copy.append(el('strong', '', server.name));
  copy.append(el('span', '', server.target));
  const meta = el('div', 'mcp-card__meta');
  meta.append(el('span', 'mcp-badge', server.transport.toUpperCase()));
  meta.append(el('span', 'mcp-badge', server.scope === 'global' ? 'Globale' : 'Progetto'));
  if (server.statusDetail) meta.append(el('span', 'mcp-status-detail', server.statusDetail));
  copy.append(meta);
  main.append(status, copy);

  const toggle = el('label', 'mcp-toggle');
  const input = el('input') as HTMLInputElement;
  input.type = 'checkbox';
  input.checked = server.enabled;
  input.addEventListener('change', () => runtime.post({
    type: 'toggleMcp',
    payload: { provider: server.provider, name: server.name, scope: server.scope, enabled: input.checked }
  }));
  toggle.append(input, el('span'));
  main.append(toggle);

  const menu = el('details', 'mcp-menu');
  const trigger = el('summary', 'mcp-menu__trigger');
  trigger.append(icon('more', 16));
  menu.append(trigger);
  const popover = el('div', 'mcp-menu__popover');
  popover.append(menuAction('edit', 'Modifica', () => {
    local.mcpEditorDraft = { ...server, providers: [server.provider], envText: mapToLines(server.env), headersText: mapToLines(server.headers), argsText: (server.args ?? []).join('\n') };
    runtime.render();
  }));
  const copyDetails = el('details', 'mcp-copy-details');
  const copySummary = el('summary', 'mcp-menu__item');
  copySummary.append(icon('copy', 14), el('span', '', 'Copia su altro provider'));
  copyDetails.append(copySummary);
  const targets = el('div', 'mcp-copy-targets');
  const checkboxes: HTMLInputElement[] = [];
  for (const provider of PROVIDERS.filter((entry) => entry.id !== server.provider && runtime.state!.providers.some((status) => status.id === entry.id && status.available))) {
    const label = el('label');
    const checkbox = el('input') as HTMLInputElement;
    checkbox.type = 'checkbox';
    checkbox.value = provider.id;
    checkboxes.push(checkbox);
    label.append(checkbox, providerGlyph(provider.id), el('span', '', provider.label));
    targets.append(label);
  }
  const confirm = button('button button--primary button--small', 'Copia');
  confirm.addEventListener('click', () => {
    const providers = checkboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value as ProviderId);
    if (!providers.length) return;
    runtime.post({ type: 'copyMcp', payload: { provider: server.provider, name: server.name, scope: server.scope, providers } });
  });
  targets.append(confirm);
  copyDetails.append(targets);
  popover.append(copyDetails);
  popover.append(menuAction('trash', 'Rimuovi', () => runtime.post({ type: 'removeMcp', payload: { provider: server.provider, name: server.name, scope: server.scope } }), true));
  menu.append(popover);
  card.append(main, menu);
  return card;
}

function renderMcpEditor(runtime: UiRuntime, draft: any): HTMLElement {
  const local = runtime as any;
  const form = el('form', 'mcp-editor');
  const top = el('header', 'mcp-editor__header');
  const copy = el('div');
  copy.append(el('span', 'eyebrow', draft.provider ? 'Modifica MCP' : 'Nuovo MCP'), el('strong', '', draft.name || 'Definizione server'));
  const close = iconButton('close', 'Chiudi');
  close.addEventListener('click', () => { delete local.mcpEditorDraft; runtime.render(); });
  top.append(copy, close);
  form.append(top);

  const grid = el('div', 'mcp-editor__grid');
  const name = fieldInput('Nome', draft.name ?? '', 'es. github');
  const transport = fieldSelect('Trasporto', draft.transport ?? 'stdio', [{ value: 'stdio', label: 'stdio' }, { value: 'http', label: 'HTTP' }]);
  const scope = fieldSelect('Ambito', draft.scope ?? 'project', [{ value: 'project', label: 'Progetto' }, { value: 'global', label: 'Globale' }]);
  const target = fieldInput('Comando o URL', draft.target ?? '', draft.transport === 'http' ? 'https://…' : 'npx / percorso eseguibile');
  grid.append(name.field, transport.field, scope.field, target.field);
  form.append(grid);

  const providers = el('div', 'mcp-editor__providers');
  providers.append(el('strong', '', 'Provider di destinazione'));
  const selected = new Set<ProviderId>(draft.providers ?? (draft.provider ? [draft.provider] : []));
  const providerInputs: HTMLInputElement[] = [];
  const providerGrid = el('div', 'provider-target-grid');
  for (const provider of PROVIDERS) {
    const status = runtime.state!.providers.find((entry) => entry.id === provider.id);
    const label = el('label', `provider-target ${selected.has(provider.id) ? 'is-selected' : ''} ${status?.available ? '' : 'is-disabled'}`);
    const input = el('input') as HTMLInputElement;
    input.type = 'checkbox';
    input.value = provider.id;
    input.checked = selected.has(provider.id);
    input.disabled = !status?.available;
    input.addEventListener('change', () => label.classList.toggle('is-selected', input.checked));
    providerInputs.push(input);
    label.append(input, providerGlyph(provider.id), el('span', '', provider.label));
    providerGrid.append(label);
  }
  providers.append(providerGrid);
  form.append(providers);

  const advanced = el('details', 'mcp-editor__advanced') as HTMLDetailsElement;
  advanced.open = true;
  const summary = el('summary');
  summary.append(el('span', '', 'Argomenti e variabili'), icon('chevronDown', 14));
  advanced.append(summary);
  const args = fieldTextarea('Argomenti', draft.argsText ?? (draft.args ?? []).join('\n'), 'Un argomento per riga');
  const env = fieldTextarea('Variabili env', draft.envText ?? mapToLines(draft.env), 'KEY=VALUE, una per riga');
  env.input.classList.add('is-secret-masked');
  const reveal = button('button button--secondary button--small', 'Mostra valori');
  reveal.addEventListener('click', () => {
    env.input.classList.toggle('is-secret-masked');
    reveal.textContent = env.input.classList.contains('is-secret-masked') ? 'Mostra valori' : 'Nascondi valori';
  });
  env.field.append(reveal);
  const headers = fieldTextarea('Header HTTP', draft.headersText ?? mapToLines(draft.headers), 'Authorization=Bearer …');
  headers.input.classList.add('is-secret-masked');
  const bearer = fieldInput('Bearer token env var', draft.bearerTokenEnvVar ?? '', 'es. GITHUB_TOKEN');
  advanced.append(args.field, env.field, headers.field, bearer.field);
  form.append(advanced);

  const footer = el('footer', 'mcp-editor__footer');
  footer.append(el('span', '', 'I file toccati vengono salvati anche come .relay-bak. I segreti non compaiono nei diagnostici.'));
  const save = button('button button--primary', draft.provider ? 'Salva modifiche' : 'Aggiungi e verifica');
  save.type = 'submit';
  footer.append(save);
  form.append(footer);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const targets = providerInputs.filter((input) => input.checked).map((input) => input.value as ProviderId);
    if (!name.input.value.trim() || !target.input.value.trim() || !targets.length) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: 'Nome, destinazione e almeno un provider sono obbligatori.' } });
      return;
    }
    runtime.post({
      type: 'addMcp',
      payload: {
        name: name.input.value.trim(),
        transport: transport.input.value,
        target: target.input.value.trim(),
        scope: scope.input.value,
        providers: targets,
        args: args.input.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
        env: parseMapLines(env.input.value),
        headers: parseMapLines(headers.input.value),
        bearerTokenEnvVar: bearer.input.value.trim()
      }
    });
    delete local.mcpEditorDraft;
  });
  return form;
}

function menuAction(iconName: Parameters<typeof icon>[0], label: string, action: () => void, danger = false): HTMLElement {
  const item = button(`mcp-menu__item ${danger ? 'is-danger' : ''}`);
  item.append(icon(iconName, 14), el('span', '', label));
  item.addEventListener('click', (event) => { event.preventDefault(); action(); });
  return item;
}

function fieldInput(label: string, value: string, placeholder = ''): { field: HTMLElement; input: HTMLInputElement } {
  const field = el('label', 'mcp-field');
  field.append(el('span', '', label));
  const input = el('input') as HTMLInputElement;
  input.value = value;
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  field.append(input);
  return { field, input };
}

function fieldTextarea(label: string, value: string, placeholder = ''): { field: HTMLElement; input: HTMLTextAreaElement } {
  const field = el('label', 'mcp-field');
  field.append(el('span', '', label));
  const input = el('textarea') as HTMLTextAreaElement;
  input.value = value;
  input.placeholder = placeholder;
  input.spellcheck = false;
  field.append(input);
  return { field, input };
}

function fieldSelect(label: string, value: string, options: Array<{ value: string; label: string }>): { field: HTMLElement; input: HTMLSelectElement } {
  const field = el('label', 'mcp-field');
  field.append(el('span', '', label));
  const input = el('select') as HTMLSelectElement;
  for (const option of options) {
    const item = el('option');
    item.value = option.value;
    item.textContent = option.label;
    item.selected = option.value === value;
    input.append(item);
  }
  field.append(input);
  return { field, input };
}

function emptyDraft(): any { return { name: '', transport: 'stdio', target: '', scope: 'project', providers: [] as ProviderId[], argsText: '', envText: '', headersText: '' }; }
function providerName(id: ProviderId): string { return PROVIDERS.find((entry) => entry.id === id)?.label ?? id; }
function mapToLines(value?: Record<string, string>): string { return Object.entries(value ?? {}).map(([key, item]) => `${key}=${item}`).join('\n'); }
function parseMapLines(value: string): Record<string, string> {
  return Object.fromEntries(value.split(/\r?\n/).map((line) => {
    const index = line.indexOf('=');
    return index > 0 ? [line.slice(0, index).trim(), line.slice(index + 1)] : ['', ''];
  }).filter(([key]) => key));
}
