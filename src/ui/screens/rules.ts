import type { ProviderId, RuleDocument } from '../../core/types.js';
import { button, el, icon, iconButton, providerGlyph } from '../dom.js';
import { groupSkillsByName } from '../../core/skill-utils.js';
import type { UiRuntime } from '../types.js';

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: 'codex', label: 'Codex' },
  { id: 'claude', label: 'Claude Code' },
  { id: 'antigravity', label: 'Antigravity' },
  { id: 'copilot', label: 'GitHub Copilot' }
];

export function renderRules(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const local = runtime as any;
  const activeTab: 'rules' | 'skills' = local.rulesTab === 'skills' ? 'skills' : 'rules';
  const skillGroups = groupSkillsByName(state.skills?.items ?? []);
  const page = el('section', 'content-page content-page--rules rules-studio');
  const selected = runtime.ruleDraft
    ?? (runtime.selectedRuleId ? state.rules.find((rule) => rule.id === runtime.selectedRuleId) : undefined);

  const header = el('header', 'page-header rules-header rules-header--compact');
  const copy = el('div');
  copy.append(el('span', 'eyebrow', 'Governance'), el('h1', '', activeTab === 'skills' ? 'Skill provider' : 'Regole'));
  copy.append(el('p', '', activeTab === 'skills'
    ? 'Sfoglia le skill native rilevate nei provider. Relay modifica soltanto quelle con marcatore gestito.'
    : 'Le regole restano la fonte di veritÃ  e possono essere pubblicate come skill native dei provider.'));
  const actions = el('div', 'rules-header__actions');
  const sync = button('button button--secondary');
  sync.append(icon('refresh', 16), el('span', '', 'Sincronizza skill'));
  sync.addEventListener('click', () => runtime.post({ type: 'syncSkills' }));
  actions.append(sync);
  if (activeTab === 'rules') {
    const add = button('button button--primary');
    add.append(icon('plus', 16), el('span', '', 'Nuova regola'));
    add.addEventListener('click', () => {
      runtime.ruleDraft = draftRule(state.workspace.id);
      delete runtime.selectedRuleId;
      runtime.render();
    });
    actions.append(add);
  }
  header.append(copy, actions);
  page.append(header);

  const tabs = el('div', 'rules-tabs');
  for (const [id, label] of [['rules', 'Regole Relay'], ['skills', `Skill trovate (${skillGroups.length})`]] as const) {
    const tab = button(`rules-tab ${activeTab === id ? 'is-active' : ''}`, label);
    tab.addEventListener('click', () => { local.rulesTab = id; runtime.render(); });
    tabs.append(tab);
  }
  page.append(tabs);

  if (activeTab === 'skills') {
    page.append(renderSkillBrowser(runtime));
    return page;
  }

  const layout = el('div', `rules-layout ${selected ? 'has-selection' : ''}`);
  layout.append(renderRuleLibrary(runtime, selected?.id));
  layout.append(selected ? renderRuleEditor(runtime, selected) : renderRulesWelcome(runtime));
  page.append(layout);
  return page;
}

function renderRuleLibrary(runtime: UiRuntime, selectedId?: string): HTMLElement {
  const state = runtime.state!;
  const panel = el('aside', 'rules-library-panel');
  const heading = el('div', 'rules-library-heading');
  const counts = `${state.rules.filter((rule) => rule.enabled).length} attive Â· ${state.rules.length} totali`;
  heading.append(el('strong', '', 'Regole configurate'), el('span', '', counts));
  panel.append(heading);

  const list = el('div', 'rules-library-list rules-library-list--studio');
  const rules = [...state.rules].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === 'project' ? -1 : 1;
    return (a.priority ?? 100) - (b.priority ?? 100) || a.name.localeCompare(b.name);
  });

  if (!rules.length) {
    const empty = el('div', 'rules-library-empty');
    empty.append(icon('rules', 22), el('strong', '', 'Nessuna regola'), el('span', '', 'Creane una per guidare gli agenti in modo coerente.'));
    list.append(empty);
  }

  for (const rule of rules) {
    const row = el('article', `rule-library-row ${rule.id === selectedId ? 'is-active' : ''}`);
    const open = button('rule-library-row__main');
    open.addEventListener('click', () => {
      delete runtime.ruleDraft;
      runtime.selectedRuleId = rule.id;
      runtime.render();
    });
    const stateDot = el('span', `rule-state ${rule.enabled ? 'is-enabled' : ''}`);
    const text = el('span', 'rule-library-row__copy');
    text.append(el('strong', '', rule.name));
    text.append(el('small', '', `${scopeLabel(rule, state.workspace.name)} Â· ${providerSummary(rule.providers)} Â· P${rule.priority ?? 100}`));
    if (rule.skillPublication?.enabled) {
      const badges = el('span', 'rule-skill-badges');
      for (const provider of rule.skillPublication.providers) {
        const badge = el('span', `rule-skill-badge rule-skill-badge--${provider}`);
        badge.title = `Pubblicata come skill per ${PROVIDERS.find((entry) => entry.id === provider)?.label ?? provider}`;
        badge.append(providerGlyph(provider), icon('check', 10));
        badges.append(badge);
      }
      text.append(badges);
    }
    open.append(stateDot, text, icon('chevronDown', 14));

    const toggle = el('label', 'rule-library-toggle');
    toggle.title = rule.enabled ? 'Disattiva regola' : 'Attiva regola';
    const input = el('input') as HTMLInputElement;
    input.type = 'checkbox';
    input.checked = rule.enabled;
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('change', () => runtime.post({ type: 'toggleRule', payload: { id: rule.id, enabled: input.checked } }));
    toggle.append(input, el('span'));
    row.append(open, toggle);
    list.append(row);
  }
  panel.append(list);
  return panel;
}

