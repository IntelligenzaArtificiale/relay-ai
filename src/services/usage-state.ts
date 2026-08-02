import type { ProviderId, UsageBucket, UsageSnapshot } from '../core/types.js';
import { preferredUsageBucket } from './usage-selection.js';

export function mergeUsageSnapshots(
  providers: ProviderId[],
  previous: UsageSnapshot[],
  refreshed: UsageSnapshot[],
  now = new Date().toISOString()
): UsageSnapshot[] {
  return providers.map((provider) => {
    const next = refreshed.find((entry) => entry.provider === provider);
    const prior = previous.find((entry) => entry.provider === provider);
    if (next?.available) {
      const buckets = mergeBuckets(prior?.buckets ?? [], next.buckets ?? []);
      const constrained = preferredUsageBucket(provider, buckets);
      return {
        ...next,
        ...(buckets.length ? { buckets } : {}),
        ...(constrained?.remainingFraction !== undefined ? { remainingFraction: constrained.remainingFraction } : {}),
        ...(constrained?.usedFraction !== undefined ? { usedFraction: constrained.usedFraction } : {}),
        ...(constrained?.resetsAt ? { resetsAt: constrained.resetsAt } : {}),
        stale: false,
        lastSuccessfulAt: next.updatedAt || now
      };
    }
    if (prior?.available) {
      return {
        ...prior,
        stale: true,
        updatedAt: next?.updatedAt ?? now,
        lastSuccessfulAt: prior.lastSuccessfulAt ?? prior.updatedAt,
        lastError: next?.detail ?? next?.lastError ?? 'Aggiornamento temporaneamente non disponibile.'
      };
    }
    return next ?? {
      provider,
      available: false,
      source: 'unavailable',
      confidence: 'unknown',
      updatedAt: now,
      lastError: 'Il provider non ha restituito dati di utilizzo.'
    };
  });
}

function mergeBuckets(previous: UsageBucket[], refreshed: UsageBucket[]): UsageBucket[] {
  if (!previous.length) return refreshed;
  if (!refreshed.length) return previous;
  const map = new Map<string, UsageBucket>();
  for (const bucket of previous) map.set(bucketKey(bucket), bucket);
  for (const bucket of refreshed) map.set(bucketKey(bucket), bucket);
  return [...map.values()].sort((a, b) => {
    const group = (a.group ?? '').localeCompare(b.group ?? '');
    if (group) return group;
    return bucketRank(a.kind) - bucketRank(b.kind) || a.label.localeCompare(b.label);
  });
}

function bucketKey(bucket: UsageBucket): string {
  return `${(bucket.group ?? '').toLowerCase()}::${bucket.kind}::${bucket.label.toLowerCase()}`;
}

function bucketRank(kind: UsageBucket['kind']): number {
  if (kind === 'session' || kind === 'five-hour') return 0;
  if (kind === 'weekly') return 1;
  return 2;
}


export function shouldRetryUsageSnapshot(snapshot: UsageSnapshot): boolean {
  if (snapshot.available) return false;
  const detail = `${snapshot.detail ?? ''}
${snapshot.lastError ?? ''}`.toLowerCase();
  if (!detail.trim()) return true;
  if (/scollegato|not found|non trovata|non rilevata|needs login|accesso richiesto|autentic|token github|plan: read|non espone|unsupported|non support|permission denied/.test(detail)) return false;
  return /tempor|timeout|timed out|econn|epipe|socket|busy|locked|spawn|avvio|launch|nessun output|no output|non ha restituito|failed|errore|error|unavailable|non disponibile/.test(detail);
}

export function usageRetryDelays(platform: NodeJS.Platform): number[] {
  return platform === 'darwin' ? [700] : [];
}
