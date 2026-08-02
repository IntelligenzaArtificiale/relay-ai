import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentProvider, AgentEventHandler } from '../core/provider.js';
import type { AgentRunRequest, AgentRunResult, ModelOption, ProviderStatus, UsageBucket, UsageSnapshot } from '../core/types.js';
import { RelayError, errorMessage } from '../core/errors.js';
import { runCommand, type CommandResult } from '../services/command-runner.js';
import { preparePromptTransport } from '../services/prompt-transport.js';
import { classifyProviderFailure, providerFailureError } from '../services/provider-failure.js';
import { resolveExecutable, type ExecutableResolution } from '../services/executable-resolver.js';

const COPILOT_REASONING = ['low', 'medium', 'high', 'xhigh', 'max'].map((id) => ({
  id,
  label: id === 'xhigh' ? 'XHigh' : id.charAt(0).toUpperCase() + id.slice(1)
}));

const COPILOT_REASONING_MODELS = new Set([
  'claude-sonnet-4.6',
  'gpt-5.4',
  'gpt-5.3-codex'
]);

const FALLBACK_MODEL_IDS = [
  'auto',
  'claude-sonnet-4.6',
  'gpt-5.4',
  'claude-haiku-4.5',
  'gpt-5.3-codex',
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash',
  'mai-code-1-flash'
] as const;

const FALLBACK_MODELS: ModelOption[] = FALLBACK_MODEL_IDS.map((id) => copilotModelOption(id));

export class CopilotProvider implements AgentProvider {
  readonly id = 'copilot' as const;
  private resolution: ExecutableResolution | undefined;
  private cachedModels: ModelOption[] = [];
  private modelInventorySource: 'cli-help' | 'unavailable' = 'unavailable';

  constructor(
    private readonly configuredExecutable: string,
    private readonly getBillingToken?: () => Promise<string | undefined>
  ) {}