function renderRulesWelcome(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const welcome = el('section', 'rules-welcome');
  const visual = el('div', 'rules-welcome__icon');
  visual.append(icon('rules', 28));
  welcome.append(visual);
  welcome.append(el('h2', '', state.rules.length ? 'Seleziona una regola' : 'Crea la prima regola'));
  welcome.append(el('p', '', state.rules.length
    ? 'Apri una regola dalla lista per modificarne ambito, prioritÃ , provider e istruzioni.'
    : 'Le regole vengono applicate agli agenti prima del task e possono essere globali oppure specifiche del progetto.'));
  const add = button('button button--primary', 'Nuova regola');
  add.addEventListener('click', () => {
    runtime.ruleDraft = draftRule(state.workspace.id);
    runtime.render();
  });
  welcome.append(add);
  return welcome;
}

function renderRuleEditor(runtime: UiRuntime, selected: RuleDocument): HTMLElement {
  const state = runtime.state!;
  const form = el('form', 'rule-editor rule-editor--studio rule-editor--usable');
  const editorHeader = el('header', 'rule-editor__topbar');
  const editorTitle = el('div');
  editorTitle.append(el('span', 'eyebrow', selected.id.startsWith('draft:') ? 'Nuova regola' : 'Modifica regola'));
  editorTitle.append(el('strong', '', selected.name || 'Senza nome'));
  const close = iconButton('close', 'Chiudi regola', 'icon-button rule-editor__close');
  close.addEventListener('click', () => {
    delete runtime.ruleDraft;
    delete runtime.selectedRuleId;
    runtime.render();
  });
  editorHeader.append(editorTitle, close);
  form.append(editorHeader);

  const hero = el('div', 'rule-editor__hero');
  const identity = el('div', 'rule-editor__identity');
  const name = el('input', 'rule-name') as HTMLInputElement;
  name.value = selected.name;
  name.placeholder = 'Nome della regola';
  const description = el('input', 'rule-description') as HTMLInputElement;
  description.value = selected.description ?? '';
  description.placeholder = 'Descrizione breve, facoltativa';
  identity.append(name, description);
  const active = el('label', 'rule-active-toggle');
  const activeInput = el('input') as HTMLInputElement;
  activeInput.type = 'checkbox';
  activeInput.checked = selected.enabled;
  active.append(activeInput, el('span', '', 'Attiva'));
  hero.append(identity, active);
  form.append(hero);

  const advanced = el('details', 'rule-advanced') as HTMLDetailsElement;
  advanced.open = runtime.expandedPanels.has('rule:advanced');
  const advancedSummary = el('summary', 'rule-advanced__summary');
  advancedSummary.append(el('span', '', 'Opzioni avanzate'), el('small', '', 'Ambito, prioritÃ , obbligatorietÃ  e provider'), icon('chevronDown', 15));
  advanced.append(advancedSummary);
  const advancedBody = el('div', 'rule-advanced__body');
  advanced.addEventListener('toggle', () => {
    if (advanced.open) runtime.expandedPanels.add('rule:advanced');
    else runtime.expandedPanels.delete('rule:advanced');
  });

  const controls = el('div', 'rule-config-grid');
  const scope = segmentedField('Ambito', [
    { value: 'global', label: 'Globale' },
    { value: 'project', label: 'Progetto' }
  ], selected.scope);
  controls.append(scope.field);

  const priority = el('input', 'rule-priority') as HTMLInputElement;
  priority.type = 'number';
  priority.min = '0';
  priority.max = '999';
  priority.value = String(selected.priority ?? 100);
  const priorityField = configField('PrioritÃ ', '0 prima Â· 999 dopo');
  priorityField.append(priority);
  controls.append(priorityField);

  const mandatory = el('label', 'rule-mandatory');
  const mandatoryInput = el('input') as HTMLInputElement;
  mandatoryInput.type = 'checkbox';
  mandatoryInput.checked = Boolean(selected.mandatory);
  mandatory.append(mandatoryInput, el('span', '', 'Obbligatoria'), el('small', '', 'Le richieste successive non possono indebolirla'));
  controls.append(mandatory);
  advancedBody.append(controls);

  const providerSection = el('section', 'rule-provider-targets');
  const providerTitle = el('div', 'rule-section-heading');
  providerTitle.append(el('strong', '', 'Provider'), el('span', '', 'Uno, piÃ¹ provider oppure tutti'));
  providerSection.append(providerTitle);
  const providers = el('div', 'provider-target-grid');
  const selectedProviders = new Set(selected.providers?.length ? selected.providers : ['codex', 'claude', 'antigravity', 'copilot']);
  for (const provider of PROVIDERS) {
    const label = el('label', `provider-target ${selectedProviders.has(provider.id) ? 'is-selected' : ''}`);
    const checkbox = el('input') as HTMLInputElement;
    checkbox.type = 'checkbox';
    checkbox.value = provider.id;
    checkbox.checked = selectedProviders.has(provider.id);
    checkbox.addEventListener('change', () => label.classList.toggle('is-selected', checkbox.checked));
    label.append(checkbox, providerGlyph(provider.id), el('span', '', provider.label));
    providers.append(label);
  }
  providerSection.append(providers);
  advancedBody.append(providerSection);
  advanced.append(advancedBody);
  form.append(advanced);

  const publicationSection = el('section', 'rule-publication-section');
  const publicationHeading = el('div', 'rule-section-heading');
  publicationHeading.append(el('strong', '', 'Pubblicazione skill'), el('span', '', 'Materializza SKILL.md nativi mantenendo Relay come fonte di veritÃ '));
  publicationSection.append(publicationHeading);
  const publicationIntro = el('div', 'rule-skill-explainer');
  publicationIntro.append(icon('sparkle', 18), el('span', '', 'Le skill sono la versione nativa delle tue regole: il provider le carica automaticamente quando servono.'));
  publicationSection.append(publicationIntro);
  const publishToggle = el('label', 'rule-publish-toggle');
  const publishInput = el('input') as HTMLInputElement;
  publishInput.type = 'checkbox';
  publishInput.checked = Boolean(selected.skillPublication?.enabled);
  publishToggle.append(publishInput, el('span', '', 'Pubblica come skill'));
  publicationSection.append(publishToggle);
  const skillTargets = el('div', 'provider-target-grid rule-skill-targets');
  const publishedProviders = new Set(selected.skillPublication?.providers ?? []);
  const support = new Map((state.skills?.providers ?? []).map((entry) => [entry.provider, entry]));
  for (const provider of PROVIDERS) {
    const available = support.get(provider.id)?.available !== false;
    const label = el('label', `provider-target ${publishedProviders.has(provider.id) ? 'is-selected' : ''} ${available ? '' : 'is-disabled'}`);
    const checkbox = el('input') as HTMLInputElement;
    checkbox.type = 'checkbox';
    checkbox.value = provider.id;
    checkbox.checked = publishedProviders.has(provider.id);
    checkbox.disabled = !available;
    checkbox.addEventListener('change', () => label.classList.toggle('is-selected', checkbox.checked));
    label.append(checkbox, providerGlyph(provider.id), el('span', '', provider.label));
    if (!available) label.title = support.get(provider.id)?.note ?? 'Skill non supportate in questa installazione.';
    skillTargets.append(label);
  }
  publicationSection.append(skillTargets);
  const codexSupport = support.get('codex');
  if (codexSupport?.featureEnabled === false) {
    const codexFlag = el('div', 'rule-codex-flag');
    codexFlag.append(el('span', '', codexSupport.note ?? 'Codex potrebbe richiedere lâ€™abilitazione delle skill.'));
    const enable = button('button button--secondary button--small', 'Abilita skill Codex');
    enable.addEventListener('click', () => runtime.post({ type: 'enableCodexSkills' }));
    codexFlag.append(enable);
    publicationSection.append(codexFlag);
  }
  form.append(publicationSection);

  const contentSection = el('section', 'rule-content-section');
  const contentHeading = el('div', 'rule-section-heading');
  contentHeading.append(el('strong', '', 'Istruzioni'), el('span', '', 'Markdown semplice e operativo'));
  const content = el('textarea', 'rule-content') as HTMLTextAreaElement;
  content.value = selected.content;
  content.spellcheck = false;
  content.placeholder = 'Esempio: analizza la codebase prima di modificare file; limita le modifiche al task richiestoâ€¦';
  contentSection.append(contentHeading, content);
  form.append(contentSection);

  const footer = el('footer', 'rule-editor__footer');
  const meta = el('div', 'rule-editor__meta');
  meta.append(el('span', '', selected.scope === 'project' ? state.workspace.name : 'Tutti i progetti'));
  footer.append(meta);
  const footerActions = el('div', 'rule-editor__actions');
  if (!selected.id.startsWith('draft:')) {
    const remove = button('button button--danger-ghost');
    remove.append(icon('trash', 15), el('span', '', 'Elimina'));
    remove.addEventListener('click', () => runtime.post({ type: 'deleteRule', payload: { id: selected.id } }));
    footerActions.append(remove);
  }
  const save = button('button button--primary');
  save.type = 'submit';
  save.append(icon('check', 15), el('span', '', 'Salva'));
  footerActions.append(save);
  footer.append(footerActions);
  form.append(footer);

  const syncDraft = () => {
    const targets = Array.from(providers.querySelectorAll<HTMLInputElement>('input:checked')).map((input) => input.value as ProviderId);
    runtime.ruleDraft = {
      ...selected,
      name: name.value,
      ...(description.value ? { description: description.value } : {}),
      scope: scope.value(),
      providers: targets,
      priority: Number(priority.value || 100),
      mandatory: mandatoryInput.checked,
      enabled: activeInput.checked,
      content: content.value,
      skillPublication: {
        enabled: publishInput.checked,
        providers: Array.from(skillTargets.querySelectorAll<HTMLInputElement>('input:checked')).map((input) => input.value as ProviderId)
      }
    };
    if (!description.value) delete runtime.ruleDraft.description;
  };
  for (const control of [name, description, priority, activeInput, mandatoryInput, content]) {
    const inputControl = control.tagName === 'INPUT' ? control as HTMLInputElement : undefined;
    control.addEventListener(inputControl && (inputControl.type === 'checkbox' || inputControl.type === 'number') ? 'change' : 'input', syncDraft);
  }
  providers.addEventListener('change', syncDraft);
  skillTargets.addEventListener('change', syncDraft);
  publishInput.addEventListener('change', syncDraft);
  scope.field.addEventListener('click', () => queueMicrotask(syncDraft));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const targets = Array.from(providers.querySelectorAll<HTMLInputElement>('input:checked')).map((input) => input.value as ProviderId);
    if (!name.value.trim() || !content.value.trim()) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: 'Inserisci nome e istruzioni della regola.' } });
      return;
    }
    if (!targets.length) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: 'Seleziona almeno un provider.' } });
      return;
    }
    const skillProviders = Array.from(skillTargets.querySelectorAll<HTMLInputElement>('input:checked')).map((input) => input.value as ProviderId);
    if (publishInput.checked && !description.value.trim()) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: 'Inserisci una descrizione: serve ai provider per caricare automaticamente la skill.' } });
      return;
    }
    if (publishInput.checked && !skillProviders.length) {
      runtime.post({ type: 'showNotice', payload: { level: 'warning', message: 'Seleziona almeno un provider per la pubblicazione skill.' } });
      return;
    }
    runtime.post({
      type: 'saveRule',
      payload: {
        ...(selected.id.startsWith('draft:') ? {} : { id: selected.id }),
        name: name.value.trim(),
        description: description.value.trim(),
        scope: scope.value(),
        providers: targets,
        priority: Number(priority.value || 100),
        mandatory: mandatoryInput.checked,
        enabled: activeInput.checked,
        content: content.value,
        skillPublication: { enabled: publishInput.checked, providers: skillProviders }
      }
    });
    delete runtime.ruleDraft;
  });

  return form;
}

