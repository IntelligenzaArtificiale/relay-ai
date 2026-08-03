import { access, copyFile, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { basename, delimiter, dirname, join } from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type { McpAuthType, McpScope, McpServerRecord, McpTemplateDef, McpTransport, ProviderId, ProviderStatus } from '../core/types.js';
import { MCP_TEMPLATES } from '../core/types.js';
import { AtomicJsonStore } from './atomic-store.js';
import { runCommand, type CommandResult } from './command-runner.js';
import { spawnManagedProcess } from './process-launcher.js';

export interface McpInventorySnapshot {
  servers: McpServerRecord[];
  refreshedAt: string;
  errors: Array<{ provider: ProviderId; message: string }>;
}

export interface McpMutationInput {
  provider: ProviderId;
  name: string;
  transport: McpTransport;
  target: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  scope: McpScope;
  authType?: McpAuthType;
  headers?: Record<string, string>;
  bearerToken?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
}

export interface McpVerifyInput {
  target: string;
  transport?: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  authType?: McpAuthType;
  headers?: Record<string, string>;
  bearerToken?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
}

export interface McpVerifyResult {
  ok: boolean;
  message: string;
  protocolVersion?: string;
  serverName?: string;
  latencyMs?: number;
}

interface DisabledMcpRecord extends McpMutationInput {
  disabledAt: string;
}

interface McpMetaRecord {
  provider: ProviderId;
  name: string;
  scope: McpScope;
  lastTestedAt?: string;
  lastError?: string;
  protocolVersion?: string;
}

interface McpManagerOptions {
  storagePath: string;
  homeDir?: string;
  runner?: typeof runCommand;
  cacheTtlMs?: number;
}

export interface ExternalMcpRuntime {
  nodePath: string;
  nodeVersion: string;
  npxPath: string;
  npxCliPath?: string;
  pathPrefix: string;
}

const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|authorization|bearer|credential|private)/i;
const MASK = '••••••';
const MCP_PROTOCOL_VERSION = '2025-03-26';
const VERIFY_TIMEOUT_MS = 8_000;
const STDIO_VERIFY_TIMEOUT_MS = 30_000;
const CODEX_BEARER_ENV_VAR = 'RELAY_MCP_BEARER_TOKEN';
// Relay only manages remote MCP servers. Copilot has no verified MCP support yet,
// so it is intentionally excluded from discovery/mutation until that lands.
const PROVIDERS: ProviderId[] = ['claude', 'codex', 'antigravity'];

export class McpManager {
  private readonly homeDir: string;
  private readonly runner: typeof runCommand;
  private readonly disabledStore: AtomicJsonStore<DisabledMcpRecord[]>;
  private readonly metaStore: AtomicJsonStore<McpMetaRecord[]>;
  private readonly cacheTtlMs: number;
  private cache: { key: string; at: number; raw: McpServerRecord[]; snapshot: McpInventorySnapshot } | undefined;

  constructor(options: McpManagerOptions) {
    this.homeDir = options.homeDir ?? homedir();
    this.runner = options.runner ?? runCommand;
    this.disabledStore = new AtomicJsonStore(join(options.storagePath, 'mcp-disabled.json'), []);
    this.metaStore = new AtomicJsonStore(join(options.storagePath, 'mcp-meta.json'), []);
    this.cacheTtlMs = options.cacheTtlMs ?? 15_000;
  }

