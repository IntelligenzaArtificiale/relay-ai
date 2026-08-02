import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type { McpScope, McpServerRecord, ProviderId, ProviderStatus } from '../core/types.js';
import { AtomicJsonStore } from './atomic-store.js';
import { runCommand, type CommandResult } from './command-runner.js';

export interface McpInventorySnapshot {
  servers: McpServerRecord[];
  refreshedAt: string;
  errors: Array<{ provider: ProviderId; message: string }>;
}

export interface McpMutationInput {
  provider: ProviderId;
  name: string;
  transport: 'stdio' | 'http';
  target: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  bearerTokenEnvVar?: string;
  scope: McpScope;
}

interface DisabledMcpRecord extends McpMutationInput {
  disabledAt: string;
}

interface McpManagerOptions {
  storagePath: string;
  homeDir?: string;
  runner?: typeof runCommand;
  cacheTtlMs?: number;
}

const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|authorization|bearer|credential|private)/i;
const PROVIDERS: ProviderId[] = ['claude', 'codex', 'copilot', 'antigravity'];

export class McpManager {
  private readonly homeDir: string;
  private readonly runner: typeof runCommand;
  private readonly disabledStore: AtomicJsonStore<DisabledMcpRecord[]>;
  private readonly cacheTtlMs: number;
  private cache: { key: string; at: number; raw: McpServerRecord[]; snapshot: McpInventorySnapshot } | undefined;

  constructor(options: McpManagerOptions) {
    this.homeDir = options.homeDir ?? homedir();
    this.runner = options.runner ?? runCommand;
    this.disabledStore = new AtomicJsonStore(join(options.storagePath, 'mcp-disabled.json'), []);
    this.cacheTtlMs = options.cacheTtlMs ?? 15_000;
  }

  invalidate(): void { this.cache = undefined; this.disabledStore.invalidate(); }

  async inventory(workspaceRoot: string | undefined, providers: ProviderStatus[], force = false): Promise<McpInventorySnapshot> {
    const key = `${workspaceRoot ?? ''}|${providers.map((provider) => `${provider.id}:${provider.executable}:${provider.available}`).join('|')}`;
    if (!force && this.cache?.key === key && Date.now() - this.cache.at < this.cacheTtlMs) return structuredClone(this.cache.snapshot);
    const raw: McpServerRecord[] = [];
    const errors: McpInventorySnapshot['errors'] = [];
    for (const provider of PROVIDERS) {
      const status = providers.find((entry) => entry.id === provider);
      if (!status?.available) continue;
      try {
        raw.push(...await this.listProvider(provider, status.executable, workspaceRoot));
      } catch (error) {
        errors.push({ provider, message: errorMessage(error) });
      }
    }
    const disabled = await this.disabledStore.read();
    for (const item of disabled) {
      const index = raw.findIndex((entry) => sameIdentity(entry, item));
      if (index >= 0) raw[index] = { ...raw[index], enabled: false };
      else raw.push({ ...item, enabled: false, status: 'unknown' });
    }
    const normalized = dedupe(raw).sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
    const snapshot: McpInventorySnapshot = {
      servers: normalized.map(redactServer),
      refreshedAt: new Date().toISOString(),
      errors
    };
    this.cache = { key, at: Date.now(), raw: normalized, snapshot };
    return structuredClone(snapshot);
  }

  async toggle(input: Pick<McpServerRecord, 'provider' | 'name' | 'scope'>, enabled: boolean, workspaceRoot: string | undefined, providers: ProviderStatus[]): Promise<void> {
    await this.inventory(workspaceRoot, providers, true);
    const current = this.cache?.raw.find((entry) => sameIdentity(entry, input));
    if (enabled) {
      const disabled = (await this.disabledStore.read()).find((entry) => sameIdentity(entry, input));
      const definition = disabled ?? current;
      if (!definition) throw new Error('Definizione MCP disabilitata non trovata.');
      const status = providers.find((entry) => entry.id === definition.provider);
      if (definition.provider === 'antigravity') {
        await this.moveAntigravityEntry(this.configPath('antigravity', definition.scope, workspaceRoot), definition.name, true);
      } else if (definition.provider === 'copilot' && status?.available) {
        await assertCommand(this.runner, status.executable, ['mcp', 'enable', definition.name], workspaceRoot).catch(() => this.addOne(definition, workspaceRoot, providers));
      } else {
        await this.addOne(definition, workspaceRoot, providers);
      }
      await this.disabledStore.update((items) => items.filter((entry) => !sameIdentity(entry, input)));
    } else {
      if (!current) throw new Error('Server MCP non trovato.');
      await this.disabledStore.update((items) => [
        ...items.filter((entry) => !sameIdentity(entry, current)),
        { ...toMutation(current), disabledAt: new Date().toISOString() }
      ]);
      await this.removeOne(current.provider, current.name, current.scope, workspaceRoot, providers, true);
    }
    this.invalidate();
  }

