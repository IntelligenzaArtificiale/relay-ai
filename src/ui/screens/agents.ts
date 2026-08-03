import type { ProviderId, ProviderStatus, RunPermission } from '../../core/types.js';
import { agentGlyph, button, el, icon, select } from '../dom.js';
import type { UiRuntime } from '../types.js';

interface AgentDraft {
  id?: string;
  name: string;
  bio: string;
  provider: ProviderId;
  model: string;
  reasoning: string;
  permission: RunPermission;
  specialization: string;
  instructions: string;
  enabled: boolean;
  canDelegate: boolean;
  visibleInChat: boolean;
  globalVisible: boolean;
  projectIds: string[];
  isDefault: boolean;
}

export function renderAgents(runtime: UiRuntime): HTMLElement {
  const state = runtime.state! as any;
  const local = runtime as any;
  const page = el('section', 'content-page agents-page');
  const header = el('header', 'page-header agents-header');
  const copy = el('div');
  copy.append(el('span', 'eyebrow', 'Orchestration'), el('h1', '', 'Agenti'));
  copy.append(el('p', '', 'Profili riutilizzabili sopra provider e modelli, senza duplicare la logica dei provider.'));
  header.append(copy);
  page.append(header);

  if (local.agentEditorDraft) {
    page.append(renderAgentEditor(runtime, local.agentEditorDraft as AgentDraft));
    return page;
  }

  const tools = el('div', 'agents-toolbar');
  const search = el('label', 'agents-search');
  search.append(icon('search', 15));
  const input = el('input') as HTMLInputElement;
  input.placeholder = 'Cerca agente o specializzazione';
  input.value = local.agentSearch ?? '';
  input.addEventListener('input', () => {
    local.agentSearch = input.value;
    runtime.render();
  });
  search.append(input);
  tools.append(search);

  const create = button('button button--primary button--small agents-toolbar__create');
  create.append(icon('plus', 15), el('span', '', 'Agente'));
  create.addEventListener('click', () => {
    local.agentEditorDraft = blankDraft(state);
    local.agentEditorId = 'new';
    local.agentDeleteId = undefined;
    runtime.render();
  });
  tools.append(create);
  page.append(tools);

  const query = String(local.agentSearch ?? '').trim().toLowerCase();
  const agents = (Array.isArray(state.agents) ? state.agents : [])
    .filter((agent: any) => !query || [agent.name, agent.bio, agent.specialization, agent.provider, agent.model].some((value) => String(value ?? '').toLowerCase().includes(query)))
    .sort((a: any, b: any) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || Number(Boolean(b.enabled)) - Number(Boolean(a.enabled)) || a.name.localeCompare(b.name));

  const customAgents = agents.filter((agent: any) => !agent.bundledTemplate);
  const templateAgents = agents.filter((agent: any) => agent.bundledTemplate);

  const grid = el('div', 'agents-grid');
  if (!agents.length) {
    const empty = el('div', 'agents-empty');
    empty.append(icon('sparkle', 24));
    empty.append(el('strong', '', query ? 'Nessun agente trovato' : 'Crea il primo agente'));
    empty.append(el('span', '', query ? 'Modifica la ricerca.' : 'Configura nome, provider, modello, specializzazione, deleghe e visibilità in un’unica schermata.'));
    if (!query) {
      const start = button('button button--primary button--small', 'Crea agente');
      start.addEventListener('click', () => {
        local.agentEditorDraft = blankDraft(state);
        local.agentEditorId = 'new';
        runtime.render();
      });
      empty.append(start);
    }
    grid.append(empty);
  }
  for (const agent of customAgents) grid.append(renderAgentCard(runtime, agent));
  if (grid.childElementCount) page.append(grid);

  if (templateAgents.length) {
    const library = el('details', 'agent-template-library') as HTMLDetailsElement;
    library.open = Boolean(query) || runtime.expandedPanels.has('agent:templates');
    const librarySummary = el('summary', 'agent-template-library__summary');
    const summaryCopy = el('div');
    summaryCopy.append(el('strong', '', 'Template ottimizzati'), el('span', '', 'Disattivati di default · attivali solo quando fanno risparmiare contesto e token'));
    librarySummary.append(icon('sparkle', 15), summaryCopy, el('span', 'agent-template-library__count', String(templateAgents.length)), icon('chevronDown', 14));
    library.append(librarySummary);
    library.addEventListener('toggle', () => {
      if (library.open) runtime.expandedPanels.add('agent:templates');
      else runtime.expandedPanels.delete('agent:templates');
    });
    const templateGrid = el('div', 'agents-grid agents-grid--templates');
    for (const agent of templateAgents) templateGrid.append(renderAgentCard(runtime, agent));
    library.append(templateGrid);
    page.append(library);
  }
  return page;
}

