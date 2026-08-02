import type { AgentProvider } from '../core/provider.js';
import type { ProviderId, ProviderStatus, UsageSnapshot } from '../core/types.js';
import { errorMessage } from '../core/errors.js';
import { classifyProviderFailure } from './provider-failure.js';
import { detectingStatus, normalizeProviderHealth } from './provider-health.js';

export interface ProviderDetectionOptions {
  force?: boolean;
  timeoutMs?: number;
}

export class ProviderRegistry {
  private readonly providers: Map<ProviderId, AgentProvider>;
  private readonly statuses = new Map<ProviderId, ProviderStatus>();
  private readonly listeners = new Set<(status: ProviderStatus, all: ProviderStatus[]) => void>();
  private detectionFlight: Promise<ProviderStatus[]> | undefined;
  private generation = 0;
  private controllers = new Map<ProviderId, AbortController>();

  constructor(providers: AgentProvider[], private readonly minimumTimeoutMs = 20_000) {
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
    for (const provider of providers) this.statuses.set(provider.id, initialStatus(provider.id));
  }

  get(id: ProviderId): AgentProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Provider ${id} is not registered.`);
    return provider;
  }

  currentStatuses(): ProviderStatus[] {
    return [...this.providers.keys()].map((id) => structuredClone(this.statuses.get(id) ?? initialStatus(id)));
  }

  onStatus(listener: (status: ProviderStatus, all: ProviderStatus[]) => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  async detectAll(options: ProviderDetectionOptions = {}): Promise<ProviderStatus[]> {
    if (this.detectionFlight && !options.force) return this.detectionFlight;
    if (options.force) {
      for (const controller of this.controllers.values()) controller.abort();
      this.controllers.clear();
    }

    const generation = ++this.generation;
    const timeoutMs = Math.max(this.minimumTimeoutMs, options.timeoutMs ?? 25_000);
    for (const id of this.providers.keys()) this.publish(detectingStatus(this.statuses.get(id) ?? initialStatus(id)), generation);

    const tasks = [...this.providers.values()].map((provider) => this.detectOne(provider, generation, timeoutMs));
    const flight = Promise.allSettled(tasks).then(() => this.currentStatuses());
    this.detectionFlight = flight.finally(() => {
      if (this.generation === generation) this.detectionFlight = undefined;
    });
    return this.detectionFlight;
  }

  async usageAll(): Promise<UsageSnapshot[]> {
    const results = await Promise.allSettled([...this.providers.values()].map((provider) => provider.getUsage()));
    return results.flatMap((result, index) => {
      if (result.status === 'fulfilled') return [result.value];
      const provider = [...this.providers.values()][index]!;
      return [{
        provider: provider.id,
        available: false,
        detail: errorMessage(result.reason),
        source: 'unavailable',
        confidence: 'unknown',
        updatedAt: new Date().toISOString()
      } satisfies UsageSnapshot];
    });
  }

  async dispose(): Promise<void> {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    await Promise.allSettled([...this.providers.values()].map((provider) => provider.dispose()));
  }

  private async detectOne(provider: AgentProvider, generation: number, timeoutMs: number): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(provider.id, controller);
    const started = Date.now();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const status = await provider.detect(controller.signal);
      if (generation !== this.generation) return;
      const normalized = normalizeProviderHealth(status, Date.now() - started);
      this.publish(normalized, generation);
    } catch (error) {
      if (generation !== this.generation) return;
      const failure = classifyProviderFailure(provider.id, controller.signal.aborted ? `Provider detection timed out after ${timeoutMs} ms. ${errorMessage(error)}` : error);
      const previous = this.statuses.get(provider.id) ?? initialStatus(provider.id);
      this.publish(normalizeProviderHealth({
        ...previous,
        available: false,
        operational: false,
        healthState: controller.signal.aborted ? 'degraded' : 'unavailable',
        detail: failure.message,
        failure,
        lastCheckedAt: new Date().toISOString(),
        probes: [
          ...(previous.probes ?? []).filter((probe) => probe.id !== 'smoke'),
          {
            id: 'smoke',
            ok: false,
            startedAt: new Date(started).toISOString(),
            durationMs: Date.now() - started,
            message: failure.message,
            detail: failure.technicalDetail
          }
        ]
      }), generation);
    } finally {
      clearTimeout(timer);
      if (this.controllers.get(provider.id) === controller) this.controllers.delete(provider.id);
    }
  }

  private publish(status: ProviderStatus, generation: number): void {
    if (generation !== this.generation) return;
    this.statuses.set(status.id, structuredClone(status));
    const all = this.currentStatuses();
    for (const listener of this.listeners) listener(structuredClone(status), all);
  }
}

function initialStatus(id: ProviderId): ProviderStatus {
  const label = id === 'claude' ? 'Claude Code' : id === 'antigravity' ? 'Antigravity' : id === 'copilot' ? 'GitHub Copilot' : 'Codex';
  return {
    id,
    label,
    available: false,
    operational: false,
    healthState: 'detecting',
    executable: id === 'antigravity' ? 'agy' : id,
    setupState: 'detecting',
    models: [],
    lastCheckedAt: new Date().toISOString()
  };
}