  async add(input: Omit<McpMutationInput, 'provider'> & { providers: ProviderId[] }, workspaceRoot: string | undefined, providers: ProviderStatus[]): Promise<void> {
    validateMutation(input);
    await this.inventory(workspaceRoot, providers, true);
    const failures: string[] = [];
    for (const provider of [...new Set(input.providers)]) {
      try {
        const existing = this.cache?.raw.find((entry) => entry.provider === provider && entry.name === input.name && entry.scope === input.scope);
        const definition = restoreMaskedValues({ ...input, provider }, existing);
        if (existing && (provider === 'claude' || provider === 'codex')) {
          await this.removeOne(provider, input.name, input.scope, workspaceRoot, providers, false);
          try { await this.addOne(definition, workspaceRoot, providers); }
          catch (error) { await this.addOne(toMutation(existing), workspaceRoot, providers).catch(() => undefined); throw error; }
        } else await this.addOne(definition, workspaceRoot, providers);
      } catch (error) {
        failures.push(`${provider}: ${errorMessage(error)}`);
      }
    }
    this.invalidate();
    if (failures.length) throw new Error(`MCP aggiunto solo parzialmente. ${failures.join(' · ')}`);
  }

  async remove(input: Pick<McpServerRecord, 'provider' | 'name' | 'scope'>, workspaceRoot: string | undefined, providers: ProviderStatus[]): Promise<void> {
    await this.removeOne(input.provider, input.name, input.scope, workspaceRoot, providers, false);
    await this.disabledStore.update((items) => items.filter((entry) => !sameIdentity(entry, input)));
    this.invalidate();
  }

  async copyTo(input: Pick<McpServerRecord, 'provider' | 'name' | 'scope'>, targets: ProviderId[], workspaceRoot: string | undefined, providers: ProviderStatus[]): Promise<void> {
    await this.inventory(workspaceRoot, providers, true);
    const current = this.cache?.raw.find((entry) => sameIdentity(entry, input));
    if (!current) throw new Error('Server MCP sorgente non trovato.');
    await this.add({ ...toMutation(current), providers: targets }, workspaceRoot, providers);
  }

  private async listProvider(provider: ProviderId, executable: string, workspaceRoot?: string): Promise<McpServerRecord[]> {
    if (provider === 'claude') {
      const result = await this.runner(executable, ['mcp', 'list'], { cwd: workspaceRoot, timeoutMs: 15_000 });
      if (result.exitCode !== 0) throw new Error(result.stderr || 'claude mcp list non riuscito.');
      return parseMcpListOutput('claude', result.stdout);
    }
    if (provider === 'codex') {
      const configRecords = [
        ...await this.readCodexConfig(join(this.homeDir, '.codex', 'config.toml'), 'global'),
        ...(workspaceRoot ? await this.readCodexConfig(join(workspaceRoot, '.codex', 'config.toml'), 'project') : [])
      ];
      const status = await this.runner(executable, ['mcp', 'list'], { cwd: workspaceRoot, timeoutMs: 15_000 }).catch(() => undefined);
      return mergeStatuses(configRecords, status ? parseMcpListOutput('codex', `${status.stdout}\n${status.stderr}`) : []);
    }
    if (provider === 'copilot') {
      const records = [
        ...await this.readJsonConfig(join(this.homeDir, '.copilot', 'mcp-config.json'), 'global', 'copilot'),
        ...(workspaceRoot ? await this.readJsonConfig(join(workspaceRoot, '.github', 'mcp.json'), 'project', 'copilot') : [])
      ];
      const status = await this.runner(executable, ['mcp', 'list'], { cwd: workspaceRoot, timeoutMs: 15_000 }).catch(() => undefined);
      return mergeStatuses(records, status ? parseMcpListOutput('copilot', `${status.stdout}\n${status.stderr}`) : []);
    }
    return [
      ...await this.readJsonConfig(join(this.homeDir, '.gemini', 'config', 'mcp_config.json'), 'global', 'antigravity'),
      ...(workspaceRoot ? await this.readJsonConfig(join(workspaceRoot, '.agents', 'mcp_config.json'), 'project', 'antigravity') : [])
    ];
  }

