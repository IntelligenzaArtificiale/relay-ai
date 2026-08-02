import { button, compactProviderVersion, el, icon, providerGlyph, select } from '../dom.js';
import type { UiRuntime } from '../types.js';

export function renderSettings(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const page = el('section', 'content-page');
  const header = el('header', 'page-header');
  const copy = el('div');
  copy.append(el('span', 'eyebrow', 'Preferences'));
  copy.append(el('h1', '', 'Impostazioni'));
  copy.append(el('p', '', 'Default coerenti, senza toglierti libertà nella singola chat.'));
  header.append(copy);
  page.append(header);

  const general = accordionSection(runtime, 'settings:general', 'Generali', 'Comportamento predefinito delle nuove conversazioni.');
  const generalGrid = el('div', 'settings-grid');
  const defaultProvider = select(state.preferences.defaultProvider, state.providers.map((provider) => ({
    value: provider.id,
    label: provider.label,
    disabled: !provider.available
  })), 'premium-select');
  defaultProvider.addEventListener('change', () => runtime.post({ type: 'updatePreferences', payload: { defaultProvider: defaultProvider.value } }));
  generalGrid.append(settingField('Agente iniziale', 'Usato quando crei una nuova chat.', wrapSelect(defaultProvider)));

  const permissions = Object.values(state.preferences.providerDefaults).map((entry) => entry.permission);
  const commonPermission = permissions.every((entry) => entry === permissions[0]) ? permissions[0] : 'mixed';
  const defaultPermission = select(commonPermission, [
    { value: 'mixed', label: 'Personalizzato per provider', disabled: true },
    { value: 'read-only', label: 'Sola lettura' },
    { value: 'workspace-write', label: 'Workspace' },
    { value: 'danger-full-access', label: 'Accesso completo' }
  ], 'premium-select');
  defaultPermission.addEventListener('change', () => {
    if (defaultPermission.value === 'mixed') return;
    runtime.post({ type: 'updateAllProviderPermissions', payload: { permission: defaultPermission.value } });
  });
  generalGrid.append(settingField(
    'Accesso iniziale globale',
    'Imposta in un colpo solo il permesso predefinito delle nuove chat per tutti i provider.',
    wrapSelect(defaultPermission)
  ));

  const delegation = select(state.preferences.delegationPolicy, [
    { value: 'confirm', label: 'Chiedi conferma' },
    { value: 'automatic', label: 'Automatica' },
    { value: 'disabled', label: 'Disabilitata' }
  ], 'premium-select');
  delegation.addEventListener('change', () => runtime.post({ type: 'updatePreferences', payload: { delegationPolicy: delegation.value } }));
  generalGrid.append(settingField('Deleghe', 'Policy iniziale; potrà essere cambiata dalla chat.', wrapSelect(delegation)));

  const exposeUsage = switchControl(
    state.preferences.exposeUsageToAgents,
    (checked) => runtime.post({ type: 'updatePreferences', payload: { exposeUsageToAgents: checked } })
  );
  generalGrid.append(settingField(
    'Quote nel contesto agente',
    'Condivide disponibilità e reset dei provider per decisioni di delega più responsabili.',
    exposeUsage
  ));

  const privacyTools = el('div', 'privacy-shield-tools');
  if (state.privacyShieldSetup.provisioned) {
    privacyTools.append(switchControl(
      state.preferences.privacyShield,
      (checked) => runtime.post({ type: 'updatePreferences', payload: { privacyShield: checked } })
    ));
  } else {
    const privacyEnable = button(
      'button button--primary button--small',
      state.privacyShieldSetup.phase === 'checking' ? 'Verifica in corso…' : 'Abilita'
    );
    privacyEnable.disabled = state.privacyShieldSetup.phase === 'checking';
    privacyEnable.addEventListener('click', () => runtime.post({ type: 'enablePrivacyShield' }));
    privacyTools.append(privacyEnable);
    if (state.privacyShieldSetup.detail) {
      privacyTools.append(el('span', `privacy-shield-status is-${state.privacyShieldSetup.phase}`, state.privacyShieldSetup.detail));
    }
  }
  generalGrid.append(settingField(
    'Privacy Shield',
    'Anonimizza localmente il testo prima che lasci Relay.',
    privacyTools
  ));

  const warning = select(String(Math.round(state.preferences.quotaWarningThreshold * 100)), [
    { value: '20', label: '20%' },
    { value: '25', label: '25%' },
    { value: '35', label: '35%' },
    { value: '50', label: '50%' }
  ], 'premium-select');
  warning.addEventListener('change', () => runtime.post({ type: 'updatePreferences', payload: { quotaWarningThreshold: Number(warning.value) / 100 } }));
  generalGrid.append(settingField('Soglia quota bassa', 'Segnala al modello quando è preferibile preservare il provider.', wrapSelect(warning)));

  const critical = select(String(Math.round(state.preferences.quotaCriticalThreshold * 100)), [
    { value: '5', label: '5%' },
    { value: '10', label: '10%' },
    { value: '15', label: '15%' },
    { value: '20', label: '20%' }
  ], 'premium-select');
  critical.addEventListener('change', () => runtime.post({ type: 'updatePreferences', payload: { quotaCriticalThreshold: Number(critical.value) / 100 } }));
  generalGrid.append(settingField('Soglia critica', 'Richiede particolare cautela prima di avviare task costosi.', wrapSelect(critical)));
  general.body.append(generalGrid);
  page.append(general.section);

  const providerSection = accordionSection(runtime, 'settings:providers', 'Provider e deleghe', 'Default delle chat e modello usato quando Relay assegna una delega.');
  const list = el('div', 'agent-settings-list');
  for (const provider of state.providers) {
    const defaults = state.preferences.providerDefaults[provider.id];
    const expandKey = `settings:provider:${provider.id}`;
    const isExpanded = runtime.expandedPanels.has(expandKey);
    const row = el('details', `agent-settings-row agent-settings-row--collapsible is-health-${provider.healthState ?? (provider.available ? 'ready' : 'unavailable')} ${provider.connected === false ? 'is-disconnected' : provider.available ? 'is-connected' : 'is-unavailable'}`) as HTMLDetailsElement;
    row.open = isExpanded;
    row.addEventListener('toggle', () => {
      if (row.open) runtime.expandedPanels.add(expandKey);
      else runtime.expandedPanels.delete(expandKey);
    });
    const rowSummary = el('summary', 'agent-settings-summary');
    const identity = el('div', 'agent-settings-identity');
    identity.append(providerGlyph(provider.id));
    const idCopy = el('div');
    const cliMissing = provider.id === 'antigravity' && provider.nativeBridgeAvailable && provider.cliAvailable === false;
    idCopy.append(el('strong', '', provider.label));
    const providerStatus = provider.connected === false
      ? 'Scollegato da Relay · account e CLI invariati'
      : provider.setupProgress
        ?? (cliMissing
          ? 'Bridge IDE pronto · AGY CLI da installare'
          : providerHealthLabel(provider.healthState, provider.version));
    idCopy.append(el('span', provider.setupError ? 'provider-setup-error' : '', providerStatus));
    if (provider.setupError) idCopy.append(el('small', 'provider-setup-error__detail', provider.setupError));
    identity.append(idCopy);
    const authUnknown = provider.id === 'copilot' && provider.available && provider.authenticated === undefined;
    if (provider.connected === false) {
      const reconnect = button('button button--primary button--small agent-install-button');
      reconnect.append(icon('workflow', 14), el('span', '', 'Ricollega'));
      reconnect.title = 'Rende nuovamente disponibile il provider dentro Relay senza eseguire login.';
      reconnect.addEventListener('click', () => runtime.post({ type: 'connectProvider', payload: { provider: provider.id } }));
      identity.append(reconnect);
    } else if (provider.setupInProgress || provider.setupError || cliMissing || !provider.available || provider.authenticated === false || authUnknown) {
      const setup = button('button button--secondary button--small agent-install-button');
      const installing = cliMissing || !provider.available;
      setup.disabled = Boolean(provider.setupInProgress);
      const label = provider.setupInProgress
        ? 'In corso…'
        : provider.setupError ? 'Riprova' : installing ? 'Installa CLI' : authUnknown ? 'Gestisci accesso' : 'Accedi';
      setup.append(icon(provider.setupInProgress ? 'refresh' : installing ? 'import' : 'arrowUp', 14), el('span', '', label));
      setup.addEventListener('click', () => runtime.post({
        type: installing ? 'installProvider' : 'openProviderSetup',
        payload: { provider: provider.id }
      }));
      identity.append(setup);
    }
    const summaryTools = el('div', 'provider-summary-tools');
    if (provider.available && provider.connected !== false) {
      const upgrade = button('provider-icon-action');
      upgrade.append(icon('refresh', 15));
      upgrade.setAttribute('aria-label', `Aggiorna ${provider.label}`);
      upgrade.title = `Aggiorna ${provider.label}`;
      upgrade.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        runtime.post({ type: 'upgradeProvider', payload: { provider: provider.id } });
      });
      const disconnect = button('provider-icon-action provider-icon-action--danger');
      disconnect.append(icon('close', 15));
      disconnect.setAttribute('aria-label', `Scollega ${provider.label}`);
      disconnect.title = `Scollega ${provider.label} solo da Relay`;
      disconnect.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        runtime.post({ type: 'disconnectProvider', payload: { provider: provider.id } });
      });
      summaryTools.append(upgrade, disconnect);
    }
    summaryTools.append(icon('chevronDown', 14));
    rowSummary.append(identity, summaryTools);
    row.append(rowSummary);

    const controls = el('div', 'agent-settings-controls');
    controls.append(renderProviderHealth(provider));
    const visibleModels = provider.models.filter((entry) => entry.id !== 'auto' && !entry.hidden);
    const model = select(defaults.model, [
      { value: 'auto', label: 'Automatico del provider' },
      ...visibleModels.map((entry) => ({ value: entry.id, label: entry.label }))
    ], 'premium-select');
    const selected = provider.models.find((entry) => entry.id === model.value) ?? provider.models.find((entry) => entry.isDefault);
    const reasoning = select(defaults.reasoning, [
      { value: 'auto', label: 'Automatico' },
      ...(selected?.reasoning ?? []).map((entry) => ({ value: entry.id, label: entry.label }))
    ], 'premium-select');
    const permission = select(defaults.permission, [
      { value: 'read-only', label: 'Sola lettura' },
      { value: 'workspace-write', label: 'Workspace' },
      { value: 'danger-full-access', label: 'Accesso completo' }
    ], 'premium-select');
    const delegationValue = defaults.delegationModel === 'relay-auto'
      || defaults.delegationModel === 'auto'
      || visibleModels.some((entry) => entry.id === defaults.delegationModel)
      ? defaults.delegationModel
      : 'relay-auto';
    const delegationModel = select(delegationValue, [
      { value: 'relay-auto', label: 'Relay sceglie per ogni task' },
      { value: 'auto', label: 'Automatico del provider' },
      ...visibleModels.map((entry) => ({ value: entry.id, label: entry.label }))
    ], 'premium-select');
    const providerControlsDisabled = provider.connected === false;
    model.disabled = providerControlsDisabled;
    reasoning.disabled = providerControlsDisabled || (selected?.reasoning.length ?? 0) === 0;
    permission.disabled = providerControlsDisabled;
    delegationModel.disabled = providerControlsDisabled;
    model.addEventListener('change', () => runtime.post({ type: 'updateProviderDefaults', payload: { provider: provider.id, model: model.value, reasoning: 'auto' } }));
    reasoning.addEventListener('change', () => runtime.post({ type: 'updateProviderDefaults', payload: { provider: provider.id, reasoning: reasoning.value } }));
    permission.addEventListener('change', () => runtime.post({ type: 'updateProviderDefaults', payload: { provider: provider.id, permission: permission.value } }));
    delegationModel.addEventListener('change', () => runtime.post({ type: 'updateProviderDefaults', payload: { provider: provider.id, delegationModel: delegationModel.value } }));
    controls.append(
      providerControlField('Chat', 'Modello predefinito', model),
      providerControlField('Thinking', 'Per le nuove chat', reasoning),
      providerControlField('Accesso', 'Permessi iniziali', permission),
      providerControlField('Deleghe', delegationValue === 'relay-auto' ? 'Scelta intelligente per task' : 'Modello fissato', delegationModel)
    );
    if (provider.connected !== false && provider.healthState !== 'ready' && provider.healthState !== 'detecting') {
      const recovery = el('div', 'provider-recovery-actions');
      const retry = button('button button--secondary button--small');
      retry.append(icon('refresh', 13), el('span', '', 'Riprova'));
      retry.addEventListener('click', () => runtime.post({ type: 'refreshProviders' }));
      const copyDiagnostics = button('button button--ghost button--small');
      copyDiagnostics.append(icon('copy', 13), el('span', '', 'Copia diagnostica'));
      copyDiagnostics.addEventListener('click', () => runtime.post({ type: 'copyProviderDiagnostics', payload: { provider: provider.id } }));
      const recover = button('button button--primary button--small');
      recover.append(icon('sparkle', 13), el('span', '', 'Ripara con altro agente'));
      recover.addEventListener('click', () => runtime.post({ type: 'recoverProvider', payload: { provider: provider.id } }));
      const config = button('button button--ghost button--small');
      config.append(icon('settings', 13), el('span', '', 'Configura percorso'));
      config.addEventListener('click', () => runtime.post({ type: 'openSettings' }));
      const logs = button('button button--ghost button--small');
      logs.append(icon('diagnostics', 13), el('span', '', 'Apri log'));
      logs.addEventListener('click', () => runtime.setSection('diagnostics'));
      recovery.append(retry, copyDiagnostics, recover, config, logs);
      controls.append(recovery);
    }
    row.append(controls);
    list.append(row);
  }
  providerSection.body.append(list);
  providerSection.body.append(el('p', 'provider-defaults-note', 'Con "Relay sceglie per ogni task" il modello viene deciso usando complessità, capacità dichiarate e quota disponibile. Una scelta esplicita blocca quel provider sul modello indicato solo nelle deleghe.'));
  page.append(providerSection.section);


  const advanced = accordionSection(runtime, 'settings:environment', 'Ambiente locale', 'Controlli essenziali e percorsi avanzati.', true);

  const doctor = el('button', 'system-doctor-card') as HTMLButtonElement;
  doctor.type = 'button';
  const doctorIcon = el('span', 'system-doctor-card__icon');
  doctorIcon.append(icon('diagnostics', 17));
  const doctorCopy = el('span', 'system-doctor-card__copy');
  doctorCopy.append(el('strong', '', 'System Doctor'));
  doctorCopy.append(el('small', '', 'Verifica CLI, accessi, Git e quote'));
  const ready = state.providers.filter((provider) => provider.available && provider.authenticated !== false).length;
  const doctorMeta = el('span', 'system-doctor-card__meta');
  doctorMeta.append(el('span', 'system-doctor-card__status', `${ready}/${state.providers.length} agenti`));
  doctorMeta.append(icon('arrowUp', 14));
  doctor.append(doctorIcon, doctorCopy, doctorMeta);
  doctor.addEventListener('click', () => runtime.post({ type: 'runSystemDoctor' }));
  advanced.body.append(doctor);

  const note = button('advanced-settings-link');
  note.append(icon('settings', 14), el('span', '', 'Percorsi CLI e worktree'), icon('arrowUp', 13));
  note.addEventListener('click', () => runtime.post({ type: 'openSettings' }));
  advanced.body.append(note);
  page.append(advanced.section);

  const data = accordionSection(runtime, 'settings:data', 'Dati e ripristino', 'Backup portabile e cancellazione protetta dei dati locali di Relay.', true);
  const dataActions = el('div', 'settings-data-actions');
  const exportButton = button('button button--secondary');
  exportButton.append(icon('external', 15), el('span', '', 'Esporta backup'));
  exportButton.addEventListener('click', () => runtime.post({ type: 'exportBackup' }));
  const importButton = button('button button--secondary');
  importButton.append(icon('import', 15), el('span', '', 'Ripristina backup'));
  importButton.addEventListener('click', () => runtime.post({ type: 'importBackup' }));
  const resetButton = button('button button--danger-ghost');
  resetButton.append(icon('trash', 15), el('span', '', 'Cancella dati Relay'));
  resetButton.addEventListener('click', () => runtime.post({ type: 'resetAllData' }));
  dataActions.append(exportButton, importButton, resetButton);
  data.body.append(dataActions);
  data.body.append(el('p', 'settings-data-note', 'Il reset non rimuove le CLI installate, i file dei progetti o i worktree. La conferma richiede due passaggi.'));
  page.append(data.section);
  return page;
}



