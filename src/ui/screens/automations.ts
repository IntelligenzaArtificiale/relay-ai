import type { AutomationSchedule, RelayAutomation, ProviderId } from '../../core/types.js';
import { button, el, formatRelativeTime, icon, iconButton, providerLabel, select } from '../dom.js';
import type { UiRuntime } from '../types.js';
import { describeSchedule } from '../../services/automation-scheduler.js';

const DAY_LABELS = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];

export function renderAutomations(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const local = runtime as any;
  const page = el('section', 'content-page automations-page');
  const header = el('header', 'page-header automations-header');
  const copy = el('div');
  copy.append(el('span', 'eyebrow', 'Scheduler locale'), el('h1', '', 'Automazioni'));
  copy.append(el('p', '', 'Task programmati che usano provider, agenti e permessi Relay. Girano quando l’editor è aperto; i risultati restano leggibili anche dal telefono.'));
  const add = button('button button--primary');
  add.append(icon('plus', 15), el('span', '', 'Nuova automazione'));
  add.addEventListener('click', () => { local.automationDraft = emptyDraft(state.workspace.id); runtime.render(); });
  header.append(copy, add);
  page.append(header);

  if (!state.automations.length && !local.automationDraft) page.append(onboarding(runtime));
  if (local.automationDraft) page.append(renderEditor(runtime, local.automationDraft));

  const list = el('div', 'automation-list');
  for (const automation of state.automations) list.append(renderCard(runtime, automation));
  page.append(list);
  return page;
}

function onboarding(runtime: UiRuntime): HTMLElement {
  const card = el('section', 'automation-onboarding');
  const copy = el('div');
  copy.append(icon('workflow', 28), el('h2', '', 'Programma Relay'), el('p', '', 'Report mattutini, check periodici e task ricorrenti. L’editor deve restare aperto; con Relay Remoto controlli i risultati dal telefono.'));
  card.append(copy);
  const templates = el('div', 'automation-templates');
  templates.append(templateButton(runtime, 'Riepilogo giornaliero del repo', 'Analizza le modifiche recenti del repository, segnala rischi e prepara un riepilogo operativo.', { kind: 'daily', time: '09:00' }));
  templates.append(templateButton(runtime, 'Controlla i TODO ogni ora', 'Cerca TODO e FIXME nel progetto, raggruppali per priorità e segnala quelli nuovi o bloccanti.', { kind: 'interval', everyMinutes: 60 }));
  card.append(templates);
  return card;
}

function templateButton(runtime: UiRuntime, name: string, prompt: string, schedule: AutomationSchedule): HTMLElement {
  const control = button('automation-template');
  control.append(el('strong', '', name), el('span', '', describeSchedule(schedule)));
  control.addEventListener('click', () => { (runtime as any).automationDraft = { ...emptyDraft(runtime.state!.workspace.id), name, prompt, schedule }; runtime.render(); });
  return control;
}