  invalidate(): void { this.cache = undefined; this.disabledStore.invalidate(); this.metaStore.invalidate(); }

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
      else raw.push({ ...mutationToRecord(item), enabled: false, status: 'unknown' });
    }
    const meta = await this.metaStore.read();
    for (const item of meta) {
      const index = raw.findIndex((entry) => sameIdentity(entry, item));
      if (index >= 0) raw[index] = { ...raw[index], lastTestedAt: item.lastTestedAt, lastError: item.lastError, protocolVersion: item.protocolVersion ?? raw[index].protocolVersion };
    }
    const normalized = dedupe(raw).sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
    const snapshot: McpInventorySnapshot = {
      servers: groupLogicalMcpServers(normalized).map(redactServer),
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
      if (definition.provider === 'antigravity') {
        await this.moveAntigravityEntry(this.configPath(definition.scope, workspaceRoot), definition.name, true);
      } else {
        await this.addOne(toMutation(definition), workspaceRoot, providers, false);
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

  async add(input: Omit<McpMutationInput, 'provider'> & { providers: ProviderId[] }, workspaceRoot: string | undefined, providers: ProviderStatus[]): Promise<McpVerifyResult> {
    validateMutation(input);
    if (!input.providers.length) throw new Error('Seleziona almeno un provider.');
    const invalidProvider = input.providers.find((provider) => !PROVIDERS.includes(provider));
    if (invalidProvider) throw new Error(`${invalidProvider} non supporta ancora server MCP remoti in Relay.`);
    await this.inventory(workspaceRoot, providers, true);
    const existingForRestore = this.cache?.raw.find((entry) => entry.provider === input.providers[0] && entry.name === input.name && entry.scope === input.scope);
    const restored = await stabilizeChromeRuntime(restoreMaskedValues(input, existingForRestore));
    if (restored.bearerToken === MASK || restored.oauthClientSecret === MASK) {
      throw new Error('Il segreto mascherato non può essere ripristinato automaticamente per questo provider: reinserisci il valore.');
    }
    const verify = await this.verifyConnection(restored);
    if (!verify.ok) throw new Error(`Verifica connessione fallita: ${verify.message}`);
    const failures: string[] = [];
    for (const provider of [...new Set(input.providers)]) {
      try {
        const existing = this.cache?.raw.find((entry) => entry.provider === provider && entry.name === input.name && entry.scope === input.scope);
        const definition = await stabilizeChromeRuntime(restoreMaskedValues({ ...input, provider }, existing));
        if (existing && (provider === 'claude' || provider === 'codex')) {
          await this.removeOne(provider, input.name, input.scope, workspaceRoot, providers, false);
          try { await this.addOne(definition, workspaceRoot, providers, false); }
          catch (error) { await this.addOne(toMutation(existing), workspaceRoot, providers, false).catch(() => undefined); throw error; }
        } else await this.addOne(definition, workspaceRoot, providers, false);
        await this.recordVerify({ provider, name: input.name, scope: input.scope }, verify);
      } catch (error) {
        failures.push(`${provider}: ${errorMessage(error)}`);
      }
    }
    this.invalidate();
    if (failures.length) throw new Error(`Server MCP aggiunto solo parzialmente. ${failures.join(' · ')}`);
    return verify;
  }

  async remove(input: Pick<McpServerRecord, 'provider' | 'name' | 'scope'>, workspaceRoot: string | undefined, providers: ProviderStatus[]): Promise<void> {
    await this.removeOne(input.provider, input.name, input.scope, workspaceRoot, providers, false);
    await this.disabledStore.update((items) => items.filter((entry) => !sameIdentity(entry, input)));
    await this.metaStore.update((items) => items.filter((entry) => !sameIdentity(entry, input)));
    this.invalidate();
  }

  async verifyConnection(input: McpVerifyInput): Promise<McpVerifyResult> {
    if (input.transport === 'stdio') {
      return verifyStdioMcp(input);
    }
    const check = validateRemoteUrl(input.target);
    if (!check.ok || !check.url) return { ok: false, message: check.message ?? 'URL del server MCP non valido.' };
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(input.headers ?? {})
    };
    if (input.bearerToken) headers.authorization = `Bearer ${input.bearerToken}`;
    else if (input.authType === 'oauth' && input.oauthClientSecret) headers.authorization = `Bearer ${input.oauthClientSecret}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const response = await fetch(check.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'Relay', version: '1.0' } }
        }),
        signal: controller.signal
      });
      const latencyMs = Date.now() - startedAt;
      if (response.status === 401 || response.status === 403) return { ok: false, message: `Autenticazione rifiutata dal server (HTTP ${response.status}).`, latencyMs };
      if (!response.ok) return { ok: false, message: `Il server ha risposto con HTTP ${response.status}.`, latencyMs };
      const raw = await response.text();
      const payload = parseMcpResponsePayload(raw);
      if (!payload) return { ok: false, message: 'Risposta non compatibile con il protocollo MCP.', latencyMs };
      if (payload.error) return { ok: false, message: `Errore MCP: ${payload.error?.message ?? 'risposta non valida'}.`, latencyMs };
      const protocolVersion = typeof payload.result?.protocolVersion === 'string' ? payload.result.protocolVersion : undefined;
      const serverName = typeof payload.result?.serverInfo?.name === 'string' ? payload.result.serverInfo.name : undefined;
      return { ok: true, message: serverName ? `Connesso a ${serverName}.` : 'Connessione riuscita.', protocolVersion, serverName, latencyMs };
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return { ok: false, message: `Timeout: il server non ha risposto entro ${VERIFY_TIMEOUT_MS / 1000}s.` };
      const code = nodeErrorCode(error);
      if (code && /CERT|TLS|SSL|SELF_SIGNED/i.test(code)) return { ok: false, message: `Errore TLS/certificato: ${code}.` };
      return { ok: false, message: errorMessage(error) };
    } finally {
      clearTimeout(timeout);
    }
  }

  async verifyExisting(input: Pick<McpServerRecord, 'provider' | 'name' | 'scope'>, workspaceRoot: string | undefined, providers: ProviderStatus[]): Promise<McpVerifyResult> {
    await this.inventory(workspaceRoot, providers, true);
    const current = this.cache?.raw.find((entry) => sameIdentity(entry, input));
    if (!current) throw new Error('Server MCP non trovato.');
    const result = await this.verifyConnection(toMutation(current));
    await this.recordVerify(input, result);
    this.invalidate();
    return result;
  }

  private async recordVerify(input: Pick<McpServerRecord, 'provider' | 'name' | 'scope'>, result: McpVerifyResult): Promise<void> {
    await this.metaStore.update((items) => [
      ...items.filter((entry) => !sameIdentity(entry, input)),
      {
        provider: input.provider,
        name: input.name,
        scope: input.scope,
        lastTestedAt: new Date().toISOString(),
        ...(result.ok ? {} : { lastError: result.message }),
        ...(result.protocolVersion ? { protocolVersion: result.protocolVersion } : {})
      }
    ]);
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
    return [
      ...await this.readJsonConfig(join(this.homeDir, '.gemini', 'config', 'mcp_config.json'), 'global'),
      ...(workspaceRoot ? await this.readJsonConfig(join(workspaceRoot, '.agents', 'mcp_config.json'), 'project') : [])
    ];
  }

  private async addOne(input: McpMutationInput, workspaceRoot: string | undefined, providers: ProviderStatus[], reverify = true): Promise<void> {
    validateMutation(input);
    const status = providers.find((entry) => entry.id === input.provider);
    if (!status?.available) throw new Error(`${input.provider} non disponibile.`);
    if (input.scope === 'project' && !workspaceRoot) throw new Error('Apri un progetto per aggiungere un MCP di progetto.');
    if (input.provider === 'claude') {
      const args = buildClaudeAddArgs(input);
      await assertCommand(this.runner, status.executable, args, workspaceRoot);
    } else if (input.provider === 'codex') {
      await backupIfExists(input.scope === 'global' ? join(this.homeDir, '.codex', 'config.toml') : join(requireWorkspace(workspaceRoot), '.codex', 'config.toml'));
      const useEnvVar = Boolean(input.bearerToken);
      const args = buildCodexAddArgs(input, useEnvVar ? CODEX_BEARER_ENV_VAR : undefined);
      await assertCommand(this.runner, status.executable, args, input.scope === 'project' ? workspaceRoot : undefined, useEnvVar ? { [CODEX_BEARER_ENV_VAR]: input.bearerToken! } : undefined);
    } else {
      await this.writeJsonEntry(this.configPath(input.scope, workspaceRoot), input);
      if (input.transport === 'stdio') await this.ensureAntigravityMcpPermissions(input.name);
    }
    if (reverify) await this.verifyAdded(input, workspaceRoot, providers);
  }

  private async removeOne(provider: ProviderId, name: string, scope: McpScope, workspaceRoot: string | undefined, providers: ProviderStatus[], preserveDisabled: boolean): Promise<void> {
    const status = providers.find((entry) => entry.id === provider);
    if (!status?.available) throw new Error(`${provider} non disponibile.`);
    if (provider === 'claude') {
      await assertCommand(this.runner, status.executable, ['mcp', 'remove', '--scope', scope === 'global' ? 'user' : 'project', name], workspaceRoot);
    } else if (provider === 'codex') {
      await backupIfExists(scope === 'global' ? join(this.homeDir, '.codex', 'config.toml') : join(requireWorkspace(workspaceRoot), '.codex', 'config.toml'));
      await assertCommand(this.runner, status.executable, ['mcp', 'remove', name], scope === 'project' ? workspaceRoot : undefined);
    } else {
      if (preserveDisabled) await this.moveAntigravityEntry(this.configPath(scope, workspaceRoot), name, false);
      else await this.removeJsonEntry(this.configPath(scope, workspaceRoot), name);
    }
  }

  private async verifyAdded(input: McpMutationInput, workspaceRoot: string | undefined, providers: ProviderStatus[]): Promise<void> {
    this.invalidate();
    await this.inventory(workspaceRoot, providers, true);
    if (!this.cache?.raw.some((entry) => sameIdentity(entry, input) && entry.enabled)) {
      if (input.provider === 'antigravity') throw new Error(`${input.name} non compare nell'inventario dopo l'aggiunta.`);
    }
  }

  private configPath(scope: McpScope, workspaceRoot?: string): string {
    return scope === 'global'
      ? join(this.homeDir, '.gemini', 'config', 'mcp_config.json')
      : join(requireWorkspace(workspaceRoot), '.agents', 'mcp_config.json');
  }

  private async ensureAntigravityMcpPermissions(name: string): Promise<void> {
    const path = join(this.homeDir, '.gemini', 'antigravity-cli', 'settings.json');
    const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '{}' : Promise.reject(error));
    let parsed: Record<string, any>;
    try { parsed = raw.trim() ? JSON.parse(raw) as Record<string, any> : {}; }
    catch { throw new Error(`Configurazione JSON MCP non valida: ${path}`); }
    const permissions = parsed.permissions && typeof parsed.permissions === 'object' ? parsed.permissions as Record<string, unknown> : {};
    const current = Array.isArray(permissions.allow) ? permissions.allow.filter((entry): entry is string => typeof entry === 'string') : [];
    const required = [`mcp(${name}/*)`, ...(name === 'chrome-devtools' ? ['execute_url(*)'] : [])];
    const allow = [...new Set([...current, ...required])];
    if (allow.length === current.length) return;
    parsed.permissions = { ...permissions, allow };
    await backupAndWrite(path, raw, `${JSON.stringify(parsed, null, 2)}\n`);
  }

  private async readCodexConfig(path: string, scope: McpScope): Promise<McpServerRecord[]> {
    const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
    if (!raw.trim()) return [];
    let parsed: Record<string, any>;
    try { parsed = parseToml(raw) as Record<string, any>; }
    catch (error) { throw new Error(`${path}: TOML non valido (${errorMessage(error)}).`); }
    return parseCodexMcpConfig(parsed, scope, path);
  }

  private async readJsonConfig(path: string, scope: McpScope): Promise<McpServerRecord[]> {
    const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
    if (!raw.trim()) return [];
    let parsed: Record<string, any>;
    try { parsed = JSON.parse(raw) as Record<string, any>; }
    catch (error) { throw new Error(`${path}: JSON non valido (${errorMessage(error)}). Nessuna scrittura eseguita.`); }
    return parseJsonMcpConfig(parsed, scope, path);
  }

  private async writeJsonEntry(path: string, input: McpMutationInput): Promise<void> {
    const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
    let parsed: Record<string, any>;
    try { parsed = raw.trim() ? JSON.parse(raw) as Record<string, any> : {}; }
    catch (error) { throw new Error(`${path}: JSON non valido (${errorMessage(error)}). Nessuna scrittura eseguita.`); }
    parsed.mcpServers = { ...(parsed.mcpServers ?? {}), [input.name]: toJsonDefinition(input) };
    await backupAndWrite(path, raw, `${JSON.stringify(parsed, null, 2)}\n`);
  }

  private async removeJsonEntry(path: string, name: string): Promise<void> {
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
  return Object.entries(servers).flatMap(([name, value]): McpServerRecord[] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const definition = value as Record<string, any>;
    if (typeof definition.url === 'string' && definition.url) {
      return [{
        provider: 'codex' as const,
        name,
        transport: 'http' as const,
        target: String(definition.url),
        scope,
        enabled: definition.enabled !== false,
        status: 'unknown' as const,
        ...(typeof definition.bearer_token_env_var === 'string' ? { bearerToken: MASK, authType: 'bearer' as const } : {}),
        ...(sourcePath ? { sourcePath } : {})
      }];
    }
    const command = typeof definition.command === 'string' ? definition.command : undefined;
    const args = Array.isArray(definition.args) ? definition.args.map(String) : undefined;
    if (command || args) {
      return [{
        provider: 'codex' as const,
        name,
        transport: 'stdio' as const,
        target: `${command ?? ''} ${(args ?? []).join(' ')}`.trim(),
        command,
        args,
        scope,
        enabled: definition.enabled !== false,
        status: 'unknown' as const,
        ...(sourcePath ? { sourcePath } : {})
      }];
    }
    return [];
  });
}

export function serializeCodexMcpConfig(records: McpMutationInput[], base: Record<string, any> = {}): string {
  const parsed = structuredClone(base);
  parsed.mcp_servers = { ...(parsed.mcp_servers ?? {}) };
  for (const record of records) {
    if (record.transport === 'stdio') {
      const isWin = process.platform === 'win32';
      let cmd = record.command || record.target || 'npx';
      let args = record.args || [];
      if (isWin && cmd === 'npx') {
        cmd = 'cmd';
        args = ['/c', 'npx', ...args];
      }
      parsed.mcp_servers[record.name] = { command: cmd, args };
    } else {
      parsed.mcp_servers[record.name] = { url: record.target };
    }
  }
  return stringifyToml(parsed);
}

export function parseJsonMcpConfig(parsed: Record<string, any>, scope: McpScope, sourcePath = ''): McpServerRecord[] {
  const active = normalizeJsonServerMap(parsed.mcpServers, true);
  const disabled = normalizeJsonServerMap(parsed._relayDisabled, false);
  return [...active, ...disabled].flatMap(({ name, value, enabled }): McpServerRecord[] => {
    const target = typeof value.url === 'string' ? value.url : typeof value.serverUrl === 'string' ? value.serverUrl : '';
    if (target) {
      const headers = isStringMap(value.headers) ? value.headers : undefined;
      return [{
        provider: 'antigravity' as const,
        name,
        transport: 'http' as const,
        target,
        scope,
        enabled: value.disabled === true ? false : enabled,
        status: 'unknown' as const,
        ...(headers ? { headers } : {}),
        ...(typeof value.oauth?.clientId === 'string' || typeof value.oauthClientId === 'string'
          ? { oauthClientId: String(value.oauth?.clientId ?? value.oauthClientId), authType: 'oauth' as const } : {}),
        ...(typeof value.oauth?.clientSecret === 'string' || typeof value.oauthClientSecret === 'string'
          ? { oauthClientSecret: String(value.oauth?.clientSecret ?? value.oauthClientSecret) } : {}),
        ...(sourcePath ? { sourcePath } : {})
      }];
    }
    const command = typeof value.command === 'string' ? value.command : undefined;
    const args = Array.isArray(value.args) ? value.args.map(String) : undefined;
    if (command || args) {
      return [{
        provider: 'antigravity' as const,
        name,
        transport: 'stdio' as const,
        target: `${command ?? ''} ${(args ?? []).join(' ')}`.trim(),
        command,
        args,
        scope,
        enabled: value.disabled === true ? false : enabled,
        status: 'unknown' as const,
        ...(sourcePath ? { sourcePath } : {})
      }];
    }
    return [];
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
    if (url) {
      records.push({
        provider,
        name,
        transport: 'http',
        target: url,
        scope: 'global',
        enabled: true,
        status,
        statusDetail: detail
      });
    } else {
      const commandLine = detail
        .replace(/\s+-\s+(?:[✓✔✘✗]|(?:connected|ready|failed|error|disconnected|rejected)\b)[\s\S]*$/i, '')
        .replace(/\s+(?:connected|ready|failed|disconnected)\s*$/i, '')
        .trim();
      const tokens = splitCommandLine(commandLine);
      records.push({
        provider,
        name,
        transport: 'stdio',
        target: commandLine || name,
        ...(tokens[0] ? { command: tokens[0], args: tokens.slice(1) } : {}),
        scope: 'global',
        enabled: true,
        status,
        statusDetail: detail
      });
    }
  }
  return records;
}

export function buildClaudeAddArgs(input: McpMutationInput): string[] {
  const scope = input.scope === 'global' ? 'user' : 'project';
  if (input.transport === 'stdio') {
    const command = input.command || input.target || 'npx';
    const args = input.args || [];
    const envArgs = Object.entries(input.env ?? {}).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
    return ['mcp', 'add', '--scope', scope, input.name, ...envArgs, '--', command, ...args];
  }
  const headerArgs = Object.entries(mergedHeaders(input)).flatMap(([key, value]) => ['--header', `${key}: ${value}`]);
  return ['mcp', 'add', '--scope', scope, '--transport', 'http', ...headerArgs, input.name, input.target];
}

export function buildCodexAddArgs(input: McpMutationInput, bearerEnvVarName?: string): string[] {
  if (input.transport === 'stdio') {
    const isWin = process.platform === 'win32';
    let command = input.command || input.target || 'npx';
    let args = input.args || [];
    if (isWin && command === 'npx') {
      command = 'cmd';
      args = ['/c', 'npx', ...args];
    }
    const envArgs = Object.entries(input.env ?? {}).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
    return ['mcp', 'add', ...envArgs, input.name, '--', command, ...args];
  }
  return ['mcp', 'add', input.name, '--url', input.target, ...(bearerEnvVarName ? ['--bearer-token-env-var', bearerEnvVarName] : [])];
}

function mergedHeaders(input: Pick<McpMutationInput, 'headers' | 'bearerToken'>): Record<string, string> {
  const headers = { ...(input.headers ?? {}) };
  if (input.bearerToken) headers.Authorization = `Bearer ${input.bearerToken}`;
  return headers;
}

async function stabilizeChromeRuntime<T extends McpVerifyInput>(input: T): Promise<T> {
  if (input.transport !== 'stdio' || ![input.command, input.target, ...(input.args ?? [])].join(' ').includes('chrome-devtools-mcp')) return input;
  const command = input.command || input.target;
  if (!/^(?:npx|npx\.cmd)$/i.test(basename(command))) return input;
  const runtime = await resolveExternalMcpRuntime();
  if (!runtime) throw new Error('Chrome DevTools MCP richiede Node esterno 20.19+, 22.12+ o >=23.');
  return materializeChromeRuntime(input, runtime);
}

export function materializeChromeRuntime<T extends McpVerifyInput>(input: T, runtime: ExternalMcpRuntime): T {
  const effectivePath = `${runtime.pathPrefix}${delimiter}${process.env.PATH ?? process.env.Path ?? ''}`;
  const env = { ...(input.env ?? {}), PATH: effectivePath };
  if (runtime.npxCliPath) {
    const args = [runtime.npxCliPath, ...(input.args ?? [])];
    return { ...input, command: runtime.nodePath, args, env, target: `${runtime.nodePath} ${args.join(' ')}` };
  }
  return { ...input, command: runtime.npxPath, env, target: `${runtime.npxPath} ${(input.args ?? []).join(' ')}`.trim() };
}

function splitCommandLine(value: string): string[] {
  const tokens: string[] = [];
  value.replace(/"((?:\\.|[^"\\])*)"|'([^']*)'|([^\s]+)/g, (_match, doubleQuoted, singleQuoted, bare) => {
    tokens.push(String(doubleQuoted ?? singleQuoted ?? bare ?? '').replace(/\\"/g, '"'));
    return '';
  });
  return tokens;
}

function toJsonDefinition(input: McpMutationInput): Record<string, any> {
  if (input.transport === 'stdio') {
    return {
      command: input.command || input.target || 'npx',
      args: input.args || [],
      ...(input.env ? { env: input.env } : {})
    };
  }
  const headers = mergedHeaders(input);
  return {
    serverUrl: input.target,
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(input.oauthClientId || input.oauthClientSecret ? { oauth: {
      ...(input.oauthClientId ? { clientId: input.oauthClientId } : {}),
      ...(input.oauthClientSecret ? { clientSecret: input.oauthClientSecret } : {})
    } } : {})
  };
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
    ...(server.headers ? { headers: redactSecretMap(server.headers) } : {}),
    ...(server.bearerToken ? { bearerToken: MASK } : {}),
    ...(server.oauthClientSecret ? { oauthClientSecret: MASK } : {})
  };
}

function redactSecretMap(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? MASK : item]));
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

export function groupLogicalMcpServers(records: McpServerRecord[]): McpServerRecord[] {
  const groups = new Map<string, McpServerRecord[]>();
  for (const record of records) {
    const key = logicalIdentity(record);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.entries()].map(([logicalId, bindings]) => {
    const representative = bindings[0];
    const statuses = bindings.map((item) => item.status ?? 'unknown');
    const status: McpServerRecord['status'] = statuses.includes('failed') ? 'failed'
      : statuses.length > 0 && statuses.every((item) => item === 'connected') ? 'connected' : 'unknown';
    return {
      ...representative,
      logicalId,
      enabled: bindings.some((item) => item.enabled),
      status,
      lastTestedAt: bindings.map((item) => item.lastTestedAt).filter(Boolean).sort().at(-1),
      lastError: bindings.find((item) => item.lastError)?.lastError,
      providerBindings: Object.fromEntries(bindings.map((item) => [item.provider, {
        provider: item.provider,
        scope: item.scope,
        enabled: item.enabled,
        status: item.status,
        statusDetail: item.statusDetail,
        sourcePath: item.sourcePath,
        lastTestedAt: item.lastTestedAt,
        lastError: item.lastError
      }]))
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function logicalIdentity(record: McpServerRecord): string {
  const name = record.name.trim().toLowerCase();
  const endpoint = record.transport === 'http'
    ? record.target.trim().replace(/\/$/, '').toLowerCase()
    : `${record.command ?? ''}\0${JSON.stringify(record.args ?? [])}`;
  return `${name}:${record.transport}:${endpoint}`;
}

function sameIdentity(a: Pick<McpServerRecord, 'provider' | 'name' | 'scope'>, b: Pick<McpServerRecord, 'provider' | 'name' | 'scope'>): boolean {
  return identity(a) === identity(b);
}

function identity(value: Pick<McpServerRecord, 'provider' | 'name' | 'scope'>): string {
  return `${value.provider}:${value.scope}:${value.name}`;
}

function toMutation(value: McpMutationInput): McpMutationInput {
  return {
    provider: value.provider,
    name: value.name,
    transport: value.transport || 'http',
    target: value.target,
    ...(value.command ? { command: value.command } : {}),
    ...(value.args ? { args: value.args } : {}),
    ...(value.env ? { env: value.env } : {}),
    scope: value.scope,
    ...(value.authType ? { authType: value.authType } : {}),
    ...(value.headers ? { headers: value.headers } : {}),
    ...(value.bearerToken ? { bearerToken: value.bearerToken } : {}),
    ...(value.oauthClientId ? { oauthClientId: value.oauthClientId } : {}),
    ...(value.oauthClientSecret ? { oauthClientSecret: value.oauthClientSecret } : {})
  };
}

function mutationToRecord(value: McpMutationInput): McpServerRecord {
  return { ...value, enabled: true };
}

function restoreMaskedValues(input: McpMutationInput | (Omit<McpMutationInput, 'provider'> & { providers: ProviderId[] }), existing?: McpServerRecord): any {
  const restoreMap = (next: Record<string, string> | undefined, previous: Record<string, string> | undefined) => next
    ? Object.fromEntries(Object.entries(next).map(([key, value]) => [key, value === MASK ? previous?.[key] ?? value : value]))
    : undefined;
  const headers = restoreMap(input.headers, existing?.headers);
  const bearerToken = input.bearerToken === MASK ? existing?.bearerToken ?? input.bearerToken : input.bearerToken;
  const oauthClientSecret = input.oauthClientSecret === MASK ? existing?.oauthClientSecret ?? input.oauthClientSecret : input.oauthClientSecret;
  return {
    ...input,
    ...(headers ? { headers } : {}),
    ...(bearerToken !== undefined ? { bearerToken } : {}),
    ...(oauthClientSecret !== undefined ? { oauthClientSecret } : {})
  };
}

async function backupIfExists(path: string): Promise<void> {
  const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
  if (raw) await copyFile(path, `${path}.relay-bak`);
}

function validateMutation(input: Omit<McpMutationInput, 'provider'> | McpMutationInput): void {
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(input.name)) throw new Error('Nome MCP non valido. Usa lettere, numeri, punto, trattino o underscore.');
  if (input.transport === 'stdio') {
    if (!input.command && !input.target) throw new Error('Comando del server MCP stdio non specificato.');
    return;
  }
  const check = validateRemoteUrl(input.target);
  if (!check.ok || !check.url) throw new Error(check.message ?? 'URL del server MCP non valido.');
}

// Returns a flat (non-discriminated) shape rather than a `{ok:true}|{ok:false}`
// union: with this project's `strict: false` tsconfig, TS cannot narrow a
// boolean-literal discriminant, so callers check `!ok || !url` explicitly instead.
function validateRemoteUrl(target: string): { ok: boolean; url?: URL; message?: string } {
  let url: URL;
  try { url = new URL(target); }
  catch { return { ok: false, message: 'URL del server MCP non valido.' }; }
  if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, message: 'Sono supportati solo URL http o https.' };
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  if (url.protocol === 'http:' && !isLocalhost) return { ok: false, message: 'HTTPS è obbligatorio per host remoti (eccetto localhost).' };
  return { ok: true, url };
}

function parseMcpResponsePayload(raw: string): any {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try { return JSON.parse(trimmed); } catch { /* fall through to SSE parsing */ }
  for (const line of trimmed.split(/\r?\n/)) {
    const match = line.match(/^data:\s*(.+)$/);
    if (!match) continue;
    try { return JSON.parse(match[1]); } catch { continue; }
  }
  return undefined;
}

async function verifyStdioMcp(input: McpVerifyInput): Promise<McpVerifyResult> {
  const command = input.command || input.target || '';
  const args = input.args ?? [];
  if (!command) return { ok: false, message: 'Comando stdio mancante.' };
  if (args.some((arg) => /--(?:headless|slim|accept-insecure-certs|allow-unrestricted-paths|autoConnect|browser-url|wsEndpoint)\b/i.test(arg))) {
    return { ok: false, message: 'Flag Browser non consentito: la verifica deve usare Chrome visibile e profilo predefinito ufficiale.' };
  }
  const isChrome = [command, ...args].join(' ').includes('chrome-devtools-mcp');
  let externalRuntime: ExternalMcpRuntime | undefined;
  if (isChrome) {
    externalRuntime = await resolveExternalMcpRuntime();
    if (!externalRuntime) {
      return { ok: false, message: `Chrome DevTools MCP richiede un Node esterno 20.19+, 22.12+ o >=23. Extension Host: ${process.version} (${process.execPath}). Nessun runtime esterno compatibile trovato.` };
    }
  }
  const startedAt = Date.now();
  const executable = externalRuntime && /^(?:npx|npx\.cmd)$/i.test(basename(command)) ? externalRuntime.npxPath : command;
  const effectivePath = externalRuntime ? `${externalRuntime.pathPrefix}${delimiter}${process.env.PATH ?? process.env.Path ?? ''}` : undefined;
  const child = spawnManagedProcess(executable, args, {
    env: { ...process.env, ...(effectivePath ? { PATH: effectivePath, Path: effectivePath } : {}), ...(input.env ?? {}), CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1' }
  });
  const probe = new StdioMcpProbe(child);
  const screenshotPath = join(tmpdir(), `relay-chrome-devtools-${Date.now()}.png`);
  try {
    const initialized = await probe.request('initialize', { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'Relay', version: '1.0' } });
    probe.notify('notifications/initialized', {});
    const tools = await probe.request('tools/list', {});
    if (!isChrome) return { ok: true, message: 'Server stdio MCP inizializzato.', protocolVersion: initialized?.protocolVersion, serverName: initialized?.serverInfo?.name, latencyMs: Date.now() - startedAt };
    const toolNames = new Set((tools?.tools ?? []).map((tool: any) => String(tool?.name ?? '')));
    for (const required of ['list_pages', 'navigate_page', 'take_snapshot', 'take_screenshot']) {
      if (!toolNames.has(required)) return { ok: false, message: `Chrome DevTools MCP non espone ${required}.`, latencyMs: Date.now() - startedAt };
    }
    const pages = await probe.tool('list_pages', {});
    await probe.tool('navigate_page', { url: 'https://example.com' });
    const snapshot = await probe.tool('take_snapshot', {});
    const screenshot = await probe.tool('take_screenshot', { filePath: screenshotPath });
    const evidence = `${JSON.stringify(snapshot)}\n${JSON.stringify(screenshot)}`;
    if (!/Example Domain|example\.com/i.test(evidence)) return { ok: false, message: 'Smoke Browser incompleto: example.com non confermato da snapshot/screenshot.', latencyMs: Date.now() - startedAt };
    const pageId = findPageId(snapshot) ?? findPageId(pages);
    if (toolNames.has('close_page') && pageId !== undefined) await probe.tool('close_page', { pageId });
    return { ok: true, message: `Chrome DevTools MCP verificato con ${externalRuntime?.nodePath ?? 'Node esterno'} ${externalRuntime?.nodeVersion ?? ''}: initialize, list_pages, navigate, snapshot, screenshot e cleanup riusciti.`, protocolVersion: initialized?.protocolVersion, serverName: initialized?.serverInfo?.name ?? 'chrome-devtools-mcp', latencyMs: Date.now() - startedAt };
  } catch (error) {
    const runtimeDetail = externalRuntime
      ? `Node esterno: ${externalRuntime.nodePath} ${externalRuntime.nodeVersion}; npx: ${externalRuntime.npxPath}; PATH prefix: ${externalRuntime.pathPrefix}; Extension Host: ${process.version} (${process.execPath}).`
      : `Extension Host: ${process.version} (${process.execPath}).`;
    return { ok: false, message: `${errorMessage(error)} ${runtimeDetail}`, latencyMs: Date.now() - startedAt };
  } finally {
    await probe.dispose();
    await import('node:fs/promises').then((fs) => fs.rm(screenshotPath, { force: true })).catch(() => undefined);
  }
}

function findPageId(value: unknown): number | undefined {
  const match = JSON.stringify(value).match(/(?:pageId|id)["']?\s*[:=]\s*["']?(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

class StdioMcpProbe {
  private nextId = 1;
  private buffer = '';
  private stderrTail = '';
  private readonly pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: NodeJS.Timeout }>();

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.read(String(chunk)));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { this.stderrTail = `${this.stderrTail}${String(chunk)}`.slice(-4_000); });
    child.on('error', (error) => this.rejectAll(error));
    child.on('exit', (code) => this.rejectAll(new Error(this.stderrTail.trim() || `Processo MCP terminato (${code ?? 'signal'}).`)));
  }

  request(method: string, params: Record<string, any>): Promise<any> {
    const id = this.nextId++;
    this.write({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout MCP durante ${method}.`));
      }, STDIO_VERIFY_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  notify(method: string, params: Record<string, any>): void {
    this.write({ jsonrpc: '2.0', method, params });
  }

  tool(name: string, args: Record<string, any>): Promise<any> {
    return this.request('tools/call', { name, arguments: args });
  }

  async dispose(): Promise<void> {
    this.rejectAll(new Error('Probe MCP chiuso.'));
    if (!this.child.killed) this.child.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!this.child.killed) this.child.kill('SIGKILL');
  }

  private write(payload: Record<string, any>): void {
    const body = JSON.stringify(payload);
    this.child.stdin.write(`${body}\n`);
  }

  private read(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const lineEnd = this.buffer.indexOf('\n');
      if (lineEnd < 0) return;
      const raw = this.buffer.slice(0, lineEnd).trim();
      this.buffer = this.buffer.slice(lineEnd + 1);
      if (!raw) continue;
      let message: any;
      try { message = JSON.parse(raw); } catch { continue; }
      if (typeof message.id !== 'number') continue;
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'Errore MCP.'));
      else pending.resolve(message.result);
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

export function supportsChromeDevtoolsNode(version: string): boolean {
  const match = version.trim().match(/^v?(\d+)\.(\d+)/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 22 || major === 22 && minor >= 12 || major === 20 && minor >= 19;
}

export async function resolveExternalMcpRuntime(
  runner: typeof runCommand = runCommand,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => Promise<boolean> = fileExists
): Promise<ExternalMcpRuntime | undefined> {
  const windows = platform === 'win32';
  const pathDelimiter = windows ? ';' : ':';
  const locator = await runner(windows ? 'where' : 'which', windows ? ['node'] : ['-a', 'node'], { env, timeoutMs: 5_000 }).catch(() => null);
  const pathEntries = String(env.PATH ?? env.Path ?? '').split(pathDelimiter).filter(Boolean);
  const common = windows
    ? [join(env.ProgramFiles ?? env.PROGRAMFILES ?? 'C:\\Program Files', 'nodejs', 'node.exe')]
    : ['/usr/local/bin/node', '/usr/bin/node', '/opt/homebrew/bin/node', '/opt/local/bin/node'];
  const managed = await managedNodeCandidates(windows, env);
  const candidates = [...new Set([
    ...(locator?.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean) ?? []),
    ...pathEntries.map((entry) => join(entry, windows ? 'node.exe' : 'node')),
    ...common,
    ...managed
  ])];
  for (const nodePath of candidates) {
    if (!await exists(nodePath)) continue;
    const probe = await runner(nodePath, ['--version'], { env, timeoutMs: 5_000 }).catch(() => null);
    const nodeVersion = probe?.exitCode === 0 ? probe.stdout.trim() : '';
    if (!supportsChromeDevtoolsNode(nodeVersion)) continue;
    const pathPrefix = dirname(nodePath);
    const prefixedEnv = { ...env, PATH: `${pathPrefix}${pathDelimiter}${env.PATH ?? env.Path ?? ''}`, Path: `${pathPrefix}${pathDelimiter}${env.Path ?? env.PATH ?? ''}` };
    const paired = join(pathPrefix, windows ? 'npx.cmd' : 'npx');
    const npxCandidates = [paired, ...await locateExecutables(runner, windows ? 'where' : 'which', windows ? ['npx'] : ['-a', 'npx'], prefixedEnv)];
    for (const npxPath of [...new Set(npxCandidates)]) {
      if (!await exists(npxPath)) continue;
      const npxProbe = await runner(npxPath, ['--version'], { env: prefixedEnv, timeoutMs: 8_000 }).catch(() => null);
      if (npxProbe?.exitCode === 0) {
        const npxCliPath = windows ? undefined : await realpath(npxPath).catch(() => undefined);
        return { nodePath, nodeVersion, npxPath, ...(npxCliPath ? { npxCliPath } : {}), pathPrefix };
      }
    }
  }
  return undefined;
}

async function managedNodeCandidates(windows: boolean, env: NodeJS.ProcessEnv): Promise<string[]> {
  const userHome = env.HOME ?? env.USERPROFILE ?? homedir();
  if (windows) {
    const nvmRoot = env.NVM_HOME ?? join(env.APPDATA ?? join(userHome, 'AppData', 'Roaming'), 'nvm');
    const versions = await directoryNames(nvmRoot);
    return versions.map((version) => join(nvmRoot, version, 'node.exe'));
  }
  const nvmRoot = join(userHome, '.nvm', 'versions', 'node');
  const fnmRoot = join(userHome, '.local', 'share', 'fnm', 'node-versions');
  const [nvmVersions, fnmVersions] = await Promise.all([directoryNames(nvmRoot), directoryNames(fnmRoot)]);
  return [
    ...nvmVersions.map((version) => join(nvmRoot, version, 'bin', 'node')),
    ...fnmVersions.map((version) => join(fnmRoot, version, 'installation', 'bin', 'node')),
    join(userHome, '.volta', 'bin', 'node'),
    join(userHome, '.asdf', 'shims', 'node')
  ];
}

async function directoryNames(path: string): Promise<string[]> {
  return readdir(path, { withFileTypes: true }).then(
    (entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
    () => []
  );
}

async function locateExecutables(runner: typeof runCommand, executable: string, args: string[], env: NodeJS.ProcessEnv): Promise<string[]> {
  const result = await runner(executable, args, { env, timeoutMs: 5_000 }).catch(() => null);
  return result?.exitCode === 0 ? result.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean) : [];
}

async function fileExists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

async function backupAndWrite(path: string, current: string, next: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  if (current) await copyFile(path, `${path}.relay-bak`);
  await writeFile(path, next, { mode: 0o600 });
}

async function assertCommand(runner: typeof runCommand, executable: string, args: string[], cwd?: string, env?: NodeJS.ProcessEnv): Promise<CommandResult> {
  const result = await runner(executable, args, { cwd, timeoutMs: 20_000, ...(env ? { env } : {}) });
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

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const withCause = error as { code?: unknown; cause?: { code?: unknown } };
  const code = withCause.code ?? withCause.cause?.code;
  return typeof code === 'string' ? code : undefined;
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
