import { button, el, formatRelativeTime, icon } from '../dom.js';
import type { UiRuntime } from '../types.js';

type RemoteTab = 'access' | 'sessions' | 'history' | 'network';
type RemoteMode = 'lan' | 'funnel' | 'tailnet';

export function renderRemote(runtime: UiRuntime): HTMLElement {
  const state = runtime.state! as any;
  const remote = state.remoteAccess ?? { enabled: false, activeSessions: [], sessionHistory: [], platform: '', computerName: '', mode: 'lan' };
  const mode = remoteMode(remote.mode ?? state.preferences?.remoteAccessMode);
  const activeCount = remote.activeSessions?.length ?? 0;
  const historyCount = remote.sessionHistory?.length ?? 0;
  const tab: RemoteTab = isRemoteTab(runtime.remoteTab) ? runtime.remoteTab : 'access';
  runtime.remoteTab = tab;

  const page = el('section', 'content-page remote-page remote-v2');
  const header = el('header', 'page-header remote-header');
  const copy = el('div');
  copy.append(el('span', 'eyebrow', 'Relay Ovunque'), el('h1', '', 'Remoto'));
  copy.append(el('p', '', 'Usa Relay sulla rete locale, da Internet o soltanto nel tuo tailnet privato.'));
  const refresh = button('icon-button remote-header-action');
  refresh.title = 'Ricontrolla accesso remoto';
  refresh.setAttribute('aria-label', 'Ricontrolla accesso remoto');
  refresh.append(icon('refresh', 17));
  refresh.addEventListener('click', () => runtime.post({ type: 'detectRemoteTunnel' }));
  header.append(copy, refresh);
  page.append(header);

  page.append(renderModeCards(runtime, mode));
  page.append(renderStatusStrip(remote, mode));
  page.append(renderTabs(runtime, tab, activeCount, historyCount));
  const content = el('div', 'remote-tab-content');
  if (tab === 'access') content.append(renderAccess(runtime, remote, state.systemReadiness, mode));
  if (tab === 'sessions') content.append(renderSessions(runtime, remote));
  if (tab === 'history') content.append(renderHistory(runtime, remote));
  if (tab === 'network') content.append(renderNetwork(runtime, remote, state.systemReadiness));
  page.append(content);
  if (remote.lastError) page.append(inlineError(remote.lastError));
  return page;
}

function renderModeCards(runtime: UiRuntime, current: RemoteMode): HTMLElement {
  const section = el('section', 'remote-mode-section');
  section.append(el('div', 'remote-section-heading', 'Accesso'));
  const grid = el('div', 'remote-mode-grid');
  const modes: Array<{ id: RemoteMode; title: string; detail: string; badge?: string; iconName: Parameters<typeof icon>[0] }> = [
    { id: 'lan', title: 'Solo rete locale', detail: 'Telefono e PC devono essere sulla stessa rete.', iconName: 'remote' },
    { id: 'funnel', title: 'Ovunque', detail: 'URL HTTPS pubblico protetto dal pairing Relay.', badge: 'Consigliata', iconName: 'external' },
    { id: 'tailnet', title: 'Privata', detail: 'Accessibile solo ai dispositivi del tuo tailnet.', iconName: 'lock' }
  ];
  for (const item of modes) {
    const card = button(`remote-mode-card ${current === item.id ? 'is-selected' : ''}`);
    const glyph = el('span', 'remote-mode-card__icon');
    glyph.append(icon(item.iconName, 18));
    const body = el('span', 'remote-mode-card__body');
    const title = el('span', 'remote-mode-card__title');
    title.append(el('strong', '', item.title));
    if (item.badge) title.append(el('small', '', item.badge));
    body.append(title, el('span', 'remote-mode-card__detail', item.detail));
    const radio = el('span', 'remote-mode-card__radio', current === item.id ? '✓' : '');
    card.append(glyph, body, radio);
    card.addEventListener('click', () => runtime.post({ type: 'setRemoteAccessMode', payload: { mode: item.id } }));
    grid.append(card);
  }
  section.append(grid);
  return section;
}

