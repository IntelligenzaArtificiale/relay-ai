import type { ProviderId, RuleDocument } from '../../core/types.js';
import { button, el, icon, iconButton, providerGlyph } from '../dom.js';
import { renderMarkdown } from '../markdown.js';
import { groupSkillsByName } from '../../core/skill-utils.js';
import type { UiRuntime } from '../types.js';

const SKILL_PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: 'codex', label: 'Codex' },
  { id: 'claude', label: 'Claude Code' },
  { id: 'antigravity', label: 'Antigravity' }
];

interface SkillCardItem {
  id: string;
  kind: 'template' | 'rule' | 'skill';
  name: string;
  description: string;
  providers: ProviderId[];
  enabled?: boolean;
  managed?: boolean;
  filePath?: string;
  rule?: RuleDocument;
  skillItems?: any[];
}

export function renderRules(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const local = runtime as any;
  const page = el('section', 'content-page content-page--rules skills-page');
  const selected = runtime.ruleDraft
    ?? (runtime.selectedRuleId ? state.rules.find((rule) => rule.id === runtime.selectedRuleId) : undefined);

  const header = el('header', 'page-header skills-header');
  const copy = el('div');
  copy.append(el('span', 'eyebrow', 'Workspace'), el('h1', '', 'Skills'));
  copy.append(el('p', '', 'Regole Relay e skill native sincronizzate, compatte e riutilizzabili tra provider compatibili.'));
  header.append(copy);
  page.append(header);

  const items = collectSkillItems(runtime);
  const hasSearchable = items.templates.length + items.rules.length + items.skills.length > 0;
  page.append(renderSkillsToolbar(runtime, hasSearchable));

  const report = state.skills?.lastReport;
  if (report) {
    const syncReport = el('details', 'skill-sync-report-compact');
    const summary = el('summary');
    summary.append(icon('check', 13), el('span', '', `${report.created} create · ${report.updated} aggiornate · ${report.removed} rimosse · ${report.skipped} ignorate`), icon('chevronDown', 13));
    syncReport.append(summary);
    if (report.errors.length) {
      const errors = el('div', 'skill-sync-report-compact__errors');
      for (const error of report.errors) errors.append(el('span', '', error));
      syncReport.append(errors);
    }
    page.append(syncReport);
  }

  if (local.skillImportPreview) page.append(renderSkillImportPreview(runtime, local.skillImportPreview));
  if (selected) page.append(renderRuleEditor(runtime, selected));

  if (!hasSearchable && !selected && !local.skillImportPreview) {
    const empty = el('section', 'skills-empty');
    empty.append(icon('sparkle', 24), el('strong', '', 'Nessuna skill configurata'), el('span', '', 'Crea una regola o importa una skill Relay da ZIP.'));
    page.append(empty);
    return page;
  }

  const query = String(local.skillSearch ?? '').trim().toLowerCase();
  const rules = filterItems(items.rules, query);
  const skills = filterItems(items.skills, query);

  page.append(renderSkillSection(runtime, 'skill:rules', 'Regole Relay', rules, { defaultOpen: items.rules.length > 0, iconName: 'rules', emptyLabel: query ? 'Nessuna regola trovata' : undefined }));
  page.append(renderSkillSection(runtime, 'skill:found', 'Skill trovate', skills, { defaultOpen: items.skills.length > 0, iconName: 'code', emptyLabel: query ? 'Nessuna skill trovata' : undefined }));
  return page;
}

