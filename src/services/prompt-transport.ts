import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderId } from '../core/types.js';
import { approximateArgvBytes } from './process-launcher.js';

export type PromptTransportMode = 'stdin-context' | 'stdin-prompt' | 'secure-file';

export interface PreparedPromptTransport {
  mode: PromptTransportMode;
  promptArgs: string[];
  stdin?: string;
  additionalArgs: string[];
  argvBytes: number;
  temporaryFile?: string;
  cleanup(): Promise<void>;
}

export interface PromptTransportOptions {
  provider: Exclude<ProviderId, 'codex'>;
  prompt: string;
  cwd: string;
  executable?: string;
}

export async function preparePromptTransport(options: PromptTransportOptions): Promise<PreparedPromptTransport> {
  const noop = async () => undefined;
  if (options.provider === 'claude') {
    // Claude Code officially supports piped content in print mode. Keep a tiny
    // instruction in argv and stream the full Relay task over stdin.
    const promptArgs = ['-p', 'Execute the complete Relay task supplied through standard input.'];
    return {
      mode: 'stdin-context',
      promptArgs,
      stdin: options.prompt,
      additionalArgs: [],
      argvBytes: approximateArgvBytes(options.executable ?? 'claude', promptArgs),
      cleanup: noop
    };
  }

  if (options.provider === 'copilot') {
    // Copilot CLI documents piped input as the programmatic alternative to -p.
    // Do not include -p because Copilot explicitly ignores stdin when -p exists.
    return {
      mode: 'stdin-prompt',
      promptArgs: [],
      stdin: `${options.prompt}\n`,
      additionalArgs: [],
      argvBytes: approximateArgvBytes(options.executable ?? 'copilot', []),
      cleanup: noop
    };
  }

  // AGY only documents -p for autonomous mode. To keep argv bounded without
  // inventing unsupported flags, store the task in a restrictive temporary file
  // and give AGY read access to that directory explicitly.
  const directory = await mkdtemp(join(tmpdir(), 'relay-prompt-'));
  const path = join(directory, 'task.md');
  try { await chmod(directory, 0o700); } catch { /* Windows/filesystems may ignore POSIX modes. */ }
  await writeFile(path, options.prompt, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  const instruction = [
    'Read the complete Relay task from this UTF-8 file and execute it:',
    path,
    'Treat the file contents as the user request. Do not print secrets or delete/modify the transport file.'
  ].join('\n');
  const promptArgs = ['-p', instruction];
  let cleaned = false;
  return {
    mode: 'secure-file',
    promptArgs,
    additionalArgs: ['--add-dir', directory],
    temporaryFile: path,
    argvBytes: approximateArgvBytes(options.executable ?? 'agy', [...promptArgs, '--add-dir', directory]),
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await rm(directory, { recursive: true, force: true });
    }
  };
}
