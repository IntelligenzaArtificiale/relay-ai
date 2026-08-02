import type { ProviderId, RelayPreferences } from '../core/types.js';
import { AtomicJsonStore } from './atomic-store.js';

export const DEFAULT_PREFERENCES: RelayPreferences = {
  defaultProvider: 'codex',
  delegationPolicy: 'confirm',
  quotaPolicy: 'balanced',
  usageAutoRefreshMinutes: 1,
  exposeUsageToAgents: true,
  privacyShield: false,
  quotaWarningThreshold: 0.35,
  quotaCriticalThreshold: 0.15,
  onboardingVersion: 0,
  disconnectedProviders: [],
  remoteAccessMode: 'lan',
  remoteAccessAutoStart: false,
  providerDefaults: {
    codex: { model: 'auto', reasoning: 'auto', permission: 'workspace-write', delegationModel: 'relay-auto' },
    claude: { model: 'sonnet', reasoning: 'high', permission: 'workspace-write', delegationModel: 'relay-auto' },
    antigravity: { model: 'auto', reasoning: 'auto', permission: 'workspace-write', delegationModel: 'relay-auto' },
    copilot: { model: 'auto', reasoning: 'medium', permission: 'workspace-write', delegationModel: 'relay-auto' }
  }
};

export class PreferencesStore {
  private readonly store: AtomicJsonStore<RelayPreferences>;

  constructor(path: string) {
    this.store = new AtomicJsonStore(path, DEFAULT_PREFERENCES);
  }

  invalidateCache(): void { this.store.invalidate(); }


  async read(): Promise<RelayPreferences> {
    return normalizePreferences(await this.store.read());
  }

  async update(patch: Partial<RelayPreferences>): Promise<RelayPreferences> {
    return this.store.update((current) => normalizePreferences({
      ...current,
      ...patch,
      providerDefaults: {
        ...current.providerDefaults,
        ...(patch.providerDefaults ?? {})
      }
    }));
  }

  async updateProvider(provider: ProviderId, patch: Partial<RelayPreferences['providerDefaults'][ProviderId]>): Promise<RelayPreferences> {
    return this.store.update((current) => normalizePreferences({
      ...current,
      providerDefaults: {
        ...current.providerDefaults,
        [provider]: {
          ...current.providerDefaults[provider],
          ...patch
        }
      }
    }));
  }
}

function normalizePreferences(value: unknown): RelayPreferences {
  const candidate = value && typeof value === 'object' ? value as Partial<RelayPreferences> : {};
  const defaults = candidate.providerDefaults && typeof candidate.providerDefaults === 'object'
    ? candidate.providerDefaults as Partial<RelayPreferences['providerDefaults']>
    : {} as Partial<RelayPreferences['providerDefaults']>;
  const disconnectedProviders = Array.isArray(candidate.disconnectedProviders)
    ? [...new Set(candidate.disconnectedProviders.filter((entry): entry is ProviderId => entry === 'codex' || entry === 'claude' || entry === 'antigravity' || entry === 'copilot'))]
    : [];
  return {
    ...DEFAULT_PREFERENCES,
    ...candidate,
    disconnectedProviders,
    privacyShield: candidate.privacyShield === true,
    remoteAccessMode: candidate.remoteAccessMode === 'funnel' || candidate.remoteAccessMode === 'tailnet' ? candidate.remoteAccessMode : 'lan',
    remoteAccessPublicPort: [443, 8443, 10000].includes(Number(candidate.remoteAccessPublicPort)) ? Number(candidate.remoteAccessPublicPort) : undefined,
    remoteAccessLocalPort: Number.isInteger(Number(candidate.remoteAccessLocalPort)) && Number(candidate.remoteAccessLocalPort) > 1024 && Number(candidate.remoteAccessLocalPort) < 65536 ? Number(candidate.remoteAccessLocalPort) : undefined,
    remoteAccessDnsName: typeof candidate.remoteAccessDnsName === 'string' && candidate.remoteAccessDnsName.trim() ? candidate.remoteAccessDnsName.trim().replace(/\.$/, '') : undefined,
    remoteAccessAutoStart: candidate.remoteAccessAutoStart === true,
    providerDefaults: {
      codex: { ...DEFAULT_PREFERENCES.providerDefaults.codex, ...defaults.codex },
      claude: { ...DEFAULT_PREFERENCES.providerDefaults.claude, ...defaults.claude },
      antigravity: { ...DEFAULT_PREFERENCES.providerDefaults.antigravity, ...defaults.antigravity },
      copilot: { ...DEFAULT_PREFERENCES.providerDefaults.copilot, ...defaults.copilot }
    }
  };
}