function renderSkillsToolbar(runtime: UiRuntime, hasSearchable: boolean): HTMLElement {
  const local = runtime as any;
  const toolbar = el('div', 'skills-toolbar');
  const sync = iconButton('refresh', local.skillSyncing ? 'Sincronizzazione in corso' : 'Sincronizza skill', 'icon-button skills-toolbar__sync');
  sync.disabled = Boolean(local.skillSyncing);
  if (local.skillSyncing) sync.classList.add('is-spinning');
  sync.addEventListener('click', () => {
    local.skillDeleteId = undefined;
    local.skillSyncing = true;
    runtime.post({ type: 'syncSkills' });
    window.setTimeout(() => { local.skillSyncing = false; runtime.render(); }, 1600);
  });
  toolbar.append(sync);

  const add = button('button button--primary button--small skills-toolbar__create');
  add.append(icon('plus', 14), el('span', '', 'Regola'));
  add.addEventListener('click', () => {
    runtime.ruleDraft = draftRule(runtime.state!.workspace.id);
    delete runtime.selectedRuleId;
    delete local.skillImportPreview;
    runtime.render();
  });
  toolbar.append(add);

  const importButton = iconButton('import', 'Importa skill', 'icon-button skills-toolbar__import');
  importButton.addEventListener('click', () => chooseSkillZip(runtime));
  toolbar.append(importButton);

  if (hasSearchable) {
    const search = el('label', 'agents-search skills-search');
    search.append(icon('search', 15));
    const input = el('input') as HTMLInputElement;
    input.placeholder = 'Cerca skill o regola';
    input.value = local.skillSearch ?? '';
    input.addEventListener('input', () => {
      local.skillSearch = input.value;
      runtime.render();
    });
    search.append(input);
    toolbar.append(search);
  }
  return toolbar;
}

function renderSkillSection(
  runtime: UiRuntime,
  id: string,
  title: string,
  items: SkillCardItem[],
  options: { defaultOpen: boolean; iconName: Parameters<typeof icon>[0]; emptyLabel?: string }
): HTMLElement {
  const section = el('details', 'agent-template-library skills-section') as HTMLDetailsElement;
  section.open = runtime.expandedPanels.has(id) || (!runtime.expandedPanels.has(`${id}:touched`) && options.defaultOpen);
  const summary = el('summary', 'agent-template-library__summary skills-section__summary');
  const copy = el('div');
  copy.append(el('strong', '', title), el('span', '', sectionSubtitle(id, items.length, options.emptyLabel)));
  summary.append(icon(options.iconName, 15), copy, el('span', 'agent-template-library__count', String(items.length)), icon('chevronDown', 14));
  section.append(summary);
  section.addEventListener('toggle', () => {
    runtime.expandedPanels.add(`${id}:touched`);
    if (section.open) runtime.expandedPanels.add(id);
    else runtime.expandedPanels.delete(id);
  });
  if (items.length) {
    const grid = el('div', 'skills-card-list');
    for (const item of items) grid.append(renderSkillCard(runtime, item));
    section.append(grid);
  }
  return section;
}

