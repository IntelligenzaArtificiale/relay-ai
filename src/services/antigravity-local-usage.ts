import http from 'node:http';
import https from 'node:https';
import type { UsageBucket, UsageSnapshot } from '../core/types.js';
import { runCommand } from './command-runner.js';

interface AntigravityProcess {
  pid: number;
  csrfToken?: string;
  extensionCsrfToken?: string;
  extensionPort?: number;
  command: string;
}

interface LocalQuotaResult extends Partial<UsageSnapshot> {
  endpoint?: 'summary' | 'models' | 'legacy';
  detail?: string;
}

const SUMMARY_PATH = '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary';
const MODEL_CONFIG_PATHS = [
  '/exa.language_server_pb.LanguageServerService/GetCommandModelConfigs',
  '/exa.language_server_pb.LanguageServerService/GetAvailableModels',
  '/exa.language_server_pb.LanguageServerService/GetCascadeModelConfigData'
];
const LEGACY_PATH = '/exa.language_server_pb.LanguageServerService/GetUserStatus';
const REQUEST_BODY = {
  metadata: {
    ideName: 'antigravity',
    extensionName: 'antigravity',
    locale: 'en',
    ideVersion: 'unknown'
  }
};

export async function readAntigravityLocalUsage(): Promise<LocalQuotaResult | undefined> {
  const processes = await discoverAntigravityProcesses();
  const results: LocalQuotaResult[] = [];

  for (const processInfo of processes) {
    const ports = await discoverListeningPorts(processInfo);
    const targets = ports.flatMap((port) => (['https:', 'http:'] as const).map((protocol) => ({
      protocol,
      port,
      token: protocol === 'http:' && port === processInfo.extensionPort
        ? processInfo.extensionCsrfToken ?? processInfo.csrfToken
        : processInfo.csrfToken
    })));
    if (!targets.length) continue;

    const summaryResults = await Promise.all(targets.map(async ({ protocol, port, token }) => {
      const payload = await requestLanguageServer(protocol, port, SUMMARY_PATH, token).catch(() => undefined);
      if (payload === undefined) return undefined;
      const parsed = parseAntigravityQuotaSummary(payload);
      if (!parsed.buckets?.length) return undefined;
      return {
        ...parsed,
        endpoint: 'summary' as const,
        detail: `Antigravity quota summary · ${protocol}//127.0.0.1:${port}`
      };
    }));
    results.push(...summaryResults.filter(Boolean) as LocalQuotaResult[]);
    if (bestQuotaResult(results)?.buckets && quotaCoverage(bestQuotaResult(results)!.buckets!) >= 4) break;

    const modelResults = await Promise.all(targets.flatMap(({ protocol, port, token }) => MODEL_CONFIG_PATHS.map(async (path) => {
      const payload = await requestLanguageServer(protocol, port, path, token).catch(() => undefined);
      if (payload === undefined) return undefined;
      const parsed = parseAntigravityLegacyStatus(payload);
      if (!parsed.buckets?.length) return undefined;
      return {
        ...parsed,
        endpoint: 'models' as const,
        detail: `Antigravity model quotas · ${protocol}//127.0.0.1:${port}`
      };
    })));
    results.push(...modelResults.filter(Boolean) as LocalQuotaResult[]);

    const legacyResults = await Promise.all(targets.map(async ({ protocol, port, token }) => {
      const payload = await requestLanguageServer(protocol, port, LEGACY_PATH, token).catch(() => undefined);
      if (payload === undefined) return undefined;
      const parsed = parseAntigravityLegacyStatus(payload);
      if (!parsed.buckets?.length) return undefined;
      return {
        ...parsed,
        endpoint: 'legacy' as const,
        detail: `Antigravity user status · ${protocol}//127.0.0.1:${port}`
      };
    }));
    results.push(...legacyResults.filter(Boolean) as LocalQuotaResult[]);
  }

  return mergeLocalQuotaResults(results);
}

export function mergeLocalQuotaResults(results: LocalQuotaResult[]): LocalQuotaResult | undefined {
  if (!results.length) return undefined;
  const buckets = deduplicateBuckets(results.flatMap((entry) => entry.buckets ?? []));
  if (!buckets.length) return bestQuotaResult(results);
  const plan = results.map((entry) => entry.plan).find(Boolean);
  const best = bestQuotaResult(results);
  return {
    ...snapshotFromBuckets(buckets, plan),
    endpoint: best?.endpoint,
    detail: [...new Set(results.map((entry) => entry.detail).filter((value): value is string => Boolean(value)))].slice(0, 3).join(' · ')
  };
}

