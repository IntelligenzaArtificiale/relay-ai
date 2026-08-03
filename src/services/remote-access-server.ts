import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces, hostname, platform } from 'node:os';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { readFile, realpath, stat } from 'node:fs/promises';
import { chmodSync, createReadStream, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
// The browser renderer avoids Node canvas/png/fs paths and returns compact SVG.
// esbuild bundles this CommonJS module into both extension and tests safely.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import QRCode from 'qrcode/lib/browser.js';
import type { RelayViewState } from './relay-controller.js';
import type { RemoteAccessMode, TailscaleTunnelSnapshot } from './tunnel-manager.js';
import { remoteHtml } from './remote-app.js';
import type { ConversationArtifact } from '../core/types.js';
import { createArtifactZip, isAllowedLoopbackUrl, mimeTypeForPath, resolveConversationArtifact, type ResolvedWorkspaceArtifact } from './remote-artifacts.js';

export interface RemoteSessionSummary {
  id: string;
  name: string;
  address: string;
  userAgent?: string;
  pairedAt: string;
  lastSeenAt: string;
}


export interface RemoteSessionHistoryEntry extends RemoteSessionSummary {
  endedAt: string;
  durationMs: number;
  reason: 'revoked' | 'expired' | 'server-stopped' | 'replaced';
}

export interface RemoteAccessNetworkUrl {
  label: string;
  url: string;
  address: string;
}

export interface RemoteAccessDiagnostic {
  level: 'info' | 'warning';
  title: string;
  detail: string;
}

export interface RemoteAccessSnapshot {
  enabled: boolean;
  mode: RemoteAccessMode;
  bindAddress?: string;
  secure: boolean;
  tunnel?: TailscaleTunnelSnapshot;
  url?: string;
  qrDataUrl?: string;
  pairingCode?: string;
  pairingExpiresAt?: string;
  pairingId?: string;
  ticketUsed?: boolean;
  port?: number;
  host?: string;
  urls: RemoteAccessNetworkUrl[];
  diagnostics: RemoteAccessDiagnostic[];
  activeSessions: RemoteSessionSummary[];
  sessionHistory: RemoteSessionHistoryEntry[];
  lastError?: string;
  startedAt?: string;
  platform: string;
  computerName: string;
}

type ControllerMessageHandler = (message: any) => Promise<any>;
type StateProvider = () => Promise<RelayViewState>;
export type RemoteValidationState = Pick<RelayViewState, 'conversation' | 'conversations' | 'activeRuns' | 'agents' | 'rules' | 'projects' | 'providers' | 'mcp' | 'automations'>;
type ActionStateProvider = () => Promise<RemoteValidationState>;
export type RemoteArtifactProvider = (conversationId: string, messageId: string, artifactId: string) => Promise<{ workspaceRoot: string; artifact: ConversationArtifact } | undefined>;

interface PairingTicket {
  id: string;
  code: string;
  createdAt: string;
  used: boolean;
}

interface RemoteSession extends RemoteSessionSummary {
  tokenHash: string;
}

interface PersistedRemoteSession extends RemoteSessionSummary {
  tokenHash: string;
}

interface SseClient {
  id: string;
  response: ServerResponse;
  heartbeat: NodeJS.Timeout;
}

interface PairAttempt { count: number; firstAt: number }
interface BootstrapPairing { code: string; expiresAt: string }
interface PreviewGrant {
  id: string;
  sessionId: string;
  conversationId: string;
  messageId: string;
  artifactId: string;
  expiresAt: number;
  cookies: Map<string, string>;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PAIRING_TTL_MS = 10 * 60 * 1000;
const PREVIEW_GRANT_TTL_MS = 30 * 60 * 1000;
const MAX_PREVIEW_BODY_BYTES = 4 * 1024 * 1024;

export class RemoteAccessServer {
  private server: Server | undefined;
  private ticket: PairingTicket | undefined;
  private sessions = new Map<string, RemoteSession>();
  private sseClients = new Map<string, SseClient>();
  private qrDataUrl: string | undefined;
  private publicUrl: string | undefined;
  private port: number | undefined;
  private lastError: string | undefined;
  private startedAt: string | undefined;
  private mode: RemoteAccessMode = 'lan';
  private bindAddress: '0.0.0.0' | '127.0.0.1' = '0.0.0.0';
  private externalBaseUrl: string | undefined;
  private tunnelSnapshot: TailscaleTunnelSnapshot | undefined;
  private readonly pairAttempts = new Map<string, PairAttempt>();
  private sessionHistory: RemoteSessionHistoryEntry[] = [];
  private stateBroadcastTimer: NodeJS.Timeout | undefined;
  private stateBroadcastInFlight = false;
  private stateBroadcastQueued = false;
  private lastRemoteState: any;
  private pendingRemoteState: any;
  private readonly actionStateProvider: ActionStateProvider;
  private readonly sessionsPath: string | undefined;
  private readonly bootstrapPath: string | undefined;
  private sessionWriteTimer: NodeJS.Timeout | undefined;
  private readonly instanceId = randomId(8);
  private readonly previewGrants = new Map<string, PreviewGrant>();

  constructor(
    private readonly stateProvider: StateProvider,
    private readonly handleMessage: ControllerMessageHandler,
    private readonly historyPath?: string,
    private readonly onChanged?: () => void,
    actionStateProvider?: ActionStateProvider,
    private readonly artifactProvider?: RemoteArtifactProvider
  ) {
    this.actionStateProvider = actionStateProvider ?? stateProvider;
    this.sessionsPath = historyPath ? join(dirname(historyPath), 'remote-sessions.json') : undefined;
    this.bootstrapPath = historyPath ? join(dirname(historyPath), 'remote-bootstrap.json') : undefined;
    this.sessionHistory = this.readHistory();
    this.sessions = this.readSessions();
  }

  snapshot(): RemoteAccessSnapshot {
    this.pruneSessions();
    return {
      enabled: Boolean(this.server),
      mode: this.mode,
      bindAddress: this.server ? this.bindAddress : undefined,
      secure: this.mode !== 'lan',
      ...(this.tunnelSnapshot ? { tunnel: structuredClone(this.tunnelSnapshot) } : {}),
      ...(this.publicUrl ? { url: this.publicUrl } : {}),
      ...(this.qrDataUrl ? { qrDataUrl: this.qrDataUrl } : {}),
      ...(this.ticket?.code ? { pairingCode: this.ticket.code } : {}),
      ...(this.ticket ? { pairingExpiresAt: new Date(new Date(this.ticket.createdAt).getTime() + PAIRING_TTL_MS).toISOString() } : {}),
      ...(this.ticket ? { pairingId: shortPairingId(this.ticket.id) } : {}),
      ...(this.ticket ? { ticketUsed: this.ticket.used } : {}),
      ...(this.port ? { port: this.port } : {}),
      ...(this.publicUrl ? { host: new URL(this.publicUrl).hostname } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
      ...(this.startedAt ? { startedAt: this.startedAt } : {}),
      urls: this.port ? this.remoteUrls() : [],
      diagnostics: remoteDiagnostics(this.port, this.ticket?.id, this.mode, this.tunnelSnapshot),
      activeSessions: [...this.sessions.values()]
        .map(({ tokenHash: _tokenHash, ...session }) => session)
        .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)),
      sessionHistory: this.sessionHistory.slice(0, 100),
      platform: platform(),
      computerName: hostname()
    };
  }

  async start(mode: RemoteAccessMode = this.mode, preferredPort?: number): Promise<RemoteAccessSnapshot> {
    const desiredBind = mode === 'lan' ? '0.0.0.0' : '127.0.0.1';
    if (this.server && (this.mode !== mode || this.bindAddress !== desiredBind)) await this.stop(false, false);
    this.mode = mode;
    this.bindAddress = desiredBind;
    if (this.server) {
      await this.rotatePairing();
      return this.snapshot();
    }
    this.lastError = undefined;
    const listen = (port: number) => new Promise<void>((resolve, reject) => {
      const server = createServer((request, response) => void this.route(request, response));
      this.server = server;
      const onError = (error: NodeJS.ErrnoException) => {
        this.lastError = error.message;
        server.removeListener('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        server.on('error', (error) => { this.lastError = error.message; });
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, this.bindAddress);
    });
    try {
      await listen(preferredPort && preferredPort > 1024 && preferredPort < 65536 ? preferredPort : 0);
    } catch (error) {
      const failed = this.server;
      this.server = undefined;
      await new Promise<void>((resolve) => failed?.listening ? failed.close(() => resolve()) : resolve());
      if (!preferredPort || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
      this.lastError = undefined;
      await listen(0);
    }
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Impossibile determinare la porta del server remoto Relay.');
    this.port = address.port;
    this.startedAt = new Date().toISOString();
    await this.rotatePairing();
    return this.snapshot();
  }

  async stop(clearExposure = true, revokeSessions = true): Promise<RemoteAccessSnapshot> {
    if (this.stateBroadcastTimer) clearTimeout(this.stateBroadcastTimer);
    this.stateBroadcastTimer = undefined;
    this.stateBroadcastQueued = false;
    this.lastRemoteState = undefined;
    this.pendingRemoteState = undefined;
    this.closeAllSse();
    if (revokeSessions) {
      for (const [tokenHash, session] of [...this.sessions]) this.finishSession(tokenHash, session, 'server-stopped');
    } else {
      this.writeSessions();
    }
    const server = this.server;
    this.server = undefined;
    this.ticket = undefined;
    if (revokeSessions) this.sessions.clear();
    this.pairAttempts.clear();
    this.qrDataUrl = undefined;
    this.publicUrl = undefined;
    if (clearExposure) { this.externalBaseUrl = undefined; this.tunnelSnapshot = undefined; this.mode = 'lan'; this.bindAddress = '0.0.0.0'; }
    this.port = undefined;
    this.startedAt = undefined;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    return this.snapshot();
  }

  async configureExposure(mode: RemoteAccessMode, externalBaseUrl?: string, tunnel?: TailscaleTunnelSnapshot): Promise<RemoteAccessSnapshot> {
    this.mode = mode;
    this.externalBaseUrl = externalBaseUrl?.replace(/\/$/, '');
    this.tunnelSnapshot = tunnel ? structuredClone(tunnel) : undefined;
    if (this.ticket && this.port) await this.refreshPublicUrlAndQr();
    this.broadcastState();
    return this.snapshot();
  }

  async rotatePairing(): Promise<RemoteAccessSnapshot> {
    if (!this.server || !this.port) await this.start(this.mode);
    const id = randomId(18);
    const code = String(randomInt(100000, 1_000_000));
    this.ticket = { id, code, createdAt: new Date().toISOString(), used: false };
    await this.refreshPublicUrlAndQr();
    this.broadcastState();
    return this.snapshot();
  }

  async verifyPublicPairingRoute(fetchFn: typeof fetch = fetch): Promise<{ ok: boolean; error?: string }> {
    if (this.mode === 'lan') return { ok: true };
    if (!this.externalBaseUrl || !this.ticket) return { ok: false, error: 'URL pubblico o ticket di pairing non disponibile.' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetchFn(`${this.externalBaseUrl}/api/pairing`, {
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal,
        headers: { accept: 'application/json', 'user-agent': 'Relay-Pairing-Probe' }
      });
      if (!response.ok) return { ok: false, error: `Probe pairing HTTP ${response.status}.` };
      const payload = await response.json() as Record<string, unknown>;
      if (payload.ticket !== this.ticket.id) return { ok: false, error: 'Il Funnel risponde con un ticket appartenente a un’altra istanza Relay.' };
      if (payload.instanceId !== this.instanceId) return { ok: false, error: 'Il Funnel risponde da un processo Relay precedente.' };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
  }


  private async refreshPublicUrlAndQr(): Promise<void> {
    if (!this.port || !this.ticket) return;
    if (this.mode === 'lan') {
      const host = preferredLanAddress() ?? '127.0.0.1';
      this.publicUrl = `http://${host}:${this.port}/?t=${encodeURIComponent(this.ticket.id)}`;
    } else if (this.externalBaseUrl) {
      this.publicUrl = `${this.externalBaseUrl}/?t=${encodeURIComponent(this.ticket.id)}`;
    } else {
      this.publicUrl = undefined;
      this.qrDataUrl = undefined;
      return;
    }
    const qrSvg = await QRCode.toString(this.publicUrl, {
      type: 'svg', errorCorrectionLevel: 'M', margin: 1,
      color: { dark: '#f59e0b', light: '#1f1f1f' }
    });
    this.qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(qrSvg, 'utf8').toString('base64')}`;
  }

  private remoteUrls(): RemoteAccessNetworkUrl[] {
    if (!this.port) return [];
    if (this.mode === 'lan') return lanUrls(this.port, this.ticket?.id);
    if (!this.publicUrl) return [];
    return [{ label: this.mode === 'funnel' ? 'Internet' : 'Tailnet privato', url: this.publicUrl, address: this.externalBaseUrl ?? '' }];
  }

  closeSession(id: string): RemoteAccessSnapshot {
    const client = this.sseClients.get(id);
    if (client) {
      clearInterval(client.heartbeat);
      client.response.end();
      this.sseClients.delete(id);
    }
    const matched = [...this.sessions.entries()].find(([, session]) => session.id === id);
    if (matched) this.finishSession(matched[0], matched[1], 'revoked');
    this.broadcastState();
    this.onChanged?.();
    return this.snapshot();
  }

  clearHistory(): RemoteAccessSnapshot {
    this.sessionHistory = [];
    this.writeHistory();
    return this.snapshot();
  }

  notifyStateChanged(state?: RelayViewState): void {
    if (!this.sseClients.size) return;
    if (state) this.pendingRemoteState = sanitizeStateForRemote(state);
    this.broadcastState();
  }

  async dispose(): Promise<void> {
    await this.stop(true, false);
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (!this.isAllowedHost(request)) return sendJson(response, 421, { error: 'Host remoto non autorizzato.' });
      const url = new URL(request.url ?? '/', this.mode === 'lan' ? 'http://relay.local' : (this.externalBaseUrl ?? 'https://relay.local'));
      if (request.method === 'GET' && url.pathname === '/') return this.serveApp(response);
      if (request.method === 'GET' && url.pathname === '/manifest.webmanifest') return this.serveManifest(response);
      if (request.method === 'GET' && url.pathname === '/relay-remote.svg') return this.serveIcon(response);
      if (request.method === 'GET' && url.pathname === '/health') return sendJson(response, 200, { ok: true, relay: 'remote' });
      if (request.method === 'GET' && url.pathname === '/api/pairing') return this.handlePairingInfo(response);
      if (request.method === 'POST' && url.pathname === '/api/pair') return this.handlePair(request, response);
      if (request.method === 'GET' && url.pathname === '/api/state') return this.handleState(url, request, response);
      if (request.method === 'POST' && url.pathname === '/api/preview-ticket') return this.handlePreviewTicket(url, request, response);
      if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/api/artifacts/')) return this.handleArtifact(url, request, response);
      if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/preview/')) return this.handlePreview(url, request, response);
      if (['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(String(request.method)) && url.pathname.startsWith('/preview-access/')) return this.handlePreviewAccess(url, request, response);
      if (request.method === 'GET' && url.pathname === '/events') return this.handleEvents(url, request, response);
      if (request.method === 'POST' && url.pathname === '/api/action') return this.handleAction(url, request, response);
      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private isAllowedHost(request: IncomingMessage): boolean {
    const raw = String(request.headers.host ?? '').trim();
    if (!raw) return false;
    const hostnameOnly = raw.replace(/^\[/, '').replace(/\](:\d+)?$/, '').replace(/:\d+$/, '').toLowerCase();
    if (hostnameOnly === 'localhost' || hostnameOnly === '127.0.0.1' || hostnameOnly === '::1') return true;
    if (this.mode === 'lan') return lanAddresses().some((entry) => entry.address.toLowerCase() === hostnameOnly);
    const expected = this.externalBaseUrl ? new URL(this.externalBaseUrl).hostname.toLowerCase() : this.tunnelSnapshot?.dnsName?.toLowerCase();
    return Boolean(expected && hostnameOnly === expected && expected.endsWith('.ts.net'));
  }

  private serveApp(response: ServerResponse): void {
    const nonce = randomId(18);
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'content-security-policy': `default-src 'self'; img-src 'self' data:; connect-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; manifest-src 'self'; base-uri 'none'; form-action 'none'`
    });
    response.end(remoteHtml(nonce));
  }


  private serveManifest(response: ServerResponse): void {
    sendJson(response, 200, {
      name: 'Relay Remote',
      short_name: 'Relay',
      description: this.mode === 'lan' ? 'Controllo locale di Relay da telefono sulla stessa rete.' : 'Controllo sicuro di Relay tramite Tailscale.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#151515',
      theme_color: '#151515',
      icons: [
        { src: '/relay-remote.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
      ]
    });
  }

  private serveIcon(response: ServerResponse): void {
    response.writeHead(200, {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    });
    response.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="30" fill="#171717"/><path d="M64 22v20M64 86v20M22 64h20M86 64h20M43 43l14 14M71 71l14 14M85 43 71 57M57 71 43 85" stroke="#f59e0b" stroke-width="9" stroke-linecap="round"/><circle cx="64" cy="64" r="13" fill="#f59e0b"/></svg>`);
  }

  private handlePairingInfo(response: ServerResponse): void {
    const current = this.ticket;
    if (!current) return sendJson(response, 503, { error: 'Pairing remoto non disponibile.' });
    sendJson(response, 200, {
      ticket: current.id,
      instanceId: this.instanceId,
      expiresAt: new Date(new Date(current.createdAt).getTime() + PAIRING_TTL_MS).toISOString(),
      used: current.used
    });
  }

  private async handlePair(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!isRelayRequest(request)) return sendJson(response, 403, { error: 'Richiesta non valida.' });
    const address = normalizeAddress(request.socket.remoteAddress ?? '');
    if (!this.allowPairAttempt(address)) return sendJson(response, 429, { error: 'Troppi tentativi. Attendi qualche minuto e rigenera il QR.' });
    const body = await readJson(request);
    const ticket = String(body.ticket ?? '');
    const code = String(body.code ?? '').replace(/\D/g, '');
    const current = this.ticket;
    const bootstrap = this.readBootstrapPairing();
    const bootstrapAccepted = Boolean(bootstrap && code === bootstrap.code);
    if (!bootstrapAccepted) {
      if (!current) return sendJson(response, 503, { error: 'Pairing non disponibile. Rigenera il QR da Relay.' });
      if (current.used) return sendJson(response, 409, { error: 'Questo QR è già stato usato. Rigenera un nuovo accesso.' });
      if (Date.now() - new Date(current.createdAt).getTime() > PAIRING_TTL_MS) return sendJson(response, 410, { error: 'Codice scaduto. Rigenera il QR.' });
      if (code !== current.code) {
        return sendJson(response, 403, {
          error: current.id !== ticket
            ? 'Il QR aperto non è più quello corrente. Scansiona il QR aggiornato e usa il nuovo codice.'
            : 'Codice di abbinamento errato.'
        });
      }
      // Il codice corrente resta l'autorità di pairing. Browser, PWA e scanner QR
      // possono perdere o riutilizzare la query `?t=`; non blocchiamo un codice
      // corretto e non scaduto solo per un ticket URL mancante o stale.
      current.used = true;
    } else {
      this.consumeBootstrapPairing();
    }
    this.pairAttempts.delete(address);
    const token = randomId(32);
    const session: RemoteSession = {
      id: randomId(8),
      tokenHash: hashSessionToken(token),
      name: String(body.name ?? '').trim().slice(0, 60) || 'Telefono',
      address,
      userAgent: String(request.headers['user-agent'] ?? '').slice(0, 180),
      pairedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    };
    this.sessions.set(session.tokenHash, session);
    this.writeSessions();
    this.broadcastState();
    this.onChanged?.();
    sendJson(response, 200, { sessionId: session.id, token }, { 'set-cookie': sessionCookie(token, this.mode !== 'lan') });
  }

  private async handleState(url: URL, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const session = this.requireSession(url, request);
    if (!session) return sendJson(response, 401, { error: 'Sessione remota non valida.' });
    const state = sanitizeStateForRemote(await this.stateProvider());
    this.lastRemoteState = state;
    sendJson(response, 200, state);
  }

  private async handlePreviewTicket(
    url: URL,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const session = this.requireSession(url, request);
    if (!session)
      return sendJson(response, 401, { error: "Sessione remota non valida." });
    const body = await readJson(request);
    const conversationId = String(body.conversationId ?? "");
    const messageId = String(body.messageId ?? "");
    const artifactId = String(body.artifactId ?? "");
    const lookup = await this.lookupArtifactByIds(
      conversationId,
      messageId,
      artifactId,
    );
    if (!lookup)
      return sendJson(response, 404, { error: "Anteprima non disponibile." });
    const resolved = await resolveConversationArtifact(
      lookup.workspaceRoot,
      lookup.artifact,
    );
    if (!resolved || !isPreviewableArtifact(resolved))
      return sendJson(response, 400, {
        error: "Questo elemento non dispone di un’anteprima web.",
      });
    this.prunePreviewGrants();
    const id = randomId(18);
    const grant: PreviewGrant = {
      id,
      sessionId: session.id,
      conversationId,
      messageId,
      artifactId,
      expiresAt: Date.now() + PREVIEW_GRANT_TTL_MS,
      cookies: new Map<string, string>(),
    };
    this.previewGrants.set(id, grant);
    const prefix = `/preview-access/${encodeURIComponent(id)}/${encodeURIComponent(conversationId)}/${encodeURIComponent(messageId)}/${encodeURIComponent(artifactId)}/`;
    sendJson(response, 200, {
      url: prefix,
      expiresAt: new Date(grant.expiresAt).toISOString(),
    });
  }

  private async handlePreviewAccess(
    url: URL,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    this.prunePreviewGrants();
    const parts = url.pathname.slice("/preview-access/".length).split("/");
    if (parts.length < 4)
      return sendJson(response, 404, { error: "Anteprima non disponibile." });
    let grantId: string;
    let conversationId: string;
    let messageId: string;
    let artifactId: string;
    try {
      grantId = decodeURIComponent(parts[0]);
      conversationId = decodeURIComponent(parts[1]);
      messageId = decodeURIComponent(parts[2]);
      artifactId = decodeURIComponent(parts[3]);
    } catch {
      return sendJson(response, 400, { error: "Anteprima non valida." });
    }
    const grant = this.previewGrants.get(grantId);
    const sessionStillActive = grant
      ? [...this.sessions.values()].some((session) => session.id === grant.sessionId)
      : false;
    if (
      !grant ||
      !sessionStillActive ||
      grant.expiresAt <= Date.now() ||
      grant.conversationId !== conversationId ||
      grant.messageId !== messageId ||
      grant.artifactId !== artifactId
    ) {
      this.previewGrants.delete(grantId);
      return sendJson(response, 401, {
        error: "Anteprima scaduta. Riaprila dalla chat Relay.",
      });
    }
    const lookup = await this.lookupArtifactByIds(
      conversationId,
      messageId,
      artifactId,
    );
    if (!lookup)
      return sendJson(response, 404, { error: "Anteprima non disponibile." });
    const resolved = await resolveConversationArtifact(
      lookup.workspaceRoot,
      lookup.artifact,
    );
    if (!resolved || !isPreviewableArtifact(resolved))
      return sendJson(response, 404, { error: "Anteprima non disponibile." });
    const suffix = parts.slice(4).join("/");
    const previewPrefix = `/preview-access/${encodeURIComponent(grantId)}/${encodeURIComponent(conversationId)}/${encodeURIComponent(messageId)}/${encodeURIComponent(artifactId)}`;
    if (resolved.artifact.kind === "local-service") {
      return this.proxyLocalService(
        request,
        response,
        resolved,
        suffix,
        url.search,
        previewPrefix,
        grant,
      );
    }
    if (!resolved.absolutePath)
      return sendJson(response, 404, { error: "Anteprima non disponibile." });
    if (resolved.artifact.kind === "static-site" && resolved.rootDirectory) {
      const target = await resolveStaticPreviewFile(
        resolved,
        suffix,
        String(request.headers.accept ?? ""),
      );
      if (!target)
        return sendJson(response, 404, {
          error: "Risorsa dell’anteprima non trovata.",
        });
      return sendPreviewFile(
        response,
        request.method === "HEAD",
        target,
        previewPrefix,
      );
    }
    return sendPreviewFile(
      response,
      request.method === "HEAD",
      resolved.absolutePath,
      previewPrefix,
    );
  }

  private async handleArtifact(url: URL, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const session = this.requireSession(url, request);
    if (!session) return sendJson(response, 401, { error: 'Sessione remota non valida.' });
    const lookup = await this.lookupArtifact(url.pathname, '/api/artifacts/');
    if (!lookup) return sendJson(response, 404, { error: 'File non disponibile nella conversazione corrente.' });
    const resolved = await resolveConversationArtifact(lookup.workspaceRoot, lookup.artifact);
    if (!resolved) return sendJson(response, 404, { error: 'Il file non esiste più o non appartiene al workspace.' });

    if (resolved.artifact.kind === 'bundle') {
      const archive = await createArtifactZip(resolved);
      return sendDownload(response, request.method === 'HEAD', archive, resolved.artifact.name, 'application/zip');
    }
    if (!resolved.absolutePath) return sendJson(response, 404, { error: 'File non disponibile.' });
    await sendFile(response, request.method === 'HEAD', resolved.absolutePath, resolved.artifact.name, resolved.artifact.mimeType ?? mimeTypeForPath(resolved.absolutePath), true);
  }

  private async handlePreview(url: URL, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const session = this.requireSession(url, request);
    if (!session) return sendJson(response, 401, { error: 'Sessione remota non valida.' });
    const lookup = await this.lookupArtifact(url.pathname, '/preview/');
    if (!lookup) return sendJson(response, 404, { error: 'Anteprima non disponibile.' });
    const resolved = await resolveConversationArtifact(lookup.workspaceRoot, lookup.artifact);
    if (!resolved) return sendJson(response, 404, { error: 'Anteprima non disponibile o fuori dal workspace.' });
    const previewPrefix = `/preview/${encodeURIComponent(lookup.conversationId)}/${encodeURIComponent(lookup.messageId)}/${encodeURIComponent(lookup.artifact.id)}`;
    if (resolved.artifact.kind === 'local-service') {
      return this.proxyLocalService(request, response, resolved, lookup.suffix, url.search, previewPrefix);
    }
    if (resolved.artifact.kind !== 'static-site' || !resolved.absolutePath || !resolved.rootDirectory) {
      return sendJson(response, 400, { error: 'Questo elemento non dispone di un’anteprima web.' });
    }
    const target = await resolveStaticPreviewFile(resolved, lookup.suffix, String(request.headers.accept ?? ''));
    if (!target) return sendJson(response, 404, { error: 'Risorsa dell’anteprima non trovata.' });
    await sendPreviewFile(response, request.method === 'HEAD', target, previewPrefix);
  }

  private async lookupArtifactByIds(
    conversationId: string,
    messageId: string,
    artifactId: string,
  ): Promise<
    { artifact: ConversationArtifact; workspaceRoot: string } | undefined
  > {
    const supplied = await this.artifactProvider?.(
      conversationId,
      messageId,
      artifactId,
    );
    if (supplied) return supplied;
    const state = await this.stateProvider();
    if (state.conversation.id !== conversationId || !state.workspace.cwd)
      return undefined;
    const message = state.conversation.messages.find(
      (entry) => entry.id === messageId,
    );
    const artifact = message?.artifacts?.find(
      (entry) => entry.id === artifactId,
    );
    return artifact
      ? { artifact, workspaceRoot: state.workspace.cwd }
      : undefined;
  }

  private async lookupArtifact(
    pathname: string,
    prefix: string,
  ): Promise<
    | {
        conversationId: string;
        messageId: string;
        artifact: ConversationArtifact;
        workspaceRoot: string;
        suffix: string;
      }
    | undefined
  > {
    const parts = pathname.slice(prefix.length).split("/");
    if (parts.length < 3) return undefined;
    const [conversationPart, messagePart, artifactPart, ...suffixParts] = parts;
    let conversationId: string;
    let messageId: string;
    let artifactId: string;
    try {
      conversationId = decodeURIComponent(conversationPart);
      messageId = decodeURIComponent(messagePart);
      artifactId = decodeURIComponent(artifactPart);
    } catch {
      return undefined;
    }
    const supplied = await this.lookupArtifactByIds(
      conversationId,
      messageId,
      artifactId,
    );
    if (!supplied) return undefined;
    return {
      conversationId,
      messageId,
      artifact: supplied.artifact,
      workspaceRoot: supplied.workspaceRoot,
      suffix: suffixParts.join("/"),
    };
  }

  private async proxyLocalService(
    request: IncomingMessage,
    response: ServerResponse,
    resolved: ResolvedWorkspaceArtifact,
    suffix: string,
    search: string,
    previewPrefix: string,
    grant?: PreviewGrant,
  ): Promise<void> {
    const localUrl = resolved.artifact.localUrl;
    if (!localUrl || !isAllowedLoopbackUrl(localUrl))
      return sendJson(response, 403, {
        error: "Servizio locale non autorizzato.",
      });
    const base = new URL(localUrl.endsWith("/") ? localUrl : `${localUrl}/`);
    const target = new URL(suffix || ".", base);
    target.search = search;
    if (!isAllowedLoopbackUrl(target.toString()))
      return sendJson(response, 403, {
        error: "Destinazione anteprima non autorizzata.",
      });

    const declaredLength = Number(request.headers["content-length"] ?? 0);
    if (declaredLength > MAX_PREVIEW_BODY_BYTES)
      return sendJson(response, 413, {
        error: "Richiesta dell’anteprima troppo grande.",
      });

    const headers: Record<string, string> = {
      accept: String(request.headers.accept ?? "*/*"),
      "accept-language": String(
        request.headers["accept-language"] ?? "it-IT,it;q=0.9,en;q=0.7",
      ),
      "user-agent": String(
        request.headers["user-agent"] ?? "Relay-Remote-Preview",
      ),
      host: target.host,
    };
    const contentType = request.headers["content-type"];
    if (contentType) headers["content-type"] = String(contentType);
    if (declaredLength > 0) headers["content-length"] = String(declaredLength);
    if (grant?.cookies.size)
      headers.cookie = [...grant.cookies.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");

    const transport = target.protocol === "https:" ? httpsRequest : httpRequest;
    const proxy = transport(
      target,
      {
        method: request.method,
        headers,
        timeout: 15_000,
        ...(target.protocol === "https:" ? { rejectUnauthorized: false } : {}),
      },
      (upstream) => {
        if (grant) updatePreviewCookies(grant, upstream.headers["set-cookie"]);
        const status = upstream.statusCode ?? 502;
        const responseType = String(
          upstream.headers["content-type"] ?? "application/octet-stream",
        );
        const responseHeaders = previewHeaders(responseType);
        const location = upstream.headers.location;
        if (location) {
          try {
            const redirected = new URL(location, target);
            responseHeaders.location = isAllowedLoopbackUrl(
              redirected.toString(),
            )
              ? `${previewPrefix}/${redirected.pathname.replace(/^\//, "")}${redirected.search}`
              : location;
          } catch {
            responseHeaders.location = location;
          }
        }
        if (request.method === "HEAD" || !isTextualPreview(responseType)) {
          response.writeHead(status, responseHeaders);
          if (request.method === "HEAD") {
            upstream.resume();
            response.end();
          } else upstream.pipe(response);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        upstream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= MAX_PREVIEW_BODY_BYTES) chunks.push(Buffer.from(chunk));
        });
        upstream.on("end", () => {
          if (size > MAX_PREVIEW_BODY_BYTES)
            return sendJson(response, 502, {
              error: "Risposta dell’anteprima troppo grande.",
            });
          const raw = Buffer.concat(chunks).toString("utf8");
          const rewritten = rewritePreviewDocument(
            raw,
            responseType,
            target.origin,
            previewPrefix,
          );
          response.writeHead(status, {
            ...responseHeaders,
            "content-length": Buffer.byteLength(rewritten),
          });
          response.end(rewritten);
        });
      },
    );
    proxy.on("timeout", () =>
      proxy.destroy(new Error("Timeout anteprima locale.")),
    );
    proxy.on("error", (error) => {
      if (!response.headersSent)
        sendJson(response, 502, {
          error: `Il sito locale non risponde: ${error.message}`,
        });
      else response.end();
    });
    if (["GET", "HEAD", "OPTIONS"].includes(String(request.method)))
      proxy.end();
    else request.pipe(proxy);
  }

  private async handleAction(url: URL, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const session = this.requireSession(url, request);
    if (!session) return sendJson(response, 401, { error: 'Sessione remota non valida.' });
    if (!isRelayRequest(request)) return sendJson(response, 403, { error: 'Richiesta non valida.' });
    const message = await readJson(request);
    const validation = validateRemoteMessage(message, await this.actionStateProvider());
    if (!validation.allowed) return sendJson(response, 403, { error: validation.error ?? 'Azione non disponibile da remoto per sicurezza.' });
    const result = await this.handleMessage(message);
    sendJson(response, 200, { ok: true, ...(result && typeof result === 'object' ? result : {}), ...(validation.notice ? { notice: validation.notice } : {}) });
  }

  private async handleEvents(url: URL, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const session = this.requireSession(url, request);
    if (!session) {
      response.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Unauthorized');
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    });
    response.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    if (this.lastRemoteState) response.write(`event: state\ndata: ${JSON.stringify(this.lastRemoteState)}\n\n`);
    const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 20_000);
    this.sseClients.set(session.id, { id: session.id, response, heartbeat });
    request.on('close', () => { clearInterval(heartbeat); this.sseClients.delete(session.id); });
  }

  private requireSession(url: URL, request: IncomingMessage): RemoteSession | undefined {
    this.pruneSessions();
    const authorization = String(request.headers.authorization ?? '');
    const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
    const token = cookieValue(request.headers.cookie, 'relay_session') ?? bearer ?? url.searchParams.get('token') ?? '';
    if (!token) return undefined;
    const tokenHash = hashSessionToken(token);
    const session = this.sessions.get(tokenHash);
    if (!session) return undefined;
    session.lastSeenAt = new Date().toISOString();
    this.scheduleSessionWrite();
    return session;
  }

  private allowPairAttempt(address: string): boolean {
    const now = Date.now();
    const current = this.pairAttempts.get(address);
    if (!current || now - current.firstAt > 5 * 60_000) {
      this.pairAttempts.set(address, { count: 1, firstAt: now });
      return true;
    }
    current.count += 1;
    return current.count <= 8;
  }

  private prunePreviewGrants(): void {
    const now = Date.now();
    for (const [id, grant] of this.previewGrants) {
      if (grant.expiresAt <= now) this.previewGrants.delete(id);
    }
  }

  private closeAllSse(): void {
    for (const client of this.sseClients.values()) { clearInterval(client.heartbeat); client.response.end(); }
    this.sseClients.clear();
  }

  private pruneSessions(): void {
    const now = Date.now();
    for (const [tokenHash, session] of this.sessions) {
      if (now - new Date(session.lastSeenAt).getTime() <= SESSION_TTL_MS) continue;
      this.finishSession(tokenHash, session, 'expired');
      const client = this.sseClients.get(session.id);
      if (client) { clearInterval(client.heartbeat); client.response.end(); this.sseClients.delete(session.id); }
    }
  }

  private broadcastState(): void {
    if (!this.sseClients.size) return;
    this.stateBroadcastQueued = true;
    if (this.stateBroadcastTimer || this.stateBroadcastInFlight) return;
    this.stateBroadcastTimer = setTimeout(() => {
      this.stateBroadcastTimer = undefined;
      void this.flushStateBroadcast();
    }, 25);
    this.stateBroadcastTimer.unref?.();
  }

  private async flushStateBroadcast(): Promise<void> {
    if (this.stateBroadcastInFlight || !this.sseClients.size) return;
    this.stateBroadcastInFlight = true;
    this.stateBroadcastQueued = false;
    try {
      const payload = this.pendingRemoteState ?? sanitizeStateForRemote(await this.stateProvider());
      this.pendingRemoteState = undefined;
      this.lastRemoteState = payload;
      const frame = `event: state\ndata: ${JSON.stringify(payload)}\n\n`;
      for (const client of this.sseClients.values()) client.response.write(frame);
    } catch {
      const frame = `event: state\ndata: ${JSON.stringify({ changedAt: new Date().toISOString() })}\n\n`;
      for (const client of this.sseClients.values()) client.response.write(frame);
    } finally {
      this.stateBroadcastInFlight = false;
      if (this.stateBroadcastQueued && this.sseClients.size) this.broadcastState();
    }
  }

  private finishSession(tokenHash: string, session: RemoteSession, reason: RemoteSessionHistoryEntry['reason']): void {
    if (!this.sessions.has(tokenHash)) return;
    this.sessions.delete(tokenHash);
    const endedAt = new Date().toISOString();
    this.sessionHistory = [{
      id: session.id,
      name: session.name,
      address: session.address,
      ...(session.userAgent ? { userAgent: session.userAgent } : {}),
      pairedAt: session.pairedAt,
      lastSeenAt: session.lastSeenAt,
      endedAt,
      durationMs: Math.max(0, new Date(endedAt).getTime() - new Date(session.pairedAt).getTime()),
      reason
    }, ...this.sessionHistory.filter((entry) => entry.id !== session.id)].slice(0, 100);
    this.writeHistory();
    this.writeSessions();
    this.onChanged?.();
  }

  private readBootstrapPairing(): BootstrapPairing | undefined {
    if (!this.bootstrapPath) return undefined;
    try {
      const value = JSON.parse(readFileSync(this.bootstrapPath, 'utf8')) as Record<string, unknown>;
      const code = String(value.code ?? '').replace(/\D/g, '');
      const expiresAt = String(value.expiresAt ?? '');
      const expires = new Date(expiresAt).getTime();
      const remaining = expires - Date.now();
      if (!/^\d{6}$/.test(code) || !Number.isFinite(expires) || remaining <= 0 || remaining > 30 * 60_000) {
        this.consumeBootstrapPairing();
        return undefined;
      }
      return { code, expiresAt };
    } catch {
      return undefined;
    }
  }

  private consumeBootstrapPairing(): void {
    if (!this.bootstrapPath) return;
    try { unlinkSync(this.bootstrapPath); } catch { /* already absent */ }
  }

  private readSessions(): Map<string, RemoteSession> {
    const sessions = new Map<string, RemoteSession>();
    if (!this.sessionsPath) return sessions;
    try {
      const parsed = JSON.parse(readFileSync(this.sessionsPath, 'utf8'));
      const now = Date.now();
      if (!Array.isArray(parsed)) return sessions;
      for (const value of parsed) {
        if (!isPersistedSession(value)) continue;
        if (now - new Date(value.lastSeenAt).getTime() > SESSION_TTL_MS) continue;
        sessions.set(value.tokenHash, { ...value });
      }
    } catch {
      return sessions;
    }
    return sessions;
  }

  private scheduleSessionWrite(): void {
    if (!this.sessionsPath || this.sessionWriteTimer) return;
    this.sessionWriteTimer = setTimeout(() => {
      this.sessionWriteTimer = undefined;
      this.writeSessions();
    }, 1_000);
    this.sessionWriteTimer.unref?.();
  }

  private writeSessions(): void {
    if (!this.sessionsPath) return;
    try {
      mkdirSync(dirname(this.sessionsPath), { recursive: true });
      const payload = [...this.sessions.values()].map((session) => ({ ...session }));
      if (!payload.length) {
        try { unlinkSync(this.sessionsPath); } catch { /* already absent */ }
        return;
      }
      writeFileSync(this.sessionsPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
      chmodSync(this.sessionsPath, 0o600);
    } catch {
      // A persistence failure must not interrupt an already active remote session.
    }
  }

  private readHistory(): RemoteSessionHistoryEntry[] {
    if (!this.historyPath) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.historyPath, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter(isHistoryEntry).slice(0, 100) : [];
    } catch {
      return [];
    }
  }

  private writeHistory(): void {
    if (!this.historyPath) return;
    try {
      mkdirSync(dirname(this.historyPath), { recursive: true });
      writeFileSync(this.historyPath, JSON.stringify(this.sessionHistory.slice(0, 100), null, 2), 'utf8');
    } catch {
      // History is helpful, never critical to remote control.
    }
  }
}