function renderSkillCard(runtime: UiRuntime, item: SkillCardItem): HTMLElement {
  const local = runtime as any;
  const expandedKey = `skill-card:${item.id}`;
  const expanded = runtime.expandedPanels.has(expandedKey);
  const card = el('article', `agent-card agent-card--compact skill-card skill-card--${item.kind} ${item.enabled === false ? 'is-disabled' : ''}`);

  const top = el('div', 'agent-card-compact__top');
  const identity = el('div', 'agent-card__identity');
  const glyph = el('span', 'agent-card__glyph');
  glyph.append(icon(item.kind === 'rule' ? 'rules' : 'sparkle', 15));
  const copy = el('div', 'agent-card-compact__copy');
  const title = el('div', 'agent-card__title');
  title.append(el('strong', '', item.name));
  if (item.managed) title.append(el('span', 'agent-badge is-default', 'Relay'));
  copy.append(title, el('span', 'skill-card__description', item.description || 'Nessuna descrizione'));
  identity.append(glyph, copy);
  top.append(identity);

  const actions = el('div', 'agent-card-compact__actions skill-card__actions');
  actions.append(providerMicroBadges(item.providers));
  if (item.kind === 'rule' && item.rule) {
    const power = button(`agent-card-power ${item.rule.enabled ? 'is-on' : 'is-off'}`);
    power.append(icon('power', 13), el('span', '', item.rule.enabled ? 'OFF' : 'ON'));
    power.title = item.rule.enabled ? `Disattiva ${item.name}` : `Attiva ${item.name}`;
    power.setAttribute('aria-label', power.title);
    power.addEventListener('click', () => runtime.post({ type: 'toggleRule', payload: { id: item.rule!.id, enabled: !item.rule!.enabled } }));
    actions.append(power);
    const edit = iconButton('edit', `Modifica ${item.name}`, 'agent-card-icon-action');
    edit.addEventListener('click', () => {
      delete runtime.ruleDraft;
      runtime.selectedRuleId = item.rule!.id;
      delete local.skillImportPreview;
      runtime.render();
    });
    actions.append(edit);
  }
  if (item.filePath) {
    const open = iconButton('code', `Apri file ${item.name}`, 'agent-card-icon-action');
    open.addEventListener('click', () => runtime.post({ type: 'openSkillFile', payload: { path: item.filePath } }));
    actions.append(open);
  }
  const duplicate = iconButton('copy', `Duplica ${item.name} come regola`, 'agent-card-icon-action');
  duplicate.addEventListener('click', () => {
    runtime.ruleDraft = duplicateAsRule(runtime, item);
    delete runtime.selectedRuleId;
    runtime.render();
  });
  actions.append(duplicate);
  if (item.kind === 'rule' && item.rule && item.rule.source !== 'bundled') {
    const remove = iconButton('trash', `Elimina ${item.name}`, 'agent-card-icon-action agent-card-icon-action--danger');
    remove.addEventListener('click', () => {
      local.skillDeleteId = item.rule!.id;
      runtime.render();
    });
    actions.append(remove);
  } else if (item.managed && item.skillItems?.[0]?.ruleId) {
    const remove = iconButton('trash', `Elimina skill gestita ${item.name}`, 'agent-card-icon-action agent-card-icon-action--danger');
    remove.addEventListener('click', () => {
      local.skillDeleteId = `managed:${item.skillItems![0].ruleId}`;
      runtime.render();
    });
    actions.append(remove);
  }
  const expand = iconButton('chevronDown', expanded ? `Comprimi ${item.name}` : `Espandi ${item.name}`, 'agent-card-icon-action skill-card__expand');
  expand.setAttribute('aria-expanded', String(expanded));
  if (expanded) expand.classList.add('is-open');
  expand.addEventListener('click', () => {
    if (expanded) runtime.expandedPanels.delete(expandedKey);
    else runtime.expandedPanels.add(expandedKey);
    runtime.render();
  });
  actions.append(expand);
  top.append(actions);
  card.append(top);

  if (expanded) card.append(renderSkillCardDetail(item));
  if (local.skillDeleteId === item.rule?.id || (item.managed && local.skillDeleteId === `managed:${item.skillItems?.[0]?.ruleId}`)) {
    card.append(renderDeleteConfirm(runtime, item));
  }
  return card;
}