  async detect(signal?: AbortSignal): Promise<ProviderStatus> {
    const started = Date.now();
    const resolution = await this.resolveCommand(true);
    if (!resolution) return this.unavailableStatus('GitHub Copilot CLI non rilevata nel PATH o nei percorsi di installazione comuni.');

    const gh = await resolveExecutable('gh', {
      extraCandidates: [
        '~/.local/bin/gh',
        '/opt/homebrew/bin/gh',
        '/usr/local/bin/gh',
        join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'GitHub CLI', 'gh.exe')
      ]
    }).catch(() => undefined);
    const [version, help, ghAuth] = await Promise.all([
      runCommand(resolution.path, ['--version'], { env: resolution.env, timeoutMs: 10_000, ...(signal ? { signal } : {}) }).catch(() => null),
      runCommand(resolution.path, ['help', '--no-color'], { env: resolution.env, timeoutMs: 15_000, ...(signal ? { signal } : {}) }).catch(() => null),
      gh ? runCommand(gh.path, ['auth', 'status'], { env: gh.env, timeoutMs: 12_000, ...(signal ? { signal } : {}) }).catch(() => null) : Promise.resolve(null)
    ]);
    const discoveredModels = help?.exitCode === 0 ? parseCopilotModels(help.stdout || help.stderr, false) : [];
    this.cachedModels = discoveredModels;
    this.modelInventorySource = discoveredModels.length ? 'cli-help' : 'unavailable';
    const billingTokenConfigured = Boolean(await this.getBillingToken?.().catch(() => undefined));
    const authFromEnvironment = Boolean(process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
    const authenticated: boolean | undefined = billingTokenConfigured || authFromEnvironment || ghAuth?.exitCode === 0
      ? true
      : ghAuth && ghAuth.exitCode !== 0
        ? false
        : undefined;
    const parsedVersion = parseCopilotVersion(version?.stdout || version?.stderr || '');
    const versionOk = Boolean(version?.exitCode === 0 && parsedVersion);
    const launchOk = versionOk && Boolean(help?.exitCode === 0);
    const modelsOk = this.cachedModels.length > 0;
    const authOk = authenticated !== false;
    const available = launchOk && modelsOk && authOk;
    const now = new Date().toISOString();
    const detail = !versionOk
      ? 'GitHub Copilot CLI è stata risolta, ma Relay non riesce a eseguire --version.'
      : !modelsOk
        ? 'GitHub Copilot CLI è avviabile, ma il comando help non ha restituito modelli selezionabili.'
        : undefined;
    return {
      id: this.id,
      label: 'GitHub Copilot',
      available,
      operational: available,
      executable: resolution.path,
      configuredExecutable: this.configuredExecutable,
      resolutionSource: resolution.source,
      setupState: available ? 'ready' : 'degraded',
      installAvailable: true,
      ...(parsedVersion ? { version: parsedVersion } : {}),
      ...(authenticated !== undefined ? { authenticated } : {}),
      ...(detail ? { detail } : {}),
      models: this.cachedModels,
      lastCheckedAt: now,
      probes: [
        { id: 'resolve', ok: true, startedAt: new Date(started).toISOString(), durationMs: 0, message: `Percorso risolto: ${resolution.path}` },
        { id: 'version', ok: versionOk, startedAt: now, durationMs: 0, message: versionOk ? parsedVersion! : 'Versione non disponibile.', ...(version?.stderr ? { detail: version.stderr } : {}) },
        { id: 'launch', ok: launchOk, startedAt: now, durationMs: 0, message: launchOk ? 'CLI avviabile.' : 'CLI non avviabile.', ...(help?.stderr ? { detail: help.stderr } : {}) },
        { id: 'authentication', ok: authOk, startedAt: now, durationMs: 0, message: authenticated ? 'Account disponibile.' : 'Stato account non determinato.' },
        { id: 'models', ok: modelsOk, startedAt: now, durationMs: 0, message: modelsOk ? `${this.cachedModels.length} modelli caricati.` : 'Nessun modello caricato.' },
        { id: 'smoke', ok: available, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, message: available ? 'GitHub Copilot operativo.' : 'GitHub Copilot non pienamente operativo.' }
      ],
      capabilities: { ...this.capabilities(), billingUsageConfigured: billingTokenConfigured, modelInventorySource: this.modelInventorySource, modelAccessMode: this.cachedModels.some((model) => model.id !== 'auto') ? 'explicit' : 'auto-only', availableModelCount: this.cachedModels.length }
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelOption[]> {
    const resolution = await this.requireResolution();
    const help = await runCommand(resolution.path, ['help', '--no-color'], { env: resolution.env, timeoutMs: 15_000, ...(signal ? { signal } : {}) }).catch(() => null);
    const discoveredModels = help?.exitCode === 0 ? parseCopilotModels(help.stdout || help.stderr, false) : [];
    this.cachedModels = discoveredModels;
    this.modelInventorySource = discoveredModels.length ? 'cli-help' : 'unavailable';
    return this.cachedModels;
  }

  async getUsage(): Promise<UsageSnapshot> {
    const resolution = await this.resolveCommand();
    if (!resolution) return this.unavailableUsage('GitHub Copilot CLI non rilevata.');

    // /usage belongs to the interactive Copilot session and does not expose the
    // monthly account allowance. Relay reads the official GitHub billing API.
    // A fine-grained token with user permission "Plan: read" is the reliable path.
    try {
      const token = await this.resolveBillingToken();
      if (!token) {
        return this.unavailableUsage('Collega un token GitHub fine-grained con permesso Plan: read per leggere utilizzo e dettaglio per modello. Il comando /usage della CLI è solo di sessione.');
      }

      const account = await githubApi(token, '/user');
      const login = typeof account.login === 'string' ? account.login.trim() : '';
      if (!login) return this.unavailableUsage('Impossibile determinare l’account GitHub associato al token.');

      const now = new Date();
      const query = `year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`;
      const userEndpoints = [
        { path: `/users/${encodeURIComponent(login)}/settings/billing/ai_credit/usage?${query}`, unit: 'credits' as const },
        { path: `/users/${encodeURIComponent(login)}/settings/billing/premium_request/usage?${query}`, unit: 'requests' as const }
      ];
      const collected: UsageBucket[] = [];
      const errors: string[] = [];
      let inferredPlan: string | undefined;

      for (const endpoint of userEndpoints) {
        try {
          const payload = await githubApi(token, endpoint.path);
          const parsed = parseCopilotBillingUsage(JSON.stringify(payload), endpoint.unit);
          if (parsed.plan && !inferredPlan) inferredPlan = parsed.plan;
          if (parsed.buckets?.length) collected.push(...parsed.buckets);
        } catch (error) {
          errors.push(errorMessage(error));
        }
      }

      let scope = `Account personale ${login}`;
      if (!collected.length) {
        // User billing endpoints intentionally exclude licenses paid by an
        // organization. Try organizations visible to the token; only orgs where
        // the user has billing/admin permission will answer successfully.
        try {
          const memberships = await githubApi(token, '/user/memberships/orgs?state=active&per_page=100');
          const organizations = Array.isArray(memberships) ? memberships : [];
          for (const membership of organizations) {
            const organization = membership && typeof membership === 'object'
              ? (membership as Record<string, any>).organization
              : undefined;
            const loginOrg = organization && typeof organization.login === 'string' ? organization.login : undefined;
            if (!loginOrg) continue;
            for (const endpoint of [
              { path: `/organizations/${encodeURIComponent(loginOrg)}/settings/billing/ai_credit/usage?${query}&user=${encodeURIComponent(login)}`, unit: 'credits' as const },
              { path: `/organizations/${encodeURIComponent(loginOrg)}/settings/billing/premium_request/usage?${query}&user=${encodeURIComponent(login)}`, unit: 'requests' as const }
            ]) {
              try {
                const payload = await githubApi(token, endpoint.path);
                const parsed = parseCopilotBillingUsage(JSON.stringify(payload), endpoint.unit);
                if (parsed.plan && !inferredPlan) inferredPlan = parsed.plan;
                if (parsed.buckets?.length) {
                  collected.push(...parsed.buckets.map((bucket) => ({ ...bucket, group: `${loginOrg} · ${bucket.group ?? 'Copilot'}` })));
                  scope = `Organizzazione ${loginOrg}`;
                }
              } catch (error) {
                errors.push(errorMessage(error));
              }
            }
            if (collected.length) break;
          }
        } catch (error) {
          errors.push(errorMessage(error));
        }
      }

      const buckets = deduplicateCopilotBuckets(collected);
      if (!buckets.length) {
        return this.unavailableUsage(`GitHub non ha restituito dati di billing per questo account. Verifica Plan: read oppure, per un piano aziendale, i permessi di billing dell’organizzazione. ${errors.join(' ').slice(0, 600)}`.trim());
      }
      const remaining = buckets
        .map((bucket) => bucket.remainingFraction)
        .filter((value): value is number => value !== undefined)
        .sort((a, b) => a - b)[0];
      const updatedAt = new Date().toISOString();
      return {
        provider: this.id,
        available: true,
        buckets,
        ...(remaining !== undefined ? { remainingFraction: remaining, usedFraction: 1 - remaining } : {}),
        ...(inferredPlan ? { plan: inferredPlan } : {}),
        detail: `${scope} · mese corrente · dati ufficiali GitHub. Il totale è separato dal dettaglio per modello; i limiti inclusi compaiono solo quando l’API li restituisce.`,
        source: 'native-api',
        confidence: 'exact',
        updatedAt,
        lastSuccessfulAt: updatedAt
      };
    } catch (error) {
      return this.unavailableUsage(errorMessage(error));
    }
  }

  private async resolveBillingToken(): Promise<string | undefined> {
    const stored = await this.getBillingToken?.().catch(() => undefined);
    if (stored?.trim()) return stored.trim();
    for (const value of [process.env.COPILOT_GITHUB_TOKEN, process.env.GH_TOKEN, process.env.GITHUB_TOKEN]) {
      if (value?.trim()) return value.trim();
    }
    const gh = await resolveExecutable('gh', {
      extraCandidates: [
        '~/.local/bin/gh',
        '/opt/homebrew/bin/gh',
        '/usr/local/bin/gh',
        join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'GitHub CLI', 'gh.exe')
      ]
    }).catch(() => undefined);
    if (!gh) return undefined;
    const result = await runCommand(gh.path, ['auth', 'token'], { env: gh.env, timeoutMs: 10_000 }).catch(() => undefined);
    return result?.exitCode === 0 && result.stdout.trim() ? result.stdout.trim() : undefined;
  }

  async run(request: AgentRunRequest, onEvent: AgentEventHandler): Promise<AgentRunResult> {
    const resolution = await this.requireResolution();
    const prompt = request.rules ? `${request.rules}\n\n# Current task\n${request.prompt}` : request.prompt;
    const sessionId = request.sessionId ?? randomUUID();
    const transport = await preparePromptTransport({ provider: this.id, prompt, cwd: request.cwd, executable: resolution.path });
    const baseArgs = [
      ...transport.promptArgs,
      '--silent',
      '--stream=on',
      '--output-format=text',
      '--no-ask-user',
      '--no-auto-update',
      '--session-id', sessionId,
      '-C', request.cwd,
      '--model', request.model && request.model !== 'auto' ? request.model : 'auto'
    ];
    applyPermissions(baseArgs, request.permission);

    const requestedModel = request.model ?? 'auto';
    const shouldSendEffort = requestedModel !== 'auto' && request.reasoning && request.reasoning !== 'auto';
    const firstArgs = [...baseArgs];
    if (shouldSendEffort) firstArgs.push('--effort', request.reasoning!);

    onEvent({ type: 'status', runId: request.runId, message: 'Avvio di GitHub Copilot…', phase: 'starting-session' });
    let text = '';
    let firstOutput = false;
    const execute = async (args: string[]): Promise<CommandResult> => runCommand(resolution.path, args, {
      env: resolution.env,
      cwd: request.cwd,
      ...(request.signal ? { signal: request.signal } : {}),
      timeoutMs: 60 * 60 * 1000,
      ...(transport.stdin !== undefined ? { stdin: transport.stdin } : {}),
      onStdoutLine: (line) => {
        if (!line) return;
        if (!firstOutput) {
          firstOutput = true;
          onEvent({ type: 'status', runId: request.runId, message: 'GitHub Copilot sta lavorando…', phase: 'working' });
        }
        const next = `${line}\n`;
        text += next;
        onEvent({ type: 'delta', runId: request.runId, text: next });
      },
      onStderrLine: (line) => {
        const trimmed = line.trim();
        if (trimmed) onEvent({ type: 'activity', runId: request.runId, title: 'GitHub Copilot', detail: trimmed });
      }
    });

    try {
      let result = await execute(firstArgs);
    let combined = [result.stderr, result.stdout].filter(Boolean).join('\n');
    if (result.exitCode !== 0 && shouldSendEffort && isUnsupportedEffortError(combined)) {
      onEvent({
        type: 'activity',
        runId: request.runId,
        title: 'Compatibilità ragionamento',
        detail: 'Il modello selezionato non accetta --effort. Relay riprova automaticamente senza forzare il livello di ragionamento.'
      });
      text = '';
      firstOutput = false;
      result = await execute(baseArgs);
      combined = [result.stderr, result.stdout].filter(Boolean).join('\n');
    }

    if (result.exitCode !== 0) {
      const raw = result.stderr || result.stdout || `GitHub Copilot CLI terminata con codice ${result.exitCode}.`;
      const failure = classifyProviderFailure(this.id, raw);
      onEvent({ type: 'error', runId: request.runId, message: failure.message, failure });
      throw providerFailureError(this.id, raw);
    }
    if (!text.trim()) text = result.stdout;
    const runResult: AgentRunResult = {
      runId: request.runId,
      provider: this.id,
      text: text.trim(),
      sessionId,
      model: requestedModel
    };
    onEvent({ type: 'complete', runId: request.runId, result: runResult });
      return runResult;
    } finally {
      await transport.cleanup();
    }
  }

  async dispose(): Promise<void> {}

  private async resolveCommand(force = false): Promise<ExecutableResolution | undefined> {
    const home = homedir();
    const resolution = await resolveExecutable(this.configuredExecutable, {
      force,
      extraCandidates: [
        '~/.local/bin/copilot',
        '/opt/homebrew/bin/copilot',
        '/usr/local/bin/copilot',
        join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'npm', 'copilot'),
        join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Microsoft', 'WinGet', 'Links', 'copilot.exe')
      ]
    });
    this.resolution = resolution;
    return resolution;
  }

