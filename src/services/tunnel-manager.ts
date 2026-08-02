import { platform as osPlatform } from 'node:os';
import { join } from 'node:path';
import type { CommandOptions, CommandResult } from './command-runner.js';
import { runCommand } from './command-runner.js';
import { resolveExecutable, type ExecutableResolution } from './executable-resolver.js';

export type RemoteAccessMode = 'lan' | 'funnel' | 'tailnet';
export type TunnelLifecycleState =
  | 'NOT_INSTALLED'
  | 'INSTALLING'
  | 'INSTALLED_NEEDS_LOGIN'
  | 'AWAITING_AUTH'
  | 'LOGGED_IN'
  | 'FUNNEL_NEEDS_ENABLE'
  | 'AWAITING_FUNNEL_APPROVAL'
  | 'ACTIVATING'
  | 'PROBING'
  | 'PROPAGATING_DNS'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'REMEDIATING'
  | 'STOPPED'
  | 'ERROR';

export interface TailscaleStatusJson {
  BackendState?: string;
  Self?: { DNSName?: string; HostName?: string; Online?: boolean };
  Version?: string;
  [key: string]: unknown;
}

export interface TunnelTransition {
  at: string;
  state: TunnelLifecycleState;
  message: string;
  command?: string;
  detail?: string;
}

export interface TunnelProbeResult {
  ok: boolean;
  checkedAt: string;
  durationMs: number;
  url?: string;
  statusCode?: number;
  dnsPropagation?: boolean;
  error?: string;
}

export interface TailscaleTunnelSnapshot {
  mode: RemoteAccessMode;
  state: TunnelLifecycleState;
  installed: boolean;
  executable?: string;
  executableSource?: string;
  version?: string;
  backendState?: string;
  dnsName?: string;
  publicPort?: number;
  baseUrl?: string;
  approvalUrl?: string;
  loginUrl?: string;
  verifiedAt?: string;
  lastProbe?: TunnelProbeResult;
  lastError?: string;
  lastTechnicalDetail?: string;
  remediationCommand?: string;
  transitions: TunnelTransition[];
  checkedAt?: string;
  macVariant?: 'gui' | 'open-source' | 'unknown';
  changedUrl?: boolean;
}

export interface TunnelDetectionOptions {
  mode: RemoteAccessMode;
  localPort?: number;
  configuredPublicPort?: number;
  previousDnsName?: string;
  probe?: boolean;
  force?: boolean;
}

export interface TunnelActivationOptions extends TunnelDetectionOptions {
  localPort: number;
}

export interface TunnelManagerDependencies {
  platform?: NodeJS.Platform;
  resolve?: (command: string, options?: any) => Promise<ExecutableResolution | undefined>;
  run?: (executable: string, args: string[], options?: CommandOptions) => Promise<CommandResult>;
  fetch?: typeof fetch;
  now?: () => number;
  openExternal?: (url: string) => Promise<void> | void;
  onChanged?: () => void;
}

export interface TunnelInstallPlan {
  mode: 'terminal' | 'external';
  label: string;
  command?: string;
  url?: string;
  detail: string;
}

interface ServePortEntry {
  port: number;
  targets: string[];
}

const PUBLIC_PORTS = [443, 8443, 10000] as const;
const DNS_PROPAGATION_WINDOW_MS = 10 * 60_000;
const PROBE_TIMEOUT_MS = 10_000;
const CLI_TIMEOUT_MS = 20_000;

export class TunnelManager {
  private readonly platform: NodeJS.Platform;
  private readonly resolveFn: NonNullable<TunnelManagerDependencies['resolve']>;
  private readonly runFn: NonNullable<TunnelManagerDependencies['run']>;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly openExternal?: TunnelManagerDependencies['openExternal'];
  private readonly onChanged?: () => void;
  private current: TailscaleTunnelSnapshot = {
    mode: 'lan',
    state: 'STOPPED',
    installed: false,
    transitions: []
  };
  private detection?: Promise<TailscaleTunnelSnapshot>;
  private generation = 0;
  private firstActivationAt?: number;
  private remediationFailures = 0;

