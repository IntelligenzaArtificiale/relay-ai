import type { ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import { RelayError } from '../core/errors.js';
import {
  createProcessLaunchSpec,
  spawnManagedProcess,
  type ManagedSpawnOptions
} from './process-launcher.js';

export interface CommandResult { stdout: string; stderr: string; exitCode: number; }
export interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  stdin?: string | Buffer;
  maxBufferBytes?: number;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  platform?: NodeJS.Platform;
  commandShell?: string;
}

export async function runCommand(executable: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const spawnOptions: ManagedSpawnOptions = {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      ...(options.platform ? { platform: options.platform } : {}),
      ...(options.commandShell ? { commandShell: options.commandShell } : {})
    };
    let child: ReturnType<typeof spawnManagedProcess>;
    try {
      child = spawnManagedProcess(executable, args, spawnOptions);
    } catch (error) {
      const code = nodeErrorCode(error) === 'E2BIG' ? 'COMMAND_PAYLOAD_TOO_LARGE' : 'COMMAND_START_FAILED';
      reject(new RelayError(`Unable to start ${executable}: ${error instanceof Error ? error.message : String(error)}`, code, error));
      return;
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const terminate = () => terminateProcessTree(child);
    const abort = () => {
      terminate();
      finish(() => reject(new RelayError('Agent run cancelled.', 'RUN_CANCELLED')));
    };

    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) {
      abort();
      return;
    }
    timer = options.timeoutMs ? setTimeout(() => {
      terminate();
      finish(() => reject(new RelayError(`Command timed out after ${options.timeoutMs} ms.`, 'COMMAND_TIMEOUT')));
    }, options.timeoutMs) : undefined;

    const maxBufferBytes = Math.max(16_384, options.maxBufferBytes ?? 2 * 1024 * 1024);
    const stdoutLines = readline.createInterface({ input: child.stdout });
    stdoutLines.on('line', (line) => {
      stdout = appendLimited(stdout, `${line}\n`, maxBufferBytes);
      options.onStdoutLine?.(line);
    });
    const stderrLines = readline.createInterface({ input: child.stderr });
    stderrLines.on('line', (line) => {
      stderr = appendLimited(stderr, `${line}\n`, maxBufferBytes);
      options.onStderrLine?.(line);
    });
    child.on('error', (error) => finish(() => {
      const code = nodeErrorCode(error) === 'E2BIG' ? 'COMMAND_PAYLOAD_TOO_LARGE' : 'COMMAND_START_FAILED';
      reject(new RelayError(`Unable to start ${executable}: ${error.message}`, code, error));
    }));
    child.on('close', (code) => finish(() => resolve({ stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode: code ?? -1 })));
    child.stdin.on('error', (error) => {
      if (!settled && nodeErrorCode(error) !== 'EPIPE') finish(() => reject(new RelayError(`Unable to write process input: ${error.message}`, 'COMMAND_STDIN_FAILED', error)));
    });
    child.stdin.end(options.stdin);
  });
}

export function terminateProcessTree(child: ChildProcess, graceMs = 1_800): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    // taskkill is intentionally spawned directly: it is a native executable and
    // must not recurse through the same wrapper handling as the target process.
    const { spawn } = require('node:child_process') as typeof import('node:child_process');
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.unref();
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  const forceTimer = setTimeout(() => {
    if (child.exitCode !== null) return;
    try { process.kill(-child.pid!, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }, graceMs);
  forceTimer.unref();
}

function appendLimited(current: string, addition: string, maxBytes: number): string {
  const combined = current + addition;
  if (Buffer.byteLength(combined, 'utf8') <= maxBytes) return combined;
  const marker = '[... output iniziale troncato da Relay ...]\n';
  const target = Math.max(0, maxBytes - Buffer.byteLength(marker, 'utf8'));
  let tail = combined.slice(-target);
  while (Buffer.byteLength(tail, 'utf8') > target) tail = tail.slice(1);
  return marker + tail;
}

function nodeErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : undefined;
}

// Compatibility export for existing tests and callers. New code should use
// createProcessLaunchSpec/spawnManagedProcess directly.
export function commandLaunch(
  executable: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  commandShell = process.env.ComSpec || 'cmd.exe'
): { executable: string; args: string[] } {
  const spec = createProcessLaunchSpec(executable, args, platform, commandShell);
  return { executable: spec.executable, args: spec.args };
}