function renderRuleEditor(runtime: UiRuntime, selected: RuleDocument): HTMLElement {
  const state = runtime.state!;
  const form = el('form', 'agent-editor skill-editor') as HTMLFormElement;
  const top = el('header', 'agent-editor__header');
  const heading = el('div');
  heading.append(el('h2', '', selected.id.startsWith('draft:') ? 'Nuova regola' : selected.name || 'Regola'));
  const close = button('button button--ghost button--small');
  close.append(icon('close', 14), el('span', '', 'Chiudi'));
  close.addEventListener('click', () => {
    delete runtime.ruleDraft;
    delete runtime.selectedRuleId;
    runtime.render();
  });
  top.append(heading, close);
  form.append(top);

  const base = el('section', 'agent-editor-section agent-editor-section--base');
  const baseBody = el('div', 'agent-editor-section__body');
  const identityGrid = el('div', 'agent-form-grid agent-form-grid--two');
  const name = textInput('Nome', 'Es. gdpr', selected.name, 120, true);
  const description = textInput('Descrizione breve', 'Una riga: quando e perché usarla', selected.description ?? '', 240);
  identityGrid.append(name.field, description.field);
  baseBody.append(identityGrid);
  const instructions = textArea('Istruzioni', 'Scrivi istruzioni Markdown operative per gli agenti.', selected.content, 20_000, 8);
  baseBody.append(instructions.field);
  const active = toggleField('Attiva', 'La regola viene applicata ai provider selezionati.', selected.enabled);
  baseBody.append(active.field);
  base.append(baseBody);
  form.append(base);

  const application = collapsible(runtime, 'skill:application', 'Applicazione', 'Ambito, progetto e obbligatorietà');
  const scope = segmentedScope(selected.scope);
  application.body.append(scope.field);
  const mandatory = toggleField('Obbligatoria', 'Le richieste successive non possono indebolirla.', Boolean(selected.mandatory));
  application.body.append(mandatory.field);
  application.details.append(application.body);
  form.append(application.details);

  const providerSection = collapsible(runtime, 'skill:providers', 'Provider', 'Applicazione e pubblicazione nativa');
  providerSection.body.append(el('span', 'section-label', 'Applica a'));
  const applyProviders = providerPicker(runtime, selected.providers?.length ? selected.providers : supportedProviderIds());
  providerSection.body.append(applyProviders.node);
  const publishToggle = toggleField('Pubblica come skill nativa', 'Materializza SKILL.md mantenendo Relay come fonte di verità.', Boolean(selected.skillPublication?.enabled));
  providerSection.body.append(publishToggle.field);
  providerSection.body.append(el('span', 'section-label', 'Pubblica su'));
  const publishedProviders = providerPicker(runtime, selected.skillPublication?.providers ?? []);
  providerSection.body.append(publishedProviders.node);
  const codexSupport = (state.skills?.providers ?? []).find((entry) => entry.provider === 'codex');
  if (codexSupport?.featureEnabled === false) {
    const warning = el('div', 'skill-provider-warning');
    warning.append(icon('warning', 14), el('span', '', codexSupport.note ?? 'Codex potrebbe richiedere features.skills=true.'));
    const enable = button('button button--secondary button--small', 'Abilita');
    enable.addEventListener('click', () => runtime.post({ type: 'enableCodexSkills' }));
    warning.append(enable);
    providerSection.body.append(warning);
  }
  providerSection.details.append(providerSection.body);
  form.append(providerSection.details);

  const preview = el('details', 'agent-advanced skill-preview') as HTMLDetailsElement;
  const previewSummary = el('summary', 'agent-advanced__summary');
  previewSummary.append(el('span', '', 'Preview Markdown'), el('small', '', 'Anteprima collassabile delle istruzioni'), icon('chevronDown', 15));
  preview.append(previewSummary);
  const previewBody = el('div', 'agent-advanced__body');
  previewBody.append(renderMarkdown(selected.content || '_Nessuna istruzione_'));
  preview.append(previewBody);
  form.append(preview);

  const actions = el('footer', 'agent-editor__actions');
  const cancel = button('button button--ghost', 'Annulla');
  cancel.addEventListener('click', () => {
    delete runtime.ruleDraft;
    delete runtime.selectedRuleId;
    runtime.render();
  });
  const save = button('button button--primary');
  save.type = 'submit';
  save.append(icon('check', 15), el('span', '', 'Salva regola'));
  actions.append(cancel, save);
  form.append(actions);

  const updateDraft = () => {
    runtime.ruleDraft = {
      ...selected,
      name: name.input.value,
      description: description.input.value,
      content: instructions.input.value,
      enabled: active.input.checked,
      scope: scope.value(),
      mandatory: mandatory.input.checked,
      providers: applyProviders.value(),
      priority: selected.priority ?? 100,
      skillPublication: { enabled: publishToggle.input.checked, providers: publishedProviders.value() }
    };
    if (!runtime.ruleDraft.description) delete runtime.ruleDraft.description;
  };
  for (const control of [name.input, description.input, instructions.input, active.input, mandatory.input, publishToggle.input]) {
    control.addEventListener(control instanceof HTMLInputElement && control.type === 'checkbox' ? 'change' : 'input', updateDraft);
  }
  scope.field.addEventListener('click', () => queueMicrotask(updateDraft));
  applyProviders.node.addEventListener('change', updateDraft);
  publishedProviders.node.addEventListener('change', updateDraft);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const providers = applyProviders.value();
    const skillProviders = publishedProviders.value();
    if (!name.input.value.trim() || !instructions.input.value.trim()) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: 'Inserisci nome e istruzioni della regola.' } });
      return;
    }
    if (!providers.length) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: 'Seleziona almeno un provider.' } });
      return;
    }
    if (publishToggle.input.checked && !description.input.value.trim()) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: 'La descrizione è obbligatoria per pubblicare una skill.' } });
      return;
    }
    if (publishToggle.input.checked && !skillProviders.length) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: 'Seleziona almeno un provider per la pubblicazione.' } });
      return;
    }
    runtime.post({
      type: 'saveRule',
      payload: {
        ...(selected.id.startsWith('draft:') ? {} : { id: selected.id }),
        name: name.input.value.trim(),
        description: description.input.value.trim(),
        content: instructions.input.value,
        enabled: active.input.checked,
        scope: scope.value(),
        mandatory: mandatory.input.checked,
        providers,
        priority: 100,
        skillPublication: { enabled: publishToggle.input.checked, providers: skillProviders }
      }
    });
    delete runtime.ruleDraft;
  });
  return form;
}