function bestQuotaResult(results: LocalQuotaResult[]): LocalQuotaResult | undefined {
  return [...results].sort((a, b) => quotaResultScore(b) - quotaResultScore(a))[0];
}

function quotaResultScore(result: LocalQuotaResult): number {
  const buckets = result.buckets ?? [];
  const endpointWeight = result.endpoint === 'summary' ? 30 : result.endpoint === 'models' ? 20 : 10;
  return quotaCoverage(buckets) * 100 + buckets.length * 10 + endpointWeight;
}

function quotaCoverage(buckets: UsageBucket[]): number {
  return new Set(buckets.map((bucket) => `${bucket.group ?? 'other'}:${bucket.kind ?? 'other'}`)).size;
}

export function parseAntigravityQuotaSummary(payload: unknown): Partial<UsageSnapshot> {
  const structured = parseStructuredQuotaGroups(payload);
  const candidates: QuotaCandidate[] = [];
  collectQuotaCandidates(payload, [], candidates);
  const buckets = deduplicateBuckets([...structured, ...candidates.flatMap(candidateToBucket)]);
  return snapshotFromBuckets(buckets, findPlan(payload));
}

export function parseAntigravityLegacyStatus(payload: unknown): Partial<UsageSnapshot> {
  const modelConfigs: Array<{ path: string[]; value: Record<string, unknown> }> = [];
  collectModelConfigs(payload, [], modelConfigs);
  const candidates: UsageBucket[] = [];

  for (const [index, entry] of modelConfigs.entries()) {
    const text = searchableText(entry.path, entry.value);
    const group = quotaGroup(text);
    if (!group) continue;
    const remaining = findNumeric(entry.value, REMAINING_KEYS);
    const used = findNumeric(entry.value, USED_KEYS);
    if (remaining === undefined && used === undefined) continue;
    const remainingFraction = clampFraction(remaining ?? 1 - clampFraction(used ?? 0));
    const reset = findReset(entry.value);
    candidates.push({
      id: `${slug(group)}-five-hour-${index}`,
      label: '5 ore',
      group,
      kind: 'five-hour',
      remainingFraction,
      usedFraction: Math.max(0, 1 - remainingFraction),
      reached: remainingFraction <= 0.001,
      ...(reset ? { resetsAt: reset } : {})
    });
  }

  // Some builds return quota records without the clientModelConfigs wrapper.
  if (!candidates.length) {
    const generic: QuotaCandidate[] = [];
    collectQuotaCandidates(payload, [], generic);
    for (const bucket of generic.flatMap(candidateToBucket)) {
      if (!bucket.group) continue;
      candidates.push({ ...bucket, kind: 'five-hour', label: '5 ore', id: `${slug(bucket.group)}-five-hour` });
    }
  }

  return snapshotFromBuckets(deduplicateBuckets(candidates), findPlan(payload));
}