function preferredLanAddress(): string | undefined {
  const candidates = lanAddresses();
  return candidates.find((entry) => isPrivateIpv4(entry.address))?.address ?? candidates[0]?.address;
}

function lanAddresses(): Array<{ label: string; address: string }> {
  const candidates: Array<{ label: string; address: string }> = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      candidates.push({ label: name, address: entry.address });
    }
  }
  return candidates.sort((a, b) => Number(isPrivateIpv4(b.address)) - Number(isPrivateIpv4(a.address)) || a.label.localeCompare(b.label));
}

function lanUrls(port: number, ticketId?: string): RemoteAccessNetworkUrl[] {
  const query = ticketId ? `/?t=${encodeURIComponent(ticketId)}` : '/';
  return lanAddresses().map((entry) => ({ ...entry, url: `http://${entry.address}:${port}${query}` }));
}

function isPrivateIpv4(value: string): boolean {
  return /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(value);
}

function remoteDiagnostics(port?: number, ticketId?: string, mode: RemoteAccessMode = 'lan', tunnel?: TailscaleTunnelSnapshot): RemoteAccessDiagnostic[] {
  const urls = mode === 'lan' && port ? lanUrls(port, ticketId) : [];
  const result: RemoteAccessDiagnostic[] = [];
  if (!urls.length) {
    result.push({ level: 'warning', title: 'IP LAN non rilevato', detail: 'Relay non vede interfacce IPv4 di rete. Verifica Wi-Fi/Ethernet, VPN o rete ospiti.' });
  } else if (urls.length > 1) {
    result.push({ level: 'info', title: 'Più reti disponibili', detail: 'Se il QR non apre, prova uno degli URL alternativi: spesso VPN, Docker o hotspot espongono più interfacce.' });
  }
  if (mode !== 'lan') {
    result.push({ level: 'info', title: mode === 'funnel' ? 'Relay Ovunque' : 'Accesso privato', detail: mode === 'funnel' ? 'Il server Relay ascolta soltanto su 127.0.0.1 ed è esposto tramite HTTPS Tailscale Funnel.' : 'Il server Relay ascolta soltanto su 127.0.0.1 ed è raggiungibile esclusivamente dal tuo tailnet.' });
    if (tunnel?.state === 'DEGRADED') result.push({ level: 'warning', title: 'Tunnel degradato', detail: tunnel.lastError ?? 'Tailscale risulta configurato ma il probe end-to-end non riesce.' });
  }
  const os = platform();
  if (os === 'win32') result.push({ level: 'info', title: 'Windows', detail: 'Se il telefono non raggiunge Relay, consenti Node/Antigravity/VS Code nel firewall privato e mantieni il PC su rete privata.' });
  else if (os === 'darwin') result.push({ level: 'info', title: 'macOS', detail: 'Se macOS chiede il permesso rete locale, autorizzalo. Evita sospensione automatica durante task lunghi.' });
  else if (os === 'linux') result.push({ level: 'info', title: 'Linux', detail: 'Se usi firewall, consenti temporaneamente la porta mostrata. Con reti aziendali può servire disattivare isolamento client.' });
  result.push({ level: 'info', title: 'Standby', detail: 'Per task lunghi tieni il computer alimentato e disabilita sospensione/standby: il telefono comanda il PC, non esegue i provider.' });
  return result;
}

