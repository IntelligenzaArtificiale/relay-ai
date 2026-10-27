// Versioned Claude choices plus native CLI metadata. Discovery sends no user turn.
import type { ModelOption } from '../core/types.js';

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const reasoningOptions = (levels: string[]) => levels.map((id) => ({ id, label: id.replace(/^./, (letter) => letter.toUpperCase()) }));

export function claudeFallbackModels(): ModelOption[] {
  const aliases = [
    ['sonnet', 'Sonnet', 'high'], ['opus', 'Opus', 'high'],
    ['haiku', 'Haiku', 'medium'], ['fable', 'Fable', 'high']
  ].map(([id, label, defaultReasoning]) => ({
    id: id!, label: `${label} · automatico`, family: 'Claude',
    description: 'Alias risolto dalla CLI e dalle impostazioni del tuo account.',
    reasoning: reasoningOptions(id === 'haiku' ? [] : EFFORTS),
    ...(id === 'sonnet' ? { isDefault: true } : {}),
    ...(id !== 'haiku' ? { defaultReasoning: defaultReasoning! } : {})
  }));
  return [...aliases, ...[
    ['claude-sonnet-5-5', 'Sonnet 5.5', 'high'],
    ['claude-opus-5-5', 'Opus 5.5', 'medium'],
    ['claude-haiku-5-5', 'Haiku 5.5', 'medium'],
    ['claude-fable-5-1', 'Fable 5.1', 'high']
  ].map(([id, label, defaultReasoning]) => ({
    id: id!, label: label!, family: 'Claude',
    description: 'Versione esplicita; disponibilità soggetta al piano e alle policy del tuo account.',
    reasoning: reasoningOptions(EFFORTS), defaultReasoning: defaultReasoning!
  }))];
}

export const CLAUDE_MODEL_DISCOVERY_ID = 'relay-models';
export const CLAUDE_MODEL_DISCOVERY_INPUT = JSON.stringify({
  type: 'control_request', request_id: CLAUDE_MODEL_DISCOVERY_ID,
  request: { subtype: 'initialize' }
}) + '\n';

export function parseClaudeModels(output: string): ModelOption[] {
  for (const line of output.split(/\r?\n/)) {
    let payload;
    try { payload = JSON.parse(line); } catch { continue; }
    const response = payload?.response;
    if (payload?.type !== 'control_response' || response?.request_id !== CLAUDE_MODEL_DISCOVERY_ID || response?.subtype !== 'success') continue;
    if (!Array.isArray(response.response?.models)) return [];
    return response.response.models.flatMap((entry: Record<string, unknown>) => {
      if (!entry || typeof entry.value !== 'string' || !entry.value.trim()) return [];
      const id = entry.value.trim();
      const resolved = typeof entry.resolvedModel === 'string' ? entry.resolvedModel : undefined;
      const levels = entry.supportsEffort === false ? [] : Array.isArray(entry.supportedEffortLevels)
        ? entry.supportedEffortLevels.filter((level): level is string => typeof level === 'string' && EFFORTS.includes(level))
        : [];
      const label = resolved ? resolved.replace(/^claude-/, '').replace(/^(\w+)-(\d+)-(\d+)(?=-|\[|$)/, '$1 $2.$3').replace(/^(\w+)-(\d+)/, '$1 $2').replace(/^./, (letter) => letter.toUpperCase())
        : typeof entry.displayName === 'string' ? entry.displayName : id;
      return [{
        id, label: /^(sonnet|opus|haiku|fable|default)$/.test(id) ? `${label} · automatico` : label, family: 'Claude',
        ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
        reasoning: reasoningOptions(levels),
        ...(levels.includes('high') ? { defaultReasoning: /claude-(?:opus|haiku)-5-5/.test(resolved ?? id) && levels.includes('medium') ? 'medium' : 'high' }
          : levels.includes('medium') ? { defaultReasoning: 'medium' } : {})
      }];
    });
  }
  return [];
}

export function mergeClaudeModels(discovered: ModelOption[]): ModelOption[] {
  const models = new Map(claudeFallbackModels().map((model) => [model.id, model]));
  for (const model of discovered) {
    const previous = models.get(model.id);
    models.set(model.id, { ...previous, ...model, ...(previous?.isDefault ? { isDefault: true } : {}) });
  }
  return [...models.values()];
}
