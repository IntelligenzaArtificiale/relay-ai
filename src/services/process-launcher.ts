import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { extname } from 'node:path';

export interface ProcessLaunchSpec {
  executable: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
  wrapper: 'direct' | 'cmd' | 'powershell';
  displayExecutable: string;
}

export interface ManagedSpawnOptions extends Omit<SpawnOptionsWithoutStdio, 'stdio' | 'shell'> {
  platform?: NodeJS.Platform;
  commandShell?: string;
}

export function createProcessLaunchSpec(
  executable: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  commandShell = process.env.ComSpec || 'cmd.exe'
): ProcessLaunchSpec {
  if (platform !== 'win32') {
    return { executable, args: [...args], wrapper: 'direct', displayExecutable: executable };
  }

  const extension = extname(executable).toLowerCase();
  if (extension === '.cmd' || extension === '.bat') {
    // .cmd/.bat are not Win32 executables. Invoke cmd.exe directly, but keep the
    // command in one /c argument. `call` lets npm shims return control correctly.
    const command = [quoteCmdArgument(executable), ...args.map(quoteCmdArgument)].join(' ');
    const commandLine = `chcp 65001>nul & call ${command}`;
    return {
      executable: commandShell,
      args: ['/d', '/s', '/c', commandLine],
      windowsVerbatimArguments: true,
      wrapper: 'cmd',
      displayExecutable: executable
    };
  }

  if (extension === '.ps1') {
    return {
      executable: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', executable, ...args],
      wrapper: 'powershell',
      displayExecutable: executable
    };
  }

  return { executable, args: [...args], wrapper: 'direct', displayExecutable: executable };
}

export function spawnManagedProcess(
  executable: string,
  args: string[],
  options: ManagedSpawnOptions = {}
): ChildProcessWithoutNullStreams {
  const platform = options.platform ?? process.platform;
  const spec = createProcessLaunchSpec(executable, args, platform, options.commandShell);
  const { platform: _platform, commandShell: _commandShell, ...spawnOptions } = options;
  return spawn(spec.executable, spec.args, {
    ...spawnOptions,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    detached: spawnOptions.detached ?? platform !== 'win32',
    windowsHide: spawnOptions.windowsHide ?? true,
    ...(spec.windowsVerbatimArguments !== undefined ? { windowsVerbatimArguments: spec.windowsVerbatimArguments } : {})
  });
}

export function quoteCmdArgument(value: string): string {
  // Prompt payloads are never sent through this function. It is used for small,
  // controlled CLI arguments only. Quotes are doubled for cmd.exe and percent
  // signs are escaped to prevent accidental environment-variable expansion.
  const escaped = value.replaceAll('%', '%%').replaceAll('"', '""');
  return `"${escaped}"`;
}

export function approximateArgvBytes(executable: string, args: readonly string[]): number {
  return Buffer.byteLength([executable, ...args].join('\0'), 'utf8');
}
