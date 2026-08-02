import type { ProviderId, ProviderRecoveryBundle, ProviderStatus, UsageSnapshot } from '../core/types.js';
import { sanitizeTechnicalDetail } from './provider-failure.js';

const PRIORITY: ProviderId[] = ['claude', 'codex', 'antigravity', 'copilot'];

export function recoveryCandidates(target: ProviderId, providers: ProviderStatus[], usage: UsageSnapshot[] = []): ProviderId[] {
  const health = new Map(providers.map((provider) => [provider.id, provider]));
  const quota = new Map(usage.map((snapshot) => [snapshot.provider, snapshot]));
  return PRIORITY
    .filter((id) => id !== target && health.get(id)?.healthState === 'ready' && health.get(id)?.connected !== false)
    .sort((a, b) => (quota.get(b)?.remainingFraction ?? 0.5) - (quota.get(a)?.remainingFraction ?? 0.5));
}

export function buildProviderRecoveryBundle(input: {
  target: ProviderStatus;
  providers: ProviderStatus[];
  diagnostics?: string;
  platform?: string;
  arch?: string;
  editor?: string;
  remoteName?: string;
  pathValue?: string;
  probableRelayFiles?: string[];
}): ProviderRecoveryBundle {
  const target = input.target;
  return {
    incidentId: `${target.id}:${Date.now()}`,
    targetProvider: target.id,
    createdAt: new Date().toISOString(),
    environment: {
      platform: input.platform ?? process.platform,
      arch: input.arch ?? process.arch,
      editor: input.editor ?? 'VS Code compatible',
      ...(input.remoteName ? { remoteName: input.remoteName } : {})
    },
    configuredExecutable: target.configuredExecutable ?? target.executable,
    resolvedExecutable: target.executable,
    resolutionSource: target.resolutionSource,
    relevantPathEntries: sanitizePathEntries(input.pathValue ?? process.env.PATH ?? ''),
    healthState: target.healthState ?? 'unavailable',
    probes: target.probes ?? [],
    models: target.models.map((model) => model.id).slice(0, 100),
    probableRelayFiles: (input.probableRelayFiles ?? defaultProbableFiles(target.id)).slice(0, 24),
    technicalDetail: sanitizeTechnicalDetail([target.detail, target.failure?.technicalDetail, input.diagnostics].filter(Boolean).join('\n')).slice(-8_000),
    constraints: [
      'Diagnose the target provider only. Do not alter unrelated providers.',
      'Start with read-only probes.',
      'Ask for confirmation before changing global installs, PATH, authentication or external configuration.',
      'Do not use Antigravity Browser Agent unless browser interaction is explicitly required.',
      'Declare the incident resolved only after Relay probes pass.'
    ]
  };
}

function sanitizePathEntries(value: string): string[] {
  const separator = process.platform === 'win32' ? ';' : ':';
  return value.split(separator)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => sanitizeTechnicalDetail(entry).slice(0, 500))
    .slice(0, 40);
}

function defaultProbableFiles(provider: ProviderId): string[] {
  const common = [
    'src/services/process-launcher.ts',
    'src/services/command-runner.ts',
    'src/services/executable-resolver.ts',
    'src/services/provider-registry.ts',
    'src/services/provider-health.ts',
    'src/services/provider-failure.ts'
  ];
  const specific: Record<ProviderId, string[]> = {
    codex: ['src/providers/codex-provider.ts', 'src/providers/codex-app-server.ts'],
    claude: ['src/providers/claude-provider.ts'],
    antigravity: ['src/providers/antigravity-provider.ts'],
    copilot: ['src/providers/copilot-provider.ts']
  };
  return [...common, ...specific[provider]];
}