  constructor(dependencies: TunnelManagerDependencies = {}) {
    this.platform = dependencies.platform ?? osPlatform();
    this.resolveFn = dependencies.resolve ?? resolveExecutable;
    this.runFn = dependencies.run ?? runCommand;
    this.fetchFn = dependencies.fetch ?? fetch;
    this.now = dependencies.now ?? Date.now;
    this.openExternal = dependencies.openExternal;
    this.onChanged = dependencies.onChanged;
  }

  snapshot(): TailscaleTunnelSnapshot {
    return structuredClone(this.current);
  }

  beginInstall(): TailscaleTunnelSnapshot {
    this.transition('INSTALLING', 'Installazione di Tailscale in corso…');
    return this.snapshot();
  }

  async detect(options: TunnelDetectionOptions): Promise<TailscaleTunnelSnapshot> {
    if (this.detection && !options.force) return this.detection;
    const generation = ++this.generation;
    const task = this.detectInternal(options, generation).finally(() => {
      if (this.detection === task) this.detection = undefined;
    });
    this.detection = task;
    return task;
  }

  async login(options: TunnelDetectionOptions): Promise<TailscaleTunnelSnapshot> {
    const initial = await this.detect({ ...options, force: true, probe: false });
    if (!initial.installed || !initial.executable) return initial;
    if (initial.backendState === 'Running') return initial;
    this.transition('AWAITING_AUTH', 'Attendi il completamento dell’accesso nel browser.', 'tailscale up');
    let loginUrl: string | undefined;
    const capture = (line: string) => {
      const url = extractTailscaleLoginUrl(line);
      if (!url || url === loginUrl) return;
      loginUrl = url;
      this.current.loginUrl = url;
      this.notify();
      void this.openExternal?.(url);
    };
    try {
      const result = await this.runFn(initial.executable, ['up'], {
        env: tailscaleEnv(initial.executable),
        timeoutMs: 5 * 60_000,
        onStdoutLine: capture,
        onStderrLine: capture
      });
      if (result.exitCode !== 0 && !loginUrl) throw new Error(compactError(result));
      for (let attempt = 0; attempt < 150; attempt += 1) {
        const detected = await this.detect({ ...options, force: true, probe: false });
        if (detected.backendState === 'Running') return detected;
        await delay(2_000);
      }
      throw new Error('Accesso Tailscale non confermato entro cinque minuti.');
    } catch (error) {
      return this.fail('Accesso Tailscale non completato.', error);
    }
  }