  private async requireResolution(): Promise<ExecutableResolution> {
    const resolution = this.resolution ?? await this.resolveCommand();
    if (!resolution) throw new RelayError('GitHub Copilot CLI non installata o non rilevabile.', 'COPILOT_NOT_FOUND');
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
      browser: false,
      mcp: true
    };
  }

  private unavailableStatus(detail: string): ProviderStatus {
    return {
      id: this.id,
      label: 'GitHub Copilot',
      available: false,
      executable: this.configuredExecutable,
      configuredExecutable: this.configuredExecutable,
      setupState: 'not-installed',
      installAvailable: true,
      detail,
      models: this.cachedModels,
      capabilities: { ...this.capabilities(), billingUsageConfigured: false, modelInventorySource: this.modelInventorySource, modelAccessMode: this.cachedModels.some((model) => model.id !== 'auto') ? 'explicit' : 'auto-only', availableModelCount: this.cachedModels.length }
    };
  }

  private unavailableUsage(detail: string): UsageSnapshot {
    return {
      provider: this.id,
      available: false,
      detail,
      source: 'unavailable',
      confidence: 'unknown',
      updatedAt: new Date().toISOString()
    };
  }
}

function applyPermissions(args: string[], permission: AgentRunRequest['permission']): void {
  if (permission === 'danger-full-access') {
    args.push('--allow-all');
    return;
  }
  if (permission === 'read-only') {
    args.push('--mode=plan', '--allow-tool=read', '--allow-tool=shell', '--deny-tool=write');
    return;
  }
  args.push('--allow-tool=read,write,shell');
}