function renderStatusStrip(remote: any, mode: RemoteMode): HTMLElement {
  const tunnel = remote.tunnel;
  const state = mode === 'lan' ? (remote.enabled ? 'ACTIVE' : 'STOPPED') : (tunnel?.state ?? 'NOT_INSTALLED');
  const strip = el('section', `remote-tunnel-status remote-tunnel-status--${statusTone(state)}`);
  const dot = el('span', `remote-tunnel-dot ${isBusyState(state) ? 'is-pulsing' : ''}`);
  const copy = el('div', 'remote-tunnel-status__copy');
  copy.append(el('strong', '', statusTitle(state, mode)), el('span', '', statusDetail(remote, state, mode)));
  strip.append(dot, copy);
  if (remote.url) strip.append(el('code', 'remote-tunnel-status__url', baseUrl(remote.url)));
  return strip;
}

function renderTabs(runtime: UiRuntime, current: RemoteTab, active: number, history: number): HTMLElement {
  const tabs = el('nav', 'remote-tabs remote-tabs--v2');
  const items: Array<{ id: RemoteTab; label: string; iconName: Parameters<typeof icon>[0]; count?: number }> = [
    { id: 'access', label: 'Accesso', iconName: 'shield' },
    { id: 'sessions', label: 'Sessioni', iconName: 'devices', count: active },
    { id: 'history', label: 'Cronologia', iconName: 'history', count: history },
    { id: 'network', label: 'Dettagli', iconName: 'diagnostics' }
  ];
  for (const item of items) {
    const control = button(`remote-tab ${current === item.id ? 'is-active' : ''}`);
    control.append(icon(item.iconName, 15), el('span', '', item.label));
    if (item.count) control.append(el('small', 'remote-tab__count', String(item.count)));
    control.addEventListener('click', () => { runtime.remoteTab = item.id; runtime.render(); });
    tabs.append(control);
  }
  return tabs;
}

function renderAccess(runtime: UiRuntime, remote: any, readiness: any, mode: RemoteMode): HTMLElement {
  if (mode === 'lan') return renderLanAccess(runtime, remote, readiness);
  const tunnel = remote.tunnel ?? { state: 'NOT_INSTALLED', transitions: [] };
  const wrap = el('div', 'remote-access-stack');
  wrap.append(renderWizard(runtime, remote, tunnel, mode, readiness));
  if (remote.enabled && remote.qrDataUrl && (tunnel.state === 'ACTIVE' || tunnel.state === 'PROPAGATING_DNS' || tunnel.state === 'DEGRADED')) {
    wrap.append(renderPairing(runtime, remote, mode));
  }
  return wrap;
}

function renderLanAccess(runtime: UiRuntime, remote: any, readiness: any): HTMLElement {
  const card = el('section', 'remote-card remote-card--access');
  const heading = cardHeading('remote', remote.enabled ? 'Accesso LAN attivo' : 'Collega sulla rete locale');
  card.append(heading, el('p', 'remote-note', readiness?.features?.remote?.detail ?? 'Usa il runtime integrato di Relay.'));
  if (!remote.enabled) {
    const preflight = el('div', 'remote-preflight');
    preflight.append(preflightItem('Runtime Relay', true, processLabel(readiness)), preflightItem('Cloud', true, 'Non richiesto'), preflightItem('Rete', true, 'LAN locale'));
    card.append(preflight);
    const start = button('button button--primary remote-wide', 'Genera QR locale');
    start.addEventListener('click', () => runtime.post({ type: 'startRemoteAccess' }));
    card.append(start);
    return card;
  }
  card.append(renderPairingBody(runtime, remote));
  return card;
}

