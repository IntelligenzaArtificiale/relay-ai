import { button, el, formatPercent, icon, providerGlyph, select } from '../dom.js';
import type { UiRuntime } from '../types.js';

export function renderOnboarding(runtime: UiRuntime): HTMLElement {
  const state = runtime.state;
  const page = el('main', 'onboarding-page onboarding-page--minimal');
  if (!state) return page;

  const shell = el('section', 'onboarding-shell onboarding-shell--minimal');
  const head = el('header', 'onboarding-minimal-head');
  const identity = el('div', 'onboarding-minimal-brand');
  identity.append(icon('logo', 20));
  const identityCopy = el('div');
  identityCopy.append(el('strong', '', 'Relay'), el('span', '', 'Workspace agentico locale'));
  identity.append(identityCopy);
  head.append(identity);

  const progress = el('div', 'onboarding-minimal-progress');
  for (let index = 0; index < 3; index += 1) {
    const step = el('span', `${index === runtime.onboardingStep ? 'is-active' : ''} ${index < runtime.onboardingStep ? 'is-complete' : ''}`);
    step.textContent = index < runtime.onboardingStep ? '✓' : String(index + 1);
    progress.append(step);
  }
  head.append(progress);
  shell.append(head);

  const body = el('div', 'onboarding-minimal-body');
  if (runtime.onboardingStep === 0) body.append(renderDetection(runtime));
  if (runtime.onboardingStep === 1) body.append(renderDefaults(runtime));
  if (runtime.onboardingStep === 2) body.append(renderFinish(runtime));
  shell.append(body);

  const footer = el('footer', 'onboarding-minimal-footer');
  const back = button('button button--ghost', 'Indietro');
  back.disabled = runtime.onboardingStep === 0;
  back.addEventListener('click', () => {
    runtime.onboardingStep = Math.max(0, runtime.onboardingStep - 1);
    runtime.render();
  });
  footer.append(back);

  const next = button('button button--primary');
  next.append(el('span', '', runtime.onboardingStep === 2 ? 'Apri Relay' : 'Continua'), icon('arrowUp', 15));
  next.addEventListener('click', () => {
    if (runtime.onboardingStep === 2) runtime.post({ type: 'completeOnboarding' });
    else {
      runtime.onboardingStep += 1;
      runtime.render();
    }
  });
  footer.append(next);
  shell.append(footer);
  page.append(shell);
  return page;
}

function renderDetection(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const section = el('section', 'onboarding-minimal-panel');
  section.append(sectionIntro('Agenti locali', 'Quattro agenti, un’unica chat.', 'Relay usa gli account già autenticati sul computer.'));

  const list = el('div', 'onboarding-agent-list');
  for (const provider of state.providers) {
    const row = el('article', `onboarding-agent-row ${provider.connected === false ? 'is-disconnected' : ''}`);
    row.append(providerGlyph(provider.id));
    const copy = el('div', 'onboarding-agent-row__copy');
    copy.append(el('strong', '', provider.label));
    copy.append(el('span', provider.setupError ? 'provider-setup-error' : '', provider.connected === false
      ? 'Scollegato da Relay · account invariato'
      : provider.setupProgress
        ?? (provider.available ? compactVersion(provider.version) : 'CLI non rilevata')));
    if (provider.setupError) copy.append(el('small', 'provider-setup-error__detail', provider.setupError));
    row.append(copy);
    const authUnknown = provider.id === 'copilot' && provider.available && provider.authenticated === undefined;
    const ready = provider.connected !== false && provider.available && provider.authenticated !== false && !authUnknown && !provider.setupInProgress && !provider.setupError;
    const stateNode = el('span', `onboarding-agent-state ${ready ? 'is-ready' : 'is-missing'} ${provider.setupInProgress ? 'is-progress' : ''}`);
    stateNode.append(el('span', 'health-dot'));
    stateNode.append(el('span', '', provider.connected === false
      ? 'Ricollega'
      : provider.setupInProgress
        ? 'In corso…'
        : provider.setupError ? 'Riprova' : provider.available ? (provider.authenticated === false ? 'Accedi' : authUnknown ? 'Verifica accesso' : 'Pronto') : 'Configura'));
    if (!provider.setupInProgress && (provider.connected === false || provider.setupError || !provider.available || provider.authenticated === false || authUnknown)) {
      stateNode.tabIndex = 0;
      stateNode.setAttribute('role', 'button');
      stateNode.addEventListener('click', () => runtime.post({
        type: provider.connected === false ? 'connectProvider' : !provider.available ? 'installProvider' : 'openProviderSetup',
        payload: { provider: provider.id }
      }));
      stateNode.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') stateNode.click();
      });
    }
    row.append(stateNode);
    if (ready) {
      const disconnect = button('button button--ghost button--small onboarding-agent-disconnect');
      disconnect.append(icon('close', 13), el('span', '', 'Scollega'));
      disconnect.title = `Scollega ${provider.label} solo da Relay`;
      disconnect.addEventListener('click', () => runtime.post({ type: 'disconnectProvider', payload: { provider: provider.id } }));
      row.append(disconnect);
    }
    list.append(row);
  }
  section.append(list);

  const actions = el('div', 'onboarding-minimal-actions');
  const refresh = button('button button--ghost button--small');
  refresh.append(icon('refresh', 14), el('span', '', 'Rileva di nuovo'));
  refresh.addEventListener('click', () => runtime.post({ type: 'refreshProviders' }));
  const diagnostics = button('button button--ghost button--small');
  diagnostics.append(icon('diagnostics', 14), el('span', '', 'Diagnostica'));
  diagnostics.addEventListener('click', () => runtime.post({ type: 'openDiagnostics' }));
  actions.append(refresh, diagnostics);
  section.append(actions);
  return section;
}

