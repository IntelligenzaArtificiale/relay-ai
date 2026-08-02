import { randomUUID } from 'node:crypto';
import type { AgentEventHandler } from '../core/provider.js';
import type { AgentRunRequest, AgentRunResult, ParallelTaskInput } from '../core/types.js';
import { ProviderRegistry } from './provider-registry.js';

interface QueuedRun {
  request: AgentRunRequest;
  onEvent: AgentEventHandler;
  resolve: (result: AgentRunResult) => void;
  reject: (error: unknown) => void;
}

export class RunScheduler {
  private readonly queue: QueuedRun[] = [];
  private readonly active = new Map<string, AbortController>();

  constructor(
    private readonly providers: ProviderRegistry,
    private maxParallel: number
  ) {}

  setMaxParallel(value: number): void {
    this.maxParallel = Math.max(1, value);
    this.drain();
  }

  run(request: Omit<AgentRunRequest, 'signal'>, onEvent: AgentEventHandler): Promise<AgentRunResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, onEvent, resolve, reject });
      onEvent({ type: 'status', runId: request.runId, message: 'In coda…', phase: 'queued' });
      this.drain();
    });
  }

  async runParallel(
    cwd: string,
    tasks: ParallelTaskInput[],
    rulesFor: (provider: ParallelTaskInput['provider']) => string,
    onEvent: AgentEventHandler
  ): Promise<AgentRunResult[]> {
    return Promise.all(tasks.map((task) => this.run({
      runId: task.id || randomUUID(),
      provider: task.provider,
      prompt: task.prompt,
      cwd,
      permission: task.permission,
      ...(task.model ? { model: task.model } : {}),
      ...(task.reasoning ? { reasoning: task.reasoning } : {}),
      ...(rulesFor(task.provider) ? { rules: rulesFor(task.provider) } : {})
    }, onEvent)));
  }

  cancel(runId: string): boolean {
    const active = this.active.get(runId);
    if (active) {
      active.abort();
      return true;
    }
    const index = this.queue.findIndex((item) => item.request.runId === runId);
    if (index >= 0) {
      const [removed] = this.queue.splice(index, 1);
      removed?.reject(new Error('Esecuzione annullata prima dell’avvio.'));
      return true;
    }
    return false;
  }

  snapshot(): { active: string[]; queued: string[]; maxParallel: number } {
    return {
      active: [...this.active.keys()],
      queued: this.queue.map((item) => item.request.runId),
      maxParallel: this.maxParallel
    };
  }

  private drain(): void {
    while (this.active.size < this.maxParallel && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) return;
      const controller = new AbortController();
      this.active.set(item.request.runId, controller);
      let lastEventAt = Date.now();
      const forward: AgentEventHandler = (event) => {
        if (!(event.type === 'activity' && event.title === 'Processo attivo')) lastEventAt = Date.now();
        item.onEvent(event);
      };
      forward({ type: 'status', runId: item.request.runId, message: 'Avvio agente…', phase: 'connecting' });
      const heartbeat = setInterval(() => {
        const idleMs = Date.now() - lastEventAt;
        if (idleMs < 15_000) return;
        forward({
          type: 'activity',
          runId: item.request.runId,
          title: 'Processo attivo',
          detail: `Nessun nuovo output da ${Math.floor(idleMs / 1000)} secondi. Relay mantiene il processo sotto controllo.`
        });
      }, 5_000);
      heartbeat.unref?.();
      const provider = this.providers.get(item.request.provider);
      provider.run({ ...item.request, signal: controller.signal }, forward)
        .then(item.resolve, item.reject)
        .finally(() => {
          clearInterval(heartbeat);
          this.active.delete(item.request.runId);
          this.drain();
        });
    }
  }
}