function parseStructuredQuotaGroups(payload: unknown): UsageBucket[] {
  const groups: Array<Record<string, unknown>> = [];
  collectGroupObjects(payload, groups);
  const buckets: UsageBucket[] = [];
  for (const [groupIndex, groupObject] of groups.entries()) {
    const groupText = [
      groupObject.displayName,
      groupObject.display_name,
      groupObject.name,
      groupObject.groupName,
      groupObject.group_name,
      groupObject.groupId,
      groupObject.group_id,
      groupObject.quotaGroup,
      groupObject.quota_group,
      groupObject.groupKey,
      groupObject.group_key,
      groupObject.title,
      groupObject.id
    ].filter((value) => typeof value === 'string').join(' ');
    const group = quotaGroup(groupText.replace(/[_-]+/g, ' ').toLowerCase());
    if (!group) continue;
    const groupBuckets = arrayFromUnknown(groupObject.buckets ?? groupObject.quotaBuckets ?? groupObject.quota_buckets ?? groupObject.limits);
    for (const [bucketIndex, rawBucket] of groupBuckets.entries()) {
      if (!rawBucket || typeof rawBucket !== 'object') continue;
      const bucket = rawBucket as Record<string, unknown>;
      const text = [
        bucket.bucketId,
        bucket.bucket_id,
        bucket.displayName,
        bucket.display_name,
        bucket.name,
        bucket.label,
        bucket.description,
        bucket.window,
        bucket.type
      ].filter((value) => typeof value === 'string').join(' ').replace(/[_-]+/g, ' ').toLowerCase();
      const kind = quotaKind(text);
      if (!kind) continue;
      const remaining = findNumeric(bucket, REMAINING_KEYS);
      const used = findNumeric(bucket, USED_KEYS);
      if (remaining === undefined && used === undefined) continue;
      const remainingFraction = clampFraction(remaining ?? 1 - clampFraction(used ?? 0));
      const reset = findReset(bucket) ?? parseResetDescription(text);
      buckets.push({
        id: `${slug(group)}-${kind}-${groupIndex}-${bucketIndex}`,
        label: kind === 'weekly' ? 'Settimanale' : kind === 'five-hour' ? '5 ore' : 'Sessione',
        group,
        kind,
        remainingFraction,
        usedFraction: Math.max(0, 1 - remainingFraction),
        reached: remainingFraction <= 0.001,
        ...(reset ? { resetsAt: reset } : {})
      });
    }
  }
  return buckets;
}

function collectGroupObjects(value: unknown, target: Array<Record<string, unknown>>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((child) => collectGroupObjects(child, target));
    return;
  }
  const object = value as Record<string, unknown>;
  const bucketValue = object.buckets ?? object.quotaBuckets ?? object.quota_buckets ?? object.limits;
  if (Array.isArray(bucketValue)) target.push(object);
  for (const child of Object.values(object)) collectGroupObjects(child, target);
}

function arrayFromUnknown(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

function parseResetDescription(text: string): string | undefined {
  const match = text.match(/(?:refresh(?:es)?|reset(?:s)?)(?:\s+in)?\s*(?:(\d+)\s*d(?:ays?)?)?\s*(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?/i);
  if (!match || !match.slice(1).some(Boolean)) return undefined;
  const milliseconds = (Number(match[1] ?? 0) * 86_400 + Number(match[2] ?? 0) * 3_600 + Number(match[3] ?? 0) * 60) * 1000;
  return new Date(Date.now() + milliseconds).toISOString();
}

interface QuotaCandidate {
  path: string[];
  value: Record<string, unknown>;
}

const REMAINING_KEYS = [
  'remainingFraction', 'remaining_fraction', 'fractionRemaining', 'fraction_remaining',
  'remainingPercent', 'remaining_percent', 'remainingPercentage', 'remaining_percentage', 'remaining'
];
const USED_KEYS = [
  'usedFraction', 'used_fraction', 'fractionUsed', 'fraction_used',
  'usedPercent', 'used_percent', 'usedPercentage', 'used_percentage', 'used'
];

function collectQuotaCandidates(value: unknown, path: string[], target: QuotaCandidate[], context: string[] = []): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectQuotaCandidates(child, [...path, String(index)], target, context));
    return;
  }
  const object = value as Record<string, unknown>;
  const localContext = Object.entries(object)
    .filter(([key, child]) => /^(?:group|label|name|displayName|display_name|description|bucketId|bucket_id|model|quotaGroup|quota_group|window|type)$/i.test(key) && typeof child === 'string')
    .map(([key, child]) => `${key} ${String(child)}`);
  const inherited = [...context, ...localContext];
  if (hasAnyKey(object, [...REMAINING_KEYS, ...USED_KEYS])) target.push({ path: [...inherited, ...path], value: object });
  for (const [key, child] of Object.entries(object)) collectQuotaCandidates(child, [...path, key], target, inherited);
}

function collectModelConfigs(value: unknown, path: string[], target: Array<{ path: string[]; value: Record<string, unknown> }>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectModelConfigs(child, [...path, String(index)], target));
    return;
  }
  const object = value as Record<string, unknown>;
  const text = path.join('.');
  const directQuotaContainer = Object.keys(object).some((key) => /^(?:quotaInfo|quota_info|quota|rateLimit|rate_limit)$/i.test(key));
  const directUsage = hasAnyKey(object, [...REMAINING_KEYS, ...USED_KEYS]);
  if (/clientModelConfigs?|modelConfigs?|cascadeModels?|availableModels?/i.test(text) && (directQuotaContainer || directUsage)) {
    target.push({ path, value: object });
  }
  for (const [key, child] of Object.entries(object)) collectModelConfigs(child, [...path, key], target);
}