function isUnsupportedEffortError(output: string): boolean {
  return /does not support reasoning effort configuration|unsupported.*(?:reasoning|effort)|(?:reasoning|effort).*not supported/i.test(output);
}

export function parseCopilotVersion(output: string): string | undefined {
  const clean = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, ' ').replace(/\s+/g, ' ').trim();
  const match = clean.match(/(?:GitHub\s+)?Copilot(?:\s+CLI)?\s+(?:version\s+)?v?(\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?)/i)
    ?? clean.match(/\bv?(\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?)\b/i);
  return match?.[1];
}

export function parseCopilotModels(output: string, fallbackWhenEmpty = true): ModelOption[] {
  const known = /\b(?:auto|claude-[a-z0-9.-]+|gpt-[a-z0-9.-]+|gemini-[a-z0-9.-]+|mai-[a-z0-9.-]+|kimi-[a-z0-9.-]+|raptor-[a-z0-9.-]+)\b/gi;
  const collect = (source: string): Set<string> => {
    const found = new Set<string>();
    for (const match of source.matchAll(known)) found.add(match[0]!.toLowerCase());
    return found;
  };

  const optionIds = collect(extractCopilotModelOptionSection(output));
  const supportedIds = collect(extractCopilotSupportedModelsSection(output));
  // Some CLI builds mention only "auto" near --model and print the real
  // account/policy inventory later. Prefer the narrowest complete section so
  // examples and custom-agent docs cannot pollute the model selector.
  const ids = optionIds.size > 1
    ? optionIds
    : supportedIds.size > 1
      ? supportedIds
      : optionIds.size
        ? optionIds
        : collect(output);
  if (ids.size) ids.add('auto');
  if (!ids.size && fallbackWhenEmpty) return FALLBACK_MODELS.map((model) => ({ ...model, reasoning: [...model.reasoning] }));
  return [...ids]
    .map((id) => copilotModelOption(id))
    .sort((a, b) => Number(b.id === 'auto') - Number(a.id === 'auto') || a.label.localeCompare(b.label));
}