  async activate(options: TunnelActivationOptions): Promise<TailscaleTunnelSnapshot> {
    if (options.mode === 'lan') return this.setStopped('Modalità LAN selezionata.');
    const detected = await this.detect({ ...options, force: true, probe: false });
    if (!detected.installed || !detected.executable) return detected;
    if (detected.backendState !== 'Running' || !detected.dnsName) {
      this.transition('INSTALLED_NEEDS_LOGIN', 'Tailscale richiede l’accesso prima di attivare il remoto.');
      return this.snapshot();
    }
    // La documentazione macOS di Tailscale non è perfettamente coerente
    // sul supporto Funnel delle varianti GUI. Relay non presume il risultato:
    // tenta esclusivamente il proxy di porta supportato dalla CLI installata e
    // considera operativo il tunnel solo dopo status + probe end-to-end.

    const target = relayTarget(options.localPort);
    const serve = await this.readStatusJson(detected.executable, 'serve');
    const funnel = await this.readStatusJson(detected.executable, 'funnel');
    const port = selectTailscalePort(serve.json, funnel.json, target, options.configuredPublicPort);
    if (!port) return this.fail('Nessuna porta Funnel disponibile.', new Error('Le porte 443, 8443 e 10000 risultano già configurate da Tailscale per altri servizi.'));

    this.firstActivationAt ??= this.now();
    this.current.publicPort = port;
    this.current.baseUrl = buildTailscaleBaseUrl(detected.dnsName, port);
    this.current.approvalUrl = undefined;
    this.transition('ACTIVATING', options.mode === 'funnel' ? 'Attivazione accesso Ovunque…' : 'Attivazione accesso Privato…');

    const command = options.mode === 'funnel' ? 'funnel' : 'serve';
    const args = ['--bg', `--https=${port}`, target];
    let approvalUrl: string | undefined;
    const capture = (line: string) => {
      const url = extractTailscaleApprovalUrl(line);
      if (!url || url === approvalUrl) return;
      approvalUrl = url;
      this.current.approvalUrl = url;
      this.transition('AWAITING_FUNNEL_APPROVAL', 'Conferma l’attivazione nel browser.', `${command} ${args.join(' ')}`);
      void this.openExternal?.(url);
    };

    try {
      const result = await this.runFn(detected.executable, [command, ...args], {
        env: tailscaleEnv(detected.executable),
        timeoutMs: 3 * 60_000,
        onStdoutLine: capture,
        onStderrLine: capture
      });
      if (result.exitCode !== 0) {
        const detail = compactError(result);
        if (/Tailscale\.CLIError|open.*Tailscale/i.test(detail) && this.platform === 'darwin') {
          return this.fail('Apri l’app Tailscale una volta e riprova.', new Error(detail));
        }
        if (!approvalUrl) throw new Error(detail);
      }
    } catch (error) {
      // L’approvazione interattiva può sopravvivere all’invocazione CLI.
      // Prima di classificare timeout/exit come errore, verifichiamo lo stato
      // effettivo pubblicato dal demone e dal control plane.
      const refreshed = await this.waitForConfigured(options, port, 36);
      if (refreshed.state !== 'ACTIVE') return this.fail('Tailscale non ha completato l’attivazione.', error);
      return this.probe({ ...options, configuredPublicPort: port, force: true });
    }

    let refreshed = await this.detect({ ...options, configuredPublicPort: port, force: true, probe: false });
    if (refreshed.state !== 'ACTIVE' && approvalUrl) refreshed = await this.waitForConfigured(options, port, 72);
    if (refreshed.state !== 'ACTIVE') {
      return this.fail('La configurazione Tailscale non contiene il proxy Relay.', new Error('Il comando è terminato ma funnel/serve status non mostra il target locale di Relay.'));
    }
    return this.probe({ ...options, configuredPublicPort: port, force: true });
  }

  async deactivate(options: TunnelActivationOptions): Promise<TailscaleTunnelSnapshot> {
    if (options.mode === 'lan') return this.setStopped('Accesso remoto locale disattivato.');
    const detected = await this.detect({ ...options, force: true, probe: false });
    if (!detected.executable) return this.setStopped('Tailscale non è installato.');
    const port = options.configuredPublicPort ?? detected.publicPort;
    if (port) {
      const command = options.mode === 'funnel' ? 'funnel' : 'serve';
      const result = await this.runFn(detected.executable, [command, `--https=${port}`, 'off'], {
        env: tailscaleEnv(detected.executable), timeoutMs: 30_000
      }).catch((error) => ({ stdout: '', stderr: error instanceof Error ? error.message : String(error), exitCode: -1 }));
      if (result.exitCode !== 0 && !/does not exist|not configured|no serve config/i.test(compactError(result))) {
        return this.fail('Impossibile disattivare il tunnel Tailscale.', new Error(compactError(result)));
      }
    }
    return this.setStopped('Tunnel Tailscale disattivato.');
  }

  async probe(options: TunnelDetectionOptions): Promise<TailscaleTunnelSnapshot> {
    const detected = await this.detect({ ...options, force: options.force, probe: false });
    if (options.mode === 'lan' || !detected.baseUrl) return detected;
    this.transition('PROBING', 'Verifica end-to-end da Internet…');
    const result = await probeTunnelHealth(`${detected.baseUrl}/health`, this.fetchFn, PROBE_TIMEOUT_MS, this.now);
    this.current.lastProbe = result;
    if (result.ok) {
      this.current.verifiedAt = result.checkedAt;
      this.current.lastError = undefined;
      this.current.lastTechnicalDetail = undefined;
      this.transition('ACTIVE', options.mode === 'funnel' ? 'Raggiungibile da Internet.' : 'Raggiungibile dal tailnet.');
      return this.snapshot();
    }
    if (result.dnsPropagation && this.firstActivationAt && this.now() - this.firstActivationAt <= DNS_PROPAGATION_WINDOW_MS) {
      this.transition('PROPAGATING_DNS', 'Propagazione DNS in corso — può richiedere fino a 10 minuti.');
      return this.snapshot();
    }
    this.current.lastError = result.error ?? 'Probe non riuscito.';
    this.current.lastTechnicalDetail = result.error;
    this.current.remediationCommand = windowsServiceRestartCommand(this.platform);
    this.transition('DEGRADED', options.mode === 'funnel'
      ? 'Funnel attivo ma non raggiungibile da Internet.'
      : 'Accesso privato configurato ma non raggiungibile dal tailnet.');
    return this.snapshot();
  }

