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
import { preparePromptTransport } from '../services/prompt-transport.js';
import { classifyProviderFailure, providerFailureError } from '../services/provider-failure.js';
import { resolveExecutable, type ExecutableResolution } from '../services/executable-resolver.js';

const BASE_REASONING = [
  { id: 'low', label: 'Low', description: 'Rapido e parsimonioso per attività circoscritte.' },
  { id: 'medium', label: 'Medium', description: 'Riduce il consumo mantenendo una buona qualità.' },
  { id: 'high', label: 'High', description: 'Bilanciamento consigliato tra profondità e consumo.' },
  { id: 'xhigh', label: 'XHigh', description: 'Ragionamento più profondo, con maggiore uso della quota.' },
  { id: 'max', label: 'Max', description: 'Massima profondità disponibile per il modello.' }
];

export class ClaudeProvider implements AgentProvider {
  readonly id = 'claude' as const;
  private resolution: ExecutableResolution | undefined;
  private detectedVersion: string | undefined;
  private usageCache: { expiresAt: number; snapshot: UsageSnapshot } | undefined;
  private lastSuccessfulUsage: UsageSnapshot | undefined;

  constructor(private readonly configuredExecutable: string) {}

  async detect(signal?: AbortSignal): Promise<ProviderStatus> {
    const started = Date.now();
    const resolution = await this.resolveCommand(true);
    if (!resolution) return this.unavailableStatus('Claude Code CLI non trovata nel PATH dell’editor, nella login shell o nei percorsi comuni del sistema.');

    const [version, auth] = await Promise.all([
      runCommand(resolution.path, ['--version'], { env: resolution.env, timeoutMs: 8000, ...(signal ? { signal } : {}) }).catch(() => null),
      runCommand(resolution.path, ['auth', 'status'], { env: resolution.env, timeoutMs: 12_000, ...(signal ? { signal } : {}) }).catch(() => null)
    ]);

    this.detectedVersion = version?.exitCode === 0 ? version.stdout.trim() || undefined : undefined;
    let authenticated: boolean | undefined;
    let detail: string | undefined;
    let plan: string | undefined;
    let accountLabel: string | undefined;
    if (auth) {
      if (auth.exitCode === 0) authenticated = true;
      else if (auth.exitCode === 1) authenticated = false;
      const parsed = parseJsonObject(auth.stdout);
      plan = stringValue(parsed?.subscriptionType);
      accountLabel = stringValue(parsed?.email);
      if (auth.exitCode !== 0 && auth.stderr) detail = auth.stderr.trim();
    }
    const models = await this.listModels(signal);
    const versionOk = Boolean(version?.exitCode === 0 && this.detectedVersion);
    const authOk = authenticated !== false;
    const modelsOk = models.length > 0;
    const available = versionOk && authOk && modelsOk;
    const now = new Date().toISOString();

    return {
      id: this.id,
      label: 'Claude Code',
      available,
      operational: available,
      executable: resolution.path,
      configuredExecutable: this.configuredExecutable,
      resolutionSource: resolution.source,
      setupState: authenticated === false ? 'needs-login' : available ? 'ready' : 'degraded',
      installAvailable: true,
      ...(this.detectedVersion ? { version: this.detectedVersion } : {}),
      ...(authenticated !== undefined ? { authenticated } : {}),
      ...(plan ? { plan } : {}),
      ...(accountLabel ? { accountLabel } : {}),
      ...(detail ? { detail } : !versionOk ? { detail: 'Claude Code è stato rilevato, ma il comando --version non è eseguibile da Relay.' } : {}),
      models,
      lastCheckedAt: now,
      probes: [
        { id: 'resolve', ok: true, startedAt: new Date(started).toISOString(), durationMs: 0, message: `Percorso risolto: ${resolution.path}` },
        { id: 'version', ok: versionOk, startedAt: now, durationMs: 0, message: versionOk ? this.detectedVersion! : 'Versione non disponibile.', ...(version?.stderr ? { detail: version.stderr } : {}) },
        { id: 'launch', ok: versionOk, startedAt: now, durationMs: 0, message: versionOk ? 'CLI avviabile.' : 'CLI non avviabile.' },
        { id: 'authentication', ok: authOk, startedAt: now, durationMs: 0, message: authenticated === false ? 'Accesso richiesto.' : authenticated ? 'Account connesso.' : 'Stato account non determinato.', ...(auth?.stderr ? { detail: auth.stderr } : {}) },
        { id: 'models', ok: modelsOk, startedAt: now, durationMs: 0, message: `${models.length} modelli configurati.` },
        { id: 'smoke', ok: available, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, message: available ? 'Claude Code operativo.' : 'Claude Code non pienamente operativo.' }
      ],
      capabilities: this.capabilities()
    };
  }