function renderSkillBrowser(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const browser = el('section', 'skill-browser');
  const providerSummaryNode = el('div', 'skill-provider-summary');
  for (const provider of state.skills?.providers ?? []) {
    const card = el('article', `skill-provider-card ${provider.available ? 'is-ready' : 'is-unavailable'}`);
    card.append(providerGlyph(provider.provider));
    const copy = el('div');
    copy.append(el('strong', '', PROVIDERS.find((entry) => entry.id === provider.provider)?.label ?? provider.provider));
    copy.append(el('span', '', provider.available ? 'Directory skill rilevata' : (provider.note ?? 'Non disponibile')));
    card.append(copy, el('span', `status-pill ${provider.available ? 'is-ready' : 'is-muted'}`, provider.available ? 'Pronto' : 'Escluso'));
    providerSummaryNode.append(card);
  }
  browser.append(providerSummaryNode);

  const skillGroups = groupSkillsByName(state.skills?.items ?? []);
  if (!skillGroups.length) {
    const empty = el('div', 'rules-library-empty skill-browser-empty');
    empty.append(icon('sparkle', 24), el('strong', '', 'Nessuna skill rilevata'), el('span', '', 'Pubblica una regola oppure crea una skill direttamente nel provider.'));
    browser.append(empty);
    return browser;
  }
  const list = el('div', 'skill-browser-list');
  for (const group of skillGroups) {
    const item = group.items[0]!;
    const managed = group.items.find((entry) => entry.managed && entry.ruleId);
    const providers = [...new Set(group.items.map((entry) => entry.provider))];
    const row = el('article', 'skill-browser-row');
    const copy = el('div', 'skill-browser-row__copy');
    const title = el('div', 'skill-browser-row__title');
    title.append(providerGlyph(item.provider), el('strong', '', group.name));
    copy.append(title);
    copy.append(el('span', '', group.description || 'Nessuna descrizione'));
    const meta = el('div', 'skill-browser-row__meta');
    const providerBadges = el('div', 'skill-browser-provider-badges');
    for (const provider of providers) {
      const badge = el('span', 'skill-browser-provider-badge');
      badge.append(providerGlyph(provider), el('span', '', PROVIDERS.find((entry) => entry.id === provider)?.label ?? provider));
      providerBadges.append(badge);
    }
    meta.append(providerBadges, el('span', `skill-browser-origin ${managed ? 'is-managed' : 'is-manual'}`, managed ? 'Gestita da Relay' : 'Manuale'));
    copy.append(meta);
    const actions = el('div', 'skill-browser-row__actions');
    const open = button('button button--secondary button--small', 'Apri file');
    open.addEventListener('click', () => runtime.post({ type: 'openSkillFile', payload: { path: item.filePath } }));
    actions.append(open);
    if (managed?.ruleId) {
      const remove = button('button button--danger-ghost button--small', 'Elimina');
      remove.addEventListener('click', () => runtime.post({ type: 'deleteManagedSkill', payload: { ruleId: managed.ruleId } }));
      actions.append(remove);
    }
    row.append(copy, actions);
    list.append(row);
  }
  browser.append(list);
  const report = state.skills?.lastReport;
  if (report) browser.append(el('div', 'skill-sync-report', `Ultimo sync: ${report.created} create Â· ${report.updated} aggiornate Â· ${report.removed} rimosse Â· ${report.skipped} saltate`));
  return browser;
}

