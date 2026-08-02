import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { ConversationArtifact } from '../core/types.js';

const MAX_ARTIFACTS = 12;
const MAX_BUNDLE_FILES = 80;
const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export interface DiscoverRemoteArtifactsOptions {
  workspaceRoot: string;
  text: string;
  changedFiles?: string[];
  runFiles?: string[];
  serviceUrls?: string[];
}

export interface ResolvedWorkspaceArtifact {
  artifact: ConversationArtifact;
  workspaceRoot: string;
  absolutePath?: string;
  rootDirectory?: string;
  files?: Array<{ relativePath: string; absolutePath: string; size: number }>;
}

export async function discoverRemoteArtifacts(options: DiscoverRemoteArtifactsOptions): Promise<ConversationArtifact[]> {
  const workspaceRoot = await safeRealpath(options.workspaceRoot);
  if (!workspaceRoot) return [];

  const artifacts: ConversationArtifact[] = [];
  const seen = new Set<string>();
  const candidates = unique([
    ...(options.changedFiles ?? []),
    ...(options.runFiles ?? []),
    ...extractPathCandidates(options.text)
  ]);
  const resolvedFiles: Array<{ relativePath: string; absolutePath: string; size: number; mimeType: string }> = [];

  for (const candidate of candidates) {
    if (resolvedFiles.length >= MAX_BUNDLE_FILES) break;
    const resolvedFile = await resolveCandidateFile(workspaceRoot, candidate);
    if (resolvedFile) {
      if (seen.has(resolvedFile.relativePath)) continue;
      seen.add(resolvedFile.relativePath);
      resolvedFiles.push(resolvedFile);

      const fileArtifact: ConversationArtifact = {
        id: artifactId('file', resolvedFile.relativePath),
        kind: isStaticHtml(resolvedFile.relativePath) ? 'static-site' : 'file',
        name: basename(resolvedFile.relativePath),
        relativePath: resolvedFile.relativePath,
        mimeType: resolvedFile.mimeType,
        size: resolvedFile.size,
        createdAt: new Date().toISOString()
      };
      artifacts.push(fileArtifact);
      if (artifacts.length >= MAX_ARTIFACTS - 2) break;
      continue;
    }

    const directory = await resolveCandidateDirectory(workspaceRoot, candidate);
    if (!directory || seen.has(`directory:${directory.relativePath}`)) continue;
    seen.add(`directory:${directory.relativePath}`);
    artifacts.push({
      id: artifactId('directory', directory.relativePath),
      kind: 'bundle',
      name: `${safeArchiveName(basename(directory.relativePath) || 'relay')}.zip`,
      files: directory.files.map((file) => file.relativePath),
      size: directory.files.reduce((sum, file) => sum + file.size, 0),
      mimeType: 'application/zip',
      createdAt: new Date().toISOString()
    });
    if (artifacts.length >= MAX_ARTIFACTS - 2) break;
  }

  const services = unique([...(options.serviceUrls ?? []), ...extractLoopbackUrls(options.text)]).filter(isAllowedLoopbackUrl).slice(0, 3);
  for (const localUrl of services) {
    const key = `service:${localUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const parsed = new URL(localUrl);
    artifacts.push({
      id: artifactId('service', localUrl),
      kind: 'local-service',
      name: `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`,
      localUrl,
      createdAt: new Date().toISOString()
    });
    if (artifacts.length >= MAX_ARTIFACTS - 1) break;
  }

  if (resolvedFiles.length >= 2) {
    const total = resolvedFiles.reduce((sum, file) => sum + file.size, 0);
    if (total <= MAX_BUNDLE_BYTES) {
      artifacts.push({
        id: artifactId('bundle', resolvedFiles.map((file) => file.relativePath).join('\n')),
        kind: 'bundle',
        name: `${safeArchiveName(basename(workspaceRoot) || 'relay')}-files.zip`,
        files: resolvedFiles.map((file) => file.relativePath),
        size: total,
        mimeType: 'application/zip',
        createdAt: new Date().toISOString()
      });
    }
  }

  return artifacts.slice(0, MAX_ARTIFACTS);
}

export async function resolveConversationArtifact(workspaceRoot: string, artifact: ConversationArtifact): Promise<ResolvedWorkspaceArtifact | undefined> {
  const root = await safeRealpath(workspaceRoot);
  if (!root) return undefined;
  if (artifact.kind === 'local-service') {
    if (!artifact.localUrl || !isAllowedLoopbackUrl(artifact.localUrl)) return undefined;
    return { artifact, workspaceRoot: root };
  }
  if (artifact.kind === 'bundle') {
    const files: Array<{ relativePath: string; absolutePath: string; size: number }> = [];
    let total = 0;
    for (const path of (artifact.files ?? []).slice(0, MAX_BUNDLE_FILES)) {
      const resolvedFile = await resolveCandidateFile(root, path);
      if (!resolvedFile) continue;
      total += resolvedFile.size;
      if (total > MAX_BUNDLE_BYTES) return undefined;
      files.push({ relativePath: resolvedFile.relativePath, absolutePath: resolvedFile.absolutePath, size: resolvedFile.size });
    }
    if (!files.length) return undefined;
    return { artifact, workspaceRoot: root, files };
  }
  if (!artifact.relativePath) return undefined;
  const resolvedFile = await resolveCandidateFile(root, artifact.relativePath);
  if (!resolvedFile) return undefined;
  return {
    artifact,
    workspaceRoot: root,
    absolutePath: resolvedFile.absolutePath,
    ...(artifact.kind === 'static-site' ? { rootDirectory: dirname(resolvedFile.absolutePath) } : {})
  };
}

export async function createArtifactZip(resolved: ResolvedWorkspaceArtifact): Promise<Buffer> {
  if (resolved.artifact.kind !== 'bundle' || !resolved.files?.length) throw new Error('Bundle remoto non disponibile.');
  const entries: Array<{ name: string; data: Buffer; crc: number; offset: number }> = [];
  let offset = 0;
  const localParts: Buffer[] = [];

  for (const file of resolved.files) {
    const data = await readFile(file.absolutePath);
    const name = file.relativePath.replace(/\\/g, '/');
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, data);
    entries.push({ name, data, crc, offset });
    offset += local.length + nameBytes.length + data.length;
  }

  const centralParts: Buffer[] = [];
  let centralSize = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(entry.offset, 42);
    centralParts.push(central, nameBytes);
    centralSize += central.length + nameBytes.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

export function isAllowedLoopbackUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function mimeTypeForPath(path: string): string {
  const extension = extname(path).toLowerCase();
  const values: Record<string, string> = {
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
    '.pdf': 'application/pdf', '.zip': 'application/zip', '.wasm': 'application/wasm', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
  };
  return values[extension] ?? 'application/octet-stream';
}

function extractPathCandidates(text: string): string[] {
  const values: string[] = [];
  const markdown = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of text.matchAll(markdown)) values.push(cleanPathCandidate(match[1]));
  const absolute = /(?:^|[\s`'"(])((?:[A-Za-z]:[\\/]|\/)[^\n`'"<>|?*]+?\.[A-Za-z0-9]{1,12})(?=$|[\s`'"),.;:])/g;
  for (const match of text.matchAll(absolute)) values.push(cleanPathCandidate(match[1]));
  const inline = /`([^`]+\.[A-Za-z0-9]{1,12})`/g;
  for (const match of text.matchAll(inline)) values.push(cleanPathCandidate(match[1]));
  return values.filter(Boolean);
}

function extractLoopbackUrls(text: string): string[] {
  const values: string[] = [];
  const regex = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/?#-]*)?/gi;
  for (const match of text.matchAll(regex)) {
    const value = match[0].replace(/[),.;]+$/, '');
    if (isAllowedLoopbackUrl(value)) values.push(value);
  }
  return unique(values).slice(0, 3);
}

async function resolveCandidateDirectory(workspaceRoot: string, candidate: string): Promise<{ relativePath: string; files: Array<{ relativePath: string; absolutePath: string; size: number }> } | undefined> {
  const normalized = normalizePathCandidate(candidate);
  if (!normalized || /^https?:\/\//i.test(normalized)) return undefined;
  const absolute = isAbsolute(normalized) ? resolve(normalized) : resolve(workspaceRoot, normalized);
  const real = await safeRealpath(absolute);
  if (!real || !isWithin(workspaceRoot, real)) return undefined;
  const info = await stat(real).catch(() => undefined);
  if (!info?.isDirectory()) return undefined;
  const directoryRelativePath = relative(workspaceRoot, real).split(sep).join('/');
  if (isSensitiveArtifactPath(directoryRelativePath)) return undefined;
  const files: Array<{ relativePath: string; absolutePath: string; size: number }> = [];
  let total = 0;
  const visit = async (directory: string): Promise<void> => {
    if (files.length >= MAX_BUNDLE_FILES || total > MAX_BUNDLE_BYTES) return;
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.length >= MAX_BUNDLE_FILES || total > MAX_BUNDLE_BYTES) break;
      const absoluteEntry = join(directory, entry.name);
      const relativeEntry = relative(workspaceRoot, absoluteEntry).split(sep).join('/');
      if (isSensitiveArtifactPath(relativeEntry)) continue;
      if (entry.isDirectory()) { await visit(absoluteEntry); continue; }
      if (!entry.isFile()) continue;
      const realEntry = await safeRealpath(absoluteEntry);
      if (!realEntry || !isWithin(workspaceRoot, realEntry)) continue;
      const entryInfo = await stat(realEntry).catch(() => undefined);
      if (!entryInfo?.isFile()) continue;
      total += entryInfo.size;
      if (total > MAX_BUNDLE_BYTES) return;
      files.push({ relativePath: relativeEntry, absolutePath: realEntry, size: entryInfo.size });
    }
  };
  await visit(real);
  if (!files.length || total > MAX_BUNDLE_BYTES) return undefined;
  return { relativePath: directoryRelativePath || basename(real), files };
}

function normalizePathCandidate(candidate: string): string {
  let normalized = cleanPathCandidate(candidate);
  if (!normalized) return '';
  if (normalized.startsWith('file://')) {
    try { normalized = new URL(normalized).pathname; } catch { return ''; }
  }
  try { normalized = decodeURIComponent(normalized); } catch { /* literal path */ }
  return normalized;
}

async function resolveCandidateFile(workspaceRoot: string, candidate: string): Promise<{ relativePath: string; absolutePath: string; size: number; mimeType: string } | undefined> {
  const normalized = normalizePathCandidate(candidate);
  if (!normalized || /^https?:\/\//i.test(normalized)) return undefined;
  const absolute = isAbsolute(normalized) ? resolve(normalized) : resolve(workspaceRoot, normalized);
  const real = await safeRealpath(absolute);
  if (!real || !isWithin(workspaceRoot, real)) return undefined;
  try {
    const info = await stat(real);
    if (!info.isFile()) return undefined;
    const rel = relative(workspaceRoot, real).split(sep).join('/');
    if (isSensitiveArtifactPath(rel)) return undefined;
    return { relativePath: rel, absolutePath: real, size: info.size, mimeType: mimeTypeForPath(real) };
  } catch {
    return undefined;
  }
}

function isWithin(root: string, value: string): boolean {
  const rel = relative(root, value);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function safeRealpath(value: string): Promise<string | undefined> {
  try { return await realpath(value); } catch { return undefined; }
}

function isSensitiveArtifactPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  const parts = normalized.split('/');
  if (parts.some((part) => ['.git', 'node_modules', '.relay', '.ssh'].includes(part))) return true;
  const name = parts.at(-1) ?? '';
  if (/^\.env(?:\.|$)/.test(name)) return true;
  if (/^(id_rsa|id_ed25519|credentials|secrets?)(?:\.|$)/.test(name)) return true;
  if (/\.(pem|key|p12|pfx|keystore|jks)$/i.test(name)) return true;
  if (['.npmrc', '.pypirc', '.netrc'].includes(name)) return true;
  return false;
}

function isStaticHtml(path: string): boolean {
  return ['.html', '.htm'].includes(extname(path).toLowerCase());
}

function cleanPathCandidate(value: string): string {
  let result = String(value ?? '').trim();
  if (result.startsWith('<') && result.endsWith('>')) result = result.slice(1, -1);
  result = result.replace(/^['"`]+|['"`.,;:]+$/g, '');
  try { return decodeURIComponent(result); } catch { return result; }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function artifactId(kind: string, value: string): string {
  return createHash('sha256').update(`${kind}\n${value}`).digest('base64url').slice(0, 18);
}

function safeArchiveName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'relay';
}

let crcTable: Uint32Array | undefined;
function crc32(data: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
