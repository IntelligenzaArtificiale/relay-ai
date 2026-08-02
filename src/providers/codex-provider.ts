import type { AgentProvider, AgentEventHandler } from '../core/provider.js';
import type {
  AgentRunRequest,
  AgentRunResult,
  ModelOption,
  ProviderStatus,
  UsageBucket,
  UsageSnapshot
} from '../core/types.js';
import { RelayError, errorMessage } from '../core/errors.js';
import { runCommand } from '../services/command-runner.js';
import { resolveExecutable, type ExecutableResolution } from '../services/executable-resolver.js';
import { preferredUsageBucket } from '../services/usage-selection.js';
import { CodexAppServer } from './codex-app-server.js';

interface CodexThreadResult {
  thread: { id: string; sessionId?: string };
}

interface CodexModelList {
  data?: Array<{
    id?: string;
    model?: string;
    displayName?: string;
    description?: string;
    hidden?: boolean;
    isDefault?: boolean;
    defaultReasoningEffort?: string;
    supportedReasoningEfforts?: Array<{ reasoningEffort?: string; description?: string }>;
  }>;
}

interface CodexAccountResult {
  account?: {
    type?: string;
    email?: string | null;
    planType?: string | null;
  } | null;
}

export class CodexProvider implements AgentProvider {
  readonly id = 'codex' as const;
  private server: CodexAppServer | undefined;
  private serverPath: string | undefined;
  private cachedModels: ModelOption[] = [];
  private resolution: ExecutableResolution | undefined;
  private sandboxDialect: 'legacy-kebab' | 'modern-camel' | undefined;

  constructor(private readonly configuredExecutable: string) {}

  async detect(signal?: AbortSignal): Promise<ProviderStatus> {
    const detectStarted = Date.now();
    const resolveStarted = new Date().toISOString();
    const resolution = await this.resolveCommand(true);
    if (!resolution) return this.unavailableStatus('Codex CLI non trovata nel PATH dell’editor, nella login shell o nei percorsi comuni del sistema.');

    const versionStarted = Date.now();
    const version = await runCommand(resolution.path, ['--version'], {
      env: resolution.env,
      timeoutMs: 8000,
      ...(signal ? { signal } : {})
    }).catch(() => null);
    let models: ModelOption[] = [];
    let authenticated: boolean | undefined;
    let plan: string | undefined;
    let accountLabel: string | undefined;
    let detail: string | undefined;
    let launchDurationMs = 0;
    const launchStartedAt = new Date().toISOString();
    const abortServer = () => { void this.server?.dispose(); };
    signal?.addEventListener('abort', abortServer, { once: true });
    try {
      if (signal?.aborted) throw new RelayError('Codex detection cancelled.', 'RUN_CANCELLED');
      const launchStarted = Date.now();
      const server = await this.ensureServer(resolution);
      launchDurationMs = Date.now() - launchStarted;
      if (signal?.aborted) throw new RelayError('Codex detection cancelled.', 'RUN_CANCELLED');
      models = await this.listModels();
      const account = await server.request<CodexAccountResult>('account/read', { refreshToken: false }, 10_000);
      authenticated = Boolean(account?.account);
      plan = stringValue(account?.account?.planType);
      accountLabel = stringValue(account?.account?.email);
    } catch (error) {
      detail = errorMessage(error);
    } finally {
      signal?.removeEventListener('abort', abortServer);
    }

    const versionOk = Boolean(version && version.exitCode === 0 && version.stdout.trim());
    const launchOk = !detail;
    const modelsOk = models.length > 0;
    const authOk = authenticated !== false;
    // `--version` is diagnostic metadata. The app-server handshake, account
    // read and model inventory are the actual operational smoke test.
    const available = launchOk && modelsOk && authOk;
    const now = new Date().toISOString();
    return {
      id: this.id,
      label: 'Codex',
      available,
      operational: available,
      executable: resolution.path,
      configuredExecutable: this.configuredExecutable,
      resolutionSource: resolution.source,
      setupState: authenticated === false ? 'needs-login' : available ? 'ready' : 'degraded',
      installAvailable: true,
      ...(version?.stdout ? { version: version.stdout.trim() } : {}),
      ...(authenticated !== undefined ? { authenticated } : {}),
      ...(plan ? { plan } : {}),
      ...(accountLabel ? { accountLabel } : {}),
      ...(detail ? { detail } : !modelsOk ? { detail: 'Codex app-server è partito, ma non ha restituito modelli utilizzabili.' } : {}),
      models,
      lastCheckedAt: now,
      probes: [
        { id: 'resolve', ok: true, startedAt: resolveStarted, durationMs: 0, message: `Percorso risolto: ${resolution.path}` },
        { id: 'version', ok: versionOk, startedAt: new Date(versionStarted).toISOString(), durationMs: Date.now() - versionStarted, message: versionOk ? version!.stdout.trim() : 'Versione non leggibile; operatività verificata tramite app-server.', ...(version?.stderr ? { detail: version.stderr } : {}) },
        { id: 'launch', ok: launchOk, startedAt: launchStartedAt, durationMs: launchDurationMs || Date.now() - detectStarted, message: launchOk ? 'Codex app-server inizializzato.' : 'Codex app-server non avviabile.', ...(detail ? { detail } : {}) },
        { id: 'authentication', ok: authOk, startedAt: now, durationMs: 0, message: authenticated === false ? 'Accesso Codex richiesto.' : authenticated ? 'Account Codex disponibile.' : 'Stato account non determinato.' },
        { id: 'models', ok: modelsOk, startedAt: now, durationMs: 0, message: modelsOk ? `${models.length} modelli caricati.` : 'Nessun modello restituito da Codex.' },
        { id: 'smoke', ok: available, startedAt: now, durationMs: Date.now() - detectStarted, message: available ? 'Codex operativo.' : 'Codex installato ma non pienamente operativo.' }
      ],
      capabilities: {
        streaming: true,
        sessions: true,
        modelSelection: true,
        reasoningSelection: true,
        usageReporting: true,
        fileEditing: true,
        browser: false
      }
    };
  }

