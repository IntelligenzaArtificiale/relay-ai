import type { ModelOption, ProviderId, ProviderStatus } from '../core/types.js';

export interface ResolvedRunSelection {
  provider: ProviderId;
  model?: string;
  reasoning?: string;
  changed: boolean;
  notices: string[];
}

export interface ModelCapabilitySummary {
  provider: ProviderId;
  model: string;
  supportsReasoningEffort: boolean;
  supportedEfforts: string[];
  supportsMcp: boolean;
  supportsBrowser: boolean;
  supportsDelegation: boolean;
}

/**
 * Single, boring gate before every provider execution.
 * UI choices, defaults and delegated requests all pass here so Relay never sends
 * model/reasoning pairs that the provider model table says are invalid.
 */
export function normalizeRunSelection(options: {
  provider: ProviderId;
  model?: string;
  reasoning?: string;
  providers: ProviderStatus[];
}): ResolvedRunSelection {
  const status = options.providers.find((entry) => entry.id === options.provider);
  const models = status?.models ?? [];
  const requestedModel = clean(options.model);
  const requestedReasoning = clean(options.reasoning);
  const model = resolveModel(models, requestedModel);
  const modelId = requestedModel && requestedModel !== 'auto' && model ? model.id : requestedModel === 'auto' ? 'auto' : model?.id;
  const supportedReasoning = model?.reasoning ?? [];
  const notices: string[] = [];
  let reasoning = requestedReasoning;

  if (modelId === 'auto' && reasoning && reasoning !== 'auto') {
    notices.push(`${providerLabel(options.provider)} modello auto non supporta un thinking forzato: Relay userà thinking automatico.`);
    reasoning = undefined;
  } else if (reasoning && reasoning !== 'auto' && !supportedReasoning.some((entry) => entry.id === reasoning)) {
    const fallback = model?.defaultReasoning && supportedReasoning.some((entry) => entry.id === model.defaultReasoning)
      ? model.defaultReasoning
      : undefined;
    notices.push(`${model?.label ?? modelId ?? providerLabel(options.provider)} non supporta thinking ${reasoning}: Relay ${fallback ? `userà ${fallback}` : 'non invierà --effort'}.`);
    reasoning = fallback;
  }

  return {
    provider: options.provider,
    ...(modelId && modelId !== 'auto' ? { model: modelId } : modelId === 'auto' ? { model: 'auto' } : {}),
    ...(reasoning && reasoning !== 'auto' ? { reasoning } : reasoning === 'auto' ? { reasoning: 'auto' } : {}),
    changed: (modelId ?? undefined) !== requestedModel || (reasoning ?? undefined) !== requestedReasoning,
    notices
  };
}


export function resolveDelegationModelSelection(options: {
  explicitModel?: string;
  agentModel?: string;
  configuredModel?: string;
  smartModel?: string;
  fallbackModel?: string;
}): string | undefined {
  if (options.explicitModel) return options.explicitModel;
  if (options.agentModel) return options.agentModel;
  if (options.configuredModel && options.configuredModel !== 'relay-auto') return options.configuredModel;
  return options.smartModel ?? options.fallbackModel;
}

export function capabilitySummary(provider: ProviderStatus): ModelCapabilitySummary[] {
  return provider.models
    .filter((model) => !model.hidden)
    .map((model) => ({
      provider: provider.id,
      model: model.id,
      supportsReasoningEffort: (model.reasoning?.length ?? 0) > 0,
      supportedEfforts: (model.reasoning ?? []).map((entry) => entry.id),
      supportsMcp: Boolean(provider.capabilities?.mcp),
      supportsBrowser: Boolean(provider.capabilities?.browser || provider.id === 'antigravity'),
      supportsDelegation: provider.available && provider.authenticated !== false
    }));
}

export function modelSupportsMcp(provider: ProviderStatus | undefined, modelId: string | undefined): boolean {
  if (!provider?.capabilities?.mcp) return false;
  if (!modelId || modelId === 'auto') return true;
  return Boolean(provider.models.find((model) => model.id === modelId));
}

function resolveModel(models: ModelOption[], modelId: string | undefined): ModelOption | undefined {
  if (!modelId || modelId === 'auto') return models.find((entry) => entry.id === 'auto') ?? models.find((entry) => entry.isDefault) ?? models[0];
  return models.find((entry) => entry.id === modelId) ?? models.find((entry) => entry.isDefault) ?? models[0];
}

function clean(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function providerLabel(provider: ProviderId): string {
  if (provider === 'claude') return 'Claude Code';
  if (provider === 'antigravity') return 'Antigravity';
  if (provider === 'copilot') return 'GitHub Copilot';
  return 'Codex';
}