  private async addOne(input: McpMutationInput, workspaceRoot: string | undefined, providers: ProviderStatus[]): Promise<void> {
    validateMutation(input);
    const status = providers.find((entry) => entry.id === input.provider);
    if (!status?.available) throw new Error(`${input.provider} non disponibile.`);
    if (input.scope === 'project' && !workspaceRoot) throw new Error('Apri un progetto per aggiungere un MCP di progetto.');
    if (input.provider === 'claude') {
      const args = buildClaudeAddArgs(input);
      await assertCommand(this.runner, status.executable, args, workspaceRoot);
    } else if (input.provider === 'codex') {
      await backupIfExists(input.scope === 'global' ? join(this.homeDir, '.codex', 'config.toml') : join(requireWorkspace(workspaceRoot), '.codex', 'config.toml'));
      const args = buildCodexAddArgs(input);
      await assertCommand(this.runner, status.executable, args, input.scope === 'project' ? workspaceRoot : undefined);
    } else if (input.provider === 'copilot') {
      await this.writeJsonEntry(this.configPath('copilot', input.scope, workspaceRoot), input, 'copilot');
    } else {
      await this.writeJsonEntry(this.configPath('antigravity', input.scope, workspaceRoot), input, 'antigravity');
    }
    await this.verifyAdded(input, workspaceRoot, providers);
  }

  private async removeOne(provider: ProviderId, name: string, scope: McpScope, workspaceRoot: string | undefined, providers: ProviderStatus[], preserveDisabled: boolean): Promise<void> {
    const status = providers.find((entry) => entry.id === provider);
    if (!status?.available) throw new Error(`${provider} non disponibile.`);
    if (provider === 'claude') {
      await assertCommand(this.runner, status.executable, ['mcp', 'remove', '--scope', scope === 'global' ? 'user' : 'project', name], workspaceRoot);
    } else if (provider === 'codex') {
      await backupIfExists(scope === 'global' ? join(this.homeDir, '.codex', 'config.toml') : join(requireWorkspace(workspaceRoot), '.codex', 'config.toml'));
      await assertCommand(this.runner, status.executable, ['mcp', 'remove', name], scope === 'project' ? workspaceRoot : undefined);
    } else if (provider === 'copilot') {
      await backupIfExists(this.configPath('copilot', scope, workspaceRoot));
      if (preserveDisabled) {
        await assertCommand(this.runner, status.executable, ['mcp', 'disable', name], workspaceRoot).catch(async () => {
          await this.removeJsonEntry(this.configPath('copilot', scope, workspaceRoot), name, 'copilot');
        });
      } else {
        await this.removeJsonEntry(this.configPath('copilot', scope, workspaceRoot), name, 'copilot');
      }
    } else {
      if (preserveDisabled) await this.moveAntigravityEntry(this.configPath('antigravity', scope, workspaceRoot), name, false);
      else await this.removeJsonEntry(this.configPath('antigravity', scope, workspaceRoot), name, 'antigravity');
    }
  }

  private async verifyAdded(input: McpMutationInput, workspaceRoot: string | undefined, providers: ProviderStatus[]): Promise<void> {
    this.invalidate();
    const snapshot = await this.inventory(workspaceRoot, providers, true);
    if (!snapshot.servers.some((entry) => sameIdentity(entry, input) && entry.enabled)) {
      // CLI output formats can evolve. Direct config providers are strict;
      // CLI providers surface a useful warning only when list itself succeeded.
      if (input.provider === 'copilot' || input.provider === 'antigravity') throw new Error(`${input.name} non compare nell'inventario dopo l'aggiunta.`);
    }
  }

  private configPath(provider: 'copilot' | 'antigravity', scope: McpScope, workspaceRoot?: string): string {
    if (provider === 'copilot') return scope === 'global'
      ? join(this.homeDir, '.copilot', 'mcp-config.json')
      : join(requireWorkspace(workspaceRoot), '.github', 'mcp.json');
    return scope === 'global'
      ? join(this.homeDir, '.gemini', 'config', 'mcp_config.json')
      : join(requireWorkspace(workspaceRoot), '.agents', 'mcp_config.json');
  }