function renderCard(runtime: UiRuntime, automation: RelayAutomation): HTMLElement {
  const local = runtime as any;
  const card = el('article', `automation-card ${automation.enabled ? '' : 'is-disabled'}`);
  const top = el('div', 'automation-card__top');
  const copy = el('div', 'automation-card__copy');
  copy.append(el('strong', '', automation.name), el('span', '', describeSchedule(automation.schedule)));
  const meta = el('div', 'automation-card__meta');
  const provider = automation.agentId ? runtime.state!.agents.find((agent) => agent.id === automation.agentId)?.name ?? 'Agente' : providerLabel(automation.provider ?? runtime.state!.preferences.defaultProvider);
  meta.append(el('span', 'automation-badge', provider));
  if (automation.nextRunAt && automation.enabled) meta.append(el('span', 'automation-badge', `Prossima ${formatRelativeFuture(automation.nextRunAt)}`));
  if (automation.lastRun) meta.append(el('span', `automation-outcome is-${automation.lastRun.outcome}`, lastOutcome(automation)));
  copy.append(meta);
  const toggle = el('label', 'automation-toggle');
  const input = el('input') as HTMLInputElement;
  input.type = 'checkbox'; input.checked = automation.enabled;
  input.addEventListener('change', () => runtime.post({ type: 'toggleAutomation', payload: { id: automation.id, enabled: input.checked } }));
  toggle.append(input, el('span'));
  top.append(copy, toggle);

  const actions = el('div', 'automation-card__actions');
  const run = button('button button--primary button--small');
  run.append(icon('arrowUp', 14), el('span', '', 'Esegui ora'));
  run.addEventListener('click', () => runtime.post({ type: 'runAutomationNow', payload: { id: automation.id } }));
  const menu = el('details', 'automation-menu');
  const summary = el('summary'); summary.append(icon('more', 16));
  const popover = el('div', 'automation-menu__popover');
  popover.append(menuAction('edit', 'Modifica', () => { local.automationDraft = structuredClone(automation); runtime.render(); }));
  popover.append(menuAction('copy', 'Duplica', () => runtime.post({ type: 'duplicateAutomation', payload: { id: automation.id } })));
  popover.append(menuAction('trash', 'Elimina', () => {
    if (local.confirmAutomationDelete === automation.id) runtime.post({ type: 'deleteAutomation', payload: { id: automation.id } });
    else { local.confirmAutomationDelete = automation.id; runtime.render(); }
  }, true, local.confirmAutomationDelete === automation.id ? 'Conferma elimina' : 'Elimina'));
  menu.append(summary, popover);
  actions.append(run, menu);
  card.append(top, actions);
  if (automation.lastRun?.detail) card.append(el('div', 'automation-card__detail', automation.lastRun.detail));
  return card;
}

