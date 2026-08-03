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
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runCommand } from '../services/command-runner.js';
import { preparePromptTransport } from '../services/prompt-transport.js';
import { classifyProviderFailure } from '../services/provider-failure.js';
import { resolveExecutable, type ExecutableResolution } from '../services/executable-resolver.js';
import { readAntigravityLocalUsage } from '../services/antigravity-local-usage.js';
import { preferredUsageBucket } from '../services/usage-selection.js';

const FALLBACK_MODELS: ModelOption[] = [
  { id: 'auto', label: 'Automatico', description: 'Lascia ad Antigravity la scelta del modello.', isDefault: true, reasoning: [] },
  { id: 'Gemini 3.5 Flash (Low)', label: 'Gemini 3.5 Flash · Low', description: 'Rapido e adatto ai task più semplici.', family: 'Gemini', reasoning: [] },
  { id: 'Gemini 3.5 Flash (Medium)', label: 'Gemini 3.5 Flash · Medium', description: 'Equilibrio tra velocità e qualità.', family: 'Gemini', reasoning: [] },
  { id: 'Gemini 3.5 Flash (High)', label: 'Gemini 3.5 Flash · High', description: 'Maggiore ragionamento sul modello Flash.', family: 'Gemini', reasoning: [] },
  { id: 'Gemini 3.1 Pro (Low)', label: 'Gemini 3.1 Pro · Low', description: 'Pro con ragionamento contenuto.', family: 'Gemini', reasoning: [] },
  { id: 'Gemini 3.1 Pro (High)', label: 'Gemini 3.1 Pro · High', description: 'Pro per task complessi e sessioni agentiche.', family: 'Gemini', reasoning: [] },
  { id: 'Claude Sonnet 4.6 (Thinking)', label: 'Claude Sonnet 4.6 · Thinking', family: 'Claude and GPT', reasoning: [] },
  { id: 'Claude Opus 4.6 (Thinking)', label: 'Claude Opus 4.6 · Thinking', family: 'Claude and GPT', reasoning: [] },
  { id: 'GPT-OSS 120B (Medium)', label: 'GPT-OSS 120B · Medium', family: 'Claude and GPT', reasoning: [] }
];

export class AntigravityProvider implements AgentProvider {
  readonly id = 'antigravity' as const;
  private models = FALLBACK_MODELS;
  private resolution: ExecutableResolution | undefined;
  private permissionWrite = Promise.resolve();

  constructor(
    private readonly configuredExecutable: string,
    private readonly usageCachePath?: string,
    private readonly configuredPermissionRules: string[] = []
  ) {}