function extractCopilotModelOptionSection(output: string): string {
  const clean = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, ' ');
  const lines = clean.split(/\r?\n/);
  const start = lines.findIndex((line) => /(?:^|\s)--model(?:[= ,]|$)/i.test(line));
  if (start < 0) return '';
  const selected: string[] = [];
  for (let index = start; index < Math.min(lines.length, start + 12); index += 1) {
    const line = lines[index]!;
    if (index > start && /^\s{0,6}--[a-z]/i.test(line)) break;
    selected.push(line);
  }
  return selected.join('\n');
}

function extractCopilotSupportedModelsSection(output: string): string {
  const clean = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, ' ');
  const lines = clean.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*(?:#{1,4}\s*)?supported models\s*:?\s*$/i.test(line));
  if (start < 0) return '';
  const selected: string[] = [];
  for (let index = start + 1; index < Math.min(lines.length, start + 40); index += 1) {
    const line = lines[index]!;
    if (selected.length && /^\s*(?:#{1,4}\s+|[A-Z][A-Za-z ]+:\s*$)/.test(line)
      && !/claude|gpt|gemini|mai|kimi|raptor|auto/i.test(line)) break;
    selected.push(line);
  }
  return selected.join('\n');
}

function copilotModelOption(id: string): ModelOption {
  if (id === 'auto') {
    return {
      id,
      label: 'Automatico',
      description: 'Copilot sceglie un modello disponibile per piano e policy. Relay non forza il reasoning perché il modello instradato può non supportarlo.',
      family: 'multi-provider',
      isDefault: true,
      reasoning: []
    };
  }
  const family = id.startsWith('claude-') ? 'Claude'
    : id.startsWith('gemini-') ? 'Gemini'
      : id.startsWith('gpt-') ? 'GPT'
        : id.startsWith('mai-') ? 'Microsoft'
          : 'GitHub';
  const reasoning = COPILOT_REASONING_MODELS.has(id) ? COPILOT_REASONING : [];
  return {
    id,
    label: humanizeModel(id),
    family,
    reasoning,
    ...(reasoning.length ? { defaultReasoning: id === 'gpt-5.3-codex' ? 'high' : 'medium' } : {})
  };
}

export function parseCopilotBillingUsage(output: string, unit: 'credits' | 'requests' = 'credits'): Partial<UsageSnapshot> {
  let payload: unknown;
  try { payload = JSON.parse(output); } catch { return {}; }
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const hasItemsField = 'usageItems' in root || 'usage_items' in root || 'items' in root;
  const items = arrayValue(root.usageItems ?? root.usage_items ?? root.items);
  const grouped = new Map<string, number>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const model = cleanCopilotModelName(record.model) ?? 'Senza dettaglio modello';
    const used = numeric(record.grossQuantity ?? record.gross_quantity ?? record.quantity ?? record.used)
      ?? numeric(record.netQuantity ?? record.net_quantity ?? record.billableQuantity ?? record.billable_quantity)
      ?? 0;
    grouped.set(model, (grouped.get(model) ?? 0) + Math.max(0, used));
  }
  if (!items.length) {
    const used = numeric(root.grossQuantity ?? root.gross_quantity ?? root.totalQuantity ?? root.total_quantity ?? root.used)
      ?? numeric(root.netQuantity ?? root.net_quantity ?? root.billableQuantity ?? root.billable_quantity);
    if (used !== undefined) grouped.set('Senza dettaglio modello', Math.max(0, used));
  }
  if (!grouped.size && !hasItemsField && !hasUsageShape(root)) return {};
  if (!grouped.size && hasItemsField) grouped.set('Senza dettaglio modello', 0);

  const limit = numeric(root.limit ?? root.includedQuantity ?? root.included_quantity ?? root.allowance ?? root.totalLimit ?? root.total_limit);
  const totalUsed = [...grouped.values()].reduce((sum, value) => sum + value, 0);
  const resetsAt = firstDayOfNextUtcMonth().toISOString();
  const labelPrefix = unit === 'credits' ? 'Crediti AI' : 'Richieste premium';
  const totalId = `${unit}-total`;
  const buckets: UsageBucket[] = [{
    id: totalId,
    label: 'Totale mese',
    group: labelPrefix,
    kind: 'monthly',
    used: totalUsed,
    ...(limit !== undefined ? {
      limit,
      remainingFraction: Math.max(0, Math.min(1, 1 - totalUsed / Math.max(1, limit))),
      usedFraction: Math.max(0, Math.min(1, totalUsed / Math.max(1, limit)))
    } : {}),
    unit,
    resetsAt
  }];

  const details = [...grouped.entries()]
    .filter(([model]) => model !== 'Senza dettaglio modello')
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [model, used] of details) {
    buckets.push({
      id: `${unit}-model-${slugCopilot(model)}`,
      label: model,
      group: unit === 'credits' ? 'AI Credits per modello' : 'Richieste per modello',
      kind: 'monthly',
      used,
      unit,
      resetsAt
    });
  }

  const plan = unit === 'credits' ? inferCopilotPlanFromAllowance(limit) : undefined;
  return { buckets, ...(plan ? { plan } : {}) };
}