function candidateToBucket(candidate: QuotaCandidate, index: number): UsageBucket[] {
  const text = searchableText(candidate.path, candidate.value);
  const group = quotaGroup(text);
  const kind = quotaKind(text);
  if (!group || !kind) return [];
  const remaining = findNumeric(candidate.value, REMAINING_KEYS);
  const used = findNumeric(candidate.value, USED_KEYS);
  if (remaining === undefined && used === undefined) return [];
  const remainingFraction = clampFraction(remaining ?? 1 - clampFraction(used ?? 0));
  const reset = findReset(candidate.value);
  return [{
    id: `${slug(group)}-${kind}-${index}`,
    label: kind === 'weekly' ? 'Settimanale' : kind === 'five-hour' ? '5 ore' : 'Sessione',
    group,
    kind,
    remainingFraction,
    usedFraction: Math.max(0, 1 - remainingFraction),
    reached: remainingFraction <= 0.001,
    ...(reset ? { resetsAt: reset } : {})
  }];
}

function deduplicateBuckets(buckets: UsageBucket[]): UsageBucket[] {
  const selected = new Map<string, UsageBucket>();
  for (const bucket of buckets) {
    const key = `${bucket.group ?? 'other'}:${bucket.kind ?? 'other'}`;
    const current = selected.get(key);
    if (!current || (bucket.remainingFraction ?? 1) < (current.remainingFraction ?? 1)) {
      selected.set(key, { ...bucket, id: `${slug(bucket.group ?? 'quota')}-${bucket.kind ?? 'other'}` });
    } else if (!current.resetsAt && bucket.resetsAt) {
      selected.set(key, { ...current, resetsAt: bucket.resetsAt });
    }
  }
  return [...selected.values()].sort((a, b) => groupOrder(a) - groupOrder(b) || kindOrder(a) - kindOrder(b));
}

function snapshotFromBuckets(buckets: UsageBucket[], plan?: string): Partial<UsageSnapshot> {
  const constrained = [...buckets].sort((a, b) => (a.remainingFraction ?? 1) - (b.remainingFraction ?? 1))[0];
  return {
    ...(constrained?.remainingFraction !== undefined ? { remainingFraction: constrained.remainingFraction } : {}),
    ...(constrained?.usedFraction !== undefined ? { usedFraction: constrained.usedFraction } : {}),
    ...(constrained?.resetsAt ? { resetsAt: constrained.resetsAt } : {}),
    ...(buckets.length ? { buckets } : {}),
    ...(plan ? { plan } : {})
  };
}

async function discoverAntigravityProcesses(): Promise<AntigravityProcess[]> {
  const lines = process.platform === 'win32'
    ? await windowsProcessLines()
    : await unixProcessLines();
  const matches: AntigravityProcess[] = [];
  for (const line of lines) {
    const antigravityProcess = /antigravity/i.test(line) || /(?:^|[\s/\\])agy(?:\.exe)?(?:\s|$)/i.test(line);
    const quotaServerProcess = /(language[_-]?server|extension_server_port|csrf[_-]?token|exa\.language_server|antigravity[_-]?cli|(?:^|[\s/\\])agy(?:\.exe)?(?:\s|$))/i.test(line);
    if (!antigravityProcess || !quotaServerProcess) continue;
    const pid = parsePid(line);
    if (!pid) continue;
    const csrfToken = argumentValue(line, ['csrf_token', 'csrf-token']);
    const extensionCsrfToken = argumentValue(line, ['extension_server_csrf_token', 'extension-server-csrf-token']);
    const extensionPortRaw = argumentValue(line, ['extension_server_port', 'extension-server-port']);
    const extensionPort = extensionPortRaw && /^\d+$/.test(extensionPortRaw) ? Number(extensionPortRaw) : undefined;
    matches.push({
      pid,
      command: line,
      ...(csrfToken ? { csrfToken } : {}),
      ...(extensionCsrfToken ? { extensionCsrfToken } : {}),
      ...(extensionPort ? { extensionPort } : {})
    });
  }
  return matches.sort((a, b) => antigravityProcessPriority(a.command) - antigravityProcessPriority(b.command));
}