function randomId(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

function shortPairingId(value: string): string {
  return value.slice(-6).toUpperCase();
}

function normalizeAddress(value: string): string {
  return value.replace(/^::ffff:/, '') || 'sconosciuto';
}

function sendJson(response: ServerResponse, status: number, payload: unknown, extraHeaders: Record<string, string> = {}): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 512_000) throw new Error('Payload remoto troppo grande.');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8') || '{}';
  return JSON.parse(raw);
}

function sanitizeStateForRemote(state: RelayViewState): any {
  return {
    workspace: state.workspace,
    projects: state.projects,
    providers: state.providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      available: provider.available,
      authenticated: provider.authenticated,
      version: provider.version,
      plan: provider.plan,
      models: provider.models
    })),
    usage: state.usage,
    conversation: state.conversation,
    conversations: state.conversations,
    archivedConversations: state.archivedConversations,
    projectConversations: state.projectConversations,
    agents: state.agents,
    rules: state.rules,
    mcp: state.mcp,
    automations: state.automations,
    activeRuns: state.activeRuns,
    pendingDelegations: state.pendingDelegations,
    preferences: state.preferences,
    usageRefreshing: state.usageRefreshing,
    scheduler: state.scheduler,
    systemReadiness: state.systemReadiness
  };
}

