import { access, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { runCommand } from './command-runner.js';

export type ExecutableResolutionSource =
  | 'explicit-path'
  | 'extension-path'
  | 'login-shell'
  | 'known-location';

export interface ExecutableResolution {
  configured: string;
  path: string;
  source: ExecutableResolutionSource;
  env: NodeJS.ProcessEnv;
}

export interface ResolveExecutableOptions {
  force?: boolean;
  extraCandidates?: string[];
}

const cache = new Map<string, ExecutableResolution | null>();

export async function resolveExecutable(
  configured: string,
  options: ResolveExecutableOptions = {}
): Promise<ExecutableResolution | undefined> {
  const normalized = configured.trim();
  if (!normalized) return undefined;
  const cacheKey = `${process.platform}\0${normalized}\0${(options.extraCandidates ?? []).join('\0')}`;
  if (!options.force && cache.has(cacheKey)) return cache.get(cacheKey) ?? undefined;

  const result = await resolveExecutableUncached(normalized, options.extraCandidates ?? []);
  cache.set(cacheKey, result ?? null);
  return result;
}

export function clearExecutableResolutionCache(): void {
  cache.clear();
}

async function resolveExecutableUncached(
  configured: string,
  extraCandidates: string[]
): Promise<ExecutableResolution | undefined> {
  const home = homedir();
  const expanded = expandHome(configured, home);

  if (looksLikePath(configured) || isAbsolute(expanded)) {
    for (const candidate of executableVariants(resolve(expanded))) {
      if (await isExecutable(candidate)) return makeResolution(configured, candidate, 'explicit-path', environmentPath());
    }
  }

  const extensionPathCandidate = await findOnPath(configured, environmentPath());
  if (extensionPathCandidate) return makeResolution(configured, extensionPathCandidate, 'extension-path', environmentPath());

  const system = process.platform === 'win32'
    ? await resolveFromWindowsShell(configured)
    : await resolveFromLoginShell(configured);
  if (system?.path) {
    const launchable = process.platform === 'win32' ? await firstLaunchableVariant(system.path) : (await isExecutable(system.path) ? system.path : undefined);
    if (launchable) return makeResolution(configured, launchable, 'login-shell', system.pathValue);
  }

  const candidates = await knownCandidates(configured, home, extraCandidates);
  for (const candidate of candidates) {
    for (const variant of executableVariants(candidate)) {
      if (await isExecutable(variant)) return makeResolution(configured, variant, 'known-location', environmentPath());
    }
  }

  return undefined;
}

async function resolveFromLoginShell(command: string): Promise<{ path?: string; pathValue?: string } | undefined> {
  const shell = process.env.SHELL?.trim() || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  if (!(await isExecutable(shell))) return undefined;
  const script = [
    'printf "__RELAY_PATH__=%s\\n" "$PATH"',
    'resolved="$(command -v -- "$RELAY_COMMAND" 2>/dev/null || true)"',
    'printf "__RELAY_EXECUTABLE__=%s\\n" "$resolved"'
  ].join('; ');
  const result = await runCommand(shell, ['-lic', script], { env: { RELAY_COMMAND: command }, timeoutMs: 5000 }).catch(() => null);
  if (!result) return undefined;
  const pathValue = markerValue(result.stdout, '__RELAY_PATH__=');
  const executable = markerValue(result.stdout, '__RELAY_EXECUTABLE__=');
  return { ...(executable ? { path: executable } : {}), ...(pathValue ? { pathValue } : {}) };
}

async function resolveFromWindowsShell(command: string): Promise<{ path?: string; pathValue?: string } | undefined> {
  const where = await runCommand('where.exe', [command], { timeoutMs: 5000 }).catch(() => null);
  if (where?.exitCode === 0) {
    for (const line of where.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
      const launchable = await firstLaunchableVariant(line);
      if (launchable) {
        const pathValue = environmentPath();
        return { path: launchable, ...(pathValue ? { pathValue } : {}) };
      }
    }
  }

  const powershell = 'powershell.exe';
  const script = [
    '$c = Get-Command -Name $env:RELAY_COMMAND -ErrorAction SilentlyContinue',
    'if ($c) {',
    '  if ($c.Source) { $c.Source } elseif ($c.Path) { $c.Path } elseif ($c.Definition) { $c.Definition }',
    '}'
  ].join('; ');
  const result = await runCommand(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    env: { RELAY_COMMAND: command }, timeoutMs: 5000
  }).catch(() => null);
  for (const line of result?.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean) ?? []) {
    const launchable = await firstLaunchableVariant(line);
    if (launchable) {
      const pathValue = environmentPath();
      return { path: launchable, ...(pathValue ? { pathValue } : {}) };
    }
  }
  return undefined;
}

function markerValue(output: string, marker: string): string | undefined {
  const lines = output.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    if (line?.startsWith(marker)) {
      const value = line.slice(marker.length).trim();
      return value || undefined;
    }
  }
  return undefined;
}

