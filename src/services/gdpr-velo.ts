import { join } from 'node:path';
import { runCommand } from './command-runner.js';
import { resolveExecutable, type ExecutableResolution } from './executable-resolver.js';

let cachedPython: ExecutableResolution | undefined;

function bundledVeloCwd(): string {
  return join(__dirname, '..', 'vendor', 'velo');
}

async function resolvePython(): Promise<ExecutableResolution | undefined> {
  if (cachedPython) return cachedPython;
  const checkedPaths = new Set<string>();
  for (const candidate of ['python3', 'python', 'py']) {
    const resolved = await resolveExecutable(candidate, { force: true });
    if (!resolved || checkedPaths.has(resolved.path.toLowerCase())) continue;
    checkedPaths.add(resolved.path.toLowerCase());
    const probe = await runCommand(resolved.path, ['-c', 'import velo'], {
      cwd: bundledVeloCwd(),
      env: resolved.env,
      timeoutMs: 5000
    }).catch(() => undefined);
    if (probe?.exitCode === 0) {
      cachedPython = resolved;
      return resolved;
    }
  }
  return undefined;
}

export async function isVeloAvailable(): Promise<boolean> {
  return Boolean(await resolvePython());
}

export function resetVeloAvailabilityCache(): void {
  cachedPython = undefined;
}

export async function describeVeloCommand(): Promise<string> {
  const python = await resolvePython();
  const executable = python?.path ?? 'python3';
  return `cd "${bundledVeloCwd()}" && "${executable}" -m velo anonimizza <input> -v <vault>`;
}