  async listModels(_signal?: AbortSignal): Promise<ModelOption[]> {
    const reasoning = supportsUltracode(this.detectedVersion)
      ? [...BASE_REASONING, { id: 'ultracode', label: 'Ultracode', description: 'XHigh con orchestrazione dinamica dei workflow.' }]
      : BASE_REASONING;
    return [
      {
        id: 'sonnet',
        label: 'Sonnet',
        description: 'Scelta bilanciata per sviluppo quotidiano e sessioni lunghe.',
        family: 'Claude',
        isDefault: true,
        reasoning,
        defaultReasoning: 'high'
      },
      {
        id: 'opus',
        label: 'Opus',
        description: 'Per architettura, debugging complesso e decisioni ad alta ambiguità.',
        family: 'Claude',
        reasoning,
        defaultReasoning: 'high'
      },
      {
        id: 'haiku',
        label: 'Haiku',
        description: 'Più rapido per task semplici, ricerca e trasformazioni localizzate.',
        family: 'Claude',
        reasoning: BASE_REASONING.filter((option) => option.id !== 'xhigh' && option.id !== 'max'),
        defaultReasoning: 'medium'
      },
      {
        id: 'fable',
        label: 'Fable',
        description: 'Modello agentico recente, se disponibile sul piano e nell’organizzazione.',
        family: 'Claude',
        reasoning,
        defaultReasoning: 'high'
      }
    ];
  }

  async getUsage(): Promise<UsageSnapshot> {
    if (this.usageCache && this.usageCache.expiresAt > Date.now()) return structuredClone(this.usageCache.snapshot);
    let resolution = await this.resolveCommand();
    if (!resolution) return this.cacheUsage(this.usageFailure('Claude Code CLI non trovata.'), 20_000);

    const attempts = process.platform === 'darwin' ? 3 : 2;
    let lastError = 'Claude Code non ha restituito dati di utilizzo leggibili.';
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const result = await runCommand(
          resolution.path,
          ['-p', '/usage', '--output-format', 'json', '--permission-mode', 'plan'],
          { env: resolution.env, timeoutMs: 45_000 }
        );
        if (result.exitCode !== 0) {
          lastError = result.stderr || result.stdout || 'Il comando usage di Claude Code non è disponibile in modalità non interattiva.';
        } else {
          const parsedResult = parseClaudeJsonResult(result.stdout);
          const text = parsedResult.text || result.stdout;
          const parsed = parseClaudeUsageText(text);
          const available = Boolean(parsed.remainingFraction !== undefined || parsed.usedFraction !== undefined || parsed.buckets?.length);
          if (available) {
            const snapshot: UsageSnapshot = {
              provider: this.id,
              available: true,
              ...parsed,
              detail: text.trim().slice(0, 800),
              source: 'native-command',
              confidence: 'provider-reported',
              updatedAt: new Date().toISOString()
            };
            this.lastSuccessfulUsage = structuredClone(snapshot);
            return this.cacheUsage(snapshot, 10 * 60_000);
          }
          const subscription = parseClaudeSubscriptionUsage(text);
          if (subscription) {
            const snapshot: UsageSnapshot = {
              provider: this.id,
              available: true,
              ...subscription,
              detail: text.trim().slice(0, 800),
              source: 'provider-reported',
              confidence: 'provider-reported',
              updatedAt: new Date().toISOString()
            };
            this.lastSuccessfulUsage = structuredClone(snapshot);
            return this.cacheUsage(snapshot, 10 * 60_000);
          }
          lastError = text.trim() || 'Claude Code non ha restituito una percentuale strutturata.';
        }
      } catch (error) {
        lastError = errorMessage(error);
      }