  async listModels(): Promise<ModelOption[]> {
    const server = await this.ensureServer(await this.requireResolution());
    const result = await server.request<CodexModelList>('model/list', {
      limit: 100,
      includeHidden: false
    });
    const models = (result.data ?? []).flatMap((model) => {
      const id = model.id ?? model.model;
      if (!id) return [];
      const reasoning = (model.supportedReasoningEfforts ?? []).flatMap((entry) =>
        entry.reasoningEffort
          ? [{
              id: entry.reasoningEffort,
              label: titleCase(entry.reasoningEffort),
              ...(entry.description ? { description: entry.description } : {})
            }]
          : []
      );
      return [{
        id,
        label: model.displayName ?? id,
        ...(model.description ? { description: model.description } : {}),
        ...(model.isDefault !== undefined ? { isDefault: model.isDefault } : {}),
        ...(model.hidden !== undefined ? { hidden: model.hidden } : {}),
        reasoning,
        ...(model.defaultReasoningEffort ? { defaultReasoning: model.defaultReasoningEffort } : {})
      } satisfies ModelOption];
    });
    this.cachedModels = models;
    return models;
  }

  async getUsage(): Promise<UsageSnapshot> {
    try {
      const server = await this.ensureServer(await this.requireResolution());
      const [limits, account, tokenUsage] = await Promise.all([
        server.request<Record<string, unknown>>('account/rateLimits/read', {}, 10_000),
        server.request<CodexAccountResult>('account/read', { refreshToken: false }, 10_000).catch((): CodexAccountResult => ({})),
        server.request<Record<string, unknown>>('account/usage/read', {}, 10_000).catch((): Record<string, unknown> => ({}))
      ]);
      const normalized = normalizeCodexUsage(limits);
      const tokenSummary = normalizeCodexTokenUsage(tokenUsage);
      const plan = stringValue(account.account?.planType) ?? normalized.plan;
      return {
        provider: this.id,
        available: Boolean(normalized.buckets?.length || normalized.remainingFraction !== undefined || normalized.usedFraction !== undefined),
        ...normalized,
        ...(plan ? { plan } : {}),
        ...(tokenSummary ? { tokenSummary } : {}),
        source: 'native-api',
        confidence: 'exact',
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        provider: this.id,
        available: false,
        detail: errorMessage(error),
        source: 'unavailable',
        confidence: 'unknown',
        updatedAt: new Date().toISOString()
      };
    }
  }