function antigravityProcessPriority(command: string): number {
  if (/antigravity[_-]?cli|(?:^|[\s/\\])agy(?:\.exe)?(?:\s|$)/i.test(command)) return 0;
  if (/app_data_dir(?:=|\s+)antigravity(?:\s|$)/i.test(command) && !/antigravity-ide/i.test(command)) return 1;
  return 2;
}

async function unixProcessLines(): Promise<string[]> {
  const result = await runCommand('ps', ['-eo', 'pid=,args='], { timeoutMs: 4_000 }).catch(() => undefined);
  return result?.stdout.split(/\r?\n/).filter(Boolean) ?? [];
}

async function windowsProcessLines(): Promise<string[]> {
  const script = "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'antigravity' } | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }";
  const result = await runCommand('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { timeoutMs: 7_000 }).catch(() => undefined);
  return result?.stdout.split(/\r?\n/).filter(Boolean) ?? [];
}

async function discoverListeningPorts(processInfo: AntigravityProcess): Promise<number[]> {
  const ports = new Set<number>();
  if (processInfo.extensionPort) ports.add(processInfo.extensionPort);
  const discovered = process.platform === 'win32'
    ? await windowsListeningPorts(processInfo.pid)
    : process.platform === 'darwin'
      ? await macListeningPorts(processInfo.pid)
      : await linuxListeningPorts(processInfo.pid);
  for (const port of discovered) if (port > 0 && port <= 65_535) ports.add(port);
  return [...ports];
}

async function linuxListeningPorts(pid: number): Promise<number[]> {
  const ss = await runCommand('ss', ['-tlnp'], { timeoutMs: 4_000 }).catch(() => undefined);
  const output = ss?.stdout || (await runCommand('netstat', ['-tlnp'], { timeoutMs: 4_000 }).catch(() => undefined))?.stdout || '';
  return portsFromNetworkOutput(output, pid);
}

async function macListeningPorts(pid: number): Promise<number[]> {
  const result = await runCommand('lsof', ['-nP', '-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN'], { timeoutMs: 4_000 }).catch(() => undefined);
  return portsFromNetworkOutput(result?.stdout ?? '', pid, false);
}

async function windowsListeningPorts(pid: number): Promise<number[]> {
  const result = await runCommand('netstat.exe', ['-ano', '-p', 'tcp'], { timeoutMs: 5_000 }).catch(() => undefined);
  return (result?.stdout ?? '').split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
    return match && Number(match[2]) === pid ? [Number(match[1])] : [];
  });
}

function portsFromNetworkOutput(output: string, pid: number, requirePid = true): number[] {
  const ports = new Set<number>();
  for (const line of output.split(/\r?\n/)) {
    if (requirePid && !new RegExp(`(?:pid=|\\b)${pid}(?:,|/|\\b)`).test(line)) continue;
    const matches = [...line.matchAll(/(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]|\*|localhost):(\d+)/g)];
    for (const match of matches) ports.add(Number(match[1]));
    if (!matches.length) {
      const fallback = line.match(/:(\d+)\s+\(LISTEN\)|:(\d+)\s+LISTEN/i);
      const value = fallback?.[1] ?? fallback?.[2];
      if (value) ports.add(Number(value));
    }
  }
  return [...ports];
}

function requestLanguageServer(protocol: 'https:' | 'http:', port: number, path: string, csrfToken?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(REQUEST_BODY);
    const transport = protocol === 'https:' ? https : http;
    const request = transport.request({
      protocol,
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      timeout: 2_500,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Connect-Protocol-Version': '1',
        ...(csrfToken ? { 'X-Codeium-Csrf-Token': csrfToken } : {})
      },
      ...(protocol === 'https:' ? { rejectUnauthorized: false } : {})
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        if ((response.statusCode ?? 500) >= 400 || !raw.trim()) return reject(new Error(`HTTP ${response.statusCode ?? 0}`));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
    request.end(body);
  });
}

function parsePid(line: string): number | undefined {
  const value = line.trim().match(/^(\d+)\s+/)?.[1];
  return value ? Number(value) : undefined;
}