  async detect(signal?: AbortSignal): Promise<ProviderStatus> {
    const started = Date.now();
    const resolution = await this.resolveCommand(true);
    if (!resolution) {
      return {
        id: this.id,
        label: 'Antigravity',
        available: false,
        operational: false,
        healthState: 'not-installed',
        cliAvailable: false,
        executable: this.configuredExecutable,
        configuredExecutable: this.configuredExecutable,
        setupState: 'not-installed',
        installAvailable: true,
        detail: 'AGY CLI non rilevata.',
        models: [],
        lastCheckedAt: new Date().toISOString(),
        probes: [{ id: 'resolve', ok: false, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, message: 'AGY CLI non rilevata.' }],
        capabilities: this.capabilities(false)
      };
    }

    const [version, modelsProbe] = await Promise.all([
      resolution
        ? runCommand(resolution.path, ['--version'], { env: resolution.env, timeoutMs: 8000, ...(signal ? { signal } : {}) }).catch(() => null)
        : Promise.resolve(null),
      resolution
        ? runCommand(resolution.path, ['models'], { env: resolution.env, timeoutMs: 15_000, ...(signal ? { signal } : {}) }).catch(() => null)
        : Promise.resolve(null)
    ]);
    const authentication = parseAntigravityAuthentication(modelsProbe);
    const discovered = modelsProbe?.exitCode === 0 ? parseAntigravityModels(modelsProbe.stdout) : [];
    if (discovered.length) this.models = mergeModels(FALLBACK_MODELS, discovered);
    const models = discovered.length ? this.models : FALLBACK_MODELS;
    const versionOk = Boolean(resolution && version?.exitCode === 0 && version.stdout.trim());
    const launchOk = Boolean(resolution && versionOk);
    const authOk = authentication.authenticated !== false;
    const modelsOk = Boolean(modelsProbe?.exitCode === 0 && models.length > 0);
    const available = launchOk && authOk;
    const baseDetail = modelsOk ? 'AGY CLI operativa.' : 'AGY CLI operativa; inventario modelli non disponibile, uso dei modelli fallback.';
    const detail = authentication.authenticated === false
      ? `${baseDetail} La CLI richiede di completare l’accesso.`
      : !resolution
        ? 'AGY CLI non disponibile.'
        : !versionOk
          ? `${baseDetail} Relay non riesce ad avviare AGY CLI.`
          : !modelsOk
            ? `${baseDetail} Il comando modelli non ha restituito un inventario utilizzabile.`
            : baseDetail;
    const now = new Date().toISOString();

    return {
      id: this.id,
      label: 'Antigravity',
      available,
      operational: available,
      cliAvailable: Boolean(resolution),
      executable: resolution?.path ?? this.configuredExecutable,
      configuredExecutable: this.configuredExecutable,
      ...(resolution ? { resolutionSource: resolution.source } : {}),
      setupState: authentication.authenticated === false ? 'needs-login' : available ? 'ready' : 'degraded',
      installAvailable: true,
      ...(version?.stdout ? { version: version.stdout.trim() } : {}),
      ...(authentication.authenticated !== undefined ? { authenticated: authentication.authenticated } : {}),
      detail,
      models,
      lastCheckedAt: now,
      probes: [
        { id: 'resolve', ok: Boolean(resolution), startedAt: new Date(started).toISOString(), durationMs: 0, message: resolution ? `Percorso risolto: ${resolution.path}` : 'AGY CLI non risolta.' },
        { id: 'version', ok: versionOk, startedAt: now, durationMs: 0, message: versionOk ? version!.stdout.trim() : 'Versione AGY non disponibile.', ...(version?.stderr ? { detail: version.stderr } : {}) },
        { id: 'launch', ok: launchOk, startedAt: now, durationMs: 0, message: launchOk ? 'AGY CLI avviabile.' : 'AGY CLI non avviabile.' },
        { id: 'authentication', ok: authOk, startedAt: now, durationMs: 0, message: authentication.authenticated === false ? 'Accesso richiesto.' : authentication.authenticated ? 'Account disponibile.' : 'Stato account non determinato.' },
        { id: 'models', ok: modelsOk, startedAt: now, durationMs: 0, message: modelsOk ? `${models.length} modelli caricati.` : 'Nessun modello restituito da AGY.', ...(modelsProbe?.stderr ? { detail: modelsProbe.stderr } : {}) },
        { id: 'smoke', ok: available, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, message: available ? 'Antigravity operativo via AGY CLI.' : 'Antigravity non pienamente operativo.' }
      ],
      capabilities: this.capabilities(Boolean(resolution))
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelOption[]> {
    const resolution = this.resolution ?? await this.resolveCommand();
    if (!resolution) return this.models;
    try {
      const result = await runCommand(resolution.path, ['models'], {
        env: resolution.env,
        timeoutMs: 8_000,
        ...(signal ? { signal } : {})
      });
      if (result.exitCode !== 0) return this.models;
      const discovered = stripAnsi(result.stdout)
        .split(/\r?\n/)
        .map((line) => line.replace(/^[\s*•>-]+/, '').trim())
        .filter((line) => /^(Gemini|Claude|GPT)/i.test(line))
        .map((label) => ({
          id: label,
          label: prettifyModelLabel(label),
          family: modelFamily(label),
          reasoning: []
        } satisfies ModelOption));
      if (discovered.length) this.models = mergeModels(this.models, discovered);
    } catch {
      // Discovery must never block startup.
    }
    return this.models;
  }

  async getUsage(): Promise<UsageSnapshot> {
    const candidates: UsageSnapshot[] = [];
    let lastError = '';

    // The local language server can expose the same grouped windows shown in
    // Settings > Models. It is private and changes between builds, so Relay
    // probes summary, model-config and legacy endpoints and merges what exists.
    try {
      const local = await readAntigravityLocalUsage();
      if (local?.buckets?.length) {
        const updatedAt = new Date().toISOString();
        candidates.push({
          provider: this.id,
          available: true,
          ...local,
          source: 'native-api',
          confidence: 'provider-reported',
          updatedAt,
          lastSuccessfulAt: updatedAt
        });
      }
    } catch (error) {
      lastError = errorMessage(error);
    }

    let cachedModel: string | undefined;
    if (this.usageCachePath) {
      try {
        const cached = JSON.parse(await readFile(this.usageCachePath, 'utf8')) as Record<string, unknown>;
        cachedModel = typeof cached.model === 'string'
          ? cached.model
          : cached.model && typeof cached.model === 'object' && typeof (cached.model as Record<string, unknown>).name === 'string'
            ? String((cached.model as Record<string, unknown>).name)
            : undefined;
        const parsed = parseAntigravityStatusline(cached);
        if (parsed.buckets?.length || parsed.remainingFraction !== undefined) {
          const updatedAt = typeof cached.updatedAt === 'string' ? cached.updatedAt : new Date().toISOString();
          candidates.push({
            provider: this.id,
            available: true,
            ...parsed,
            source: 'native-statusline',
            confidence: 'provider-reported',
            updatedAt,
            lastSuccessfulAt: updatedAt,
            ...(Date.now() - Date.parse(updatedAt) >= 2 * 60_000 ? { stale: true } : {})
          });
        }
      } catch {
        // Optional bridge without a payload yet.
      }
    }

    // Only invoke the CLI fallback when local/cache sources do not already cover
    // the four expected group/window pairs. This avoids unnecessary agent work.
    const partial = mergeAntigravityUsageSnapshots(candidates);
    const resolution = this.resolution ?? await this.resolveCommand();
    if (resolution && antigravityCoverage(partial?.buckets ?? []) < 4) {
      try {
        const result = await runCommand(resolution.path, ['--mode=plan', '--print-timeout=25s', '-p', '/usage'], {
          env: {
            ...resolution.env,
            LINES: '120',
            COLUMNS: '200',
            TERM: resolution.env.TERM || 'xterm-256color',
            NO_COLOR: '1'
          },
          timeoutMs: 30_000
        });
        const output = stripAnsi([result.stdout, result.stderr].filter(Boolean).join('\n')).trim();
        const parsed = parseAntigravityUsage(output, cachedModel);
        if (parsed.buckets?.length || parsed.remainingFraction !== undefined) {
          const updatedAt = new Date().toISOString();
          candidates.push({
            provider: this.id,
            available: true,
            ...parsed,
            source: 'native-command',
            confidence: 'provider-reported',
            updatedAt,
            lastSuccessfulAt: updatedAt
          });
        } else if (output) {
          lastError = output.slice(0, 900);
        }
      } catch (error) {
        lastError = errorMessage(error);
      }
    }

    const merged = mergeAntigravityUsageSnapshots(candidates);
    if (merged) return lastError ? { ...merged, lastError } : merged;
    return this.unavailableUsage(lastError || 'Utilizzo live non ancora disponibile. Relay non ha trovato quote strutturate nel language server, nella status line o nel comando /usage.');
  }

  async run(request: AgentRunRequest, onEvent: AgentEventHandler): Promise<AgentRunResult> {
    const resolution = await this.requireResolution();
    const conversational = isConversationalAntigravityPrompt(request.prompt);
    const permissionRules = antigravityPermissionRules(
      request.cwd,
      conversational ? 'read-only' : request.permission,
      this.configuredPermissionRules
    );
    this.permissionWrite = this.permissionWrite.catch(() => undefined).then(() => mergeAntigravityPermissionRules(
      join(homedir(), '.gemini', 'antigravity-cli', 'settings.json'),
      permissionRules
    ));
    await this.permissionWrite;

    const relayContext = [
      '# Relay execution context',
      `Workspace root: ${request.cwd}`,
      'Operate inside this workspace. Do not create or use ~/.gemini/antigravity-cli/scratch unless the user explicitly asks for a scratch project.',
      'For every file, directory, or search tool, use the exact workspace root above or one of its descendants. Never search or read a parent directory.',
      'Do not invoke Codex or Claude CLI directly. When another provider is needed, use the Relay delegation protocol included in the prompt.',
    ].filter(Boolean).join('\n');
    const task = conversational
      ? ['Answer this conversational message directly. Do not inspect the workspace and do not use tools or commands.', request.prompt].join('\n\n')
      : [relayContext, request.rules, '# Current task', request.prompt].filter(Boolean).join('\n\n');

    const transport = await preparePromptTransport({ provider: this.id, prompt: task, cwd: request.cwd, executable: resolution.path });

    const buildArgs = () => {
      const args = [...antigravityWorkspaceArgs(request.cwd), ...transport.additionalArgs, '--output-format', 'stream-json', '--print-timeout=30m'];
      if (request.model && request.model !== 'auto') args.push('--model', request.model);
      args.push(...transport.promptArgs);
      return args;
    };

    onEvent({ type: 'status', runId: request.runId, message: 'Avvio di Antigravity…', phase: 'starting-session' });
    const startedAt = Date.now();
    let text = '';
    let terminalStatus: string | undefined;
    let lastToolError: string | undefined;
    let firstLine = false;
    let attempt = 0;
    const heartbeat = setInterval(() => {
      if (firstLine) return;
      const seconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      onEvent({
        type: 'status',
        runId: request.runId,
        message: `Antigravity è attivo, in attesa del primo output · ${seconds}s`,
        phase: 'waiting-first-output'
      });
    }, 8_000);

    try {
      while (attempt < 2) {
        attempt += 1;
        text = '';
        terminalStatus = undefined;
        lastToolError = undefined;
        firstLine = false;
        const result = await runCommand(resolution.path, buildArgs(), {
          env: resolution.env,
          cwd: request.cwd,
          ...(request.signal ? { signal: request.signal } : {}),
          timeoutMs: 45 * 60 * 1000,
          ...(transport.stdin !== undefined ? { stdin: transport.stdin } : {}),
          onStdoutLine: (line) => {
            const event = parseAntigravityStreamEvent(line);
            if (!firstLine) {
              firstLine = true;
              onEvent({
                type: 'status',
                runId: request.runId,
                message: 'Antigravity sta lavorando…',
                phase: 'working'
              });
            }
            if (event.activity) onEvent({ type: 'activity', runId: request.runId, title: event.activity.title, detail: event.activity.detail });
            if (event.status) onEvent({ type: 'status', runId: request.runId, message: event.status, phase: 'working' });
            if (event.toolState === 'error') lastToolError = event.error ?? event.status;
            else if (event.toolState === 'done') lastToolError = undefined;
            if (event.terminalStatus) terminalStatus = event.terminalStatus;
            if (event.final && event.text) {
              text = event.text;
              onEvent({ type: 'replace', runId: request.runId, text });
            } else if (event.text) {
              text += event.text;
              onEvent({ type: 'delta', runId: request.runId, text: event.text });
            }
          },
          onStderrLine: (line) => {
            const detail = line.trim();
            if (detail) onEvent({ type: 'activity', runId: request.runId, title: 'Antigravity CLI', detail });
          }
        });

        const combined = stripAnsi([result.stderr, result.stdout].filter(Boolean).join('\n')).trim();
        const transientTimeout = /timeout waiting for response|deadline exceeded|temporar(?:y|ily) unavailable/i.test(combined);
        // AGY marks the envelope ERROR when an early tool call fails even if the
        // agent recovers and a later tool completes the requested task.
        const completed = !terminalStatus || terminalStatus.toUpperCase() === 'SUCCESS'
          || (terminalStatus.toUpperCase() === 'ERROR' && !lastToolError);
        if (result.exitCode === 0 && completed && text.trim() && !lastToolError) {
          const runResult: AgentRunResult = {
            runId: request.runId,
            provider: this.id,
            text: text.trim(),
            ...(request.model ? { model: request.model } : {})
          };
          onEvent({ type: 'complete', runId: request.runId, result: runResult });
          return runResult;
        }
        if (isAntigravityHeadlessPermission(combined)) {
          const failure = {
            provider: this.id,
            category: 'permission-denied' as const,
            message: 'Antigravity non ha prodotto una risposta perché una specifica operazione è stata negata dalla policy headless. Il provider resta disponibile.',
            technicalDetail: combined.slice(-8_000),
            retryable: false,
            suggestedActions: ['review-permissions' as const, 'continue-other-provider' as const, 'copy-diagnostics' as const]
          };
          onEvent({ type: 'error', runId: request.runId, message: failure.message, failure });
          throw new RelayError(failure.message, 'PROVIDER_PERMISSION_DENIED', combined, failure);
        }
        if (lastToolError) {
          const failure = classifyProviderFailure(this.id, lastToolError);
          onEvent({ type: 'error', runId: request.runId, message: failure.message, failure });
          throw new RelayError(failure.message, 'ANTIGRAVITY_TOOL_ERROR', lastToolError, failure);
        }
        if (attempt < 2 && transientTimeout && !text.trim()) {
          onEvent({
            type: 'activity',
            runId: request.runId,
            title: 'Retry Antigravity',
            detail: 'Il backend non ha risposto al primo tentativo. Relay riprova una sola volta nello stesso workspace.'
          });
          continue;
        }
        const raw = combined || `Antigravity terminato con codice ${result.exitCode}.`;
        const failure = classifyProviderFailure(this.id, raw);
        onEvent({ type: 'error', runId: request.runId, message: failure.message, failure });
        throw new RelayError(failure.message, `PROVIDER_${failure.category.toUpperCase().replaceAll('-', '_')}`, raw, failure);
      }
      throw new RelayError('Antigravity non ha restituito una risposta.', 'ANTIGRAVITY_EMPTY_RESPONSE');
    } finally {
      clearInterval(heartbeat);
      await transport.cleanup();
    }
  }

  async dispose(): Promise<void> {}

  private async resolveCommand(force = false): Promise<ExecutableResolution | undefined> {
    const resolution = await resolveExecutable(this.configuredExecutable, {
      force,
      extraCandidates: ['~/.local/bin/agy']
    });
    this.resolution = resolution;
    return resolution;
  }

  private async requireResolution(): Promise<ExecutableResolution> {
    const resolution = this.resolution ?? await this.resolveCommand();
    if (!resolution) throw new RelayError('Antigravity CLI non è installata o non è stato possibile risolverne il percorso.', 'ANTIGRAVITY_NOT_FOUND');
    return resolution;
  }

  private capabilities(cliAvailable = true) {
    return {
      streaming: true,
      sessions: false,
      modelSelection: cliAvailable,
      reasoningSelection: false,
      usageReporting: cliAvailable,
      fileEditing: cliAvailable,
      browser: false
    };
  }

  private unavailableUsage(detail: string): UsageSnapshot {
    return {
      provider: this.id,
      available: false,
      detail,
      source: 'unavailable',
      confidence: 'unknown',
      updatedAt: new Date().toISOString(),
      lastError: detail
    };
  }
}

function isAntigravityHeadlessPermission(raw: string): boolean {
  return /(?:permission|autorizzazione).*(?:command|comando)|headless.*(?:permission|autorizzazione)|auto-denied|command permission/i.test(raw);
}

export function antigravityWorkspaceArgs(cwd: string): string[] {
  // AGY does not infer its active workspace from the child process cwd.
  // Without --add-dir, headless file tools request permission outside the project.
  return ['--add-dir', resolve(cwd)];
}

export function antigravityPermissionRules(
  cwd: string,
  permission: AgentRunRequest['permission'],
  configured: string[] = []
): string[] {
  const workspaceRule = permission === 'read-only' ? [] : [`write_file(${resolve(cwd)})`];
  return [...new Set([...configured.map((rule) => rule.trim()).filter(Boolean), ...workspaceRule])];
}

export async function mergeAntigravityPermissionRules(path: string, required: string[]): Promise<void> {
  if (!required.length) return;
  const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '{}' : Promise.reject(error));
  let settings: Record<string, unknown>;
  try {
    settings = raw.trim() ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    throw new RelayError(`Configurazione Antigravity non valida: ${path}`, 'ANTIGRAVITY_SETTINGS_INVALID');
  }
  const permissions = settings.permissions && typeof settings.permissions === 'object'
    ? settings.permissions as Record<string, unknown>
    : {};
  const current = Array.isArray(permissions.allow)
    ? permissions.allow.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const allow = [...new Set([...current, ...required])];
  if (allow.length === current.length) return;
  settings.permissions = { ...permissions, allow };
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export function isConversationalAntigravityPrompt(prompt: string): boolean {
  const value = prompt.trim();
  if (!value || value.length > 160 || /[`{}[\]<>/\\]|https?:\/\//i.test(value)) return false;
  return /^(?:ciao|salve|buongiorno|buonasera|hey|hello|hi|grazie|thanks|come stai|chi sei|come ti chiami)[\s!?.,]*$/i.test(value);
}

export function mergeAntigravityUsageSnapshots(snapshots: UsageSnapshot[]): UsageSnapshot | undefined {
  const usable = snapshots.filter((snapshot) => snapshot.buckets?.length || snapshot.remainingFraction !== undefined);
  if (!usable.length) return undefined;
  const selected = new Map<string, UsageBucket>();
  for (const snapshot of usable) {
    for (const bucket of snapshot.buckets ?? []) {
      const key = `${bucket.group ?? 'other'}:${bucket.kind ?? 'other'}`;
      const current = selected.get(key);
      if (!current) {
        selected.set(key, { ...bucket, id: `${slug(bucket.group ?? 'quota')}-${bucket.kind ?? 'other'}` });
        continue;
      }
      // Source order is intentional: local summary first, then status line, then
      // CLI. Later sources only enrich missing reset/absolute fields.
      selected.set(key, {
        ...current,
        ...((current.remainingFraction === undefined && bucket.remainingFraction !== undefined) ? { remainingFraction: bucket.remainingFraction } : {}),
        ...((current.usedFraction === undefined && bucket.usedFraction !== undefined) ? { usedFraction: bucket.usedFraction } : {}),
        ...((current.used === undefined && bucket.used !== undefined) ? { used: bucket.used } : {}),
        ...((current.limit === undefined && bucket.limit !== undefined) ? { limit: bucket.limit } : {}),
        ...(!current.resetsAt && bucket.resetsAt ? { resetsAt: bucket.resetsAt } : {})
      });
    }
  }
  const buckets = [...selected.values()].sort((a, b) => antigravityGroupOrder(a) - antigravityGroupOrder(b) || antigravityKindOrder(a) - antigravityKindOrder(b));
  const constrained = preferredUsageBucket('antigravity', buckets);
  const latest = [...usable].sort((a, b) => Date.parse(b.lastSuccessfulAt ?? b.updatedAt) - Date.parse(a.lastSuccessfulAt ?? a.updatedAt))[0]!;
  const details = [...new Set(usable.map((snapshot) => snapshot.detail).filter((value): value is string => Boolean(value)))];
  return {
    provider: 'antigravity',
    available: true,
    buckets,
    ...(constrained?.remainingFraction !== undefined ? { remainingFraction: constrained.remainingFraction, usedFraction: 1 - constrained.remainingFraction } : {}),
    ...(constrained?.resetsAt ? { resetsAt: constrained.resetsAt } : {}),
    ...(usable.map((snapshot) => snapshot.plan).find(Boolean) ? { plan: usable.map((snapshot) => snapshot.plan).find(Boolean) } : {}),
    detail: details.length ? details.join(' · ') : `Quote Antigravity aggregate da ${usable.length} sorgenti locali.`,
    source: usable.length > 1 ? 'provider-merged' : latest.source,
    confidence: 'provider-reported',
    updatedAt: latest.updatedAt,
    lastSuccessfulAt: latest.lastSuccessfulAt ?? latest.updatedAt,
    stale: usable.every((snapshot) => snapshot.stale === true)
  };
}

function antigravityCoverage(buckets: UsageBucket[]): number {
  return new Set(buckets.map((bucket) => `${bucket.group ?? 'other'}:${bucket.kind ?? 'other'}`)).size;
}
function antigravityGroupOrder(bucket: UsageBucket): number { return bucket.group === 'Gemini' ? 0 : bucket.group === 'Claude e GPT' ? 1 : 2; }
function antigravityKindOrder(bucket: UsageBucket): number { return bucket.kind === 'weekly' ? 0 : bucket.kind === 'five-hour' || bucket.kind === 'session' ? 1 : 2; }

function parseAntigravityModels(output: string): ModelOption[] {
  return stripAnsi(output)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s*•>-]+/, '').trim())
    .filter((line) => /^(Gemini|Claude|GPT)/i.test(line))
    .map((label) => ({ id: label, label: prettifyModelLabel(label), family: modelFamily(label), reasoning: [] }));
}

function mergeModels(current: ModelOption[], discovered: ModelOption[]): ModelOption[] {
  const byLabel = new Map<string, ModelOption>();
  for (const model of [...current, ...discovered]) byLabel.set(model.label.toLowerCase(), model);
  const automatic = current.find((model) => model.id === 'auto') ?? FALLBACK_MODELS[0]!;
  return [automatic, ...[...byLabel.values()].filter((model) => model.id !== 'auto')];
}

function prettifyModelLabel(value: string): string {
  return value.replace(/\((Low|Medium|High|Thinking)\)/i, '· $1').replace(/\s+/g, ' ').trim();
}

function modelFamily(value: string): string {
  if (/^Gemini/i.test(value)) return 'Gemini';
  if (/^(Claude|GPT)/i.test(value)) return 'Claude and GPT';
  return 'Other';
}

export function parseAntigravityUsage(rawText: string, activeModel?: string): Partial<UsageSnapshot> {
  const text = stripAnsi(rawText).replace(/\r/g, '');
  const lines = text
    .split('\n')
    .map((line) => line.trim().replace(/^[#>*•-]+\s*/, ''))
    .filter(Boolean);
  const buckets: UsageBucket[] = [];

  let group: string | undefined;
  let windowKind: UsageBucket['kind'];
  let windowLabel: string | undefined;
  let context: string[] = [];
  let barCandidate: number | undefined;
  let explicitRemaining: number | undefined;

  const finishWindow = () => {
    if (!group || !windowKind || !windowLabel) {
      context = [];
      barCandidate = undefined;
      explicitRemaining = undefined;
      return;
    }
    const joined = context.join(' ');
    const remainingFraction = explicitRemaining ?? barCandidate;
    if (remainingFraction !== undefined) {
      const reset = parseRelativeReset(joined);
      buckets.push({
        id: `${slug(group)}-${windowKind}`,
        label: windowLabel,
        group,
        kind: windowKind,
        remainingFraction,
        usedFraction: Math.max(0, 1 - remainingFraction),
        reached: remainingFraction <= 0.001 || /hit your .*limit|quota reached|limite raggiunto/i.test(joined),
        ...(reset ? { resetsAt: reset } : {})
      });
    }
    context = [];
    barCandidate = undefined;
    explicitRemaining = undefined;
  };

  for (const line of lines) {
    if (/^Gemini Models?(?:\s+quota)?$/i.test(line)) {
      finishWindow();
      group = 'Gemini';
      windowKind = undefined;
      windowLabel = undefined;
      continue;
    }
    if (/^(?:Claude(?: and| &) GPT models?|Claude and GPT Models?)(?:\s+quota)?$/i.test(line)) {
      finishWindow();
      group = 'Claude e GPT';
      windowKind = undefined;
      windowLabel = undefined;
      continue;
    }
    if (/Weekly Limit/i.test(line)) {
      finishWindow();
      windowKind = 'weekly';
      windowLabel = 'Settimanale';
      context = [line];
      continue;
    }
    if (/(?:Five|5)[ -]?Hour Limit/i.test(line)) {
      finishWindow();
      windowKind = 'five-hour';
      windowLabel = '5 ore';
      context = [line];
      continue;
    }
    if (!group || !windowKind || !windowLabel) continue;

    context.push(line);

    // AGY draws a progress-bar percentage first and then a rounded, semantic
    // "N% remaining" line. Prefer the semantic value and only retain the bar
    // percentage as a fallback for older/terse output formats.
    const remaining = extractPercent(line, 'remaining');
    if (remaining !== undefined) {
      explicitRemaining = remaining;
      continue;
    }
    const used = extractPercent(line, 'used');
    if (used !== undefined) {
      explicitRemaining = Math.max(0, 1 - used);
      continue;
    }
    const standalone = line.match(/(?:^|\])\s*(\d{1,3}(?:[.,]\d+)?)\s*%\s*$/);
    if (standalone?.[1]) {
      barCandidate = Math.min(1, Math.max(0, Number(standalone[1].replace(',', '.')) / 100));
    }
  }
  finishWindow();

  // Fallback for terse CLI output such as "Gemini Test — 65% remaining · resets in 2h".
  if (!buckets.length) {
    for (const [index, line] of lines.entries()) {
      const remaining = extractPercent(line, 'remaining');
      const used = extractPercent(line, 'used');
      if (remaining === undefined && used === undefined) continue;
      const model = line.match(/(?:Gemini|Claude|GPT)[^|:–—\d%]*(?:[\w.+-]+(?:\s+[\w.+()-]+){0,8})/i)?.[0]?.trim();
      if (!model) continue;
      const remainingFraction = remaining ?? Math.max(0, 1 - (used ?? 0));
      const reset = parseRelativeReset(line);
      buckets.push({
        id: `model-${index}`,
        label: prettifyModelLabel(model),
        group: modelFamily(model),
        kind: 'other',
        remainingFraction,
        usedFraction: Math.max(0, 1 - remainingFraction),
        ...(reset ? { resetsAt: reset } : {})
      });
    }
  }

  if (!buckets.length && /(?:individual )?quota reached|baseline model quota reached|hit your .*limit|limite raggiunto/i.test(text)) {
    const reset = parseRelativeReset(text);
    buckets.push({
      id: 'active-model-limit',
      label: activeModel ? prettifyModelLabel(activeModel) : 'Modello attivo',
      ...(activeModel ? { group: modelFamily(activeModel) === 'Claude and GPT' ? 'Claude e GPT' : modelFamily(activeModel) } : {}),
      kind: 'other',
      remainingFraction: 0,
      usedFraction: 1,
      reached: true,
      ...(reset ? { resetsAt: reset } : {})
    });
  }

  const constrained = preferredUsageBucket('antigravity', buckets);
  const plan = parsePlan(text);
  return {
    ...(constrained?.remainingFraction !== undefined ? { remainingFraction: constrained.remainingFraction } : {}),
    ...(constrained?.usedFraction !== undefined ? { usedFraction: constrained.usedFraction } : {}),
    ...(constrained?.resetsAt ? { resetsAt: constrained.resetsAt } : {}),
    ...(buckets.length ? { buckets } : {}),
    ...(plan ? { plan } : {})
  };
}

function extractPercent(text: string, kind: 'remaining' | 'used'): number | undefined {
  const words = kind === 'remaining'
    ? '(?:remaining|left|available|disponibile|residuo)'
    : '(?:used|utilizzato|consumato|spent)';
  const direct = text.match(new RegExp(`(\\d{1,3}(?:[.,]\\d+)?)\\s*%[^\\n]{0,70}${words}`, 'i'));
  const reverse = text.match(new RegExp(`${words}[^\\n]{0,70}(\\d{1,3}(?:[.,]\\d+)?)\\s*%`, 'i'));
  const value = direct?.[1] ?? reverse?.[1];
  if (!value) return undefined;
  return Math.min(1, Math.max(0, Number(value.replace(',', '.')) / 100));
}

function parseRelativeReset(text: string): string | undefined {
  const normalized = text.replace(/,/g, ' ');
  const match = normalized.match(/(?:reset(?:s)?|refresh(?:es)?|fully refresh(?:es)?|ripristino)(?:\s+in|\s+tra)?\s*(?:(\d+)\s*d(?:ays?|giorni?)?)?\s*(?:(\d+)\s*h(?:ours?|ore?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?|minuti?)?)?\s*(?:(\d+)\s*s(?:ec(?:onds?)?|econdi?)?)?/i);
  if (!match || !match.slice(1).some(Boolean)) return undefined;
  const milliseconds = (Number(match[1] ?? 0) * 86_400 + Number(match[2] ?? 0) * 3_600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0)) * 1000;
  return new Date(Date.now() + milliseconds).toISOString();
}

function parsePlan(text: string): string | undefined {
  return text.match(/(?:Your Plan|Piano)\s*:\s*([^\n]+)/i)?.[1]?.trim();
}

function parseAntigravityAuthentication(result: { exitCode: number; stdout: string; stderr: string } | null): { authenticated?: boolean } {
  if (!result) return {};
  const text = `${result.stdout}\n${result.stderr}`.trim();
  if (/login required|not authenticated|authentication required|sign in required|please (?:log|sign) in|run\s+agy\s+login|unauthenticated|access token.*missing/i.test(text)) {
    return { authenticated: false };
  }
  if (result.exitCode === 0 && /\b(?:Gemini|Claude|GPT)\b/i.test(text)) return { authenticated: true };
  return {};
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

export interface AntigravityStreamEvent {
  text?: string;
  status?: string;
  activity?: { title: string; detail?: string };
  final?: boolean;
  toolState?: 'active' | 'done' | 'error';
  terminalStatus?: string;
  error?: string;
}

export function parseAntigravityStreamEvent(line: string): AntigravityStreamEvent {
  const clean = stripAnsi(line).trim();
  if (!clean) return {};
  let payload: Record<string, any>;
  try { payload = JSON.parse(clean); }
  catch { return { text: `${clean}\n` }; }
  const type = String(payload.event ?? payload.type ?? '').toLowerCase().replaceAll('-', '_');
  const nested = payload[type] && typeof payload[type] === 'object' ? payload[type] as Record<string, any> : payload;
  const role = String(payload.role ?? payload.message?.role ?? '').toLowerCase();
  const blocks = Array.isArray(payload.content) ? payload.content : Array.isArray(payload.message?.content) ? payload.message.content : [];
  const toolBlock = blocks.find((entry: any) => /tool_(?:use|call)/i.test(String(entry?.type ?? '')));
  const toolName = stringField(nested.tool_name ?? nested.toolName ?? nested.name ?? nested.tool?.name ?? payload.tool_name ?? payload.toolName ?? toolBlock?.name);
  const toolState = String(nested.state ?? '').toLowerCase();
  if (type === 'step_update' && toolName && toolState === 'done') {
    return { status: `${toolName} completato`, activity: { title: `Completato · ${toolName}` }, toolState: 'done' };
  }
  if (type === 'step_update' && toolName && toolState === 'error') {
    const error = stringField(nested.error ?? nested.message) ?? `${toolName} non riuscito`;
    return { status: error, activity: { title: `Errore · ${toolName}`, detail: error }, toolState: 'error', error };
  }
  if (/tool_(?:use|call|start)|toolcall/.test(type) || toolBlock || (type === 'step_update' && toolName)) {
    return { status: toolName ? `Uso di ${toolName}…` : 'Esecuzione di uno strumento…', activity: { title: toolName ? `Strumento · ${toolName}` : 'Strumento', detail: compactStreamDetail(nested.input ?? nested.arguments ?? nested.parameters ?? payload.input ?? toolBlock?.input) }, toolState: 'active' };
  }
  if (/tool_(?:result|response|end)|toolresult/.test(type)) {
    return { status: toolName ? `${toolName} completato` : 'Strumento completato', activity: { title: toolName ? `Completato · ${toolName}` : 'Strumento completato' }, toolState: 'done' };
  }
  if (/^(?:init|session|start|system)$/.test(type)) return { status: 'Sessione Antigravity avviata…' };
  const final = /^(?:result|final|complete|completed)$/.test(type);
  const text = streamText(nested) ?? streamText(payload);
  if (text && (role === 'assistant' || /assistant|message|content|delta|step_update|result|final|complete/.test(type))) {
    return { text, ...(final ? { final: true, terminalStatus: stringField(nested.status ?? payload.status) } : {}) };
  }
  return {};
}

function streamText(payload: Record<string, any>): string | undefined {
  const value = payload.text_delta ?? payload.textDelta ?? payload.response ?? payload.delta ?? payload.text ?? payload.content ?? payload.result ?? payload.output ?? payload.message?.content;
  if (typeof value === 'string' && value) return value;
  if (Array.isArray(value)) {
    const joined = value.map((entry) => typeof entry === 'string' ? entry : typeof entry?.text === 'string' ? entry.text : '').join('');
    return joined || undefined;
  }
  return undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function compactStreamDetail(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  try { return JSON.stringify(value).slice(0, 500); } catch { return String(value).slice(0, 500); }
}

function slug(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function parseAntigravityStatusline(payload: Record<string, unknown>): Partial<UsageSnapshot> {
  const quota = payload.quota ?? payload.quotas ?? payload.rate_limits;
  const entries: Array<{ key: string; value: Record<string, unknown> }> = [];
  collectQuotaEntries(quota, '', entries);
  const buckets: UsageBucket[] = entries.flatMap(({ key, value }, index) => {
    const remainingRaw = numberValue(value.remaining_fraction ?? value.remainingFraction ?? value.remaining);
    const usedRaw = numberValue(value.used_fraction ?? value.usedFraction ?? value.used);
    if (remainingRaw === undefined && usedRaw === undefined) return [];
    const remainingFraction = clamp01(remainingRaw ?? 1 - (usedRaw ?? 0));
    const usedFraction = clamp01(usedRaw ?? 1 - remainingFraction);
    const text = [key, value.label, value.name, value.model, value.group, value.window].filter((entry) => typeof entry === 'string').join(' ');
    const resetRaw = value.reset_time ?? value.resetTime ?? value.resets_at ?? value.resetsAt;
    const resetSeconds = numberValue(value.reset_in_seconds ?? value.resetInSeconds);
    const resetsAt = normalizeReset(resetRaw, resetSeconds);
    const kind: UsageBucket['kind'] = /week/i.test(text) ? 'weekly' : /5\s*(?:hour|h)|five/i.test(text) ? 'five-hour' : /session/i.test(text) ? 'session' : 'other';
    const group = /^gemini|\bgemini\b/i.test(text) ? 'Gemini' : /claude|gpt/i.test(text) ? 'Claude e GPT' : undefined;
    const label = kind === 'weekly' ? 'Settimanale' : kind === 'five-hour' ? '5 ore' : humanizeQuotaKey(key || `quota-${index + 1}`);
    return [{
      id: slug(key || `quota-${index + 1}`),
      label,
      ...(group ? { group } : {}),
      kind,
      remainingFraction,
      usedFraction,
      reached: remainingFraction <= 0.001,
      ...(resetsAt ? { resetsAt } : {})
    }];
  });
  const constrained = preferredUsageBucket('antigravity', buckets);
  const planValue = payload.plan;
  const plan = typeof planValue === 'string'
    ? planValue
    : planValue && typeof planValue === 'object' && typeof (planValue as Record<string, unknown>).name === 'string'
      ? String((planValue as Record<string, unknown>).name)
      : undefined;
  return {
    ...(constrained?.remainingFraction !== undefined ? { remainingFraction: constrained.remainingFraction } : {}),
    ...(constrained?.usedFraction !== undefined ? { usedFraction: constrained.usedFraction } : {}),
    ...(constrained?.resetsAt ? { resetsAt: constrained.resetsAt } : {}),
    ...(buckets.length ? { buckets } : {}),
    ...(plan ? { plan } : {})
  };
}

function collectQuotaEntries(value: unknown, prefix: string, target: Array<{ key: string; value: Record<string, unknown> }>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectQuotaEntries(child, `${prefix}[${index}]`, target));
    return;
  }
  const object = value as Record<string, unknown>;
  if (['remaining_fraction', 'remainingFraction', 'used_fraction', 'usedFraction', 'remaining', 'used'].some((key) => key in object)) {
    target.push({ key: prefix, value: object });
    return;
  }
  for (const [key, child] of Object.entries(object)) collectQuotaEntries(child, prefix ? `${prefix}.${key}` : key, target);
}
function numberValue(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value > 1 ? value / 100 : value)); }
function normalizeReset(raw: unknown, seconds: number | undefined): string | undefined {
  if (seconds !== undefined) return new Date(Date.now() + Math.max(0, seconds) * 1000).toISOString();
  if (typeof raw === 'number') return new Date(raw < 10_000_000_000 ? raw * 1000 : raw).toISOString();
  if (typeof raw === 'string' && !Number.isNaN(Date.parse(raw))) return new Date(raw).toISOString();
  return undefined;
}
function humanizeQuotaKey(value: string): string { return value.split('.').at(-1)?.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) ?? 'Quota'; }