  async run(request: AgentRunRequest, onEvent: AgentEventHandler): Promise<AgentRunResult> {
    onEvent({ type: 'status', runId: request.runId, message: 'Connessione a Codex…', phase: 'connecting' });
    const server = await this.ensureServer(await this.requireResolution());

    let threadId = request.sessionId;
    onEvent({
      type: 'status',
      runId: request.runId,
      message: threadId ? 'Ripristino della sessione Codex…' : 'Creazione della sessione Codex…',
      phase: 'starting-session'
    });
    if (threadId) {
      await server.request('thread/resume', { threadId, cwd: request.cwd }, 20_000);
    } else {
      const result = await this.startThread(server, request);
      threadId = result.thread.id;
    }

    const prompt = request.rules ? `${request.rules}\n\n# Current task\n${request.prompt}` : request.prompt;
    let text = '';
    let latestDiff: string | undefined;
    let finalModel = request.model;
    let changedFiles: string[] | undefined;
    let turnId: string | undefined;

    return new Promise<AgentRunResult>((resolve, reject) => {
      let settled = false;
      let receivedUsefulEvent = false;
      let slowTimer: NodeJS.Timeout | undefined;
      let stalledTimer: NodeJS.Timeout | undefined;

      const clearWatchdogs = () => {
        if (slowTimer) clearTimeout(slowTimer);
        if (stalledTimer) clearTimeout(stalledTimer);
      };
      const markAlive = () => {
        if (receivedUsefulEvent) return;
        receivedUsefulEvent = true;
        clearWatchdogs();
        onEvent({ type: 'status', runId: request.runId, message: 'Codex sta lavorando…', phase: 'working' });
      };
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearWatchdogs();
        server.off('notification', notification);
        server.off('stderr', stderrListener);
        request.signal?.removeEventListener('abort', abort);
        callback();
      };
      const abort = () => {
        if (threadId && turnId) {
          void server.request('turn/interrupt', { threadId, turnId }, 10_000).catch(() => undefined);
        }
        finish(() => reject(new RelayError('Esecuzione Codex annullata.', 'RUN_CANCELLED')));
      };
      const stderrListener = (chunk: string) => {
        const detail = chunk.trim();
        if (detail) onEvent({ type: 'activity', runId: request.runId, title: 'Codex', detail: detail.slice(0, 1200) });
      };
      const notification = (method: string, rawParams: unknown) => {
        const params = rawParams as Record<string, any> | undefined;
        const eventThreadId = typeof params?.threadId === 'string' ? params.threadId : undefined;
        const eventTurnId = typeof params?.turnId === 'string'
          ? params.turnId
          : typeof params?.turn?.id === 'string'
            ? params.turn.id
            : undefined;
        if (eventThreadId && eventThreadId !== threadId) return;
        if (turnId && eventTurnId && eventTurnId !== turnId) return;

        if (method === 'turn/started') {
          if (eventTurnId) turnId = eventTurnId;
          onEvent({ type: 'status', runId: request.runId, message: 'Turno avviato. In attesa del primo output…', phase: 'waiting-first-output' });
        } else if (method === 'thread/status/changed') {
          const type = String(params?.status?.type ?? '');
          if (type === 'active') markAlive();
        } else if (method === 'item/agentMessage/delta') {
          markAlive();
          const delta = String(params?.delta ?? '');
          if (delta) {
            text += delta;
            onEvent({ type: 'delta', runId: request.runId, text: delta });
          }
        } else if (method === 'item/started') {
          markAlive();
          const item = params?.item;
          if (item?.type === 'commandExecution') {
            onEvent({ type: 'activity', runId: request.runId, title: 'Comando', detail: String(item.command ?? '') });
          } else if (item?.type === 'fileChange') {
            onEvent({ type: 'activity', runId: request.runId, title: 'Modifica dei file' });
          } else if (item?.type) {
            onEvent({ type: 'activity', runId: request.runId, title: humanizeItemType(String(item.type)) });
          }
        } else if (method === 'turn/diff/updated') {
          markAlive();
          latestDiff = typeof params?.diff === 'string' ? params.diff : latestDiff;
          if (latestDiff) onEvent({ type: 'diff', runId: request.runId, diff: latestDiff });
        } else if (method === 'item/completed') {
          markAlive();
          const item = params?.item;
          if (item?.type === 'agentMessage' && typeof item.text === 'string' && !text) text = item.text;
          if (item?.type === 'fileChange' && Array.isArray(item.changes)) {
            changedFiles = item.changes.map((change: { path?: string }) => change.path).filter(Boolean) as string[];
          }
        } else if (method === 'model/rerouted') {
          markAlive();
          finalModel = typeof params?.toModel === 'string' ? params.toModel : finalModel;
          onEvent({
            type: 'activity',
            runId: request.runId,
            title: 'Modello cambiato automaticamente',
            detail: `${params?.fromModel ?? ''} → ${params?.toModel ?? ''}`
          });
        } else if (method === 'turn/completed') {
          const turn = params?.turn;
          if (turn?.status === 'failed') {
            finish(() => reject(new RelayError(turn?.error?.message ?? 'Il turno Codex è fallito.', 'CODEX_TURN_FAILED', turn?.error)));
            return;
          }
          if (turn?.status === 'interrupted') {
            finish(() => reject(new RelayError('Esecuzione Codex interrotta.', 'RUN_CANCELLED')));
            return;
          }
          const result: AgentRunResult = {
            runId: request.runId,
            provider: this.id,
            text: text.trim() || 'Operazione completata senza un messaggio testuale.',
            sessionId: threadId,
            ...(finalModel ? { model: finalModel } : {}),
            ...(changedFiles ? { changedFiles } : {}),
            ...(latestDiff ? { diff: latestDiff } : {})
          };
          finish(() => {
            onEvent({ type: 'complete', runId: request.runId, result });
            resolve(result);
          });
        } else if (method === 'error') {
          const message = String(params?.error?.message ?? params?.message ?? 'Errore Codex.');
          finish(() => reject(new RelayError(message, 'CODEX_TURN_ERROR', params)));
        }
      };

      server.on('notification', notification);
      server.on('stderr', stderrListener);
      request.signal?.addEventListener('abort', abort, { once: true });
      if (request.signal?.aborted) {
        abort();
        return;
      }

      onEvent({ type: 'status', runId: request.runId, message: 'Avvio del turno Codex…', phase: 'starting-turn' });
      server.request<{ turn?: { id?: string } }>('turn/start', {
        threadId,
        input: [{ type: 'text', text: prompt }],
        cwd: request.cwd,
        approvalPolicy: 'never',
        // The sandbox is fixed when the thread is created. Omitting sandboxPolicy here
        // keeps compatibility with both 0.142.x and the newer v2 object schema.
        ...(request.model ? { model: request.model } : {}),
        ...(request.reasoning ? { effort: request.reasoning } : {}),
        summary: 'concise'
      }, 30_000).then((response) => {
        if (response.turn?.id) turnId = response.turn.id;
        onEvent({ type: 'status', runId: request.runId, message: 'In attesa del primo output…', phase: 'waiting-first-output' });
        slowTimer = setTimeout(() => {
          if (!receivedUsefulEvent && !settled) {
            onEvent({
              type: 'status',
              runId: request.runId,
              message: 'Codex sta impiegando più del previsto. La sessione è ancora attiva…',
              phase: 'waiting-first-output'
            });
          }
        }, 15_000);
        stalledTimer = setTimeout(() => {
          if (!receivedUsefulEvent && !settled) {
            if (threadId && turnId) void server.request('turn/interrupt', { threadId, turnId }, 10_000).catch(() => undefined);
            finish(() => reject(new RelayError(
              'Codex non ha prodotto eventi per due minuti. Esecuzione interrotta: apri Diagnostica per controllare App Server, modello e permessi.',
              'CODEX_FIRST_OUTPUT_TIMEOUT'
            )));
          }
        }, 120_000);
      }).catch((error) => finish(() => reject(error)));
    }).catch((error) => {
      onEvent({ type: 'error', runId: request.runId, message: errorMessage(error) });
      throw error;
    });
  }

  async dispose(): Promise<void> {
    await this.server?.dispose();
  }


  private async startThread(server: CodexAppServer, request: AgentRunRequest): Promise<CodexThreadResult> {
    const dialects: Array<'legacy-kebab' | 'modern-camel'> = this.sandboxDialect
      ? [this.sandboxDialect]
      : ['legacy-kebab', 'modern-camel'];
    let lastError: unknown;
    for (const dialect of dialects) {
      try {
        const result = await server.request<CodexThreadResult>('thread/start', {
          ...(request.model ? { model: request.model } : {}),
          cwd: request.cwd,
          approvalPolicy: 'never',
          sandbox: sandboxMode(request.permission, dialect),
          serviceName: 'relay_agent_workspace'
        }, 30_000);
        this.sandboxDialect = dialect;
        return result;
      } catch (error) {
        lastError = error;
        if (!isSandboxVariantError(error) || this.sandboxDialect) throw error;
      }
    }
    throw lastError;
  }

  private async resolveCommand(force = false): Promise<ExecutableResolution | undefined> {
    const resolution = await resolveExecutable(this.configuredExecutable, {
      force,
      extraCandidates: ['~/.local/bin/codex']
    });
    this.resolution = resolution;
    return resolution;
  }

  private async requireResolution(): Promise<ExecutableResolution> {
    const resolution = this.resolution ?? await this.resolveCommand();
    if (!resolution) throw new RelayError('Codex CLI non è installata o non è stato possibile risolverne il percorso.', 'CODEX_NOT_FOUND');
    return resolution;
  }

  private async ensureServer(resolution: ExecutableResolution): Promise<CodexAppServer> {
    if (!this.server || this.serverPath !== resolution.path) {
      await this.server?.dispose();
      this.server = new CodexAppServer(resolution.path, resolution.env);
      this.serverPath = resolution.path;
    }
    await this.server.start();
    return this.server;
  }

  private unavailableStatus(detail: string): ProviderStatus {
    return {
      id: this.id,
      label: 'Codex',
      available: false,
      executable: this.configuredExecutable,
      configuredExecutable: this.configuredExecutable,
      setupState: 'not-installed',
      installAvailable: true,
      detail,
      models: this.cachedModels,
      capabilities: {
        streaming: true,
        sessions: true,
        modelSelection: true,
        reasoningSelection: true,
        usageReporting: true,
        fileEditing: true,
        browser: false
      }
    };
  }
}