function providerHealthLabel(state: string | undefined, version?: string): string {
  if (state === 'detecting') return 'Rilevamento in corso…';
  if (state === 'ready') return `Pronto · ${compactProviderVersion(version)}`;
  if (state === 'launchable') return 'CLI avviabile · controlli in corso';
  if (state === 'installed') return 'Installato · avvio da verificare';
  if (state === 'needs-login') return 'Accesso richiesto';
  if (state === 'rate-limited') return 'Rate limit attivo';
  if (state === 'degraded') return 'Degradato · apri i dettagli';
  if (state === 'not-installed') return 'CLI non rilevata';
  if (state === 'disconnected') return 'Scollegato da Relay';
  return 'Non operativo';
}

function renderProviderHealth(provider: any): HTMLElement {
  const panel = el('section', 'provider-health-panel');
  const probes = new Map((provider.probes ?? []).map((probe: any) => [probe.id, probe]));
  const row = (label: string, value: string, ok: boolean | undefined, detail?: string) => {
    const item = el('div', `provider-health-row ${ok === true ? 'is-ok' : ok === false ? 'is-error' : 'is-pending'}`);
    item.append(el('strong', '', label), el('span', '', value));
    if (detail) item.title = detail;
    return item;
  };
  const resolve = probes.get('resolve') as any;
  const launch = probes.get('launch') as any;
  const auth = probes.get('authentication') as any;
  const models = probes.get('models') as any;
  panel.append(
    row('CLI', resolve?.ok ? 'Rilevata' : provider.healthState === 'detecting' ? 'Rilevamento…' : 'Non rilevata', resolve?.ok, resolve?.detail),
    row('Avvio', launch?.ok ? 'OK' : provider.healthState === 'detecting' ? 'In corso' : 'Errore', launch?.ok, launch?.detail),
    row('Account', auth?.ok ? 'Connesso' : provider.authenticated === false ? 'Accesso richiesto' : 'Non verificato', auth?.ok, auth?.detail),
    row('Modelli', models?.ok ? `${provider.models.length} disponibili` : provider.healthState === 'detecting' ? 'Caricamento…' : 'Non caricati', models?.ok, models?.detail),
    row('Operatività', provider.healthState === 'ready' ? 'Pronto' : providerHealthLabel(provider.healthState), provider.healthState === 'ready', provider.failure?.technicalDetail ?? provider.detail)
  );
  if (provider.detail || provider.failure?.message) panel.append(el('p', 'provider-health-reason', provider.failure?.message ?? provider.detail));
  return panel;
}

