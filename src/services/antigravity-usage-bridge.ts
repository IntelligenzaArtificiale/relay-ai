import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface AntigravityBridgeStatus {
  enabled: boolean;
  settingsPath: string;
  cachePath: string;
  lastUpdate?: string;
}

export class AntigravityUsageBridge {
  readonly cachePath: string;
  readonly scriptPath: string;
  readonly settingsPath: string;
  private readonly backupPath: string;

  constructor(private readonly storageRoot: string) {
    this.cachePath = join(storageRoot, 'antigravity-usage.json');
    this.scriptPath = join(storageRoot, 'antigravity-statusline-bridge.cjs');
    this.backupPath = join(storageRoot, 'antigravity-settings-backup.json');
    this.settingsPath = join(homedir(), '.gemini', 'antigravity-cli', 'settings.json');
  }

  async status(): Promise<AntigravityBridgeStatus> {
    const settings = await readJson<Record<string, unknown>>(this.settingsPath, {});
    const statusLine = asObject(settings.statusLine);
    const command = typeof statusLine.command === 'string' ? statusLine.command : '';
    const cache = await readJson<Record<string, unknown>>(this.cachePath, {});
    const lastUpdate = typeof cache.updatedAt === 'string' ? cache.updatedAt : undefined;
    return {
      enabled: command.includes('antigravity-statusline-bridge.cjs'),
      settingsPath: this.settingsPath,
      cachePath: this.cachePath,
      ...(lastUpdate ? { lastUpdate } : {})
    };
  }

  async install(): Promise<AntigravityBridgeStatus> {
    await mkdir(this.storageRoot, { recursive: true });
    const settings = await readJson<Record<string, unknown>>(this.settingsPath, {});
    const current = asObject(settings.statusLine);
    const currentCommand = typeof current.command === 'string' && !current.command.includes('antigravity-statusline-bridge.cjs')
      ? current.command
      : '';
    await writeFile(this.backupPath, `${JSON.stringify({ statusLine: settings.statusLine ?? null }, null, 2)}\n`, { mode: 0o600 });
    await writeFile(this.scriptPath, bridgeScript(this.cachePath, currentCommand), { mode: 0o700 });
    if (process.platform !== 'win32') await chmod(this.scriptPath, 0o700);
    const command = `node ${quoteForShell(this.scriptPath)}`;
    const next = { ...settings, statusLine: { ...current, type: 'command', command } };
    await mkdir(dirname(this.settingsPath), { recursive: true });
    await writeFile(this.settingsPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    return this.status();
  }

  async uninstall(): Promise<AntigravityBridgeStatus> {
    const settings = await readJson<Record<string, unknown>>(this.settingsPath, {});
    const current = asObject(settings.statusLine);
    const command = typeof current.command === 'string' ? current.command : '';
    if (command.includes('antigravity-statusline-bridge.cjs')) {
      const backup = await readJson<{ statusLine?: unknown }>(this.backupPath, {});
      const next = { ...settings };
      if (backup.statusLine === undefined || backup.statusLine === null) delete next.statusLine;
      else next.statusLine = backup.statusLine;
      await mkdir(dirname(this.settingsPath), { recursive: true });
      await writeFile(this.settingsPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    }
    await Promise.all([this.cachePath, this.scriptPath, this.backupPath].map((path) => rm(path, { force: true }).catch(() => undefined)));
    return this.status();
  }
}

function bridgeScript(cachePath: string, previousCommand: string): string {
  return `'use strict';
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const CACHE = ${JSON.stringify(cachePath)};
const PREVIOUS = ${JSON.stringify(previousCommand)};
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(input || '{}');
    const record = {
      updatedAt: new Date().toISOString(),
      quota: payload.quota || payload.quotas || payload.rate_limits || {},
      model: payload.model || payload.current_model || null,
      plan: payload.plan || payload.account?.plan || payload.user?.plan || null
    };
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    const temporary = CACHE + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(record, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, CACHE);
  } catch (_) {}
  if (PREVIOUS) {
    try {
      const output = cp.execSync(PREVIOUS, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 1500 });
      if (output) process.stdout.write(output);
    } catch (_) {}
  }
});
`;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; } catch { return fallback; }
}
function asObject(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
function quoteForShell(value: string): string {
  if (process.platform === 'win32') return `"${value.replaceAll('"', '""')}"`;
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
