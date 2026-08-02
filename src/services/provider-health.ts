import type { ProviderHealthState, ProviderProbeResult, ProviderStatus } from '../core/types.js';

export function normalizeProviderHealth(status: ProviderStatus, durationMs?: number): ProviderStatus {
  const probes = status.probes ?? syntheticProbes(status, durationMs ?? 0);
  let healthState: ProviderHealthState;
  if (status.connected === false) healthState = 'disconnected';
  else if (status.healthState === 'detecting') healthState = 'detecting';
  else if (!status.executable || status.setupState === 'not-installed' || status.cliAvailable === false) healthState = 'not-installed';
  else if (status.authenticated === false || status.setupState === 'needs-login') healthState = 'needs-login';
  else if (status.failure?.category === 'rate-limit') healthState = 'rate-limited';
  else if (status.failure || probes.some((probe) => !probe.ok && ['launch', 'authentication', 'models', 'smoke'].includes(probe.id))) healthState = 'degraded';
  else if (status.capabilities?.modelSelection && status.models.length === 0) healthState = 'degraded';
  else if (status.available) healthState = 'ready';
  else healthState = 'unavailable';

  const operational = healthState === 'ready';
  return {
    ...status,
    healthState,
    probes,
    operational,
    available: operational,
    lastCheckedAt: status.lastCheckedAt ?? new Date().toISOString(),
    ...(healthState === 'degraded' && !status.detail && status.capabilities?.modelSelection && status.models.length === 0
      ? { detail: 'CLI rilevata, ma Relay non ha caricato alcun modello utilizzabile.' }
      : {})
  };
}

export function detectingStatus(status: ProviderStatus): ProviderStatus {
  return { ...status, available: false, operational: false, healthState: 'detecting', lastCheckedAt: new Date().toISOString() };
}

function syntheticProbes(status: ProviderStatus, durationMs: number): ProviderProbeResult[] {
  const now = new Date().toISOString();
  const modelsRequired = Boolean(status.capabilities?.modelSelection);
  return [
    { id: 'resolve', ok: Boolean(status.executable) && status.setupState !== 'not-installed', startedAt: now, durationMs: 0, message: status.executable ? `Percorso risolto: ${status.executable}` : 'Eseguibile non risolto.' },
    { id: 'version', ok: Boolean(status.version), startedAt: now, durationMs: 0, message: status.version ? `Versione ${status.version}` : 'Versione non disponibile.' },
    { id: 'launch', ok: status.available && !status.detail, startedAt: now, durationMs, message: status.available && !status.detail ? 'Avvio riuscito.' : status.detail ?? 'Avvio non verificato.' },
    { id: 'authentication', ok: status.authenticated !== false, startedAt: now, durationMs: 0, message: status.authenticated === false ? 'Accesso richiesto.' : 'Account disponibile o non richiesto.' },
    { id: 'models', ok: !modelsRequired || status.models.length > 0, startedAt: now, durationMs: 0, message: `${status.models.length} modelli disponibili.` }
  ];
}