  private async readCodexConfig(path: string, scope: McpScope): Promise<McpServerRecord[]> {
    const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
    if (!raw.trim()) return [];
    let parsed: Record<string, any>;
    try { parsed = parseToml(raw) as Record<string, any>; }
    catch (error) { throw new Error(`${path}: TOML non valido (${errorMessage(error)}).`); }
    return parseCodexMcpConfig(parsed, scope, path);
  }

  private async readJsonConfig(path: string, scope: McpScope, provider: 'copilot' | 'antigravity'): Promise<McpServerRecord[]> {
    const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
    if (!raw.trim()) return [];
    let parsed: Record<string, any>;
    try { parsed = JSON.parse(raw) as Record<string, any>; }
    catch (error) { throw new Error(`${path}: JSON non valido (${errorMessage(error)}). Nessuna scrittura eseguita.`); }
    return parseJsonMcpConfig(parsed, provider, scope, path);
  }

  private async writeJsonEntry(path: string, input: McpMutationInput, provider: 'copilot' | 'antigravity'): Promise<void> {
    const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
    let parsed: Record<string, any>;
    try { parsed = raw.trim() ? JSON.parse(raw) as Record<string, any> : {}; }
    catch (error) { throw new Error(`${path}: JSON non valido (${errorMessage(error)}). Nessuna scrittura eseguita.`); }
    parsed.mcpServers = { ...(parsed.mcpServers ?? {}), [input.name]: toJsonDefinition(input, provider) };
    await backupAndWrite(path, raw, `${JSON.stringify(parsed, null, 2)}\n`);
  }

  private async removeJsonEntry(path: string, name: string, provider: 'copilot' | 'antigravity'): Promise<void> {
    const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
    if (!raw.trim()) return;
    let parsed: Record<string, any>;
    try { parsed = JSON.parse(raw) as Record<string, any>; }
    catch (error) { throw new Error(`${path}: JSON non valido (${errorMessage(error)}). Nessuna scrittura eseguita.`); }
    if (!parsed.mcpServers || !(name in parsed.mcpServers)) return;
    const next = { ...(parsed.mcpServers ?? {}) };
    delete next[name];
    parsed.mcpServers = next;
    await backupAndWrite(path, raw, `${JSON.stringify(parsed, null, 2)}\n`);
  }

  private async moveAntigravityEntry(path: string, name: string, enable: boolean): Promise<void> {
    const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
    let parsed: Record<string, any>;
    try { parsed = raw.trim() ? JSON.parse(raw) as Record<string, any> : {}; }
    catch (error) { throw new Error(`${path}: JSON non valido (${errorMessage(error)}). Nessuna scrittura eseguita.`); }
    const sourceKey = enable ? '_relayDisabled' : 'mcpServers';
    const targetKey = enable ? 'mcpServers' : '_relayDisabled';
    const source = { ...(parsed[sourceKey] ?? {}) };
    if (!(name in source)) throw new Error(`MCP ${name} non trovato.`);
    parsed[targetKey] = { ...(parsed[targetKey] ?? {}), [name]: source[name] };
    delete source[name];
    parsed[sourceKey] = source;
    await backupAndWrite(path, raw, `${JSON.stringify(parsed, null, 2)}\n`);
  }
}