function sandboxMode(
  permission: AgentRunRequest['permission'],
  dialect: 'legacy-kebab' | 'modern-camel'
): string {
  if (dialect === 'legacy-kebab') return permission;
  if (permission === 'read-only') return 'readOnly';
  if (permission === 'workspace-write') return 'workspaceWrite';
  return 'dangerFullAccess';
}

function isSandboxVariantError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes('unknown variant') || message.includes('sandbox') && message.includes('expected one of');
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('-', ' ');
}

function humanizeItemType(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (character) => character.toUpperCase());
}


function normalizeCodexTokenUsage(response: Record<string, unknown>): UsageSnapshot['tokenSummary'] | undefined {
  const summary = objectValue(response.summary);
  if (!summary) return undefined;
  const lifetimeTokens = numberValue(summary.lifetimeTokens ?? summary.lifetime_tokens);
  const peakDailyTokens = numberValue(summary.peakDailyTokens ?? summary.peak_daily_tokens);
  const currentStreakDays = numberValue(summary.currentStreakDays ?? summary.current_streak_days);
  const longestRunningTurnSeconds = numberValue(summary.longestRunningTurnSec ?? summary.longest_running_turn_sec);
  if ([lifetimeTokens, peakDailyTokens, currentStreakDays, longestRunningTurnSeconds].every((value) => value === undefined)) return undefined;
  return {
    ...(lifetimeTokens !== undefined ? { lifetimeTokens } : {}),
    ...(peakDailyTokens !== undefined ? { peakDailyTokens } : {}),
    ...(currentStreakDays !== undefined ? { currentStreakDays } : {}),
    ...(longestRunningTurnSeconds !== undefined ? { longestRunningTurnSeconds } : {})
  };
}