function renderWizard(runtime: UiRuntime, remote: any, tunnel: any, mode: RemoteMode, readiness: any): HTMLElement {
  const card = el('section', 'remote-card remote-wizard');
  const state = String(tunnel.state ?? 'NOT_INSTALLED');
  const tailscale = readiness?.components?.find((entry: any) => entry.id === 'tailscale');
  card.append(cardHeading('shield', mode === 'funnel' ? 'Configura Relay Ovunque' : 'Configura Relay Privato'));
  const steps = el('div', 'remote-wizard__steps');
  steps.append(
    wizardStep(1, 'Installa Tailscale', tailscale?.state === 'ready' || tunnel.installed, installStepText(state)),
    wizardStep(2, 'Collega l’account', tunnel.backendState === 'Running', loginStepText(state)),
    wizardStep(3, 'Attiva Relay', state === 'ACTIVE' || state === 'PROPAGATING_DNS' || state === 'DEGRADED', activateStepText(state, mode))
  );
  card.append(steps);

  const actions = el('div', 'remote-actions remote-wizard__actions');
  if (state === 'NOT_INSTALLED' || !tunnel.installed) {
    actions.append(actionButton('Installa automaticamente', 'installTailscale', runtime, 'button button--primary'));
  } else if (tunnel.backendState !== 'Running') {
    actions.append(actionButton('Accedi o crea account', 'loginTailscale', runtime, 'button button--primary'));
  } else if (!['ACTIVE', 'PROPAGATING_DNS', 'DEGRADED', 'PROBING'].includes(state)) {
    actions.append(actionButton(mode === 'funnel' ? 'Attiva Ovunque' : 'Attiva accesso privato', 'activateRemoteTunnel', runtime, 'button button--primary'));
  } else if (state === 'DEGRADED') {
    actions.append(actionButton('Ripara connessione', 'remediateRemoteTunnel', runtime, 'button button--primary'));
  }
  const retry = actionButton('Ricontrolla', 'detectRemoteTunnel', runtime, 'button button--secondary');
  actions.append(retry);
  card.append(actions);

  if (state === 'AWAITING_AUTH') card.append(infoLine('Completa l’accesso nel browser. Relay controlla automaticamente lo stato per cinque minuti.'));
  if (state === 'AWAITING_FUNNEL_APPROVAL') card.append(infoLine('Conferma Funnel nella pagina Tailscale aperta dal browser. È richiesto soltanto la prima volta nel tailnet.'));
  if (state === 'PROPAGATING_DNS') card.append(infoLine('La prima pubblicazione del dominio può richiedere fino a 10 minuti. Relay ripete il probe automaticamente.'));
  if (state === 'DEGRADED' || state === 'ERROR') {
    const recovery = el('div', 'remote-recovery-actions');
    recovery.append(actionButton('Copia diagnostica', 'copyRemoteDiagnostic', runtime, 'button button--ghost button--small'));
    recovery.append(actionButton('Fai risolvere a un agente', 'recoverRemoteTunnel', runtime, 'button button--secondary button--small'));
    card.append(recovery);
  }
  const disclosure = el('div', 'remote-disclosure');
  disclosure.append(icon('lock', 14), el('span', '', mode === 'funnel'
    ? 'HTTPS e pairing Relay proteggono l’accesso. Il nome del PC e del tailnet compariranno nel registro pubblico dei certificati, come previsto da Let’s Encrypt.'
    : 'Il telefono deve avere Tailscale ed essere collegato allo stesso tailnet. L’indirizzo non viene esposto pubblicamente.'));
  card.append(disclosure);
  return card;
}

function renderPairing(runtime: UiRuntime, remote: any, mode: RemoteMode): HTMLElement {
  const card = el('section', 'remote-card remote-card--pairing remote-card--tunnel-pairing');
  card.append(cardHeading('remote', mode === 'funnel' ? 'QR raggiungibile da Internet' : 'QR del tailnet privato'));
  card.append(renderPairingBody(runtime, remote));
  if (remote.tunnel?.verifiedAt) card.append(infoLine(`${mode === 'funnel' ? 'Verificato da Internet' : 'Verificato dal tailnet'} · ${formatRelativeTime(remote.tunnel.verifiedAt)}.`));
  return card;
}

function renderPairingBody(runtime: UiRuntime, remote: any): HTMLElement {
  const fragment = document.createDocumentFragment();
  const qrWrap = el('div', 'remote-qr-wrap');
  if (remote.qrDataUrl) {
    const qr = el('img', 'remote-qr') as HTMLImageElement;
    qr.src = remote.qrDataUrl;
    qr.alt = 'QR accesso remoto Relay';
    qrWrap.append(qr);
  }
  const details = el('div', 'remote-pairing-details');
  const code = el('div', 'remote-code');
  code.append(el('span', '', 'Codice di conferma'), el('strong', '', remote.pairingCode ?? '—'));
  details.append(code);
  if (remote.pairingId) details.append(el('p', 'remote-note', `ID QR ${remote.pairingId} · deve cambiare quando premi Rigenera QR.`));
  details.append(el('p', 'remote-note', remote.ticketUsed ? 'QR già utilizzato: rigeneralo per aggiungere un dispositivo.' : `QR monouso · ${remote.pairingExpiresAt ? `scade ${formatRelativeTime(remote.pairingExpiresAt)}` : 'validità limitata'}.`));
  const urlRow = el('div', 'remote-url remote-url--copy');
  urlRow.append(el('span', '', remote.url ?? 'URL in preparazione'));
  const copy = button('icon-button'); copy.title = 'Copia URL'; copy.append(icon('copy', 14));
  copy.addEventListener('click', () => navigator.clipboard.writeText(remote.url ?? ''));
  urlRow.append(copy); details.append(urlRow); qrWrap.append(details); fragment.append(qrWrap);
  const actions = el('div', 'remote-actions');
  const regen = button('button button--secondary', 'Rigenera QR'); regen.addEventListener('click', () => runtime.post({ type: 'rotateRemotePairing' }));
  const stop = button('button button--danger-ghost', 'Disattiva accesso'); stop.addEventListener('click', () => runtime.post({ type: 'stopRemoteAccess' }));
  actions.append(regen, stop); fragment.append(actions);
  return fragment as unknown as HTMLElement;
}

