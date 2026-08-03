import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type { McpAuthType, McpScope, McpServerRecord, ProviderId, ProviderStatus } from '../core/types.js';
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
  transport: 'http';
  target: string;
  scope: McpScope;
  authType?: McpAuthType;
  headers?: Record<string, string>;
  bearerToken?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
}

export interface McpVerifyInput {
  target: string;
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

const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|authorization|bearer|credential|private)/i;
const MASK = '••••••';
const MCP_PROTOCOL_VERSION = '2025-03-26';
const VERIFY_TIMEOUT_MS = 8_000;
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
    const restored = restoreMaskedValues(input, existingForRestore);
    if (restored.bearerToken === MASK || restored.oauthClientSecret === MASK) {
      throw new Error('Il segreto mascherato non può essere ripristinato automaticamente per questo provider: reinserisci il valore.');
    }
    const verify = await this.verifyConnection(restored);
    if (!verify.ok) throw new Error(`Verifica connessione fallita: ${verify.message}`);
    const failures: string[] = [];
    for (const provider of [...new Set(input.providers)]) {
      try {
        const existing = this.cache?.raw.find((entry) => entry.provider === provider && entry.name === input.name && entry.scope === input.scope);
        const definition = restoreMaskedValues({ ...input, provider }, existing);
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
    const snapshot = await this.inventory(workspaceRoot, providers, true);
    if (!snapshot.servers.some((entry) => sameIdentity(entry, input) && entry.enabled)) {
      // CLI output formats can evolve. Direct config providers are strict;
      // CLI providers surface a useful warning only when list itself succeeded.
      if (input.provider === 'antigravity') throw new Error(`${input.name} non compare nell'inventario dopo l'aggiunta.`);
    }
  }

  private configPath(scope: McpScope, workspaceRoot?: string): string {
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
  return Object.entries(servers).flatMap(([name, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const definition = value as Record<string, any>;
    // Relay only manages remote (HTTP) MCP servers. Stdio entries created outside
    // Relay are left untouched and simply do not appear in this inventory.
    if (typeof definition.url !== 'string' || !definition.url) return [];
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
  });
}

export function serializeCodexMcpConfig(records: McpMutationInput[], base: Record<string, any> = {}): string {
  const parsed = structuredClone(base);
  parsed.mcp_servers = { ...(parsed.mcp_servers ?? {}) };
  for (const record of records) {
    parsed.mcp_servers[record.name] = { url: record.target };
  }
  return stringifyToml(parsed);
}

export function parseJsonMcpConfig(parsed: Record<string, any>, scope: McpScope, sourcePath = ''): McpServerRecord[] {
  const active = normalizeJsonServerMap(parsed.mcpServers, true);
  const disabled = normalizeJsonServerMap(parsed._relayDisabled, false);
  return [...active, ...disabled].flatMap(({ name, value, enabled }) => {
    const target = typeof value.url === 'string' ? value.url : typeof value.serverUrl === 'string' ? value.serverUrl : '';
    // Relay only manages remote (HTTP) MCP servers; command-based entries are skipped.
    if (!target) return [];
    // Values here stay unmasked: this feeds the in-memory raw cache used to restore
    // secrets on edit. Masking for the webview happens once, in redactServer().
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
      ...(typeof value.oauthClientId === 'string' ? { oauthClientId: value.oauthClientId, authType: 'oauth' as const } : {}),
      ...(typeof value.oauthClientSecret === 'string' ? { oauthClientSecret: value.oauthClientSecret } : {}),
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
    // Relay only manages remote (HTTP) MCP servers; lines without a URL describe
    // a stdio/command server and are skipped rather than surfaced read-only.
    if (!url) continue;
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
  }
  return records;
}

export function buildClaudeAddArgs(input: McpMutationInput): string[] {
  const scope = input.scope === 'global' ? 'user' : 'project';
  const headerArgs = Object.entries(mergedHeaders(input)).flatMap(([key, value]) => ['--header', `${key}: ${value}`]);
  return ['mcp', 'add', '--scope', scope, '--transport', 'http', ...headerArgs, input.name, input.target];
}

export function buildCodexAddArgs(input: McpMutationInput, bearerEnvVarName?: string): string[] {
  return ['mcp', 'add', input.name, '--url', input.target, ...(bearerEnvVarName ? ['--bearer-token-env-var', bearerEnvVarName] : [])];
}

function mergedHeaders(input: Pick<McpMutationInput, 'headers' | 'bearerToken'>): Record<string, string> {
  const headers = { ...(input.headers ?? {}) };
  if (input.bearerToken) headers.Authorization = `Bearer ${input.bearerToken}`;
  return headers;
}

function toJsonDefinition(input: McpMutationInput): Record<string, any> {
  const headers = mergedHeaders(input);
  return {
    serverUrl: input.target,
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(input.oauthClientId ? { oauthClientId: input.oauthClientId } : {}),
    ...(input.oauthClientSecret ? { oauthClientSecret: input.oauthClientSecret } : {})
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
    transport: 'http',
    target: value.target,
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