      if (attempt + 1 < attempts) {
        this.usageCache = undefined;
        if (attempt === 0) resolution = await this.resolveCommand(true) ?? resolution;
        await delay(process.platform === 'darwin' ? 700 * (attempt + 1) : 450);
      }
    }
    return this.cacheUsage(this.usageFailure(lastError), this.lastSuccessfulUsage ? 30_000 : 20_000);
  }

  async run(request: AgentRunRequest, onEvent: AgentEventHandler): Promise<AgentRunResult> {
    const resolution = await this.requireResolution();
    const prompt = request.rules ? `${request.rules}\n\n# Current task\n${request.prompt}` : request.prompt;
    const transport = await preparePromptTransport({ provider: this.id, prompt, cwd: request.cwd, executable: resolution.path });
    const args = [
      ...transport.promptArgs,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode',
      permissionMode(request.permission)
    ];
    if (request.model) args.push('--model', request.model);
    if (request.reasoning) args.push('--effort', request.reasoning);
    if (request.sessionId) args.push('--resume', request.sessionId);
    const allowedMcpTools = selectedMcpToolPatterns(prompt);
    if (allowedMcpTools.length) args.push('--allowedTools', allowedMcpTools.join(' '));

    onEvent({ type: 'status', runId: request.runId, message: 'Avvio di Claude Code…', phase: 'starting-session' });
    let text = '';
    let sessionId = request.sessionId;
    let model = request.model;
    let usage: AgentRunResult['usage'];
    let emittedStreamingText = false;
    let firstEvent = false;
    const slowTimer = setTimeout(() => {
      if (!firstEvent) onEvent({ type: 'status', runId: request.runId, message: 'Claude Code è attivo. In attesa del primo evento…', phase: 'waiting-first-output' });
    }, 12_000);

    let terminalFailure: ReturnType<typeof classifyProviderFailure> | undefined;
    const runController = new AbortController();
    const abortFromCaller = () => runController.abort();
    request.signal?.addEventListener('abort', abortFromCaller, { once: true });
    let result;
    try {
      result = await runCommand(resolution.path, args, {
      env: resolution.env,
      cwd: request.cwd,
      signal: runController.signal,
      timeoutMs: 60 * 60 * 1000,
      ...(transport.stdin !== undefined ? { stdin: transport.stdin } : {}),
      onStdoutLine: (line) => {
        const event = parseJsonLine(line);
        if (!event) return;
        if (isTerminalClaudeRateLimitEvent(event)) {
          terminalFailure = classifyProviderFailure(this.id, JSON.stringify(event));
          onEvent({ type: 'status', runId: request.runId, message: terminalFailure.message, phase: 'rate-limited' });
          runController.abort();
          return;
        }
        if (!firstEvent) {
          firstEvent = true;
          clearTimeout(slowTimer);
          onEvent({ type: 'status', runId: request.runId, message: 'Claude Code sta lavorando…', phase: 'working' });
        }
        const delta = extractClaudeDelta(event);
        if (delta) {
          emittedStreamingText = true;
          text += delta;
          onEvent({ type: 'delta', runId: request.runId, text: delta });
        }
        const activity = extractClaudeActivity(event);
        if (activity) onEvent({ type: 'activity', runId: request.runId, ...activity });
        if (event.type === 'result') {
          const final = typeof event.result === 'string' ? event.result : '';
          if (!emittedStreamingText && final) {
            text = final;
            onEvent({ type: 'delta', runId: request.runId, text: final });
          }
          sessionId = stringValue(event.session_id) ?? sessionId;
          const modelUsage = firstObjectValue(event.modelUsage);
          model = stringValue(modelUsage?.model) ?? model;
          const inputTokens = numberValue(event.usage?.input_tokens ?? event.usage?.inputTokens);
          const outputTokens = numberValue(event.usage?.output_tokens ?? event.usage?.outputTokens);
          const costUsd = numberValue(event.total_cost_usd ?? event.cost_usd);
          usage = {
            ...(inputTokens !== undefined ? { inputTokens } : {}),
            ...(outputTokens !== undefined ? { outputTokens } : {}),
            ...(costUsd !== undefined ? { costUsd } : {})
          };
          onEvent({ type: 'usage', runId: request.runId, ...(usage as Record<string, number>) });
        }
      },
      onStderrLine: (line) => {
        const detail = line.trim();
        if (!detail) return;
        onEvent({ type: 'activity', runId: request.runId, title: 'Claude Code', detail });
        const stderrEvent = parseJsonLine(detail);
        if (stderrEvent?.type === 'rate_limit_event' && !isTerminalClaudeRateLimitEvent(stderrEvent)) return;
        const classified = classifyProviderFailure(this.id, detail);
        if (classified.category === 'permission-denied' || classified.category === 'rate-limit') {
          terminalFailure = classified;
          onEvent({ type: 'status', runId: request.runId, message: classified.message, phase: classified.category === 'rate-limit' ? 'rate-limited' : 'permission-denied' });
          runController.abort();
        }
      }
    });
    } catch (error) {
      if (terminalFailure) {
        onEvent({ type: 'error', runId: request.runId, message: terminalFailure.message, failure: terminalFailure });
        throw providerFailureError(this.id, terminalFailure.technicalDetail || terminalFailure.message);
      }
      throw error;
    } finally {
      request.signal?.removeEventListener('abort', abortFromCaller);
      clearTimeout(slowTimer);
      await transport.cleanup();
    }

    if (terminalFailure || result.exitCode !== 0) {
      const raw = terminalFailure?.technicalDetail || result.stderr || result.stdout || `Claude Code terminato con codice ${result.exitCode}.`;
      const failure = terminalFailure ?? classifyProviderFailure(this.id, raw);
      onEvent({ type: 'error', runId: request.runId, message: failure.message, failure });
      throw providerFailureError(this.id, raw);
    }

    if (!text) {
      const fallback = parseClaudeJsonResult(result.stdout);
      text = fallback.text || result.stdout;
      sessionId = fallback.sessionId ?? sessionId;
    }

    const runResult: AgentRunResult = {
      runId: request.runId,
      provider: this.id,
      text: text.trim() || 'Operazione completata senza un messaggio testuale.',
      ...(sessionId ? { sessionId } : {}),
      ...(model ? { model } : {}),
      ...(usage && Object.keys(usage).length > 0 ? { usage } : {})
    };
    onEvent({ type: 'complete', runId: request.runId, result: runResult });
    return runResult;
  }

  async dispose(): Promise<void> {}

  private cacheUsage(snapshot: UsageSnapshot, ttlMs: number): UsageSnapshot {
    this.usageCache = { expiresAt: Date.now() + ttlMs, snapshot: structuredClone(snapshot) };
    return snapshot;
  }

  private async resolveCommand(force = false): Promise<ExecutableResolution | undefined> {
    const resolution = await resolveExecutable(this.configuredExecutable, {
      force,
      extraCandidates: ['~/.local/bin/claude', '~/.claude/local/claude']
    });
    this.resolution = resolution;
    return resolution;
  }

  private async requireResolution(): Promise<ExecutableResolution> {
    const resolution = this.resolution ?? await this.resolveCommand();
    if (!resolution) throw new RelayError('Claude Code CLI non è installata o non è stato possibile risolverne il percorso.', 'CLAUDE_NOT_FOUND');
    return resolution;
  }

  private capabilities() {
    return {
      streaming: true,
      sessions: true,
      modelSelection: true,
      reasoningSelection: true,
      usageReporting: true,
      fileEditing: true,
      browser: true
    };
  }

  private unavailableStatus(detail: string): ProviderStatus {
    return {
      id: this.id,
      label: 'Claude Code',
      available: false,
      executable: this.configuredExecutable,
      configuredExecutable: this.configuredExecutable,
      setupState: 'not-installed',
      installAvailable: true,
      detail,
      models: [],
      capabilities: this.capabilities()
    };
  }

  private usageFailure(detail: string): UsageSnapshot {
    return fallbackClaudeUsage(this.lastSuccessfulUsage, detail);
  }
}