function validateRemoteMessage(message: any, state: RemoteValidationState): { allowed: boolean; error?: string; notice?: string } {
  const type = String(message?.type ?? '');
  const allowed = new Set([
    'refreshProviders', 'refreshUsage', 'sendMessage', 'cancelRun', 'newConversation', 'selectConversation', 'saveChatAttachments',
    'setSelection', 'setPermission', 'setDelegationPolicy', 'approveDelegation', 'rejectDelegation', 'selectAgent', 'toggleRule',
    'requestRemoteProjectPicker', 'requestRemoteProjectOpen', 'updateExtensionFromVsix', 'resolveRunError', 'listMcp', 'toggleMcp', 'listAutomations', 'toggleAutomation', 'runAutomationNow',
    'updatePreferences', 'updateProviderDefaults', 'updateAllProviderPermissions'
  ]);
  if (!allowed.has(type)) return { allowed: false };
  if (type === 'updatePreferences') {
    const payload = message.payload ?? {};
    const keys = Object.keys(payload);
    const allowedKeys = new Set(['defaultProvider', 'delegationPolicy', 'quotaPolicy', 'exposeUsageToAgents', 'usageAutoRefreshMinutes']);
    if (!keys.length || keys.some((key) => !allowedKeys.has(key))) return { allowed: false, error: 'Preferenza remota non consentita.' };
    if (payload.defaultProvider !== undefined && !['codex', 'claude', 'antigravity', 'copilot'].includes(String(payload.defaultProvider))) return { allowed: false, error: 'Provider predefinito non valido.' };
    if (payload.delegationPolicy !== undefined && !['confirm', 'automatic', 'disabled'].includes(String(payload.delegationPolicy))) return { allowed: false, error: 'Politica deleghe non valida.' };
    if (payload.quotaPolicy !== undefined && !['balanced', 'preserve', 'unrestricted'].includes(String(payload.quotaPolicy))) return { allowed: false, error: 'Politica quote non valida.' };
    if (payload.exposeUsageToAgents !== undefined && typeof payload.exposeUsageToAgents !== 'boolean') return { allowed: false, error: 'Valore quote agenti non valido.' };
    if (payload.usageAutoRefreshMinutes !== undefined) {
      const minutes = Number(payload.usageAutoRefreshMinutes);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) return { allowed: false, error: 'Intervallo utilizzo non valido.' };
    }
  }
  if (type === 'updateProviderDefaults') {
    if (!['codex', 'claude', 'antigravity', 'copilot'].includes(String(message.payload?.provider ?? ''))) return { allowed: false, error: 'Provider non valido.' };
    if (message.payload?.permission !== undefined && !['read-only', 'workspace-write', 'full-access'].includes(String(message.payload.permission))) return { allowed: false, error: 'Permesso provider non valido.' };
  }
  if (type === 'updateAllProviderPermissions' && !['read-only', 'workspace-write', 'full-access'].includes(String(message.payload?.permission ?? ''))) {
    return { allowed: false, error: 'Permesso globale non valido.' };
  }
  if (type === 'updateExtensionFromVsix') {
    const path = String(message.payload?.path ?? '').trim();
    if (message.payload?.confirmed !== true) return { allowed: false, error: 'Conferma il reload dell’editor prima di aggiornare Relay.' };
    if (!path || path.length > 2_048 || !path.toLowerCase().endsWith('.vsix')) return { allowed: false, error: 'Indica un percorso locale valido a un file .vsix.' };
    if (state.activeRuns.length) return { allowed: false, error: 'Termina i task attivi prima di aggiornare Relay.' };
  }
  if (type === 'selectConversation' && !state.conversations.some((entry) => entry.id === String(message.payload?.id ?? ''))) {
    return { allowed: false, error: 'La chat non appartiene al progetto attualmente aperto.' };
  }
  if (type === 'cancelRun' && !state.activeRuns.some((entry) => entry.id === String(message.payload?.runId ?? ''))) {
    return { allowed: false, error: 'Il task non è più attivo.' };
  }
  if (type === 'resolveRunError') {
    const runId = String(message.payload?.runId ?? '');
    const active = state.activeRuns.find((entry) => entry.id === runId && Boolean(entry.error));
    const persisted = state.conversation.messages.find((entry) => entry.runId === runId && entry.role === 'assistant' && entry.error);
    if (!active && !persisted) return { allowed: false, error: 'L’errore del task non è più disponibile.' };
    const failedProvider = active?.provider ?? persisted?.provider ?? state.conversation.provider;
    const helperAvailable = state.providers.some((entry) => entry.id !== failedProvider && entry.healthState === 'ready' && entry.connected !== false);
    if (!helperAvailable) return { allowed: false, error: 'Nessun altro provider disponibile per risolvere questo errore.' };
  }
  if (type === 'selectAgent' && !state.agents.some((entry) => entry.id === String(message.payload?.agentId ?? '') && entry.enabled)) {
    return { allowed: false, error: 'Agente non disponibile.' };
  }
  if (type === 'toggleRule' && !state.rules.some((entry) => entry.id === String(message.payload?.id ?? ''))) {
    return { allowed: false, error: 'Regola non disponibile nel progetto aperto.' };
  }
  if (type === 'toggleMcp') {
    const provider = String(message.payload?.provider ?? '');
    const name = String(message.payload?.name ?? '');
    const scope = String(message.payload?.scope ?? '');
    const server = state.mcp.servers.find((entry) => entry.provider === provider && entry.name === name && entry.scope === scope);
    if (!server) return { allowed: false, error: 'Server MCP non disponibile.' };
    if (typeof message.payload?.enabled !== 'boolean') return { allowed: false, error: 'Stato MCP non valido.' };
  }
  if (type === 'toggleAutomation' || type === 'runAutomationNow') {
    const automation = state.automations.find((entry) => entry.id === String(message.payload?.id ?? ''));
    if (!automation) return { allowed: false, error: 'Automazione non disponibile.' };
    if (type === 'toggleAutomation' && typeof message.payload?.enabled !== 'boolean') return { allowed: false, error: 'Stato automazione non valido.' };
  }
  if (type === 'requestRemoteProjectPicker') return { allowed: true, notice: state.activeRuns.length ? 'Ci sono attività in background: la navigazione resta disponibile.' : undefined };
  if (type === 'requestRemoteProjectOpen') {
    const path = String(message.payload?.path ?? '');
    if (!state.projects.some((entry) => entry.path === path)) return { allowed: false, error: 'Il progetto non è registrato in Relay.' };
    return { allowed: true, notice: 'Conferma l’apertura sul PC.' };
  }
  if (type === 'sendMessage' && state.activeRuns.some((entry) => entry.conversationId === state.conversation.id && entry.kind !== 'delegation')) {
    return { allowed: false, error: 'Questa chat è già in esecuzione. Aprine una nuova per lavorare in parallelo.' };
  }
  return { allowed: true };
}

