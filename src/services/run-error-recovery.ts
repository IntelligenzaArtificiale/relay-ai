import type { ActiveRunState, ConversationMessage, ProviderId, ProviderStatus, UsageSnapshot } from '../core/types.js';
import { recoveryCandidates } from './provider-recovery.js';
import { sanitizeTechnicalDetail } from './provider-failure.js';

export interface RunErrorRecoveryBundle {
  incidentId: string;
  createdAt: string;
  failedRun: {
    runId: string;
    provider: ProviderId;
    model?: string;
    reasoning?: string;
    permission?: string;
    phase?: string;
    status?: string;
    error: string;
    failure?: unknown;
    originalPrompt?: string;
    partialOutput?: string;
    partialChanges: string[];
    activities: Array<{ title: string; detail?: string; createdAt?: string }>;
  };
  environment: { platform: string; arch: string; editor: string; remoteName?: string };
  diagnostics: string;
  tunnel?: unknown;
  constraints: string[];
}

export function selectRunRecoveryProvider(failedProvider: ProviderId, providers: ProviderStatus[], usage: UsageSnapshot[] = []): ProviderId | undefined {
  return recoveryCandidates(failedProvider, providers, usage)[0];
}

export function buildRunErrorRecoveryBundle(input: {
  runId: string;
  failedProvider: ProviderId;
  activeRun?: ActiveRunState;
  errorMessage?: ConversationMessage;
  originalPrompt?: string;
  diagnostics?: string;
  platform?: string;
  arch?: string;
  editor?: string;
  remoteName?: string;
  tunnel?: unknown;
}): RunErrorRecoveryBundle {
  const run = input.activeRun;
  const message = input.errorMessage;
  const error = sanitizeTechnicalDetail(run?.failure?.technicalDetail || run?.error || message?.text || 'Errore del provider non specificato.').slice(-8_000);
  const diagnosticText = sanitizeTechnicalDetail(input.diagnostics ?? '').slice(-10_000);
  const activities = (run?.activities ?? []).slice(-20).map((activity) => ({
    title: sanitizeTechnicalDetail(activity.title).slice(0, 500),
    ...(activity.detail ? { detail: sanitizeTechnicalDetail(activity.detail).slice(0, 2_000) } : {}),
    ...(activity.createdAt ? { createdAt: activity.createdAt } : {})
  }));
  return {
    incidentId: `run:${input.runId}:${Date.now()}`,
    createdAt: new Date().toISOString(),
    failedRun: {
      runId: input.runId,
      provider: input.failedProvider,
      ...(run?.model || message?.model ? { model: run?.model ?? message?.model } : {}),
      ...(run?.reasoning || message?.reasoning ? { reasoning: run?.reasoning ?? message?.reasoning } : {}),
      ...(run?.permission ? { permission: run.permission } : {}),
      ...(run?.phase ? { phase: run.phase } : {}),
      ...(run?.status ? { status: sanitizeTechnicalDetail(run.status).slice(0, 1_000) } : {}),
      error,
      ...(run?.failure ? { failure: run.failure } : {}),
      ...(input.originalPrompt || run?.originalPrompt ? { originalPrompt: sanitizeTechnicalDetail(input.originalPrompt ?? run?.originalPrompt ?? '').slice(0, 30_000) } : {}),
      ...(run?.partialOutput ? { partialOutput: sanitizeTechnicalDetail(run.partialOutput).slice(-30_000) } : {}),
      partialChanges: (run?.partialChanges ?? []).map((value) => sanitizeTechnicalDetail(value).slice(0, 1_000)).slice(0, 200),
      activities
    },
    environment: {
      platform: input.platform ?? process.platform,
      arch: input.arch ?? process.arch,
      editor: input.editor ?? 'VS Code compatible',
      ...(input.remoteName ? { remoteName: input.remoteName } : {})
    },
    diagnostics: diagnosticText,
    ...(input.tunnel ? { tunnel: sanitizeUnknown(input.tunnel) } : {}),
    constraints: [
      'Diagnose and resolve only the failed run and directly related Relay/provider code.',
      'Use danger-full-access for the recovery task, but preserve explicit confirmations before global installs, PATH, authentication, services or external configuration changes.',
      'Inspect the current workspace state before editing and do not repeat partial changes blindly.',
      'Run focused tests and report the evidence. Do not use Antigravity Browser Agent unless browser interaction is explicitly required.'
    ]
  };
}

function sanitizeUnknown(value: unknown): unknown {
  try {
    return JSON.parse(sanitizeTechnicalDetail(JSON.stringify(value)).slice(-10_000));
  } catch {
    return sanitizeTechnicalDetail(String(value)).slice(-10_000);
  }
}