  async remediate(options: TunnelActivationOptions): Promise<TailscaleTunnelSnapshot> {
    const detected = await this.detect({ ...options, force: true, probe: false });
    if (!detected.executable) return detected;
    this.transition('REMEDIATING', 'Riavvio controllato della connessione Tailscale…');
    try {
      await this.runFn(detected.executable, ['down'], { env: tailscaleEnv(detected.executable), timeoutMs: 25_000 });
      await this.runFn(detected.executable, ['up'], { env: tailscaleEnv(detected.executable), timeoutMs: 90_000 });
      await delay(2_000);
      const activation = await this.activate(options);
      if (activation.state === 'ACTIVE') { this.remediationFailures = 0; return activation; }
      this.remediationFailures += 1;
      if (this.remediationFailures >= 3) return this.fail('La remediation Tailscale è fallita tre volte.', new Error(activation.lastTechnicalDetail ?? activation.lastError ?? 'Probe ancora negativo.'));
      this.current.remediationCommand = windowsServiceRestartCommand(this.platform);
      return activation;
    } catch (error) {
      this.remediationFailures += 1;
      this.current.remediationCommand = windowsServiceRestartCommand(this.platform);
      return this.fail('Remediation automatica non completata.', error, this.remediationFailures >= 3 ? 'ERROR' : 'DEGRADED');
    }
  }

  diagnosticBundle(): Record<string, unknown> {
    return {
      kind: 'relay-tailscale-tunnel',
      createdAt: new Date(this.now()).toISOString(),
      platform: this.platform,
      mode: this.current.mode,
      state: this.current.state,
      executable: this.current.executable,
      executableSource: this.current.executableSource,
      version: this.current.version,
      backendState: this.current.backendState,
      dnsName: this.current.dnsName,
      publicPort: this.current.publicPort,
      baseUrl: this.current.baseUrl,
      lastProbe: this.current.lastProbe,
      lastError: sanitizeDiagnostic(this.current.lastError),
      technicalDetail: sanitizeDiagnostic(this.current.lastTechnicalDetail),
      transitions: this.current.transitions.slice(-12).map((entry) => ({ ...entry, detail: sanitizeDiagnostic(entry.detail) })),
      constraints: [
        'Non modificare altre configurazioni Serve/Funnel dell’utente.',
        'Non cambiare account, tailnet, hostname o policy senza consenso.',
        'Verificare il risultato con un probe HTTPS end-to-end su /health.'
      ]
    };
  }

