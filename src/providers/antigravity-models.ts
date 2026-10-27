// AGY owns the live catalog. Fallbacks are used only when inventory is unavailable.
import type { ModelOption } from '../core/types.js';

const flashModels = ['3.8', '3.7', '3.6', '3.5'].flatMap((version) => ['low', 'medium', 'high'].map((effort) => ({
  id: `gemini-${version}-flash-${effort}`,
  label: `Gemini ${version} Flash · ${effort.replace(/^./, (letter) => letter.toUpperCase())}`,
  family: 'Gemini', reasoning: []
})));

export const ANTIGRAVITY_FALLBACK_MODELS: ModelOption[] = [
  { id: 'auto', label: 'Automatico', description: 'Lascia ad Antigravity la scelta del modello.', isDefault: true, reasoning: [] },
  ...flashModels,
  { id: 'gemini-3.1-pro-low', label: 'Gemini 3.1 Pro · Low', family: 'Gemini', reasoning: [] },
  { id: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro · High', family: 'Gemini', reasoning: [] },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 · Thinking', family: 'Claude and GPT', reasoning: [] },
  { id: 'claude-opus-4-6-thinking', label: 'Claude Opus 4.6 · Thinking', family: 'Claude and GPT', reasoning: [] },
  { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B · Medium', family: 'Claude and GPT', reasoning: [] }
];

export function parseAntigravityModels(output: string): ModelOption[] {
  const models = new Map<string, ModelOption>();
  for (const raw of output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').split(/\r?\n/)) {
    const line = raw.replace(/^[\s*•>-]+/, '').trim();
    const match = line.match(/^([a-z0-9][a-z0-9._-]*)\s+((?:Gemini|Claude|GPT)\b.*)$/i);
    if (match) {
      const id = match[1]!;
      const label = prettifyModelLabel(match[2]!);
      models.set(id, { id, label, family: modelFamily(label), reasoning: [] });
    } else {
      // Older label-only inventories can use a known slug, never a display name as --model.
      const label = prettifyModelLabel(line);
      const known = ANTIGRAVITY_FALLBACK_MODELS.find((model) => model.label.toLowerCase() === label.toLowerCase());
      if (known) models.set(known.id, { ...known });
    }
  }
  return [...models.values()];
}

export function antigravityDiscoveredModels(discovered: ModelOption[]): ModelOption[] {
  return [ANTIGRAVITY_FALLBACK_MODELS[0]!, ...discovered.filter((model) => model.id !== 'auto')];
}

export function prettifyModelLabel(value: string): string {
  return value.replace(/\((Low|Medium|High|Thinking)\)/i, '· $1').replace(/\s+/g, ' ').trim();
}

export function modelFamily(value: string): string {
  if (/^Gemini/i.test(value)) return 'Gemini';
  if (/^(Claude|GPT)/i.test(value)) return 'Claude and GPT';
  return 'Other';
}