export function inferCopilotPlanFromAllowance(limit: number | undefined): string | undefined {
  if (limit === undefined) return undefined;
  if (Math.abs(limit - 1_500) < 0.01) return 'Copilot Pro · 1.500 AI Credits/mese';
  if (Math.abs(limit - 7_000) < 0.01) return 'Copilot Pro+ · 7.000 AI Credits/mese';
  if (Math.abs(limit - 20_000) < 0.01) return 'Copilot Max · 20.000 AI Credits/mese';
  return `Piano Copilot · ${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(limit)} AI Credits/mese`;
}

export function parseCopilotUsage(output: string): Partial<UsageSnapshot> {
  const buckets: UsageBucket[] = [];
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let group = 'Copilot';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (/premium requests|ai credits|session|weekly|monthly|plan budget/i.test(line) && !/%|remaining|used/i.test(line)) group = line.replace(/[:|]+$/g, '').trim();
    const remaining = line.match(/([\d.]+)%\s*(?:remaining|available)/i);
    const used = line.match(/([\d.]+)%\s*(?:used|consumed)/i);
    const ratio = line.match(/([\d,]+)\s*(?:of|\/|su)\s*([\d,]+)\s*(?:remaining|requests|credits)?/i);
    if (!remaining && !used && !ratio) continue;
    const reset = lines.slice(index, index + 3).join(' ').match(/(?:refreshes|resets|reset)[^\d]*(?:in\s*)?([\dhm\s]+)/i)?.[1];
    const remainingFraction = remaining ? Number(remaining[1]) / 100 : ratio ? Number(ratio[1]!.replaceAll(',', '')) / Number(ratio[2]!.replaceAll(',', '')) : undefined;
    const usedFraction = used ? Number(used[1]) / 100 : remainingFraction !== undefined ? 1 - remainingFraction : undefined;
    buckets.push({
      id: `copilot-${buckets.length}`,
      label: group,
      group: 'Copilot',
      kind: /month/i.test(group) ? 'other' : /week/i.test(group) ? 'weekly' : /session/i.test(group) ? 'session' : 'other',
      ...(remainingFraction !== undefined && Number.isFinite(remainingFraction) ? { remainingFraction } : {}),
      ...(usedFraction !== undefined && Number.isFinite(usedFraction) ? { usedFraction } : {}),
      ...(reset ? { resetsAt: futureIsoFromDuration(reset) } : {})
    });
  }
  const remainingValues = buckets.map((bucket) => bucket.remainingFraction).filter((value): value is number => value !== undefined);
  return {
    ...(remainingValues.length ? { remainingFraction: Math.min(...remainingValues), usedFraction: 1 - Math.min(...remainingValues) } : {}),
    ...(buckets.length ? { buckets } : {})
  };
}