function renderAgentCard(runtime: UiRuntime, agent: any): HTMLElement {
  const state = runtime.state! as any;
  const local = runtime as any;
  const provider = state.providers.find((entry: ProviderStatus) => entry.id === agent.provider);
  const unavailable = !provider?.available || provider.connected === false;
  const card = el('article', `agent-card agent-card--compact ${agent.enabled ? '' : 'is-disabled'} ${agent.isDefault ? 'is-default' : ''}`);

  const top = el('div', 'agent-card-compact__top');
  const identity = el('div', 'agent-card__identity');
  const glyph = el('span', 'agent-card__glyph');
  glyph.append(agentGlyph(agent.name));
  const copy = el('div', 'agent-card-compact__copy');
  const title = el('div', 'agent-card__title');
  title.append(el('strong', '', agent.name));
  if (agent.isDefault) title.append(el('span', 'agent-badge is-default', 'Default'));
  if (unavailable) title.append(el('span', 'agent-provider-warning', provider?.connected === false ? 'Provider scollegato' : 'Provider non disponibile'));
  copy.append(title);
  identity.append(glyph, copy);

  const actions = el('div', 'agent-card-compact__actions');
  const power = button(`agent-card-power ${agent.enabled ? 'is-on' : 'is-off'}`);
  power.append(icon('power', 13), el('span', '', agent.enabled ? 'OFF' : 'ON'));
  power.title = agent.enabled ? `Spegni ${agent.name}` : `Accendi ${agent.name}`;
  power.setAttribute('aria-label', power.title);
  power.addEventListener('click', () => runtime.post({ type: 'toggleAgent', payload: { agentId: agent.id, enabled: !agent.enabled } }));
  const edit = button('agent-card-icon-action');
  edit.append(icon('edit', 15));
  edit.title = `Modifica ${agent.name}`;
  edit.setAttribute('aria-label', edit.title);
  edit.addEventListener('click', () => {
    local.agentEditorDraft = draftFromAgent(agent);
    local.agentEditorId = agent.id;
    local.agentDeleteId = undefined;
    runtime.render();
  });
  const remove = button('agent-card-icon-action agent-card-icon-action--danger');
  remove.append(icon('trash', 15));
  remove.title = `Elimina ${agent.name}`;
  remove.setAttribute('aria-label', remove.title);
  remove.addEventListener('click', () => {
    local.agentDeleteId = agent.id;
    runtime.render();
  });
  actions.append(power, edit, remove);
  top.append(identity, actions);
  card.append(top);

  const meta = el('div', 'agent-card-compact__meta');
  meta.append(compactMeta(
    agent.permission === 'danger-full-access' ? 'Accesso completo' : agent.permission === 'workspace-write' ? 'Lettura e scrittura' : 'Sola lettura',
    agent.permission === 'danger-full-access' ? 'is-full' : agent.permission === 'workspace-write' ? 'is-write' : ''
  ));
  meta.append(compactMeta(agent.canDelegate ? 'Può delegare' : 'No deleghe'));
  meta.append(compactMeta(agent.globalVisible ? 'Globale' : `${agent.projectIds?.length ?? 0} progetti`));
  meta.append(compactMeta(`${agent.taskCount ?? 0} task`));
  card.append(meta);

  if (local.agentDeleteId === agent.id) {
    const confirm = el('div', 'agent-card-delete-confirm');
    const confirmCopy = el('div');
    confirmCopy.append(el('strong', '', `Eliminare ${agent.name}?`), el('span', '', 'L’azione rimuove soltanto la configurazione dell’agente.'));
    const confirmActions = el('div');
    const cancel = button('button button--ghost button--small', 'Annulla');
    cancel.addEventListener('click', () => { local.agentDeleteId = undefined; runtime.render(); });
    const confirmDelete = button('button button--danger button--small', 'Elimina');
    confirmDelete.addEventListener('click', () => {
      runtime.post({ type: 'deleteAgent', payload: { agentId: agent.id } });
      local.agentDeleteId = undefined;
    });
    confirmActions.append(cancel, confirmDelete);
    confirm.append(confirmCopy, confirmActions);
    card.append(confirm);
  }
  return card;
}