  private async detectInternal(options: TunnelDetectionOptions, generation: number): Promise<TailscaleTunnelSnapshot> {
    this.current.mode = options.mode;
    if (options.mode === 'lan') {
      this.current.checkedAt = new Date(this.now()).toISOString();
      if (this.current.state === 'ACTIVE' || this.current.state === 'DEGRADED') this.transition('STOPPED', 'Modalità Solo rete locale.');
      return this.snapshot();
    }
    this.transition('ACTIVATING', 'Rilevamento Tailscale in corso…');
    let resolution: ExecutableResolution | undefined;
    try {
      resolution = await this.resolveFn('tailscale', { force: options.force, extraCandidates: tailscaleCandidates(this.platform) });
    } catch {
      if (generation !== this.generation) return this.snapshot();
      this.current = {
        ...this.current,
        mode: options.mode,
        state: 'NOT_INSTALLED',
        installed: false,
        executable: undefined,
        executableSource: undefined,
        checkedAt: new Date(this.now()).toISOString(),
        transitions: appendTransition(this.current.transitions, {
          at: new Date(this.now()).toISOString(), state: 'NOT_INSTALLED', message: 'Tailscale non è installato.'
        })
      };
      this.notify();
      return this.snapshot();
    }
    if (!resolution) {
      if (generation !== this.generation) return this.snapshot();
      this.current = {
        ...this.current,
        mode: options.mode,
        state: 'NOT_INSTALLED',
        installed: false,
        executable: undefined,
        executableSource: undefined,
        checkedAt: new Date(this.now()).toISOString(),
        transitions: appendTransition(this.current.transitions, {
          at: new Date(this.now()).toISOString(), state: 'NOT_INSTALLED', message: 'Tailscale non è installato.'
        })
      };
      this.notify();
      return this.snapshot();
    }
    if (generation !== this.generation) return this.snapshot();
    this.current.installed = true;
    this.current.executable = resolution.path;
    this.current.executableSource = resolution.source;
    this.current.macVariant = detectMacVariant(resolution.path, this.platform);

    const versionResult = await this.runFn(resolution.path, ['version'], { env: { ...resolution.env, ...tailscaleEnv(resolution.path) }, timeoutMs: CLI_TIMEOUT_MS }).catch(() => undefined);
    if (versionResult?.exitCode === 0) this.current.version = firstLine(versionResult.stdout);

    const statusResult = await this.runFn(resolution.path, ['status', '--json'], { env: { ...resolution.env, ...tailscaleEnv(resolution.path) }, timeoutMs: CLI_TIMEOUT_MS }).catch((error) => ({ stdout: '', stderr: error instanceof Error ? error.message : String(error), exitCode: -1 }));
    const status = parseTailscaleStatus(statusResult.stdout);
    this.current.checkedAt = new Date(this.now()).toISOString();
    this.current.backendState = status.BackendState || inferBackendState(statusResult.stderr);
    this.current.dnsName = normalizeDnsName(status.Self?.DNSName);
    this.current.changedUrl = Boolean(options.previousDnsName && this.current.dnsName && options.previousDnsName !== this.current.dnsName);
    if (statusResult.exitCode !== 0 && !status.BackendState) {
      const detail = compactError(statusResult);
      if (this.platform === 'darwin' && this.current.macVariant === 'gui' && /Tailscale\.CLIError|open.*Tailscale/i.test(detail)) {
        return this.fail('Apri l’app Tailscale una volta e poi premi Ricontrolla.', new Error(detail));
      }
      return this.fail('Relay non riesce a comunicare con il servizio Tailscale.', new Error(detail));
    }
    if (this.current.backendState !== 'Running') {
      this.transition('INSTALLED_NEEDS_LOGIN', this.current.backendState === 'NeedsLogin' ? 'Tailscale richiede l’accesso.' : 'Tailscale è installato ma non connesso.');
      return this.snapshot();
    }
    this.transition('LOGGED_IN', 'Tailscale connesso.');
    if (!this.current.dnsName) return this.fail('Tailscale non ha restituito il nome DNS del dispositivo.', new Error('Self.DNSName assente in tailscale status --json'));

    const target = options.localPort ? relayTarget(options.localPort) : undefined;
    const [serve, funnel] = await Promise.all([
      this.readStatusJson(resolution.path, 'serve'),
      this.readStatusJson(resolution.path, 'funnel')
    ]);
    const port = target
      ? selectTailscalePort(serve.json, funnel.json, target, options.configuredPublicPort)
      : options.configuredPublicPort;
    this.current.publicPort = port;
    this.current.baseUrl = port ? buildTailscaleBaseUrl(this.current.dnsName, port) : undefined;

    const configured = target && port
      ? options.mode === 'funnel'
        ? statusHasTarget(funnel.json, port, target)
        : statusHasTarget(serve.json, port, target) && !statusAllowsFunnel(serve.json, port)
      : false;
    if (!configured) {
      this.transition(options.mode === 'funnel' ? 'FUNNEL_NEEDS_ENABLE' : 'LOGGED_IN', options.mode === 'funnel' ? 'Funnel Relay non ancora attivo.' : 'Accesso privato Relay non ancora attivo.');
      return this.snapshot();
    }
    this.transition('ACTIVE', options.mode === 'funnel' ? 'Funnel Relay configurato.' : 'Accesso privato Relay configurato.');
    return this.snapshot();
  }