function renderEditor(runtime: UiRuntime, draft: any): HTMLElement {
  const local = runtime as any;
  const form = el('form', 'automation-editor');
  const header = el('header', 'automation-editor__header');
  const copy = el('div'); copy.append(el('span', 'eyebrow', draft.id ? 'Modifica' : 'Nuova'), el('strong', '', draft.name || 'Automazione'));
  const close = iconButton('close', 'Chiudi'); close.addEventListener('click', () => { delete local.automationDraft; runtime.render(); });
  header.append(copy, close); form.append(header);

  const name = inputField('Nome', draft.name ?? '', 'es. Report mattutino');
  const prompt = textareaField('Prompt', draft.prompt ?? '', 'Descrivi il task. Puoi usare @provider, @"Nome agente", @file[…] e @dir[…].');
  form.append(name.field, prompt.field);

  const execution = el('div', 'automation-editor__grid');
  const project = selectField('Progetto', draft.projectId ?? '', [{ value: '', label: 'Progetto aperto al momento' }, ...runtime.state!.projects.map((item) => ({ value: item.id, label: item.name }))]);
  const provider = selectField('Provider', draft.provider ?? '', [{ value: '', label: 'Predefinito Relay' }, ...runtime.state!.providers.filter((item) => item.available).map((item) => ({ value: item.id, label: item.label }))]);
  const agent = selectField('Agente', draft.agentId ?? '', [{ value: '', label: 'Nessun agente' }, ...runtime.state!.agents.filter((item) => item.enabled).map((item) => ({ value: item.id, label: item.name }))]);
  const permission = selectField('Permessi', draft.permission ?? 'workspace-write', [
    { value: 'read-only', label: 'Sola lettura' }, { value: 'workspace-write', label: 'Workspace' }, { value: 'danger-full-access', label: 'Accesso completo' }
  ]);
  const delegation = selectField('Deleghe', draft.delegationPolicy ?? 'confirm', [
    { value: 'confirm', label: 'Conferma' }, { value: 'automatic', label: 'Automatiche' }, { value: 'disabled', label: 'Disabilitate' }
  ]);
  execution.append(project.field, provider.field, agent.field, permission.field, delegation.field); form.append(execution);

  const scheduleBox = el('section', 'automation-schedule');
  scheduleBox.append(el('strong', '', 'Pianificazione'));
  const current = normalizeDraftSchedule(draft.schedule);
  const kinds = el('div', 'automation-kind-chips');
  for (const item of [{ id: 'interval', label: 'Intervallo' }, { id: 'daily', label: 'Giornaliera' }, { id: 'weekly', label: 'Settimanale' }, { id: 'once', label: 'Una volta' }]) {
    const control = button(`automation-kind ${current.kind === item.id ? 'is-active' : ''}`, item.label);
    control.addEventListener('click', () => { draft.schedule = defaultSchedule(item.id); runtime.render(); });
    kinds.append(control);
  }
  scheduleBox.append(kinds);
  const scheduleInputs = el('div', 'automation-schedule__inputs');
  if (current.kind === 'interval') scheduleInputs.append(numberField('Ogni minuti', current.everyMinutes, 5).field);
  if (current.kind === 'daily' || current.kind === 'weekly') scheduleInputs.append(timeField('Orario', current.time).field);
  if (current.kind === 'weekly') {
    const days = el('div', 'automation-days');
    const selected = new Set<number>(current.days);
    DAY_LABELS.forEach((label, index) => {
      const control = button(`automation-day ${selected.has(index) ? 'is-active' : ''}`, label);
      control.dataset.day = String(index); control.addEventListener('click', () => { control.classList.toggle('is-active'); updateSchedulePreview(); });
      days.append(control);
    });
    scheduleInputs.append(days);
  }
  if (current.kind === 'once') scheduleInputs.append(datetimeField('Data e ora', isoForInput(current.at)).field);
  const activeFrom = datetimeField('Valida da', current.activeFrom ? isoForInput(current.activeFrom) : '');
  const activeTo = datetimeField('Valida fino a', current.activeTo ? isoForInput(current.activeTo) : '');
  scheduleInputs.append(activeFrom.field, activeTo.field);
  const preview = el('div', 'automation-schedule__preview', describeSchedule(current));
  const updateSchedulePreview = () => {
    try {
      preview.textContent = describeSchedule(collectSchedule(form, current.kind));
      preview.classList.remove('is-invalid');
    } catch {
      preview.textContent = 'Completa data, ora e periodo per vedere la pianificazione.';
      preview.classList.add('is-invalid');
    }
  };
  for (const input of scheduleInputs.querySelectorAll('input')) {
    input.addEventListener('input', updateSchedulePreview);
    input.addEventListener('change', updateSchedulePreview);
  }
  scheduleBox.append(scheduleInputs, preview);
  form.append(scheduleBox);

  const missed = selectField('Se l’editor era chiuso', draft.missedPolicy ?? 'skip', [
    { value: 'skip', label: 'Salta e riallinea (predefinito)' }, { value: 'catchUpOnce', label: 'Recupera una volta alla riapertura' }
  ]);
  form.append(missed.field, el('p', 'automation-honesty', 'Le automazioni girano solo quando l’editor con Relay è aperto. Nessun servizio di sistema viene installato.'));

  const footer = el('footer', 'automation-editor__footer');
  const save = button('button button--primary', 'Salva automazione');
  save.type = 'submit'; footer.append(save); form.append(footer);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const schedule = collectSchedule(form, current.kind);
    runtime.post({ type: 'saveAutomation', payload: {
      ...(draft.id ? { id: draft.id } : {}), name: name.input.value, prompt: prompt.input.value, projectId: project.input.value || null,
      provider: provider.input.value || undefined, agentId: agent.input.value || undefined, permission: permission.input.value,
      delegationPolicy: delegation.input.value, schedule, enabled: draft.enabled !== false, missedPolicy: missed.input.value
    } });
    delete local.automationDraft;
  });
  return form;
}