function renderSessions(runtime: UiRuntime, remote: any): HTMLElement {
  const card = el('section', 'remote-card remote-card--sessions');
  card.append(cardHeading('devices', 'Sessioni attive'));
  if (!remote.activeSessions?.length) {
    const empty = el('div', 'remote-empty-state');
    empty.append(icon('devices', 24), el('strong', '', 'Nessun dispositivo collegato'), el('p', '', 'Apri Accesso e completa il pairing dal telefono.'));
    const access = button('button button--primary', 'Vai ad Accesso'); access.addEventListener('click', () => { runtime.remoteTab = 'access'; runtime.render(); });
    empty.append(access); card.append(empty); return card;
  }
  const list = el('div', 'remote-session-list');
  for (const session of remote.activeSessions) {
    const row = el('article', 'remote-session-row');
    const device = el('div', 'remote-session-device');
    const avatar = el('span', 'remote-device-icon'); avatar.append(icon(deviceIcon(session.userAgent), 17));
    const info = el('div'); info.append(el('strong', '', session.name || 'Dispositivo mobile'), el('small', '', `${deviceLabel(session.userAgent)} · ${session.address}`), el('span', 'remote-session-meta', `Attivo ${formatRelativeTime(session.lastSeenAt)}`));
    device.append(avatar, info);
    const close = button('button button--danger-ghost button--small', 'Disconnetti'); close.addEventListener('click', () => runtime.post({ type: 'closeRemoteSession', payload: { sessionId: session.id } }));
    row.append(device, close); list.append(row);
  }
  card.append(list);
  return card;
}

function renderHistory(runtime: UiRuntime, remote: any): HTMLElement {
  const history = Array.isArray(remote.sessionHistory) ? remote.sessionHistory : [];
  const pageSize = 8;
  const pages = Math.max(1, Math.ceil(history.length / pageSize));
  const currentPage = Math.max(0, Math.min(Number(runtime.remoteHistoryPage ?? 0), pages - 1));
  runtime.remoteHistoryPage = currentPage;
  const card = el('section', 'remote-card');
  const head = el('div', 'remote-card__title remote-card__title--split'); head.append(cardHeading('history', 'Cronologia'));
  if (history.length) { const clear = button('button button--ghost button--small', 'Svuota'); clear.addEventListener('click', () => runtime.post({ type: 'clearRemoteHistory' })); head.append(clear); }
  card.append(head);
  if (!history.length) { card.append(el('div', 'remote-empty-state', 'Nessuna connessione conclusa.')); return card; }
  const list = el('div', 'remote-history-list');
  for (const entry of history.slice(currentPage * pageSize, currentPage * pageSize + pageSize)) {
    const row = el('article', 'remote-history-row'); const glyph = el('span', 'remote-device-icon'); glyph.append(icon(deviceIcon(entry.userAgent), 16));
    const info = el('div', 'remote-history-info'); info.append(el('strong', '', entry.name || 'Dispositivo'), el('small', '', `${deviceLabel(entry.userAgent)} · ${entry.address}`), el('span', '', `${reasonLabel(entry.reason)} · ${formatDuration(entry.durationMs)} · ${formatRelativeTime(entry.endedAt)}`));
    row.append(glyph, info); list.append(row);
  }
  card.append(list);
  if (pages > 1) {
    const pager = el('div', 'remote-pager'); const prev = button('button button--ghost button--small', 'Precedente'); prev.disabled = currentPage === 0; prev.addEventListener('click', () => { runtime.remoteHistoryPage = currentPage - 1; runtime.render(); });
    const next = button('button button--ghost button--small', 'Successiva'); next.disabled = currentPage >= pages - 1; next.addEventListener('click', () => { runtime.remoteHistoryPage = currentPage + 1; runtime.render(); });
    pager.append(prev, el('span', '', `${currentPage + 1} / ${pages}`), next); card.append(pager);
  }
  return card;
}