export function parseCodexMcpConfig(parsed: Record<string, any>, scope: McpScope, sourcePath = ''): McpServerRecord[] {
  const servers = parsed.mcp_servers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return [];
  return Object.entries(servers).flatMap(([name, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const definition = value as Record<string, any>;
    const transport = typeof definition.url === 'string' ? 'http' : 'stdio';
    const target = transport === 'http' ? String(definition.url) : String(definition.command ?? '');
    if (!target) return [];
    return [{
      provider: 'codex' as const,
      name,
      transport,
      target,
      scope,
      enabled: definition.enabled !== false,
      status: 'unknown' as const,
      ...(Array.isArray(definition.args) ? { args: definition.args.map(String) } : {}),
      ...(isStringMap(definition.env) ? { env: definition.env } : {}),
      ...(typeof definition.bearer_token_env_var === 'string' ? { bearerTokenEnvVar: definition.bearer_token_env_var } : {}),
      ...(sourcePath ? { sourcePath } : {})
    }];
  });
}

export function serializeCodexMcpConfig(records: McpMutationInput[], base: Record<string, any> = {}): string {
  const parsed = structuredClone(base);
  parsed.mcp_servers = { ...(parsed.mcp_servers ?? {}) };
  for (const record of records) {
    parsed.mcp_servers[record.name] = record.transport === 'http'
      ? { url: record.target, ...(record.bearerTokenEnvVar ? { bearer_token_env_var: record.bearerTokenEnvVar } : {}) }
      : { command: record.target, ...(record.args?.length ? { args: record.args } : {}), ...(record.env ? { env: record.env } : {}) };
  }
  return stringifyToml(parsed);
}

export function parseJsonMcpConfig(parsed: Record<string, any>, provider: 'copilot' | 'antigravity', scope: McpScope, sourcePath = ''): McpServerRecord[] {
  const active = normalizeJsonServerMap(parsed.mcpServers, true);
  const disabled = provider === 'antigravity' ? normalizeJsonServerMap(parsed._relayDisabled, false) : [];
  return [...active, ...disabled].flatMap(({ name, value, enabled }) => {
    const transport = typeof value.url === 'string' || typeof value.serverUrl === 'string' ? 'http' : 'stdio';
    const target = transport === 'http' ? String(value.url ?? value.serverUrl ?? '') : String(value.command ?? '');
    if (!target) return [];
    return [{
      provider,
      name,
      transport,
      target,
      scope,
      enabled: value.disabled === true ? false : enabled,
      status: 'unknown' as const,
      ...(Array.isArray(value.args) ? { args: value.args.map(String) } : {}),
      ...(isStringMap(value.env) ? { env: value.env } : {}),
      ...(isStringMap(value.headers) ? { headers: value.headers } : {}),
      ...(sourcePath ? { sourcePath } : {})
    }];
  });
}

export function parseMcpListOutput(provider: ProviderId, raw: string): McpServerRecord[] {
  const records: McpServerRecord[] = [];
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^(name|server|mcp servers?|no mcp|checking)/i.test(line)) continue;
    const status = /(?:connected|ready|✓|\bok\b)/i.test(line) ? 'connected'
      : /(?:failed|error|disconnected|✗|rejected)/i.test(line) ? 'failed' : 'unknown';
    const separator = line.includes(':') ? line.indexOf(':') : line.search(/\s{2,}|\t/);
    if (separator <= 0) continue;
    const name = line.slice(0, separator).replace(/^[●○✓✗-]+\s*/, '').trim();
    const detail = line.slice(separator + (line[separator] === ':' ? 1 : 0)).trim();
    if (!name || name.includes(' ')) continue;
    const url = detail.match(/https?:\/\/\S+/i)?.[0]?.replace(/[),;]+$/, '');
    const commandPart = detail.split(/\s+(?:connected|ready|failed|error|✓|✗)\b/i)[0]?.trim() ?? '';
    const target = url ?? commandPart.split(/\s+/)[0] ?? '';
    if (!target) continue;
    records.push({
      provider,
      name,
      transport: url ? 'http' : 'stdio',
      target,
      scope: 'global',
      enabled: true,
      status,
      statusDetail: detail
    });
  }
  return records;
}

export function buildClaudeAddArgs(input: McpMutationInput): string[] {
  const scope = input.scope === 'global' ? 'user' : 'project';
  if (input.transport === 'http') return ['mcp', 'add', '--scope', scope, '--transport', 'http', input.name, input.target];
  const envArgs = Object.entries(input.env ?? {}).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
  return ['mcp', 'add', '--scope', scope, ...envArgs, input.name, '--', input.target, ...(input.args ?? [])];
}

export function buildCodexAddArgs(input: McpMutationInput): string[] {
  if (input.transport === 'http') {
    return ['mcp', 'add', input.name, '--url', input.target, ...(input.bearerTokenEnvVar ? ['--bearer-token-env-var', input.bearerTokenEnvVar] : [])];
  }
  const envArgs = Object.entries(input.env ?? {}).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
  return ['mcp', 'add', input.name, ...envArgs, '--', input.target, ...(input.args ?? [])];
}

function toJsonDefinition(input: McpMutationInput, provider: 'copilot' | 'antigravity'): Record<string, any> {
  if (input.transport === 'http') return provider === 'antigravity'
    ? { serverUrl: input.target, ...(input.headers ? { headers: input.headers } : {}) }
    : { url: input.target, ...(input.headers ? { headers: input.headers } : {}) };
  return { command: input.target, ...(input.args?.length ? { args: input.args } : {}), ...(input.env ? { env: input.env } : {}) };
}