function collectSkillItems(runtime: UiRuntime): { templates: SkillCardItem[]; rules: SkillCardItem[]; skills: SkillCardItem[] } {
  const state = runtime.state!;
  const rules = state.rules.map((rule) => ruleToItem(rule));
  const editableRules = rules.filter((item) => item.rule?.source !== 'bundled');
  const skills = groupSkillsByName((state.skills?.items ?? []).filter((item: any) => item.provider !== 'copilot'))
    .map((group: any) => {
      const first = group.items[0];
      return {
        id: `skill:${group.name}`,
        kind: 'skill' as const,
        name: group.name,
        description: group.description || first?.description || '',
        providers: [...new Set(group.items.map((entry: any) => entry.provider).filter(isSupportedProvider))] as ProviderId[],
        managed: group.items.some((entry: any) => entry.managed),
        filePath: first?.filePath,
        skillItems: group.items
      };
    });
  return { templates: [], rules: editableRules, skills };
}

function ruleToItem(rule: RuleDocument): SkillCardItem {
  return {
    id: `rule:${rule.id}`,
    kind: rule.source === 'bundled' ? 'template' : 'rule',
    name: rule.name,
    description: rule.description ?? firstLine(rule.content),
    providers: (rule.providers?.length ? rule.providers : supportedProviderIds()).filter(isSupportedProvider),
    enabled: rule.enabled,
    managed: Boolean(rule.skillPublication?.enabled),
    rule
  };
}

function renderSkillCardDetail(item: SkillCardItem): HTMLElement {
  const detail = el('div', 'skill-card-detail');
  if (item.rule) {
    detail.append(detailRow('Ambito', item.rule.scope === 'global' ? 'Globale' : 'Progetto'));
    detail.append(detailRow('Obbligatoria', item.rule.mandatory ? 'Sì' : 'No'));
    detail.append(detailRow('Pubblicazione', item.rule.skillPublication?.enabled ? providerNames(item.rule.skillPublication.providers.filter(isSupportedProvider)) : 'Non pubblicata'));
    const content = el('details', 'skill-card-detail__instructions');
    const summary = el('summary');
    summary.append(el('span', '', 'Istruzioni'), icon('chevronDown', 13));
    content.append(summary, renderMarkdown(item.rule.content || ''));
    detail.append(content);
  } else {
    detail.append(detailRow('Provider', providerNames(item.providers)));
    if (item.filePath) detail.append(detailRow('File', item.filePath));
  }
  return detail;
}

function renderDeleteConfirm(runtime: UiRuntime, item: SkillCardItem): HTMLElement {
  const local = runtime as any;
  const confirm = el('div', 'agent-card-delete-confirm skill-delete-confirm');
  const copy = el('div');
  copy.append(el('strong', '', `Eliminare ${item.name}?`), el('span', '', item.kind === 'rule' ? 'La regola verrà rimossa da Relay.' : 'Verrà rimossa la skill gestita da Relay.'));
  const actions = el('div');
  const cancel = button('button button--ghost button--small', 'Annulla');
  cancel.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    delete local.skillDeleteId;
    runtime.render();
  });
  const remove = button('button button--danger button--small', 'Elimina');
  remove.addEventListener('click', () => {
    if (item.rule) runtime.post({ type: 'deleteRule', payload: { id: item.rule.id, confirmed: true } });
    else if (item.skillItems?.[0]?.ruleId) runtime.post({ type: 'deleteManagedSkill', payload: { ruleId: item.skillItems[0].ruleId, confirmed: true } });
    delete local.skillDeleteId;
    runtime.render();
  });
  actions.append(cancel, remove);
  confirm.append(copy, actions);
  return confirm;
}