function isRelayRequest(request: IncomingMessage): boolean {
  return request.headers['x-relay-request'] === 'mobile';
}

function sessionCookie(token: string, secure = false): string {
  return `relay_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`;
}

function cookieValue(raw: string | undefined, name: string): string | undefined {
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}



async function resolveStaticPreviewFile(resolved: ResolvedWorkspaceArtifact, suffix: string, accept: string): Promise<string | undefined> {
  if (!resolved.absolutePath || !resolved.rootDirectory) return undefined;
  if (!suffix) return resolved.absolutePath;
  const root = await realpath(resolved.rootDirectory).catch(() => undefined);
  if (!root) return undefined;
  const requested = resolve(root, suffix.replace(/^\/+/, ''));
  let real = await realpath(requested).catch(() => undefined);
  if (real) {
    const info = await stat(real).catch(() => undefined);
    if (info?.isDirectory()) real = await realpath(resolve(real, 'index.html')).catch(() => undefined);
  }
  if (real && isPathWithin(root, real) && isPathWithin(resolved.workspaceRoot, real)) return real;
  if (/text\/html|\*\//i.test(accept)) return resolved.absolutePath;
  return undefined;
}

async function sendFile(
  response: ServerResponse,
  headOnly: boolean,
  absolutePath: string,
  name: string,
  contentType: string,
  attachment: boolean
): Promise<void> {
  const info = await stat(absolutePath);
  response.writeHead(200, {
    'content-type': contentType,
    'content-length': info.size,
    'cache-control': 'private, no-store',
    'content-disposition': `${attachment ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(safeDownloadName(name))}`,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  });
  if (headOnly) { response.end(); return; }
  const stream = createReadStream(absolutePath);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}

async function sendPreviewFile(response: ServerResponse, headOnly: boolean, absolutePath: string, previewPrefix: string): Promise<void> {
  const info = await stat(absolutePath);
  const contentType = mimeTypeForPath(absolutePath);
  if (isTextualPreview(contentType) && info.size <= 4 * 1024 * 1024) {
    const raw = (await readFile(absolutePath)).toString('utf8');
    const rewritten = rewritePreviewDocument(raw, contentType, '', previewPrefix);
    response.writeHead(200, { ...previewHeaders(contentType), 'content-length': Buffer.byteLength(rewritten) });
    if (headOnly) { response.end(); return; }
    response.end(rewritten);
    return;
  }
  response.writeHead(200, { ...previewHeaders(contentType), 'content-length': info.size });
  if (headOnly) { response.end(); return; }
  const stream = createReadStream(absolutePath);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}

function sendDownload(response: ServerResponse, headOnly: boolean, data: Buffer, name: string, contentType: string): void {
  response.writeHead(200, {
    'content-type': contentType,
    'content-length': data.length,
    'cache-control': 'private, no-store',
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeDownloadName(name))}`,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  });
  response.end(headOnly ? undefined : data);
}

function isPreviewableArtifact(resolved: ResolvedWorkspaceArtifact): boolean {
  if (resolved.artifact.kind === 'local-service') return true;
  if (resolved.artifact.kind === 'static-site') return Boolean(resolved.absolutePath);
  const mimeType = String(resolved.artifact.mimeType ?? (resolved.absolutePath ? mimeTypeForPath(resolved.absolutePath) : '')).toLowerCase();
  return /^(image\/|text\/|application\/pdf)/.test(mimeType);
}

function updatePreviewCookies(grant: PreviewGrant, raw: string[] | string | undefined): void {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const value of values) {
    const first = value.split(';', 1)[0] ?? '';
    const separator = first.indexOf('=');
    if (separator <= 0) continue;
    const name = first.slice(0, separator).trim();
    const cookieValue = first.slice(separator + 1).trim();
    if (!name) continue;
    if (!cookieValue) grant.cookies.delete(name);
    else grant.cookies.set(name, cookieValue);
  }
}

function previewHeaders(contentType: string): Record<string, string | number> {
  return {
    'content-type': contentType,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
    'content-security-policy': "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads; default-src 'self' data: blob: http: https:; img-src * data: blob:; style-src 'self' 'unsafe-inline' http: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' http: https:; connect-src 'self' http: https: ws: wss:; font-src 'self' data: http: https:; frame-ancestors 'self'"
  };
}

function isTextualPreview(contentType: string): boolean {
  return /^(text\/|application\/(json|javascript|xml|x-javascript))/i.test(contentType);
}

function rewritePreviewDocument(
  raw: string,
  contentType: string,
  targetOrigin: string,
  previewPrefix: string,
): string {
  let value = targetOrigin ? raw.split(targetOrigin).join(previewPrefix) : raw;
  if (/text\/html/i.test(contentType)) {
    value = value
      .replace(/\b(src|href|action)=(['"])\/(?!\/)/gi, `$1=$2${previewPrefix}/`)
      .replace(/url\((['"]?)\/(?!\/)/gi, `url($1${previewPrefix}/`);
    const injection = `<base href="${previewPrefix}/">${previewBootstrapScript(previewPrefix)}`;
    if (/<head(\s[^>]*)?>/i.test(value))
      value = value.replace(
        /<head(\s[^>]*)?>/i,
        (head) => `${head}${injection}`,
      );
    else value = `${injection}${value}`;
  } else if (/text\/css/i.test(contentType)) {
    value = value.replace(/url\((['"]?)\/(?!\/)/gi, `url($1${previewPrefix}/`);
  }
  return value;
}

function previewBootstrapScript(previewPrefix: string): string {
  const prefix = JSON.stringify(previewPrefix);
  return `<script>(function(){var prefix=${prefix};function map(value){try{var raw=String(value||'');if(!raw||/^(?:data:|blob:|mailto:|tel:|javascript:|#)/i.test(raw))return raw;var url=new URL(raw,document.baseURI);if(url.pathname.indexOf(prefix+'/')===0)return url.pathname+url.search+url.hash;if(url.host===location.host||/^(?:localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(url.hostname))return prefix+'/'+url.pathname.replace(/^\/+/, '')+url.search+url.hash;return raw}catch(_){return value}}var nativeFetch=window.fetch;if(nativeFetch)window.fetch=function(input,init){if(typeof input==='string'||input instanceof URL)return nativeFetch.call(this,map(input),init);if(input&&input.url)return nativeFetch.call(this,new Request(map(input.url),input),init);return nativeFetch.call(this,input,init)};var open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url){arguments[1]=map(url);return open.apply(this,arguments)};if(window.EventSource){var NativeEventSource=window.EventSource;window.EventSource=function(url,config){return new NativeEventSource(map(url),config)};window.EventSource.prototype=NativeEventSource.prototype}var push=history.pushState.bind(history),replace=history.replaceState.bind(history);history.pushState=function(state,title,url){return push(state,title,url==null?url:map(url))};history.replaceState=function(state,title,url){return replace(state,title,url==null?url:map(url))};document.addEventListener('click',function(event){var link=event.target&&event.target.closest?event.target.closest('a[href]'):null;if(!link)return;var mapped=map(link.getAttribute('href'));if(mapped!==link.getAttribute('href'))link.setAttribute('href',mapped)},true);})();<\/script>`;
}

function isPathWithin(root: string, value: string): boolean {
  const rel = relative(root, value);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function safeDownloadName(value: string): string {
  return basename(String(value || 'relay-file')).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '-').slice(0, 160) || 'relay-file';
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function isPersistedSession(value: unknown): value is PersistedRemoteSession {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string'
    && typeof entry.tokenHash === 'string'
    && /^[a-f0-9]{64}$/i.test(entry.tokenHash)
    && typeof entry.name === 'string'
    && typeof entry.address === 'string'
    && typeof entry.pairedAt === 'string'
    && typeof entry.lastSeenAt === 'string';
}

function isHistoryEntry(value: unknown): value is RemoteSessionHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string'
    && typeof entry.name === 'string'
    && typeof entry.address === 'string'
    && typeof entry.pairedAt === 'string'
    && typeof entry.lastSeenAt === 'string'
    && typeof entry.endedAt === 'string'
    && typeof entry.durationMs === 'number'
    && ['revoked', 'expired', 'server-stopped', 'replaced'].includes(String(entry.reason));
}
