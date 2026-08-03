import type { ModelOption, ProviderId, ProviderStatus, RelayPreferences, RunPermission, TaskComplexity, UsageSnapshot } from '../core/types.js';
import { preferredUsageBucket } from './usage-selection.js';

export function inferTaskComplexity(prompt: string): TaskComplexity {
  if (/\b(?:architecture|architettura|migration|migrazione|security|sicurezza|race condition|database schema|refactor(?:ing)? ampio|multi[- ]step|root cause|causa radice)\b/i.test(prompt)) return 'complex';
  if (/\b(?:rename|rinomina|typo|copy|testo|small|semplice|bounded|singolo file|one file|lint|format|import)\b/i.test(prompt) && prompt.length < 1_200) return 'light';
  return 'standard';
}

function providerAvailableFraction(usage: UsageSnapshot | undefined): number {
  if (!usage) return .5;
  const bucket = preferredUsageBucket(usage.provider, usage.buckets);
  return bucket?.remainingFraction ?? usage.remainingFraction ?? .5;
}

function usageFractionForModel(usage: UsageSnapshot | undefined, modelOrFamily: string): number | undefined {
  if (!usage) return undefined;
  const bucket = preferredUsageBucket(usage.provider, usage.buckets, modelOrFamily);
  return bucket?.remainingFraction ?? usage.remainingFraction;
}

export function chooseDelegationProvider(options: {
  currentProvider: ProviderId;
  prompt: string;
  permission: RunPermission;
  complexity: TaskComplexity;
  providers: ProviderStatus[];
  usage: UsageSnapshot[];
  preferences: RelayPreferences;
}): ProviderId {
  const candidates = options.providers.filter((provider) => provider.available && (options.permission === 'read-only' || provider.capabilities?.fileEditing));
  if (!candidates.length) return options.currentProvider;

  const scored = candidates.map((provider) => {
    const snapshot = options.usage.find((entry) => entry.provider === provider.id);
    const remaining = providerAvailableFraction(snapshot);
    let score = remaining * 100;
    if (provider.id === options.currentProvider) score += 3;
    if (options.complexity === 'complex' && (provider.id === 'claude' || provider.id === 'codex' || provider.id === 'copilot')) score += 18;
    if (options.complexity === 'light' && (provider.id === 'codex' || provider.id === 'copilot')) score += 8;
    if (provider.id === 'copilot') score += options.complexity === 'standard' ? 12 : 7;
    if (options.preferences.quotaPolicy === 'preserve' && remaining <= options.preferences.quotaWarningThreshold) score -= 45;
    if (remaining <= options.preferences.quotaCriticalThreshold) score -= 90;
    return { provider: provider.id, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.provider ?? options.currentProvider;
}

export function modelTier(idOrLabel: string): 0 | 1 | 2 {
  const value = idOrLabel.toLowerCase();
  if (/(?:mini|flash|haiku|nano|terra|spark|fast|small|low)/i.test(value)) return 0;
  if (/(?:opus|pro|thinking|high|max|ultra)/i.test(value)) return 2;
  return 1;
}

export function chooseDelegationModel(
  models: ModelOption[],
  complexity: TaskComplexity,
  policy: RelayPreferences['quotaPolicy'],
  usage: UsageSnapshot | undefined
): string | undefined {
  const visible = models.filter((model) => !model.hidden && model.id !== 'auto');
  if (!visible.length) return undefined;
  const ranked = visible.map((model) => {
    const label = `${model.id} ${model.label}`;
    const remaining = usageFractionForModel(usage, model.family ?? label);
    const efficient = /(?:mini|flash|haiku|terra|spark|fast|low)/i.test(label);
    const powerful = /(?:opus|pro|gpt-5\.6|gpt-5\.5|thinking|high)/i.test(label) && !/(?:mini|flash|haiku|terra|spark)/i.test(label);
    let score = model.isDefault ? 12 : 0;
    score += (remaining ?? providerAvailableFraction(usage)) * 70;
    if (complexity === 'light' && efficient) score += 30;
    if (complexity === 'standard' && !efficient) score += 8;
    if (complexity === 'complex' && powerful) score += 38;
    if (policy === 'preserve' && efficient) score += 24;
    if ((remaining ?? 1) <= .05) score -= 120;
    else if ((remaining ?? 1) <= .2) score -= 45;
    return { model, score };
  }).sort((a, b) => b.score - a.score);
  return ranked[0]?.model.id;
}

export function chooseDelegationReasoning(
  models: ModelOption[],
  modelId: string | undefined,
  complexity: TaskComplexity,
  policy: RelayPreferences['quotaPolicy'],
  usage: UsageSnapshot | undefined
): string | undefined {
  const model = models.find((entry) => entry.id === modelId) ?? models.find((entry) => entry.isDefault);
  const options = model?.reasoning ?? [];
  if (!options.length) return undefined;
  const remaining = usage?.remainingFraction;
  const conserve = policy === 'preserve' || (remaining !== undefined && remaining <= .25);
  const order = ['minimal', 'low', 'medium', 'high', 'xhigh', 'extra-high', 'max', 'ultracode'];
  const target = complexity === 'complex' && !conserve ? 'high' : complexity === 'light' || conserve ? 'low' : 'medium';
  const exact = options.find((option) => option.id.toLowerCase() === target);
  if (exact) return exact.id;
  const targetIndex = order.indexOf(target);
  const rank = (id: string) => {
    const index = order.indexOf(id.toLowerCase());
    return index < 0 ? targetIndex : index;
  };
  return [...options]
    .sort((a, b) => Math.abs(rank(a.id) - targetIndex) - Math.abs(rank(b.id) - targetIndex))[0]?.id
    ?? model?.defaultReasoning;
}