export function normalizeCodexUsage(response: Record<string, unknown>): Partial<UsageSnapshot> {
  const rateLimitsById = objectValue(response.rateLimitsByLimitId);
  const buckets: UsageBucket[] = [];
  if (rateLimitsById) {
    for (const [id, raw] of Object.entries(rateLimitsById)) {
      const limit = objectValue(raw);
      if (!limit) continue;
      const primary = objectValue(limit.primary);
      const secondary = objectValue(limit.secondary);
      if (primary) buckets.push(toUsageBucket(id, stringValue(limit.limitName) ?? id, primary, Boolean(limit.rateLimitReachedType)));
      if (secondary) buckets.push(toUsageBucket(`${id}:secondary`, `${stringValue(limit.limitName) ?? id} · secondary`, secondary, Boolean(limit.rateLimitReachedType)));
    }
  }
  if (buckets.length === 0) {
    const fallback = objectValue(response.rateLimits);
    const primary = objectValue(fallback?.primary);
    const secondary = objectValue(fallback?.secondary);
    const id = stringValue(fallback?.limitId) ?? 'codex';
    const label = stringValue(fallback?.limitName) ?? 'Codex';
    if (primary) buckets.push(toUsageBucket(id, label, primary, Boolean(fallback?.rateLimitReachedType)));
    if (secondary) buckets.push(toUsageBucket(`${id}:secondary`, `${label} · secondary`, secondary, Boolean(fallback?.rateLimitReachedType)));
  }

  const mostUsed = preferredUsageBucket('codex', buckets);
  const resetCredits = objectValue(response.rateLimitResetCredits);
  const credits = numberValue(resetCredits?.availableCount);
  const plan = stringValue(objectValue(response.rateLimits)?.planType);

  return {
    ...(mostUsed?.remainingFraction !== undefined ? { remainingFraction: mostUsed.remainingFraction } : {}),
    ...(mostUsed?.usedFraction !== undefined ? { usedFraction: mostUsed.usedFraction } : {}),
    ...(mostUsed?.resetsAt ? { resetsAt: mostUsed.resetsAt } : {}),
    ...(buckets.length > 0 ? { buckets } : {}),
    ...(credits !== undefined ? { credits } : {}),
    ...(plan ? { plan } : {}),
    ...(buckets.length === 0 ? { detail: 'Codex ha restituito i limiti senza finestre riconoscibili.' } : {})
  };
}