  private async waitForConfigured(options: TunnelActivationOptions, port: number, attempts: number): Promise<TailscaleTunnelSnapshot> {
    let refreshed = await this.detect({ ...options, configuredPublicPort: port, force: true, probe: false });
    for (let attempt = 0; attempt < attempts && refreshed.state !== 'ACTIVE'; attempt += 1) {
      await delay(2_500);
      refreshed = await this.detect({ ...options, configuredPublicPort: port, force: true, probe: false });
    }
    return refreshed;
  }

  private async readStatusJson(executable: string, command: 'serve' | 'funnel'): Promise<{ json: unknown; result: CommandResult }> {
    const result = await this.runFn(executable, [command, 'status', '--json'], { env: tailscaleEnv(executable), timeoutMs: CLI_TIMEOUT_MS }).catch((error) => ({ stdout: '', stderr: error instanceof Error ? error.message : String(error), exitCode: -1 }));
    return { json: safeJson(result.stdout), result };
  }

  private transition(state: TunnelLifecycleState, message: string, command?: string, detail?: string): void {
    this.current.state = state;
    this.current.transitions = appendTransition(this.current.transitions, {
      at: new Date(this.now()).toISOString(), state, message, ...(command ? { command } : {}), ...(detail ? { detail } : {})
    });
    this.notify();
  }

  private fail(message: string, error: unknown, state: TunnelLifecycleState = 'ERROR'): TailscaleTunnelSnapshot {
    const detail = error instanceof Error ? error.message : String(error);
    this.current.lastError = message;
    this.current.lastTechnicalDetail = detail;
    this.transition(state, message, undefined, detail);
    return this.snapshot();
  }

  private setStopped(message: string): TailscaleTunnelSnapshot {
    this.current.lastError = undefined;
    this.current.lastTechnicalDetail = undefined;
    this.current.lastProbe = undefined;
    this.current.verifiedAt = undefined;
    this.transition('STOPPED', message);
    return this.snapshot();
  }

  private notify(): void { this.onChanged?.(); }
}

export function parseTailscaleStatus(raw: string): TailscaleStatusJson {
  const parsed = safeJson(raw);
  return parsed && typeof parsed === 'object' ? parsed as TailscaleStatusJson : {};
}

export function extractTailscaleLoginUrl(text: string): string | undefined {
  return extractUrls(text).find((url) => /^https:\/\/login\.tailscale\.com\/a\//i.test(url));
}

export function extractTailscaleApprovalUrl(text: string): string | undefined {
  const urls = extractUrls(text);
  return urls.find((url) => /^https:\/\/login\.tailscale\.com\/(?:admin\/)?funnel\b/i.test(url))
    ?? urls.find((url) => /^https:\/\/login\.tailscale\.com\//i.test(url) && !/\/a\//i.test(url));
}

export function buildTailscaleBaseUrl(dnsName: string, port: number): string {
  const name = normalizeDnsName(dnsName);
  if (!name) throw new Error('DNSName Tailscale non valido.');
  return `https://${name}${port === 443 ? '' : `:${port}`}`;
}

export function selectTailscalePort(serveStatus: unknown, funnelStatus: unknown, relayTargetUrl: string, preferred?: number): number | undefined {
  const serve = collectServePorts(serveStatus);
  const funnel = collectServePorts(funnelStatus);
  const ordered = [...new Set([preferred, ...PUBLIC_PORTS].filter((value): value is number => PUBLIC_PORTS.includes(value as any)))];
  for (const port of ordered) {
    const targets = [...(serve.get(port)?.targets ?? []), ...(funnel.get(port)?.targets ?? [])];
    if (targets.some((target) => normalizeTarget(target) === normalizeTarget(relayTargetUrl))) return port;
    if (!serve.has(port) && !funnel.has(port)) return port;
  }
  return undefined;
}

export function collectServePorts(value: unknown): Map<number, ServePortEntry> {
  const result = new Map<number, ServePortEntry>();
  const visit = (node: unknown, path: string[]) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((entry, index) => visit(entry, [...path, String(index)])); return; }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const match = key.match(/(?:^|:)(443|8443|10000)$/);
      if (match && looksLikeServeNode(child, path, key)) {
        const port = Number(match[1]);
        const targets = collectProxyTargets(child);
        const existing = result.get(port) ?? { port, targets: [] };
        existing.targets.push(...targets);
        result.set(port, { port, targets: [...new Set(existing.targets)] });
      }
      visit(child, [...path, key]);
    }
  };
  visit(value, []);
  return result;
}