function compactMeta(label: string, className = ''): HTMLElement {
  return el('span', `agent-card-compact__pill ${className}`.trim(), label);
}

function renderAgentEditor(runtime: UiRuntime, draft: AgentDraft): HTMLElement {
  const state = runtime.state! as any;
  const local = runtime as any;
  const editing = Boolean(draft.id);
  const provider = state.providers.find((entry: ProviderStatus) => entry.id === draft.provider) as ProviderStatus | undefined;
  const models = provider?.models ?? [];
  const selectedModel = models.find((entry) => entry.id === draft.model) ?? models.find((entry) => entry.id === 'auto') ?? models.find((entry) => entry.isDefault);
  const reasoningOptions = selectedModel?.reasoning ?? [];
  if (draft.model !== 'auto' && !models.some((entry) => entry.id === draft.model)) draft.model = 'auto';
  if (draft.reasoning !== 'auto' && !reasoningOptions.some((entry) => entry.id === draft.reasoning)) draft.reasoning = 'auto';

  const shell = el('section', 'agent-editor');
  const top = el('header', 'agent-editor__header');
  const heading = el('div');
  heading.append(el('h2', '', editing ? (draft.name || 'Agente') : 'Nuovo agente'));
  const close = button('button button--ghost button--small');
  close.append(icon('close', 14), el('span', '', 'Chiudi'));
  close.addEventListener('click', () => closeEditor(runtime));
  top.append(heading, close);
  shell.append(top);

  const form = el('form', 'agent-editor__form') as HTMLFormElement;

  const identity = el('section', 'agent-editor-section agent-editor-section--base');
  const identityBody = el('div', 'agent-editor-section__body');
  const identityGrid = el('div', 'agent-form-grid agent-form-grid--two');
  identityGrid.append(textField('Nome', 'Es. Code Reviewer', draft.name, 80, (value) => { draft.name = value; }, true));
  identityGrid.append(textField('Specializzazione', 'Es. review codice e refactoring', draft.specialization, 160, (value) => { draft.specialization = value; }));
  identityBody.append(identityGrid);
  identityBody.append(textAreaField('Bio breve', 'Una riga che spiega quando scegliere questo agente.', draft.bio, 240, 2, (value) => { draft.bio = value; }));
  identityBody.append(textAreaField('Istruzioni custom', 'Preferenze, metodo di lavoro, qualità attesa e limiti. Evita di ridefinire JSON, parser o protocolli Relay.', draft.instructions, 12_000, 7, (value) => { draft.instructions = value; }));
  identity.append(identityBody);
  form.append(identity);

  const engine = el('details', 'agent-advanced') as HTMLDetailsElement;
  engine.open = runtime.expandedPanels.has('agent:engine');
  const engineSummary = el('summary', 'agent-advanced__summary');
  engineSummary.append(el('span', '', 'Motore'), el('small', '', 'Provider, modello, thinking e accesso'), icon('chevronDown', 15));
  engine.append(engineSummary);
  engine.addEventListener('toggle', () => {
    if (engine.open) runtime.expandedPanels.add('agent:engine');
    else runtime.expandedPanels.delete('agent:engine');
  });
  const engineBody = el('div', 'agent-advanced__body');

  const engineGrid = el('div', 'agent-form-grid agent-form-grid--three');
  const providerSelect = select(draft.provider, state.providers.map((entry: ProviderStatus) => ({ value: entry.id, label: entry.connected === false ? `${entry.label} · scollegato` : entry.label, disabled: !entry.available || entry.connected === false })), 'premium-select');
  providerSelect.addEventListener('change', () => {
    draft.provider = providerSelect.value as ProviderId;
    draft.model = 'auto';
    draft.reasoning = 'auto';
    runtime.render();
  });
  engineGrid.append(selectField('Provider', 'Account reale che esegue il task.', providerSelect));

  const modelSelect = select(draft.model, [
    { value: 'auto', label: 'Automatico' },
    ...models.filter((entry) => entry.id !== 'auto' && !entry.hidden).map((entry) => ({ value: entry.id, label: entry.label }))
  ], 'premium-select');
  modelSelect.addEventListener('change', () => {
    draft.model = modelSelect.value;
    draft.reasoning = 'auto';
    runtime.render();
  });
  engineGrid.append(selectField('Modello', 'Relay valida la combinazione prima del run.', modelSelect));

  const reasoningSelect = select(draft.reasoning, [
    { value: 'auto', label: 'Automatico' },
    ...reasoningOptions.map((entry) => ({ value: entry.id, label: entry.label }))
  ], 'premium-select');
  reasoningSelect.disabled = reasoningOptions.length === 0;
  reasoningSelect.addEventListener('change', () => { draft.reasoning = reasoningSelect.value; });
  engineGrid.append(selectField('Thinking', reasoningOptions.length ? 'Solo livelli esposti dal modello.' : 'Il modello non espone livelli selezionabili.', reasoningSelect));

  const permissionSelect = select(draft.permission, [
    { value: 'read-only', label: 'Sola lettura' },
    { value: 'workspace-write', label: 'Lettura e scrittura nel workspace' },
    { value: 'danger-full-access', label: 'Accesso completo' }
  ], 'premium-select');
  permissionSelect.addEventListener('change', () => {
    draft.permission = permissionSelect.value === 'danger-full-access'
      ? 'danger-full-access'
      : permissionSelect.value === 'workspace-write' ? 'workspace-write' : 'read-only';
  });
  engineGrid.append(selectField('Accesso', 'Per agenti di fix e build usa Accesso completo; analisi e audit possono restare in sola lettura.', permissionSelect));
  engineBody.append(engineGrid);

  const capability = el('div', 'agent-capability-note');
  capability.append(icon('shield', 14), el('span', '', capabilityText(provider, selectedModel?.id ?? 'auto')));
  engineBody.append(capability);

  // Le regole globali abilitate per il provider selezionato si applicano già a ogni agente.
  const globalRules = (state.rules ?? []).filter((rule: any) => rule.enabled && (!rule.providers?.length || rule.providers.includes(draft.provider)));
  const rulesNote = el('div', 'agent-capability-note');
  rulesNote.append(icon('rules', 14), el('span', '', globalRules.length
    ? `${globalRules.length} regole globali attive per ${provider?.label ?? draft.provider} si applicano già a questo agente.`
    : `Nessuna regola globale attiva per ${provider?.label ?? draft.provider}.`));
  engineBody.append(rulesNote);
  // TODO: collegare skill o regole dedicate a un singolo agente richiede estendere CustomAgentRecord
  // (src/services/agent-store.ts) con ruleIds/skillIds e propagare la selezione in relay-controller.ts
  // al momento del run. Rimandato: richiede una migrazione dati più ampia.

  engine.append(engineBody);
  form.append(engine);

  const visibilityDetails = el('details', 'agent-advanced') as HTMLDetailsElement;
  visibilityDetails.open = runtime.expandedPanels.has('agent:visibility');
  const visibilitySummary = el('summary', 'agent-advanced__summary');
  visibilitySummary.append(el('span', '', 'Visibilità'), el('small', '', 'Attivazione, chat, deleghe e progetti'), icon('chevronDown', 15));
  visibilityDetails.append(visibilitySummary);
  visibilityDetails.addEventListener('toggle', () => {
    if (visibilityDetails.open) runtime.expandedPanels.add('agent:visibility');
    else runtime.expandedPanels.delete('agent:visibility');
  });
  const visibilityBody = el('div', 'agent-advanced__body');

  const toggles = el('div', 'agent-toggle-grid');
  toggles.append(toggleField('Agente attivo', 'Può essere selezionato ed eseguire task.', draft.enabled, (value) => { draft.enabled = value; }));
  toggles.append(toggleField('Visibile in chat', 'Compare nel selettore e nelle menzioni.', draft.visibleInChat, (value) => { draft.visibleInChat = value; }));
  toggles.append(toggleField('Può delegare', 'Può richiedere altri provider o agenti.', draft.canDelegate, (value) => { draft.canDelegate = value; }));
  toggles.append(toggleField('Agente predefinito', 'Viene proposto per primo nelle nuove chat.', draft.isDefault, (value) => { draft.isDefault = value; }));
  visibilityBody.append(toggles);

  const visibility = el('div', 'agent-visibility');
  const visibilitySelect = select(draft.globalVisible ? 'global' : 'projects', [
    { value: 'global', label: 'Globale · tutti i progetti' },
    { value: 'projects', label: 'Solo progetti selezionati' }
  ], 'premium-select');
  visibilitySelect.addEventListener('change', () => {
    draft.globalVisible = visibilitySelect.value === 'global';
    if (!draft.globalVisible && draft.projectIds.length === 0 && state.workspace.id) draft.projectIds = [state.workspace.id];
    runtime.render();
  });
  visibility.append(selectField('Visibilità', 'Gli agenti restano globali come configurazione e vengono associati ai progetti.', visibilitySelect));
  if (!draft.globalVisible) {
    const projects = el('div', 'agent-project-picker');
    for (const project of state.projects ?? []) {
      const row = el('label', 'agent-project-option');
      const checkbox = el('input') as HTMLInputElement;
      checkbox.type = 'checkbox';
      checkbox.checked = draft.projectIds.includes(project.id);
      checkbox.addEventListener('change', () => {
        draft.projectIds = checkbox.checked
          ? [...new Set([...draft.projectIds, project.id])]
          : draft.projectIds.filter((id) => id !== project.id);
      });
      const label = el('span');
      label.append(el('strong', '', project.name), el('small', '', project.path));
      row.append(checkbox, label);
      projects.append(row);
    }
    visibility.append(projects);
  }
  visibilityBody.append(visibility);
  visibilityDetails.append(visibilityBody);
  form.append(visibilityDetails);

  const actions = el('footer', 'agent-editor__actions');
  const cancel = button('button button--ghost', 'Annulla');
  cancel.addEventListener('click', () => closeEditor(runtime));
  const save = button('button button--primary');
  save.type = 'submit';
  save.append(icon('check', 15), el('span', '', editing ? 'Salva modifiche' : 'Crea agente'));
  actions.append(cancel, save);
  if (editing) {
    const remove = button('button button--danger-ghost', 'Elimina agente');
    remove.addEventListener('click', () => {
      local.agentDeleteId = draft.id;
      runtime.render();
    });
    actions.prepend(remove);
  }
  form.append(actions);

  if (editing && local.agentDeleteId === draft.id) {
    const confirmation = el('div', 'agent-delete-confirm');
    const warning = el('div');
    warning.append(icon('warning', 16), el('span', '', 'Eliminare questa configurazione? Chat, provider e file del progetto non verranno toccati.'));
    const controls = el('div');
    const keep = button('button button--ghost button--small', 'Annulla');
    keep.addEventListener('click', () => { local.agentDeleteId = undefined; runtime.render(); });
    const confirm = button('button button--danger-ghost button--small', 'Elimina definitivamente');
    confirm.addEventListener('click', () => {
      runtime.post({ type: 'deleteAgent', payload: { agentId: draft.id } });
      closeEditor(runtime);
    });
    controls.append(keep, confirm);
    confirmation.append(warning, controls);
    form.append(confirmation);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: 'Inserisci un nome per l’agente.' } });
      return;
    }
    if (!draft.globalVisible && draft.projectIds.length === 0) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: 'Seleziona almeno un progetto oppure imposta la visibilità globale.' } });
      return;
    }
    runtime.post({
      type: 'saveAgent',
      payload: {
        agentId: draft.id,
        name,
        bio: draft.bio,
        provider: draft.provider,
        model: draft.model,
        reasoning: draft.reasoning,
        permission: draft.permission,
        specialization: draft.specialization,
        instructions: draft.instructions,
        enabled: draft.enabled,
        canDelegate: draft.canDelegate,
        visibleInChat: draft.visibleInChat,
        globalVisible: draft.globalVisible,
        projectIds: draft.globalVisible ? [] : draft.projectIds,
        isDefault: draft.isDefault
      }
    });
    closeEditor(runtime);
  });

  shell.append(form);
  return shell;
}