function accordionSection(
  runtime: UiRuntime,
  key: string,
  title: string,
  description: string,
  compact = false
): { section: HTMLElement; body: HTMLElement } {
  const section = el('details', `settings-section settings-accordion ${compact ? 'settings-section--compact' : ''}`) as HTMLDetailsElement;
  // Only the first section starts open; afterwards the user's layout wins.
  section.open = runtime.expandedPanels.has(key)
    || (!runtime.expandedPanels.has('settings:touched') && key === 'settings:general');
  const summary = el('summary', 'settings-accordion__summary');
  const copy = el('div', 'settings-section__title');
  copy.append(el('h2', '', title), el('p', '', description));
  summary.append(copy, icon('chevronDown', 16));
  section.append(summary);
  const body = el('div', 'settings-accordion__body');
  section.append(body);
  section.addEventListener('toggle', () => {
    runtime.expandedPanels.add('settings:touched');
    if (section.open) runtime.expandedPanels.add(key);
    else runtime.expandedPanels.delete(key);
  });
  return { section, body };
}

function settingField(title: string, description: string, control: HTMLElement): HTMLElement {
  const field = el('div', 'setting-field');
  const copy = el('div');
  copy.append(el('strong', '', title), el('span', '', description));
  field.append(copy, control);
  return field;
}

function providerControlField(label: string, hint: string, control: HTMLSelectElement): HTMLElement {
  const field = el('label', 'provider-default-field');
  const copy = el('span', 'provider-default-field__copy');
  copy.append(el('strong', '', label), el('small', '', hint));
  field.append(copy, wrapSelect(control));
  return field;
}

function wrapSelect(node: HTMLSelectElement): HTMLElement {
  const wrapper = el('div', 'select-shell');
  wrapper.append(node, icon('chevronDown', 15));
  return wrapper;
}


function switchControl(checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const label = el('label', 'switch-field switch-field--standalone');
  const input = el('input') as HTMLInputElement;
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  label.append(input, el('span', 'switch'));
  return label;
}