function collectSchedule(form: HTMLElement, kind: AutomationSchedule['kind']): AutomationSchedule {
  const value = (name: string) => (form.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.value ?? '';
  const activeFrom = value('activeFrom') ? new Date(value('activeFrom')).toISOString() : undefined;
  const activeTo = value('activeTo') ? new Date(value('activeTo')).toISOString() : undefined;
  const period = { ...(activeFrom ? { activeFrom } : {}), ...(activeTo ? { activeTo } : {}) };
  if (kind === 'interval') return { kind, everyMinutes: Math.max(5, Number(value('everyMinutes')) || 5), ...period };
  if (kind === 'daily') return { kind, time: value('time') || '09:00', ...period };
  if (kind === 'weekly') return { kind, days: [...form.querySelectorAll('.automation-day.is-active')].map((node) => Number((node as HTMLElement).dataset.day)), time: value('time') || '09:00', ...period };
  return { kind, at: new Date(value('onceAt')).toISOString(), ...period };
}

function emptyDraft(projectId: string): any { return { name: '', prompt: '', projectId, permission: 'workspace-write', delegationPolicy: 'confirm', schedule: { kind: 'daily', time: '09:00' }, enabled: true, missedPolicy: 'skip' }; }
function normalizeDraftSchedule(value: AutomationSchedule | undefined): AutomationSchedule { return value ?? { kind: 'daily', time: '09:00' }; }
function defaultSchedule(kind: string): AutomationSchedule { if (kind === 'interval') return { kind, everyMinutes: 60 }; if (kind === 'weekly') return { kind, days: [1], time: '09:00' }; if (kind === 'once') return { kind, at: new Date(Date.now() + 60 * 60_000).toISOString() }; return { kind: 'daily', time: '09:00' }; }
function lastOutcome(item: RelayAutomation): string { const run = item.lastRun!; return run.outcome === 'ok' ? `✓ ${formatRelativeTime(run.at)}` : run.outcome === 'error' ? `Errore ${formatRelativeTime(run.at)}` : `Saltata ${formatRelativeTime(run.at)}`; }
function formatRelativeFuture(value: string): string { const ms = new Date(value).getTime() - Date.now(); if (ms <= 0) return 'ora'; const minutes = Math.ceil(ms / 60_000); if (minutes < 60) return `tra ${minutes}m`; const hours = Math.floor(minutes / 60); const rest = minutes % 60; return `tra ${hours}h${rest ? ` ${rest}m` : ''}`; }
function isoForInput(value: string): string { const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }
function menuAction(iconName: any, label: string, handler: () => void, danger = false, override?: string): HTMLElement { const control = button(`automation-menu__item ${danger ? 'is-danger' : ''}`); control.append(icon(iconName, 14), el('span', '', override ?? label)); control.addEventListener('click', handler); return control; }
function inputField(label: string, value: string, placeholder = '') { const field = el('label', 'automation-field'); field.append(el('span', '', label)); const input = el('input') as HTMLInputElement; input.value = value; input.placeholder = placeholder; field.append(input); return { field, input }; }
function textareaField(label: string, value: string, placeholder = '') { const field = el('label', 'automation-field automation-field--wide'); field.append(el('span', '', label)); const input = el('textarea') as HTMLTextAreaElement; input.value = value; input.placeholder = placeholder; input.rows = 6; field.append(input); return { field, input }; }
function selectField(label: string, value: string, options: Array<{ value: string; label: string }>) { const field = el('label', 'automation-field'); field.append(el('span', '', label)); const input = select(value, options); field.append(input); return { field, input }; }
function numberField(label: string, value: number, min: number) { const result = inputField(label, String(value)); result.input.type = 'number'; result.input.min = String(min); result.input.name = 'everyMinutes'; return result; }
function timeField(label: string, value: string) { const result = inputField(label, value); result.input.type = 'time'; result.input.name = 'time'; return result; }
function datetimeField(label: string, value: string) { const result = inputField(label, value); result.input.type = 'datetime-local'; result.input.name = label === 'Valida da' ? 'activeFrom' : label === 'Valida fino a' ? 'activeTo' : 'onceAt'; return result; }