function argumentValue(command: string, names: string[]): string | undefined {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = command.match(new RegExp(`--${escaped}(?:=|\\s+)(?:["']([^"']+)["']|([^\\s]+))`, 'i'));
    const value = match?.[1] ?? match?.[2];
    if (value) return value;
  }
  return undefined;
}

function searchableText(path: string[], value: Record<string, unknown>): string {
  const primitiveValues: string[] = [];
  collectPrimitiveText(value, primitiveValues, 0);
  return [...path, ...primitiveValues].join(' ').replace(/[_-]+/g, ' ').toLowerCase();
}

function collectPrimitiveText(value: unknown, target: string[], depth: number): void {
  if (depth > 5 || target.length >= 160 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const child of value) collectPrimitiveText(child, target, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (['string', 'number', 'boolean'].includes(typeof child)) target.push(`${key} ${String(child)}`);
    else collectPrimitiveText(child, target, depth + 1);
    if (target.length >= 160) return;
  }
}

function quotaGroup(text: string): string | undefined {
  if (/gemini/.test(text)) return 'Gemini';
  if (/claude|\bgpt\b|non\s*gemini|other\s*models?|cascade/.test(text)) return 'Claude e GPT';
  return undefined;
}

function quotaKind(text: string): UsageBucket['kind'] | undefined {
  if (/week|168\s*hour|10080\s*minute/.test(text)) return 'weekly';
  if (/five\s*hour|5\s*hour|5h|300\s*minute|session|rolling/.test(text)) return 'five-hour';
  return undefined;
}

function findNumeric(value: unknown, keys: string[]): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findNumeric(child, keys);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const object = value as Record<string, unknown>;
  for (const key of keys) {
    const numeric = toNumber(object[key]);
    if (numeric !== undefined) return numeric;
  }
  for (const child of Object.values(object)) {
    const found = findNumeric(child, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findReset(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const object = value as Record<string, unknown>;
  const raw = object.resetTime ?? object.reset_time ?? object.resetsAt ?? object.resets_at ?? object.refreshTime ?? object.refresh_time;
  const seconds = toNumber(object.resetInSeconds ?? object.reset_in_seconds ?? object.secondsUntilReset ?? object.seconds_until_reset);
  const normalized = normalizeReset(raw, seconds);
  if (normalized) return normalized;
  for (const child of Object.values(object)) {
    const nested = findReset(child);
    if (nested) return nested;
  }
  return undefined;
}

function findPlan(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const object = value as Record<string, unknown>;
  for (const key of ['planName', 'plan_name', 'userTier', 'user_tier', 'tierName', 'tier_name', 'plan', 'tier']) {
    const raw = object[key];
    if (typeof raw === 'string' && raw.trim() && raw.length < 80) return raw.trim();
    if (raw && typeof raw === 'object') {
      const nested = findPlan(raw);
      if (nested) return nested;
    }
  }
  for (const child of Object.values(object)) {
    const nested = findPlan(child);
    if (nested) return nested;
  }
  return undefined;
}

function normalizeReset(raw: unknown, seconds?: number): string | undefined {
  if (seconds !== undefined) return new Date(Date.now() + Math.max(0, seconds) * 1000).toISOString();
  const numeric = toNumber(raw);
  if (numeric !== undefined) return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric).toISOString();
  if (typeof raw === 'string' && !Number.isNaN(Date.parse(raw))) return new Date(raw).toISOString();
  return undefined;
}

function hasAnyKey(value: Record<string, unknown>, keys: string[]): boolean { return keys.some((key) => key in value); }
function hasAnyKeyDeep(value: unknown, keys: string[]): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((child) => hasAnyKeyDeep(child, keys));
  const object = value as Record<string, unknown>;
  return hasAnyKey(object, keys) || Object.values(object).some((child) => hasAnyKeyDeep(child, keys));
}
function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}
function clampFraction(value: number): number { return Math.max(0, Math.min(1, value > 1 ? value / 100 : value)); }
function slug(value: string): string { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function groupOrder(bucket: UsageBucket): number { return bucket.group === 'Gemini' ? 0 : bucket.group === 'Claude e GPT' ? 1 : 2; }
function kindOrder(bucket: UsageBucket): number { return bucket.kind === 'weekly' ? 0 : bucket.kind === 'five-hour' ? 1 : 2; }