function configField(label: string, hint?: string): HTMLElement {
  const node = el('label', 'rule-config-field');
  node.append(el('span', '', label));
  if (hint) node.append(el('small', '', hint));
  return node;
}

function segmentedField(
  label: string,
  options: Array<{ value: RuleDocument['scope']; label: string }>,
  initial: RuleDocument['scope']
): { field: HTMLElement; value(): RuleDocument['scope'] } {
  let current = initial;
  const field = configField(label);
  const group = el('div', 'rule-segmented');
  for (const option of options) {
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

function draftRule(projectId: string): RuleDocument {
  return {
    id: `draft:${Date.now()}`,
    name: '',
    description: '',
    scope: 'project',
    projectId,
    providers: ['codex', 'claude', 'antigravity', 'copilot'],
    priority: 100,
    enabled: true,
    path: '',
    content: '',
    skillPublication: { enabled: false, providers: [] }
  };
}

function providerSummary(providers: ProviderId[]): string {
  if (providers.length === 4) return 'Tutti';
  return providers.map((provider) => provider === 'claude' ? 'Claude' : provider === 'antigravity' ? 'Antigravity' : provider === 'copilot' ? 'Copilot' : 'Codex').join(' + ');
}

function scopeLabel(rule: RuleDocument, projectName: string): string {
  return rule.scope === 'project' ? projectName : 'Globale';
}
