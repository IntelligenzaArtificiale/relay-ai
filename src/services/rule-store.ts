import type { ProviderId, RuleDocument } from '../core/types.js';
import { AtomicJsonStore } from './atomic-store.js';

export class RuleStore {
  private readonly store: AtomicJsonStore<RuleDocument[]>;

  constructor(path: string) {
    this.store = new AtomicJsonStore(path, []);
  }

  invalidateCache(): void { this.store.invalidate(); }


  async read(): Promise<RuleDocument[]> {
    const stored = await this.store.read();
    const rules = Array.isArray(stored) ? stored : [];
    const normalized = rules.map(normalizeRule);
    if (JSON.stringify(normalized) !== JSON.stringify(rules)) await this.store.write(normalized);
    return normalized;
  }

  write(rules: RuleDocument[]): Promise<void> {
    return this.store.write(rules.map(normalizeRule));
  }

  async toggle(id: string, enabled: boolean): Promise<RuleDocument[]> {
    return this.store.update((stored) => {
      const rules = Array.isArray(stored) ? stored : [];
      return rules.map((rule) => rule.id === id ? { ...normalizeRule(rule), enabled } : normalizeRule(rule));
    });
  }

  async upsert(rule: RuleDocument): Promise<RuleDocument[]> {
    const normalizedRule = normalizeRule(rule);
    return this.store.update((stored) => {
      const rules = Array.isArray(stored) ? stored : [];
      const normalized = rules.map(normalizeRule);
      const index = normalized.findIndex((entry) => entry.id === normalizedRule.id);
      if (index < 0) return [normalizedRule, ...normalized];
      const next = [...normalized];
      next[index] = normalizedRule;
      return next;
    });
  }

  async remove(id: string): Promise<RuleDocument[]> {
    return this.store.update((stored) => {
      const rules = Array.isArray(stored) ? stored : [];
      return rules.map(normalizeRule).filter((rule) => rule.id !== id);
    });
  }
}

export function normalizeRule(input: RuleDocument): RuleDocument {
  const legacy = input.provider;
  const providers = uniqueProviders(
    Array.isArray(input.providers) && input.providers.length
      ? input.providers
      : legacy && legacy !== 'all'
        ? [legacy]
        : ['codex', 'claude', 'antigravity', 'copilot']
  );
  const skillProviders = uniqueProviders(input.skillPublication?.providers ?? []);
  const normalized: RuleDocument = {
    ...input,
    providers,
    priority: Number.isFinite(input.priority) ? Math.max(0, Math.min(999, Math.round(input.priority))) : 100,
    enabled: input.enabled !== false,
    ...(input.skillPublication
      ? { skillPublication: {
          enabled: input.skillPublication.enabled === true,
          providers: skillProviders,
          ...(input.skillPublication.lastSyncAt ? { lastSyncAt: input.skillPublication.lastSyncAt } : {})
        } }
      : {})
  };
  delete normalized.provider;
  return normalized;
}

function uniqueProviders(values: unknown[]): ProviderId[] {
  const valid = values.filter((value): value is ProviderId => value === 'codex' || value === 'claude' || value === 'antigravity' || value === 'copilot');
  return [...new Set(valid)];
}
