import type { ProviderId, UsageBucket, UsageSnapshot } from '../core/types.js';

export type UsageModelFamily = 'gemini' | 'claude-gpt';

export function usageModelFamily(modelOrFamily: string | undefined): UsageModelFamily | undefined {
  const value = modelOrFamily?.toLowerCase().trim() ?? '';
  if (!value || value === 'auto' || value.includes('multi-provider')) return undefined;
  if (value.includes('gemini')) return 'gemini';
  if (/claude|gpt|openai|oss/.test(value)) return 'claude-gpt';
  return undefined;
}

export function preferredUsageBucket(
  provider: ProviderId,
  buckets: UsageBucket[] | undefined,
  modelOrFamily?: string
): UsageBucket | undefined {
  const readable = (buckets ?? []).filter((bucket) => bucket.remainingFraction !== undefined || bucket.used !== undefined);
  if (!readable.length) return undefined;

  if (provider === 'copilot') {
    return readable.find((bucket) => bucket.id === 'credits-total')
      ?? readable.find((bucket) => bucket.id.includes('credits-total'))
      ?? readable.find((bucket) => bucket.id.includes('total'))
      ?? readable[0];
  }

  const short = readable.filter(isShortWindow);
  if (provider === 'antigravity') {
    const family = usageModelFamily(modelOrFamily);
    if (family) {
      const familyShort = short.filter((bucket) => bucketMatchesFamily(bucket, family));
      if (familyShort.length) return mostConstrained(familyShort);
      const familyAny = readable.filter((bucket) => bucketMatchesFamily(bucket, family));
      if (familyAny.length) return mostConstrained(familyAny);
    }
    // Without an explicit model, use the most constrained 5-hour pool. Weekly
    // windows are useful context but must never drive Antigravity's headline.
    if (short.length) return mostConstrained(short);
    return mostConstrained(readable);
  }

  if (provider === 'claude' || provider === 'codex') {
    if (short.length) return mostConstrained(short);
    return mostConstrained(readable);
  }

  return mostConstrained(readable);
}

export function withPreferredUsage(
  provider: ProviderId,
  usage: UsageSnapshot | undefined,
  modelOrFamily?: string
): UsageSnapshot | undefined {
  if (!usage) return undefined;
  const preferred = preferredUsageBucket(provider, usage.buckets, modelOrFamily);
  if (!preferred) return usage;
  return {
    ...usage,
    ...(preferred.remainingFraction !== undefined ? { remainingFraction: preferred.remainingFraction } : {}),
    ...(preferred.usedFraction !== undefined ? { usedFraction: preferred.usedFraction } : {}),
    ...(preferred.resetsAt ? { resetsAt: preferred.resetsAt } : {})
  };
}

export function usageReferenceLabel(provider: ProviderId, bucket: UsageBucket | undefined): string {
  if (!bucket) return 'dato provider';
  if (provider === 'copilot') return bucket.label || 'mese corrente';
  const group = compactGroup(bucket.group);
  const window = compactWindow(bucket);
  return [group, window].filter(Boolean).join(' · ') || bucket.label;
}

export function compactWindow(bucket: UsageBucket): string {
  if (bucket.kind === 'five-hour' || bucket.kind === 'session') return bucket.kind === 'session' ? 'sessione' : '5 ore';
  if (bucket.kind === 'weekly') return 'settimana';
  if (bucket.kind === 'monthly') return 'mese';
  if (bucket.kind === 'daily') return 'giorno';
  return bucket.label || 'quota';
}

export function compactGroup(group: string | undefined): string {
  if (!group) return '';
  const normalized = group.toLowerCase();
  if (normalized.includes('gemini')) return 'Gemini';
  if (normalized.includes('claude') || normalized.includes('gpt')) return 'Claude/GPT';
  if (normalized.includes('codex')) return 'Codex';
  if (normalized.includes('credit')) return 'AI Credits';
  if (normalized.includes('request')) return 'Richieste premium';
  return group;
}

function isShortWindow(bucket: UsageBucket): boolean {
  return bucket.kind === 'five-hour' || bucket.kind === 'session';
}

function bucketMatchesFamily(bucket: UsageBucket, family: UsageModelFamily): boolean {
  const value = `${bucket.group ?? ''} ${bucket.label}`.toLowerCase();
  if (family === 'gemini') return value.includes('gemini');
  return /claude|gpt|openai|oss/.test(value);
}

function mostConstrained(buckets: UsageBucket[]): UsageBucket | undefined {
  return [...buckets].sort((a, b) => {
    const aFraction = a.remainingFraction;
    const bFraction = b.remainingFraction;
    if (aFraction !== undefined && bFraction !== undefined) return aFraction - bFraction;
    if (aFraction !== undefined) return -1;
    if (bFraction !== undefined) return 1;
    return Number(b.id.includes('total')) - Number(a.id.includes('total'));
  })[0];
}