function renderNetwork(runtime: UiRuntime, remote: any, readiness: any): HTMLElement {
  const card = el('section', 'remote-card'); card.append(cardHeading('diagnostics', 'Dettagli e transizioni'));
  const facts = el('div', 'remote-facts'); facts.append(fact('Modalità', modeLabel(remoteMode(remote.mode))), fact('Bind', remote.bindAddress ?? '—'), fact('TLS', remote.secure ? 'HTTPS' : 'HTTP LAN'), fact('Sistema', platformLabel(remote.platform))); card.append(facts);
  const tunnel = remote.tunnel;
  if (tunnel) {
    const details = el('details', 'remote-transition-log'); details.open = false; details.append(el('summary', '', `Ultime transizioni · ${tunnel.transitions?.length ?? 0}`));
    const list = el('div', 'remote-transition-list');
    for (const entry of (tunnel.transitions ?? []).slice(-12).reverse()) {
      const row = el('div', 'remote-transition-row'); row.append(el('span', `remote-transition-state remote-transition-state--${statusTone(entry.state)}`, entry.state), el('strong', '', entry.message), el('small', '', formatRelativeTime(entry.at))); list.append(row);
    }
    details.append(list); card.append(details);
  }
  if (Array.isArray(remote.diagnostics)) for (const diagnostic of remote.diagnostics) card.append(diagnosticRow(diagnostic));
  const actions = el('div', 'remote-actions'); actions.append(actionButton('Ricontrolla', 'detectRemoteTunnel', runtime, 'button button--secondary'), actionButton('Copia diagnostica', 'copyRemoteDiagnostic', runtime, 'button button--ghost')); card.append(actions);
  return card;
}