function renderSkillImportPreview(runtime: UiRuntime, preview: any): HTMLElement {
  const local = runtime as any;
  const box = el('details', 'skill-import-preview') as HTMLDetailsElement;
  box.open = true;
  const summary = el('summary', 'agent-advanced__summary');
  summary.append(el('span', '', 'Importa skill'), el('small', '', preview.status ?? 'Preview ZIP'), icon('chevronDown', 15));
  box.append(summary);
  const body = el('div', 'agent-advanced__body');
  body.append(detailRow('Nome', preview.name ?? 'Non disponibile'));
  body.append(detailRow('Descrizione', preview.description ?? ''));
  body.append(detailRow('Schema', String(preview.schemaVersion ?? '')));
  body.append(detailRow('Provider', providerNames((preview.providers ?? []).filter(isSupportedProvider))));
  body.append(detailRow('File inclusi', String(preview.fileCount ?? 0)));
  for (const warning of preview.warnings ?? []) body.append(el('div', 'skill-provider-warning', warning));
  for (const error of preview.errors ?? []) body.append(el('div', 'skill-provider-warning is-danger', error));
  const actions = el('div', 'agent-editor__actions');
  const cancel = button('button button--ghost', 'Annulla');
  cancel.addEventListener('click', () => { delete local.skillImportPreview; runtime.render(); });
  const confirm = button('button button--primary', 'Importa');
  confirm.disabled = preview.status === 'incompatible' || (preview.errors ?? []).length > 0;
  confirm.addEventListener('click', () => runtime.post({ type: 'confirmSkillImport', payload: { token: preview.token } }));
  actions.append(cancel, confirm);
  body.append(actions);
  box.append(body);
  return box;
}

async function chooseSkillZip(runtime: UiRuntime): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,application/zip';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: 'Seleziona un file .zip.' } });
      return;
    }
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    runtime.post({ type: 'previewSkillImport', payload: { name: file.name, size: file.size, bytes } });
  });
  input.click();
}

function duplicateAsRule(runtime: UiRuntime, item: SkillCardItem): RuleDocument {
  const base = draftRule(runtime.state!.workspace.id);
  return {
    ...base,
    name: `${item.name} copia`,
    description: item.description,
    providers: item.providers.length ? item.providers : supportedProviderIds(),
    content: item.rule?.content ?? `# ${item.name}\n\n${item.description}`
  };
}

function draftRule(projectId: string): RuleDocument {
  return {
    id: `draft:${Date.now()}`,
    name: '',
    description: '',
    scope: 'project',
    projectId,
    providers: supportedProviderIds(),
    priority: 100,
    enabled: true,
    path: '',
    content: '',
    skillPublication: { enabled: false, providers: [] }
  };
}

function providerPicker(runtime: UiRuntime, values: ProviderId[]): { node: HTMLElement; value(): ProviderId[] } {
  const node = el('div', 'provider-target-grid skill-provider-grid');
  for (const provider of SKILL_PROVIDERS) {
    const status = runtime.state!.providers.find((entry) => entry.id === provider.id);
    const selected = values.includes(provider.id);
    const label = el('label', `provider-target ${selected ? 'is-selected' : ''} ${status?.available ? '' : 'is-disabled'}`);
    label.title = status?.available ? provider.label : `${provider.label} non disponibile`;
    const input = el('input') as HTMLInputElement;
    input.type = 'checkbox';
    input.value = provider.id;
    input.checked = selected;
    input.disabled = !status?.available;
    input.addEventListener('change', () => label.classList.toggle('is-selected', input.checked));
    label.append(input, providerGlyph(provider.id), el('span', '', provider.label));
    node.append(label);
  }
  return {
    node,
    value: () => Array.from(node.querySelectorAll<HTMLInputElement>('input:checked')).map((input) => input.value as ProviderId)
  };
}

function segmentedScope(initial: RuleDocument['scope']): { field: HTMLElement; value(): RuleDocument['scope'] } {
  let current = initial;
  const field = el('div', 'agent-field');
  field.append(el('span', 'agent-field__label', 'Ambito'));
  const group = el('div', 'rule-segmented');
  for (const option of [{ value: 'global', label: 'Globale' }, { value: 'project', label: 'Progetto' }] as const) {
    const item = button(`rule-segmented__item ${option.value === current ? 'is-active' : ''}`, option.label);
    item.addEventListener('click', () => {
      current = option.value;
      for (const child of Array.from(group.children)) child.classList.remove('is-active');
      item.classList.add('is-active');
    });
    group.append(item);
  }
  field.append(group);
  return { field, value: () => current };
}