async function knownCandidates(command: string, home: string, extras: string[]): Promise<string[]> {
  const name = basename(command);
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
    const candidates = [
      ...extras.map((candidate) => expandHome(candidate, home)),
      join(appData, 'npm', name),
      join(appData, 'npm', `${name}.cmd`),
      join(programFiles, 'nodejs', name),
      join(programFiles, 'nodejs', `${name}.cmd`),
      join(programFiles, 'nodejs', `${name}.exe`),
      join(programFilesX86, 'nodejs', name),
      join(programFilesX86, 'nodejs', `${name}.cmd`),
      join(programFilesX86, 'nodejs', `${name}.exe`),
      join(localAppData, 'Programs', name, name),
      join(localAppData, name, name),
      ...(name.toLowerCase().replace(/\.(exe|cmd|bat)$/i, '') === 'agy'
        ? antigravityWindowsInstallCandidates(localAppData)
        : []),
      ...(name.toLowerCase().replace(/\.(exe|cmd|bat)$/i, '') === 'pwsh'
        ? powershellWindowsInstallCandidates(programFiles)
        : []),
      join(home, '.local', 'bin', name),
      join(home, '.claude', 'local', name),
      join(home, '.volta', 'bin', name),
      join(home, '.fnm', 'aliases', 'default', name),
      join(programFiles, name, name)
    ];
    return unique(candidates);
  }

  const candidates = [
    ...extras.map((candidate) => expandHome(candidate, home)),
    join(home, '.local', 'bin', name),
    join(home, '.npm-global', 'bin', name),
    join(home, '.volta', 'bin', name),
    join(home, '.asdf', 'shims', name),
    join(home, '.local', 'share', 'pnpm', name),
    join(home, 'Library', 'pnpm', name),
    join(home, '.bun', 'bin', name),
    join(home, '.claude', 'local', name),
    join('/opt/homebrew/bin', name),
    join('/usr/local/bin', name),
    join('/usr/bin', name),
    join('/snap/bin', name)
  ];
  candidates.push(...await scanVersionedBin(join(home, '.nvm', 'versions', 'node'), name, ['bin']));
  candidates.push(...await scanVersionedBin(join(home, '.fnm', 'node-versions'), name, ['installation', 'bin']));
  return unique(candidates);
}


export function antigravityWindowsInstallCandidates(localAppData: string): string[] {
  return [
    join(localAppData, 'agy', 'bin', 'agy.exe'),
    join(localAppData, 'agy', 'bin', 'agy.cmd')
  ];
}

function powershellWindowsInstallCandidates(programFiles: string): string[] {
  return [
    join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    join(programFiles, 'PowerShell', '7-preview', 'pwsh.exe')
  ];
}

async function scanVersionedBin(root: string, command: string, suffix: string[]): Promise<string[]> {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; }
  const candidates = entries.filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name, ...suffix, command));
  const ranked = await Promise.all(candidates.map(async (candidate) => {
    try { return { candidate, modified: (await stat(candidate)).mtimeMs }; } catch { return { candidate, modified: 0 }; }
  }));
  return ranked.sort((a, b) => b.modified - a.modified).map((entry) => entry.candidate);
}

async function findOnPath(command: string, pathValue: string | undefined): Promise<string | undefined> {
  if (!pathValue) return undefined;
  for (const entry of pathValue.split(delimiter)) {
    if (!entry) continue;
    for (const candidate of executableVariants(join(entry, command))) if (await isExecutable(candidate)) return candidate;
  }
  return undefined;
}

function executableVariants(path: string): string[] {
  return executableVariantsForPlatform(path, process.platform, process.env.PATHEXT);
}

export function executableVariantsForPlatform(path: string, platform: NodeJS.Platform, pathExt?: string): string[] {
  if (platform !== 'win32' || extname(path)) return [path];
  const configured = (pathExt ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((extension) => extension.trim())
    .filter(Boolean);
  const preferred = ['.EXE', '.CMD', '.BAT', '.COM'];
  const extensions = unique([...preferred, ...configured].map((extension) => extension.toUpperCase()));
  // npm creates both an extensionless POSIX shim and a .cmd launcher on Windows.
  // Node cannot spawn the extensionless shim directly, so executable variants must win.
  return unique([
    ...extensions.map((extension) => `${path}${extension.toLowerCase()}`),
    ...extensions.map((extension) => `${path}${extension}`),
    path
  ]);
}

async function firstLaunchableVariant(path: string): Promise<string | undefined> {
  for (const candidate of executableVariants(path)) {
    if (await isExecutable(candidate)) {
      if (process.platform !== 'win32' || extname(candidate)) return candidate;
    }
  }
  return undefined;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    const info = await stat(path);
    return info.isFile() || info.isSymbolicLink();
  } catch { return false; }
}

function makeResolution(configured: string, path: string, source: ExecutableResolutionSource, discoveredPath: string | undefined): ExecutableResolution {
  const pathEntries = unique([
    dirname(path),
    ...(discoveredPath ?? '').split(delimiter),
    ...(environmentPath() ?? '').split(delimiter),
    join(homedir(), '.local', 'bin'),
    process.platform === 'win32' ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'npm') : ''
  ].filter(Boolean));
  return { configured, path, source, env: { ...process.env, PATH: pathEntries.join(delimiter), Path: pathEntries.join(delimiter) } };
}

function environmentPath(): string | undefined { return process.env.PATH ?? process.env.Path; }
function looksLikePath(value: string): boolean { return value.includes('/') || value.includes('\\'); }
function expandHome(value: string, home: string): string {
  if (value === '~') return home;
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(home, value.slice(2));
  return value;
}
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