function blankDraft(state: any): AgentDraft {
  const preferred = state.providers.find((entry: ProviderStatus) => entry.id === state.preferences.defaultProvider && entry.available)
    ?? state.providers.find((entry: ProviderStatus) => entry.available)
    ?? state.providers[0];
  return {
    name: '',
    bio: '',
    provider: preferred?.id ?? 'codex',
    model: 'auto',
    reasoning: 'auto',
    permission: 'read-only',
    specialization: '',
    instructions: '',
    enabled: true,
    canDelegate: false,
    visibleInChat: true,
    globalVisible: true,
    projectIds: [],
    isDefault: false
  };
}

function draftFromAgent(agent: any): AgentDraft {
  return {
    id: agent.id,
    name: agent.name ?? '',
    bio: agent.bio ?? '',
    provider: agent.provider,
    model: agent.model ?? 'auto',
    reasoning: agent.reasoning ?? 'auto',
    permission: agent.permission === 'danger-full-access' ? 'danger-full-access' : agent.permission === 'workspace-write' ? 'workspace-write' : 'read-only',
    specialization: agent.specialization ?? '',
    instructions: agent.instructions ?? '',
    enabled: agent.enabled !== false,
    canDelegate: Boolean(agent.canDelegate),
    visibleInChat: agent.visibleInChat !== false,
    globalVisible: agent.globalVisible !== false,
    projectIds: [...(agent.projectIds ?? [])],
    isDefault: Boolean(agent.isDefault)
  };
}