function wizardStep(index: number, title: string, complete: boolean, detail: string): HTMLElement {
  const row = el('div', `remote-wizard-step ${complete ? 'is-complete' : ''}`);
  row.append(el('span', 'remote-wizard-step__index', complete ? '✓' : String(index)));
  const copy = el('div'); copy.append(el('strong', '', title), el('span', '', detail)); row.append(copy); return row;
}
function actionButton(label: string, type: string, runtime: UiRuntime, className: string): HTMLButtonElement { const node = button(className, label); node.addEventListener('click', () => runtime.post({ type })); return node; }
function cardHeading(iconName: Parameters<typeof icon>[0], title: string): HTMLElement { const node = el('div', 'remote-card__title'); node.append(icon(iconName, 18), el('strong', '', title)); return node; }
function infoLine(text: string): HTMLElement { const node = el('div', 'remote-info-line'); node.append(icon('warning', 14), el('span', '', text)); return node; }
function inlineError(text: string): HTMLElement { const node = el('section', 'remote-error'); node.append(icon('warning', 16), el('span', '', text)); return node; }
function diagnosticRow(item: any): HTMLElement { const node = el('div', `remote-diagnostic remote-diagnostic--${item.level}`); node.append(el('span', '', item.title), el('p', '', item.detail)); return node; }
function fact(label: string, value: string): HTMLElement { const node = el('div', 'remote-fact'); node.append(el('span', '', label), el('strong', '', value)); return node; }
function preflightItem(label: string, ready: boolean, detail: string): HTMLElement { const node = el('div', `remote-preflight__item ${ready ? 'is-ready' : 'is-warning'}`); node.append(icon(ready ? 'check' : 'warning', 13)); const copy = el('span'); copy.append(el('strong', '', label), el('small', '', detail)); node.append(copy); return node; }
function processLabel(readiness: any): string { return readiness?.components?.find((entry: any) => entry.id === 'runtime')?.version ?? 'Integrato'; }
function remoteMode(value: unknown): RemoteMode { return value === 'funnel' || value === 'tailnet' ? value : 'lan'; }
function modeLabel(mode: RemoteMode): string { return mode === 'funnel' ? 'Ovunque' : mode === 'tailnet' ? 'Privata' : 'Solo rete locale'; }
function baseUrl(value: string): string { try { const url = new URL(value); return `${url.protocol}//${url.host}`; } catch { return value; } }
function isBusyState(state: string): boolean { return ['INSTALLING', 'AWAITING_AUTH', 'ACTIVATING', 'AWAITING_FUNNEL_APPROVAL', 'PROBING', 'PROPAGATING_DNS', 'REMEDIATING'].includes(state); }
function statusTone(state: string): string { if (state === 'ACTIVE') return 'ready'; if (['DEGRADED', 'PROPAGATING_DNS', 'AWAITING_AUTH', 'AWAITING_FUNNEL_APPROVAL'].includes(state)) return 'warning'; if (state === 'ERROR') return 'error'; return 'neutral'; }
function statusTitle(state: string, mode: RemoteMode): string { const labels: Record<string, string> = { NOT_INSTALLED: 'Tailscale non installato', INSTALLED_NEEDS_LOGIN: 'Account da collegare', AWAITING_AUTH: 'Attesa accesso nel browser', LOGGED_IN: 'Tailscale connesso', FUNNEL_NEEDS_ENABLE: 'Pronto per l’attivazione', AWAITING_FUNNEL_APPROVAL: 'Conferma richiesta nel browser', ACTIVATING: 'Attivazione in corso', PROBING: 'Verifica end-to-end', PROPAGATING_DNS: 'Propagazione DNS', ACTIVE: mode === 'funnel' ? 'Raggiungibile da Internet' : mode === 'tailnet' ? 'Raggiungibile dal tailnet' : 'Raggiungibile in LAN', DEGRADED: 'Attivo ma non raggiungibile', REMEDIATING: 'Riparazione in corso', STOPPED: 'Accesso spento', ERROR: 'Configurazione non completata' }; return labels[state] ?? 'Controllo accesso remoto'; }
function statusDetail(remote: any, state: string, mode: RemoteMode): string { if (state === 'ACTIVE' && remote.tunnel?.verifiedAt) return `Verificato ${formatRelativeTime(remote.tunnel.verifiedAt)}`; if (state === 'DEGRADED') return remote.tunnel?.lastError ?? 'Il proxy risulta configurato ma il probe non riesce a raggiungerlo.'; if (state === 'PROPAGATING_DNS') return 'Può richiedere fino a 10 minuti soltanto alla prima attivazione.'; if (mode === 'lan') return remote.enabled ? 'Telefono e PC devono restare sulla stessa rete.' : 'Avvia il server locale e genera un QR.'; return remote.tunnel?.transitions?.at(-1)?.message ?? 'Relay controllerà installazione, account e proxy.'; }
function installStepText(state: string): string { return state === 'NOT_INSTALLED' ? 'Manca il client ufficiale.' : 'Client rilevato.'; }
function loginStepText(state: string): string { return state === 'AWAITING_AUTH' ? 'Completa il browser.' : state === 'INSTALLED_NEEDS_LOGIN' ? 'Accesso richiesto.' : 'Account collegato.'; }
function activateStepText(state: string, mode: RemoteMode): string { if (state === 'ACTIVE') return 'Attivo e verificato.'; if (state === 'PROPAGATING_DNS') return 'Configurato, DNS in propagazione.'; if (state === 'DEGRADED') return 'Configurato, richiede remediation.'; return mode === 'funnel' ? 'Pubblica Relay con HTTPS.' : 'Espone Relay soltanto nel tailnet.'; }
function platformLabel(value: string): string { return value === 'win32' ? 'Windows' : value === 'darwin' ? 'macOS' : value === 'linux' ? 'Linux' : value || 'Locale'; }
function isRemoteTab(value: unknown): value is RemoteTab { return value === 'access' || value === 'sessions' || value === 'history' || value === 'network'; }
function deviceIcon(userAgent: string | undefined): Parameters<typeof icon>[0] { return /ipad|tablet/i.test(userAgent ?? '') ? 'devices' : 'remote'; }
function deviceLabel(userAgent: string | undefined): string { const value = userAgent ?? ''; if (/iphone|ipad/i.test(value)) return /ipad/i.test(value) ? 'iPad · Safari' : 'iPhone · Safari'; if (/android/i.test(value)) return /chrome/i.test(value) ? 'Android · Chrome' : 'Android'; if (/windows/i.test(value)) return 'Windows'; if (/macintosh|mac os/i.test(value)) return 'macOS'; if (/linux/i.test(value)) return 'Linux'; return 'Browser mobile'; }
function reasonLabel(reason: string): string { return reason === 'revoked' ? 'Disconnessa manualmente' : reason === 'expired' ? 'Scaduta per inattività' : reason === 'server-stopped' ? 'Remoto chiuso' : 'Terminata'; }
function formatDuration(value: number): string { const seconds = Math.max(0, Math.round(Number(value || 0) / 1000)); if (seconds < 60) return `${seconds}s`; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes}m`; return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
