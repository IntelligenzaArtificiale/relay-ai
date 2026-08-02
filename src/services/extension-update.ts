import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

export interface PendingExtensionUpdate {
  fromVersion: string;
  vsixPath: string;
  createdAt: string;
}

export interface CompletedExtensionUpdate extends PendingExtensionUpdate {
  toVersion: string;
}

export async function resolveVsixUpdatePath(input: string, workspaceRoot?: string): Promise<string> {
  const value = String(input ?? '').trim();
  if (!value) throw new Error('Indica il percorso del file VSIX da installare.');
  const absolute = isAbsolute(value) ? resolve(value) : resolve(workspaceRoot || process.cwd(), value);
  if (!absolute.toLowerCase().endsWith('.vsix')) throw new Error('Il file selezionato deve avere estensione .vsix.');
  let info;
  try { info = await stat(absolute); } catch { throw new Error(`File VSIX non trovato: ${absolute}`); }
  if (!info.isFile()) throw new Error(`Il percorso VSIX non indica un file: ${absolute}`);
  return absolute;
}

export async function writePendingExtensionUpdate(path: string, marker: PendingExtensionUpdate): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(marker, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  if (process.platform !== 'win32') await chmod(path, 0o600);
}

export async function consumePendingExtensionUpdate(path: string, currentVersion: string): Promise<CompletedExtensionUpdate | undefined> {
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(path, 'utf8')); } catch { return undefined; }
  await rm(path, { force: true }).catch(() => undefined);
  if (!parsed || typeof parsed !== 'object') return undefined;
  const value = parsed as Record<string, unknown>;
  if (typeof value.fromVersion !== 'string' || typeof value.vsixPath !== 'string' || typeof value.createdAt !== 'string') return undefined;
  return { fromVersion: value.fromVersion, vsixPath: value.vsixPath, createdAt: value.createdAt, toVersion: currentVersion };
}

export async function installVsixWithFallback(
  vsix: unknown,
  execute: (command: string, ...args: unknown[]) => PromiseLike<unknown>
): Promise<'workbench.extensions.installExtension' | 'workbench.extensions.command.installFromVSIX'> {
  try {
    await execute('workbench.extensions.installExtension', vsix);
    return 'workbench.extensions.installExtension';
  } catch {
    await execute('workbench.extensions.command.installFromVSIX', vsix);
    return 'workbench.extensions.command.installFromVSIX';
  }
}