async function githubApi(token: string, path: string): Promise<any> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2026-03-10',
      'User-Agent': 'Relay-VSCode-Extension'
    }
  });
  const text = await response.text();
  let payload: any = undefined;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text }; }
  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : `HTTP ${response.status}`;
    throw new Error(`GitHub API ${response.status}: ${message}`);
  }
  return payload;
}

function deduplicateCopilotBuckets(buckets: UsageBucket[]): UsageBucket[] {
  const selected = new Map<string, UsageBucket>();
  for (const bucket of buckets) {
    const key = `${bucket.unit ?? ''}:${bucket.id}`;
    const current = selected.get(key);
    if (!current || (bucket.used ?? 0) > (current.used ?? 0)) selected.set(key, bucket);
  }
  return [...selected.values()].sort((a, b) => {
    const unitRank = copilotUnitRank(a.unit) - copilotUnitRank(b.unit);
    if (unitRank) return unitRank;
    const totalRank = Number(!a.id.includes('total')) - Number(!b.id.includes('total'));
    if (totalRank) return totalRank;
    return (b.used ?? 0) - (a.used ?? 0) || a.label.localeCompare(b.label);
  });
}

function copilotUnitRank(unit: string | undefined): number {
  if (unit === 'credits') return 0;
  if (unit === 'requests') return 1;
  return 2;
}

function cleanCopilotModelName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/^Copilot\s+/i, '').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, 120) : undefined;
}

function slugCopilot(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'total';
}

function parseGithubLogin(output: string): string | undefined {
  try {
    const payload = JSON.parse(output) as Record<string, unknown>;
    return typeof payload.login === 'string' && payload.login.trim() ? payload.login.trim() : undefined;
  } catch { return undefined; }
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function arrayValue(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function hasUsageShape(value: Record<string, unknown>): boolean {
  return ['grossQuantity', 'gross_quantity', 'netQuantity', 'net_quantity', 'totalQuantity', 'total_quantity', 'used'].some((key) => key in value);
}
function firstDayOfNextUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function futureIsoFromDuration(value: string): string {
  const hours = Number(value.match(/(\d+)\s*h/i)?.[1] ?? 0);
  const minutes = Number(value.match(/(\d+)\s*m/i)?.[1] ?? 0);
  return new Date(Date.now() + (hours * 60 + minutes) * 60_000).toISOString();
}

function humanizeModel(id: string): string {
  if (id === 'auto') return 'Automatico';
  return id.split('-').map((part) => /^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}
