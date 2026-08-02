import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';
import { RelayError, errorMessage } from '../core/errors.js';
import { terminateProcessTree } from '../services/command-runner.js';
import { spawnManagedProcess } from '../services/process-launcher.js';

type RpcId = number;
interface RpcResponse {
  id?: RpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

declare const __RELAY_VERSION__: string;

export class CodexAppServer extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | undefined;
  private sequence = 0;
  private readonly pending = new Map<RpcId, PendingRequest>();
  private initialized = false;
  private starting: Promise<void> | undefined;
  private stderrBuffer = '';

  constructor(
    private readonly executable: string,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.isReady()) return;
    if (this.starting) return this.starting;
    this.starting = this.startInternal().finally(() => { this.starting = undefined; });
    return this.starting;
  }

  private async startInternal(): Promise<void> {
    if (this.process && !this.process.killed) terminateProcessTree(this.process);
    this.stderrBuffer = '';
    const child = spawnManagedProcess(this.executable, ['app-server', '--listen', 'stdio://'], {
      env: this.env,
      windowsHide: true
    });
    this.process = child;

    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', (line) => this.handleLine(line));
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.stderrBuffer = trimBuffer(`${this.stderrBuffer}${text}`, 8_000);
      this.emit('stderr', text);
    });
    child.on('error', (error) => this.failAll(new RelayError(`Codex app-server failed: ${error.message}`, 'CODEX_SERVER_START', error)));
    child.on('close', (code) => {
      this.initialized = false;
      if (this.process === child) this.process = undefined;
      const detail = this.stderrBuffer.trim();
      const suffix = detail ? ` Ultimo stderr: ${detail.slice(-2000)}` : '';
      this.failAll(new RelayError(`Codex app-server stopped with code ${code ?? -1}.${suffix}`, 'CODEX_SERVER_STOPPED'));
      this.emit('close', code);
    });

    await this.request('initialize', {
      clientInfo: {
        name: 'relay_agent_workspace',
        title: 'Relay',
        version: __RELAY_VERSION__
      }
    });
    this.notify('initialized', {});
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized && Boolean(this.process && !this.process.killed);
  }

  async request<T = unknown>(method: string, params: unknown = {}, timeoutMs = 30_000): Promise<T> {
    if (method !== 'initialize' && !this.isReady()) await this.start();
    if (!this.process || this.process.killed) {
      if (method !== 'initialize') await this.start();
      if (!this.process) throw new RelayError('Codex app-server is unavailable.', 'CODEX_SERVER_UNAVAILABLE');
    }

    const id = ++this.sequence;
    const promise = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RelayError(`Codex request ${method} timed out.`, 'CODEX_RPC_TIMEOUT'));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      });
    });

    this.write({ method, id, params });
    return promise;
  }

  notify(method: string, params: unknown = {}): void {
    this.write({ method, params });
  }

  async dispose(): Promise<void> {
    const child = this.process;
    this.process = undefined;
    this.initialized = false;
    if (child && !child.killed) terminateProcessTree(child);
    this.failAll(new RelayError('Codex app-server disposed.', 'CODEX_SERVER_DISPOSED'));
  }

  private write(message: unknown): void {
    if (!this.process || this.process.killed) {
      throw new RelayError('Codex app-server is not running.', 'CODEX_SERVER_NOT_RUNNING');
    }
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: RpcResponse;
    try {
      message = JSON.parse(line) as RpcResponse;
    } catch {
      this.emit('protocolError', `Invalid JSON from Codex: ${line.slice(0, 300)}`);
      return;
    }

    if (typeof message.id === 'number' && message.method) {
      this.emit('serverRequest', message.id, message.method, message.params);
      return;
    }

    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new RelayError(message.error.message ?? 'Codex RPC error.', 'CODEX_RPC_ERROR', message.error));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method) {
      this.emit('notification', message.method, message.params);
    }
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export function rpcErrorMessage(error: unknown): string {
  return `Codex error: ${errorMessage(error)}`;
}

function trimBuffer(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(-maxLength);
}