export function selectedMcpToolPatterns(prompt: string): string[] {
  return [...prompt.matchAll(/^## Selected MCP server:\s*([^\r\n]+)$/gim)]
    .map((match) => match[1]!.trim())
    .filter((name) => /^[a-zA-Z0-9._-]+$/.test(name))
    .map((name) => `mcp__${name}__*`);
}

export function isTerminalClaudeRateLimitEvent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, any>;
  if (event.type !== 'rate_limit_event') return false;
  const status = stringValue(event.rate_limit_info?.status ?? event.status)?.toLowerCase();
  return status === 'rejected';
}

export function fallbackClaudeUsage(previous: UsageSnapshot | undefined, detail: string, now = new Date().toISOString()): UsageSnapshot {
  if (previous?.available) {
    return {
      ...structuredClone(previous),
      available: true,
      stale: true,
      source: 'cache',
      updatedAt: now,
      lastSuccessfulAt: previous.lastSuccessfulAt ?? previous.updatedAt,
      lastError: detail,
      detail: 'Lettura quota temporaneamente non disponibile: mostro l’ultimo dato valido.'
    };
  }
  return {
    provider: 'claude',
    available: false,
    detail,
    source: 'unavailable',
    confidence: 'unknown',
    updatedAt: now,
    lastError: detail
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function permissionMode(permission: AgentRunRequest['permission']): string {
  if (permission === 'read-only') return 'plan';
  if (permission === 'danger-full-access') return 'bypassPermissions';
  return 'acceptEdits';
}

function supportsUltracode(version: string | undefined): boolean {
  const match = version?.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 203)));
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonLine(line: string): any | undefined {
  try { return JSON.parse(line); } catch { return undefined; }
}

function extractClaudeDelta(event: any): string {
  // With --include-partial-messages Claude emits both stream deltas and a later
  // assistant snapshot containing the full text. Consuming both duplicates the
  // response in Relay, so only incremental stream events are rendered here.
  if (event?.type === 'stream_event' && event.event?.type === 'content_block_delta') {
    return typeof event.event?.delta?.text === 'string' ? event.event.delta.text : '';
  }
  return '';
}

function extractClaudeActivity(event: any): { title: string; detail?: string } | undefined {
  const type = event?.type;
  if (type === 'system' && typeof event.subtype === 'string') return { title: humanize(event.subtype) };
  if (type === 'tool_use') return { title: String(event.name ?? 'Tool'), ...(event.input ? { detail: safeStringify(event.input) } : {}) };
  if (event?.event?.type === 'content_block_start' && event.event?.content_block?.type === 'tool_use') {
    return { title: String(event.event.content_block.name ?? 'Tool') };
  }
  return undefined;
}

function parseClaudeJsonResult(stdout: string): { text: string; sessionId?: string } {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) continue;
    const event = parseJsonLine(line);
    if (event?.type === 'result') {
      const sessionId = stringValue(event.session_id);
      return {
        text: typeof event.result === 'string' ? event.result : '',
        ...(sessionId ? { sessionId } : {})
      };
    }
  }
  return { text: stdout.trim() };
}