export function probeTunnelHealth(url: string, fetchFn: typeof fetch = fetch, timeoutMs = PROBE_TIMEOUT_MS, now: () => number = Date.now): Promise<TunnelProbeResult> {
  const started = now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetchFn(url, { cache: 'no-store', redirect: 'error', signal: controller.signal, headers: { 'user-agent': 'Relay-Tunnel-Probe/1' } })
    .then(async (response) => {
      const body = await response.text().catch(() => '');
      const ok = response.ok && /"ok"\s*:\s*true/.test(body);
      return { ok, checkedAt: new Date(now()).toISOString(), durationMs: Math.max(0, now() - started), url, statusCode: response.status, ...(ok ? {} : { error: `HTTP ${response.status}` }) };
    })
    .catch((error) => ({
      ok: false,
      checkedAt: new Date(now()).toISOString(),
      durationMs: Math.max(0, now() - started),
      url,
      dnsPropagation: isDnsPropagationError(error),
      error: error instanceof Error ? error.message : String(error)
    }))
    .finally(() => clearTimeout(timer));
}

export function tailscaleInstallPlan(platform: NodeJS.Platform): TunnelInstallPlan {
  if (platform === 'win32') return {
    mode: 'terminal', label: 'Tailscale',
    command: 'winget install --id tailscale.tailscale --exact --accept-package-agreements --accept-source-agreements',
    detail: 'Installa il client ufficiale Tailscale. Se WinGet non è disponibile, Relay può aprire il download ufficiale.'
  };
  if (platform === 'darwin') return {
    mode: 'external', label: 'Tailscale per macOS', url: 'https://tailscale.com/download/mac',
    detail: 'Installa la variante Standalone consigliata. Relay rileva la CLI inclusa nell’app, prova il proxy di porta supportato dalla versione installata e valida sempre il risultato con un probe reale.'
  };
  return {
    mode: 'terminal', label: 'Tailscale',
    command: 'curl -fsSL https://tailscale.com/install.sh | sh',
    detail: 'Installa Tailscale con lo script ufficiale. Sarà richiesto sudo una sola volta per impostare l’operatore locale.'
  };
}

export function linuxOperatorCommand(username = process.env.USER || process.env.USERNAME || '$USER'): string {
  const safe = /^[A-Za-z0-9._-]+$/.test(username) ? username : '$USER';
  return `sudo tailscale set --operator=${safe}`;
}

export function windowsServiceRestartCommand(platform: NodeJS.Platform = process.platform): string | undefined {
  return platform === 'win32'
    ? `Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile','-Command','Restart-Service Tailscale'`
    : undefined;
}

function statusHasTarget(status: unknown, port: number, target: string): boolean {
  const entry = collectServePorts(status).get(port);
  return Boolean(entry?.targets.some((value) => normalizeTarget(value) === normalizeTarget(target)));
}

function statusAllowsFunnel(status: unknown, port: number): boolean {
  let allowed = false;
  const visit = (node: unknown, path: string[]) => {
    if (allowed || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((entry, index) => visit(entry, [...path, String(index)])); return; }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const next = [...path, key];
      const context = next.join('.');
      if (/allowfunnel/i.test(key)) {
        if (child === true && new RegExp(`(?:^|:)${port}(?:$|\.)`).test(context)) { allowed = true; return; }
        if (child && typeof child === 'object') {
          for (const [childKey, value] of Object.entries(child as Record<string, unknown>)) {
            if (value === true && new RegExp(`:${port}$`).test(childKey)) { allowed = true; return; }
          }
        }
      }
      if (child === true && /allowfunnel/i.test(context) && new RegExp(`:${port}(?:$|\.)`).test(context)) { allowed = true; return; }
      visit(child, next);
    }
  };
  visit(status, []);
  return allowed;
}