function closeEditor(runtime: UiRuntime): void {
  const local = runtime as any;
  local.agentEditorDraft = undefined;
  local.agentEditorId = undefined;
  local.agentDeleteId = undefined;
  runtime.render();
}

function metric(label: string, value: string): HTMLElement {
  const node = el('div', 'agent-metric');
  node.append(el('small', '', label), el('strong', '', value));
  return node;
}

function textField(label: string, hint: string, value: string, maxLength: number, onInput: (value: string) => void, required = false): HTMLElement {
  const field = el('label', 'agent-field');
  field.append(el('span', 'agent-field__label', label), el('small', '', hint));
  const input = el('input', 'agent-input') as HTMLInputElement;
  input.value = value;
  input.maxLength = maxLength;
  input.required = required;
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
  input.addEventListener('input', () => onInput(input.value));
  field.append(input);
  return field;
}

function selectField(label: string, hint: string, control: HTMLSelectElement): HTMLElement {
  const field = el('label', 'agent-field');
  field.append(el('span', 'agent-field__label', label), el('small', '', hint));
  const shell = el('div', 'select-shell');
  shell.append(control, icon('chevronDown', 14));
  field.append(shell);
  return field;
}

function toggleField(label: string, hint: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
  const field = el('label', 'agent-toggle');
  const copy = el('span');
  copy.append(el('strong', '', label), el('small', '', hint));
  const control = el('span', 'agent-toggle__control');
  const input = el('input') as HTMLInputElement;
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  control.append(input, el('span'));
  field.append(copy, control);
  return field;
}

function capabilityText(provider: ProviderStatus | undefined, modelId: string): string {
  if (!provider) return 'Provider non disponibile: l’agente può essere salvato, ma non eseguito.';
  const model = provider.models.find((entry) => entry.id === modelId);
  const thinking = model?.reasoning?.length ? `${model.reasoning.length} livelli thinking` : 'thinking gestito dal provider';
  return `${provider.available ? 'Provider pronto' : 'Provider non disponibile'} · ${thinking}.`;
}