export function parseClaudeUsageText(text: string): Partial<UsageSnapshot> {
  const buckets: UsageBucket[] = [];
  const lines = text.split(/\r?\n/);
  let pendingLabel: { text: string; index: number; resetsAt?: string } | undefined;
  for (const [index, line] of lines.entries()) {
    const labelMatch = line.match(/(?:current\s+session|session|current\s+week|weekly|week|five[- ]hour|5[- ]hour|monthly|month|sonnet|opus|haiku|fable)[^|:–—%]*/i);
    if (labelMatch) {
      pendingLabel = { text: labelMatch[0], index, ...(parseUsageReset(line) ? { resetsAt: parseUsageReset(line) } : {}) };
    }
    const remaining = extractUsagePercent(line, 'remaining');
    const used = extractUsagePercent(line, 'used');
    if (remaining === undefined && used === undefined) continue;
    const bucketLabel = labelMatch?.[0] ?? pendingLabel?.text;
    if (!bucketLabel) continue;
    const remainingFraction = remaining ?? (used !== undefined ? Math.max(0, 1 - used) : undefined);
    const resetsAt = parseUsageReset(line) ?? pendingLabel?.resetsAt;
    const kind = usageKind(bucketLabel);
    buckets.push({
      id: `claude-${pendingLabel?.index ?? index}`,
      label: humanizeUsageLabel(bucketLabel),
      ...(kind ? { kind } : {}),
      ...(used !== undefined ? { usedFraction: used } : {}),
      ...(remainingFraction !== undefined ? { remainingFraction } : {}),
      ...(resetsAt ? { resetsAt } : {})
    });
    pendingLabel = undefined;
  }
  const remaining = extractUsagePercent(text, 'remaining');
  const used = extractUsagePercent(text, 'used');
  const constrained = [...buckets].sort((a, b) => (a.remainingFraction ?? 1) - (b.remainingFraction ?? 1))[0];
  const resetsAt = constrained?.resetsAt ?? parseUsageReset(text);
  return {
    ...(constrained?.remainingFraction !== undefined
      ? { remainingFraction: constrained.remainingFraction }
      : remaining !== undefined
        ? { remainingFraction: remaining }
        : used !== undefined
          ? { remainingFraction: Math.max(0, 1 - used) }
          : {}),
    ...(constrained?.usedFraction !== undefined ? { usedFraction: constrained.usedFraction } : used !== undefined ? { usedFraction: used } : {}),
    ...(resetsAt ? { resetsAt } : {}),
    ...(buckets.length ? { buckets } : {})
  };
}