function looksLikeServeNode(value: unknown, path: string[], key: string): boolean {
  const context = [...path, key].join('.').toLowerCase();
  if (/web|tcp|allowfunnel|serve|funnel/.test(context)) return true;
  const text = JSON.stringify(value ?? {});
  return /proxy|handlers|http:\/\/127\.0\.0\.1|https?/.test(text);
}

function collectProxyTargets(value: unknown): string[] {
  const result: string[] = [];
  const visit = (node: unknown, key = '') => {
    if (typeof node === 'string') {
      if (/proxy|target|forward/i.test(key) || /^https?:\/\//i.test(node)) result.push(node);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((entry) => visit(entry, key)); return; }
    for (const [childKey, child] of Object.entries(node as Record<string, unknown>)) visit(child, childKey);
  };
  visit(value);
  return result;
}

function relayTarget(localPort: number): string { return `http://127.0.0.1:${localPort}`; }
function normalizeTarget(value: string): string { return String(value || '').replace(/\/$/, '').replace('localhost', '127.0.0.1').toLowerCase(); }
function normalizeDnsName(value: string | undefined): string | undefined { return value?.trim().replace(/\.$/, '') || undefined; }
function safeJson(value: string): unknown { try { return JSON.parse(value || '{}'); } catch { return {}; } }
function firstLine(value: string): string | undefined { return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean); }
function inferBackendState(value: string): string | undefined {
  if (/needs login|logged out|not logged in/i.test(value)) return 'NeedsLogin';
  if (/stopped|not running/i.test(value)) return 'Stopped';
  return undefined;
}
function compactError(result: Pick<CommandResult, 'stdout' | 'stderr' | 'exitCode'>): string {
  const text = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
  return text.slice(-2_000) || `Comando terminato con codice ${result.exitCode}.`;
}
function extractUrls(text: string): string[] { return [...String(text || '').matchAll(/https:\/\/[^\s<>'"\])]+/gi)].map((match) => match[0].replace(/[.,;]+$/, '')); }
function isDnsPropagationError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${(error as any).cause?.code || ''}` : String(error);
  return /ENOTFOUND|EAI_AGAIN|NXDOMAIN|name.*not resolved|getaddrinfo/i.test(text);
}
function sanitizeDiagnostic(value: string | undefined): string | undefined {
  return value?.replace(/(?:token|auth|key|secret|password)\s*[=:]\s*\S+/gi, '[redacted]').slice(-2_000);
}
function tailscaleEnv(executable: string): NodeJS.ProcessEnv {
  return { TAILSCALE_BE_CLI: '1', PATH: process.env.PATH, Path: process.env.Path, RELAY_TAILSCALE_EXECUTABLE: executable };
}
function tailscaleCandidates(platform: NodeJS.Platform): string[] {
  if (platform === 'win32') return [
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Tailscale', 'tailscale.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Tailscale', 'tailscale.exe')
  ];
  if (platform === 'darwin') return [
    '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
    '/Applications/Tailscale.app/Contents/MacOS/tailscale',
    '/opt/homebrew/bin/tailscale',
    '/usr/local/bin/tailscale'
  ];
  return ['/usr/bin/tailscale', '/usr/local/bin/tailscale', '/snap/bin/tailscale'];
}
function detectMacVariant(executable: string, platform: NodeJS.Platform): TailscaleTunnelSnapshot['macVariant'] {
  if (platform !== 'darwin') return undefined;
  return executable.includes('/Applications/Tailscale.app/') ? 'gui' : executable.includes('/bin/tailscale') ? 'open-source' : 'unknown';
}
function appendTransition(current: TunnelTransition[], entry: TunnelTransition): TunnelTransition[] {
  const last = current[current.length - 1];
  if (last?.state === entry.state && last.message === entry.message) return current;
  return [...current, entry].slice(-24);
}
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