function renderDefaults(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const section = el('section', 'onboarding-minimal-panel');
  section.append(sectionIntro('Default', 'Scegli solo il punto di partenza.', 'Provider, modello e thinking restano sempre modificabili nel composer.'));

  const defaultRow = el('label', 'onboarding-default-provider');
  defaultRow.append(el('span', '', 'Agente iniziale'));
  const providerSelect = select(
    state.preferences.defaultProvider,
    state.providers.map((provider) => ({ value: provider.id, label: provider.label, disabled: !provider.available })),
    'premium-select'
  );
  providerSelect.addEventListener('change', () => runtime.post({ type: 'updatePreferences', payload: { defaultProvider: providerSelect.value } }));
  defaultRow.append(wrapSelect(providerSelect));
  section.append(defaultRow);

  const list = el('div', 'onboarding-default-list');
  for (const provider of state.providers.filter((entry) => entry.available)) {
    const current = state.preferences.providerDefaults[provider.id];
    const row = el('article', 'onboarding-default-row');
    const heading = el('div', 'onboarding-default-row__identity');
    heading.append(providerGlyph(provider.id));
    const headingCopy = el('div');
    headingCopy.append(el('strong', '', provider.label));

    const models = provider.models.length ? provider.models : [{ id: 'auto', label: 'Automatico', reasoning: [] }];
    const selectedModel = models.find((model) => model.id === current.model) ?? models.find((model) => model.isDefault) ?? models[0];
    const usage = usageForModel(state.usage.find((entry) => entry.provider === provider.id), selectedModel?.family ?? selectedModel?.label);
    headingCopy.append(el('span', '', usage?.available ? `${formatPercent(usage.remainingFraction)} disponibile` : 'Quota non letta'));
    heading.append(headingCopy);
    row.append(heading);

    const modelSelect = select(current.model, [
      { value: 'auto', label: 'Automatico' },
      ...models.filter((model) => model.id !== 'auto').map((model) => ({ value: model.id, label: model.label }))
    ], 'premium-select');
    const reasoningSelect = select(current.reasoning, [
      { value: 'auto', label: 'Auto' },
      ...(selectedModel?.reasoning ?? []).map((option) => ({ value: option.id, label: option.label }))
    ], 'premium-select');
    reasoningSelect.disabled = (selectedModel?.reasoning.length ?? 0) === 0;
    modelSelect.addEventListener('change', () => runtime.post({ type: 'updateProviderDefaults', payload: { provider: provider.id, model: modelSelect.value, reasoning: 'auto' } }));
    reasoningSelect.addEventListener('change', () => runtime.post({ type: 'updateProviderDefaults', payload: { provider: provider.id, reasoning: reasoningSelect.value } }));
    const controls = el('div', 'onboarding-default-row__controls');
    controls.append(wrapSelect(modelSelect), wrapSelect(reasoningSelect));
    row.append(controls);
    list.append(row);
  }
  section.append(list);
  return section;
}

function renderFinish(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const section = el('section', 'onboarding-minimal-panel onboarding-minimal-panel--finish');
  const check = el('div', 'onboarding-ready-mark');
  check.append(icon('check', 22));
  section.append(check);
  section.append(sectionIntro('Pronto', 'Inizia da una conversazione.', `${state.providers.filter((provider) => provider.available).length} agenti disponibili · ${state.workspace.name}`));

  const note = el('div', 'onboarding-finish-note');
  note.append(icon('sparkle', 16));
  const bundledTemplates = state.agents.filter((agent: any) => agent.bundledTemplate).length;
  note.append(el('span', '', bundledTemplates
    ? `${bundledTemplates} agenti template pronti e disattivati: attivali solo quando servono per risparmiare token.`
    : 'Relay preparerà 5 agenti template disattivati sul primo provider disponibile.'));
  section.append(note);
  return section;
}

function sectionIntro(kicker: string, title: string, description: string): HTMLElement {
  const intro = el('div', 'onboarding-minimal-copy');
  intro.append(el('span', 'eyebrow', kicker), el('h1', '', title), el('p', '', description));
  return intro;
}

function usageForModel(usage: import('../../core/types.js').UsageSnapshot | undefined, modelFamilyOrLabel: string | undefined) {
  if (!usage?.buckets?.length || !modelFamilyOrLabel) return usage;
  const target = /^Gemini/i.test(modelFamilyOrLabel) ? 'gemini' : /Claude|GPT/i.test(modelFamilyOrLabel) ? 'claude' : '';
  if (!target) return usage;
  const buckets = usage.buckets.filter((bucket) => (bucket.group ?? bucket.label).toLowerCase().includes(target));
  const constrained = [...buckets].sort((a, b) => (a.remainingFraction ?? 1) - (b.remainingFraction ?? 1))[0];
  if (!constrained) return usage;
  return {
    ...usage,
    ...(constrained.remainingFraction !== undefined ? { remainingFraction: constrained.remainingFraction } : {}),
    ...(constrained.usedFraction !== undefined ? { usedFraction: constrained.usedFraction } : {}),
    ...(constrained.resetsAt ? { resetsAt: constrained.resetsAt } : {})
  };
}

function compactVersion(value: string | undefined): string {
  if (!value) return 'Installazione rilevata';
  return value.replace(/\s*\(Claude Code\)\s*/i, '').trim();
}

function wrapSelect(control: HTMLSelectElement): HTMLElement {
  const shell = el('span', 'select-shell');
  shell.append(control, icon('chevronDown', 14));
  return shell;
}