function normalizeJsonServerMap(value: unknown, enabled: boolean): Array<{ name: string; value: Record<string, any>; enabled: boolean }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([name, item]) => item && typeof item === 'object' && !Array.isArray(item)
    ? [{ name, value: item as Record<string, any>, enabled }]
    : []);
}

function redactServer(server: McpServerRecord): McpServerRecord {
  return {
    ...server,
    ...(server.env ? { env: Object.fromEntries(Object.entries(server.env).map(([key, value]) => [key, SECRET_KEY.test(key) ? '••••••' : value])) } : {}),
    ...(server.headers ? { headers: Object.fromEntries(Object.entries(server.headers).map(([key, value]) => [key, SECRET_KEY.test(key) ? '••••••' : value])) } : {})
  };
}

function mergeStatuses(definitions: McpServerRecord[], statuses: McpServerRecord[]): McpServerRecord[] {
  const statusByName = new Map(statuses.map((entry) => [entry.name, entry]));
  if (!definitions.length) return statuses;
  return definitions.map((definition) => {
    const status = statusByName.get(definition.name);
    return status ? { ...definition, status: status.status, statusDetail: status.statusDetail } : definition;
  });
}

function dedupe(records: McpServerRecord[]): McpServerRecord[] {
  const byKey = new Map<string, McpServerRecord>();
  for (const record of records) byKey.set(identity(record), record);
  return [...byKey.values()];
}

function sameIdentity(a: Pick<McpServerRecord, 'provider' | 'name' | 'scope'>, b: Pick<McpServerRecord, 'provider' | 'name' | 'scope'>): boolean {
  return identity(a) === identity(b);
}

function identity(value: Pick<McpServerRecord, 'provider' | 'name' | 'scope'>): string {
  return `${value.provider}:${value.scope}:${value.name}`;
}

function toMutation(value: McpServerRecord): McpMutationInput {
  return {
    provider: value.provider,
    name: value.name,
    transport: value.transport,
    target: value.target,
    scope: value.scope,
    ...(value.args ? { args: value.args } : {}),
    ...(value.env ? { env: value.env } : {}),
    ...(value.headers ? { headers: value.headers } : {}),
    ...(value.bearerTokenEnvVar ? { bearerTokenEnvVar: value.bearerTokenEnvVar } : {})
  };
}

function restoreMaskedValues(input: McpMutationInput, existing?: McpServerRecord): McpMutationInput {
  const restore = (next: Record<string, string> | undefined, previous: Record<string, string> | undefined) => next
    ? Object.fromEntries(Object.entries(next).map(([key, value]) => [key, value === '••••••' ? previous?.[key] ?? value : value]))
    : undefined;
  const env = restore(input.env, existing?.env);
  const headers = restore(input.headers, existing?.headers);
  return { ...input, ...(env ? { env } : {}), ...(headers ? { headers } : {}) };
}

async function backupIfExists(path: string): Promise<void> {
  const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
  if (raw) await copyFile(path, `${path}.relay-bak`);
}

function validateMutation(input: Omit<McpMutationInput, 'provider'> | McpMutationInput): void {
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(input.name)) throw new Error('Nome MCP non valido. Usa lettere, numeri, punto, trattino o underscore.');
  if (input.transport === 'http') {
    let parsed: URL;
    try { parsed = new URL(input.target); } catch { throw new Error('URL MCP non valido.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Il trasporto HTTP accetta solo URL http/https.');
  } else if (!input.target.trim()) throw new Error('Comando MCP obbligatorio.');
}

async function backupAndWrite(path: string, current: string, next: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  if (current) await copyFile(path, `${path}.relay-bak`);
  await writeFile(path, next, { mode: 0o600 });
}

async function assertCommand(runner: typeof runCommand, executable: string, args: string[], cwd?: string): Promise<CommandResult> {
  const result = await runner(executable, args, { cwd, timeoutMs: 20_000 });
  if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || `${executable} ${args.join(' ')} non riuscito.`);
  return result;
}

function requireWorkspace(value?: string): string {
  if (!value) throw new Error('Apri un progetto per usare lo scope progetto.');
  return value;
}

function isStringMap(value: unknown): value is Record<string, string> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.values(value as Record<string, unknown>).every((entry) => typeof entry === 'string'));
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