export function parseClaudeSubscriptionUsage(text: string): Partial<UsageSnapshot> | undefined {
  const clean = text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  if (!/(subscription|abbonamento|plan|piano)/i.test(clean)) return undefined;
  const plan = extractClaudePlanLabel(clean);
  return {
    ...(plan ? { plan } : {}),
    lastError: 'Claude Code ha confermato l’account, ma non espone una quota numerica leggibile per questo piano.'
  };
}

function extractClaudePlanLabel(text: string): string | undefined {
  const explicit = text.match(/\b(?:subscriptionType|subscription_type|plan|piano)\s*[:=]\s*["']?([A-Za-z0-9 +._-]{2,40})["']?/i)?.[1]
    ?? text.match(/\b(?:subscription|abbonamento)\s+(?:type|tier)\s*[:=]\s*["']?([A-Za-z0-9 +._-]{2,40})["']?/i)?.[1];
  const cleaned = explicit
    ?.replace(/\b(?:usage|utilizzo|quota|account)\b.*$/i, '')
    .trim();
  return cleaned && !/\b(?:to power|using your|your claude code)\b/i.test(cleaned) ? cleaned : undefined;
}

function extractUsagePercent(text: string, kind: 'remaining' | 'used'): number | undefined {
  const words = kind === 'remaining'
    ? '(?:remaining|left|available|disponibile|residuo)'
    : '(?:used|utilizzato|consumato|spent)';
  const direct = text.match(new RegExp(`(\\d{1,3}(?:[.,]\\d+)?)\\s*%[^\\n]{0,80}${words}`, 'i'));
  const reverse = text.match(new RegExp(`${words}[^\\n]{0,80}(\\d{1,3}(?:[.,]\\d+)?)\\s*%`, 'i'));
  const value = direct?.[1] ?? reverse?.[1];
  if (!value) return undefined;
  return Math.min(1, Math.max(0, Number(value.replace(',', '.')) / 100));
}

function parseUsageReset(text: string): string | undefined {
  const relative = text.replace(/,/g, ' ').match(/(?:reset(?:s)?|refresh(?:es)?|fully refresh(?:es)?|ripristino)(?:\s+in|\s+tra)?\s*(?:(\d+)\s*d(?:ays?|giorni?)?)?\s*(?:(\d+)\s*h(?:ours?|ore?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?|minuti?)?)?/i);
  if (relative?.slice(1).some(Boolean)) {
    const milliseconds = (Number(relative[1] ?? 0) * 86_400 + Number(relative[2] ?? 0) * 3_600 + Number(relative[3] ?? 0) * 60) * 1000;
    return new Date(Date.now() + milliseconds).toISOString();
  }
  return undefined;
}


function usageKind(value: string): UsageBucket['kind'] {
  if (/session|five[- ]hour|5[- ]hour/i.test(value)) return 'session';
  if (/week/i.test(value)) return 'weekly';
  if (/day/i.test(value)) return 'daily';
  return 'other';
}

function humanizeUsageLabel(value: string): string {
  return value.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (character) => character.toUpperCase());
}

function firstObjectValue(value: unknown): Record<string, any> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return Object.values(value as Record<string, unknown>).find((entry) => entry && typeof entry === 'object') as Record<string, any> | undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());
}

function safeStringify(value: unknown): string {
  try { return JSON.stringify(value).slice(0, 1200); } catch { return String(value); }
}