function toUsageBucket(id: string, label: string, value: Record<string, unknown>, reached: boolean): UsageBucket {
  const usedPercent = numberValue(value.usedPercent ?? value.used_percent ?? value.percentUsed);
  const remainingPercent = numberValue(value.remainingPercent ?? value.remaining_percent ?? value.percentRemaining);
  const usedFraction = usedPercent !== undefined ? normalizePercent(usedPercent) : undefined;
  const remainingFraction = remainingPercent !== undefined
    ? normalizePercent(remainingPercent)
    : usedFraction !== undefined
      ? Math.max(0, 1 - usedFraction)
      : undefined;
  const resetsAt = isoTimestamp(value.resetsAt ?? value.resets_at ?? value.resetAt);
  const windowMinutes = numberValue(value.windowDurationMins ?? value.window_duration_mins);
  const kind = usageWindowKind(windowMinutes, label) ?? 'other';
  return {
    id,
    label: codexWindowLabel(kind, label),
    group: 'Codex',
    kind,
    ...(usedFraction !== undefined ? { usedFraction } : {}),
    ...(remainingFraction !== undefined ? { remainingFraction } : {}),
    ...(resetsAt ? { resetsAt } : {}),
    ...(windowMinutes !== undefined ? { windowMinutes } : {}),
    ...(reached ? { reached: true } : {})
  };
}


function codexWindowLabel(kind: UsageBucket['kind'], fallback: string): string {
  if (kind === 'five-hour') return '5 ore';
  if (kind === 'weekly') return 'Settimanale';
  if (kind === 'daily') return 'Giornaliero';
  if (kind === 'session') return 'Sessione';
  return fallback.replace(/\s*[·-]\s*secondary$/i, '').trim() || 'Limite';
}

function usageWindowKind(windowMinutes: number | undefined, label: string): UsageBucket['kind'] | undefined {
  if (/week/i.test(label) || (windowMinutes !== undefined && windowMinutes >= 6 * 24 * 60)) return 'weekly';
  if (/day/i.test(label) || (windowMinutes !== undefined && windowMinutes >= 20 * 60)) return 'daily';
  if (/five|5[- ]?hour/i.test(label) || (windowMinutes !== undefined && windowMinutes >= 240 && windowMinutes <= 420)) return 'five-hour';
  if (/session/i.test(label) || (windowMinutes !== undefined && windowMinutes > 0 && windowMinutes < 240)) return 'session';
  return 'other';
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizePercent(value: number): number {
  return Math.min(1, Math.max(0, value > 1 ? value / 100 : value));
}

function isoTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const timestamp = typeof value === 'number' && value < 10_000_000_000 ? value * 1000 : value;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