function collapsible(runtime: UiRuntime, id: string, title: string, hint: string): { details: HTMLDetailsElement; body: HTMLElement } {
  const details = el('details', 'agent-advanced') as HTMLDetailsElement;
  details.open = runtime.expandedPanels.has(id);
  const summary = el('summary', 'agent-advanced__summary');
  summary.append(el('span', '', title), el('small', '', hint), icon('chevronDown', 15));
  details.append(summary);
  details.addEventListener('toggle', () => {
    if (details.open) runtime.expandedPanels.add(id);
    else runtime.expandedPanels.delete(id);
  });
  return { details, body: el('div', 'agent-advanced__body') };
}

function textInput(label: string, hint: string, value: string, maxLength: number, required = false): { field: HTMLElement; input: HTMLInputElement } {
  const field = el('label', 'agent-field');
  field.append(el('span', 'agent-field__label', label), el('small', '', hint));
  const input = el('input', 'agent-input') as HTMLInputElement;
  input.value = value;
  input.maxLength = maxLength;
  input.required = required;
  field.append(input);
  return { field, input };
}

function textArea(label: string, hint: string, value: string, maxLength: number, rows: number): { field: HTMLElement; input: HTMLTextAreaElement } {
  const field = el('label', 'agent-field');
  field.append(el('span', 'agent-field__label', label), el('small', '', hint));
  const input = el('textarea', 'agent-textarea skill-instructions') as HTMLTextAreaElement;
  input.value = value;
  input.maxLength = maxLength;
  input.rows = rows;
  input.spellcheck = false;
  field.append(input);
  return { field, input };
}

function toggleField(label: string, hint: string, checked: boolean): { field: HTMLElement; input: HTMLInputElement } {
  const field = el('label', 'agent-toggle');
  const copy = el('span');
  copy.append(el('strong', '', label), el('small', '', hint));
  const control = el('span', 'agent-toggle__control');
  const input = el('input') as HTMLInputElement;
  input.type = 'checkbox';
  input.checked = checked;
  control.append(input, el('span'));
  field.append(copy, control);
  return { field, input };
}

function providerMicroBadges(providers: ProviderId[]): HTMLElement {
  const badges = el('span', 'skill-provider-microbadges');
  for (const provider of providers.filter(isSupportedProvider)) {
    const badge = el('span', 'skill-provider-microbadge');
    badge.title = providerName(provider);
    badge.append(providerGlyph(provider));
    badges.append(badge);
  }
  return badges;
}

function detailRow(label: string, value: string): HTMLElement {
  const row = el('div', 'skill-detail-row');
  row.append(el('span', '', label), el('strong', '', value || '—'));
  return row;
}

function filterItems(items: SkillCardItem[], query: string): SkillCardItem[] {
  if (!query) return items;
  return items.filter((item) => [item.name, item.description, item.providers.join(' ')].some((value) => value.toLowerCase().includes(query)));
}

function sectionSubtitle(id: string, count: number, emptyLabel?: string): string {
  if (emptyLabel) return emptyLabel;
  if (id === 'skill:templates') return count ? 'Pronti da duplicare come regole' : 'Chiusi di default';
  if (id === 'skill:rules') return count ? 'Fonte di verità Relay' : 'Nessuna regola';
  return count ? 'Sincronizzate dai provider compatibili' : 'Nessuna skill trovata';
}

function supportedProviderIds(): ProviderId[] {
  return SKILL_PROVIDERS.map((provider) => provider.id);
}

function isSupportedProvider(value: unknown): value is ProviderId {
  return value === 'codex' || value === 'claude' || value === 'antigravity';
}

function providerNames(providers: ProviderId[]): string {
  return providers.filter(isSupportedProvider).map(providerName).join(', ') || '—';
}

function providerName(provider: ProviderId): string {
  return SKILL_PROVIDERS.find((entry) => entry.id === provider)?.label ?? provider;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
}
