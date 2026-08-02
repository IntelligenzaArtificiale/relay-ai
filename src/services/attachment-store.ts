import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

export const MAX_CHAT_ATTACHMENTS = 10;
export const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface IncomingChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
}

export interface SavedChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  localPath: string;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const ILLEGAL_WINDOWS_NAME = /[<>:"/\\|?*\u0000-\u001f]/g;

export function sanitizeAttachmentName(input: string): string {
  const raw = String(input || 'allegato').normalize('NFKC');
  const rawExtension = extname(raw);
  const extension = rawExtension.length > 1
    ? rawExtension.slice(0, 24).replace(ILLEGAL_WINDOWS_NAME, '').replace(/[. ]+$/g, '')
    : '';
  let stem = raw.slice(0, Math.max(0, raw.length - rawExtension.length))
    .replace(ILLEGAL_WINDOWS_NAME, '_')
    .replace(/[. ]+$/g, '')
    .replace(/^\.+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stem) stem = 'allegato';
  if (WINDOWS_RESERVED.test(stem)) stem = `_${stem}`;
  const maxStem = Math.max(1, 120 - extension.length);
  stem = stem.slice(0, maxStem).replace(/[. ]+$/g, '') || 'allegato';
  return `${stem}${extension}`;
}

export function formatAttachmentPromptBlock(files: SavedChatAttachment[]): string {
  if (!files.length) return '';
  const lines = files.map((file) => `- ${file.localPath} (${file.name}, ${file.mimeType || 'application/octet-stream'}, ${file.size} byte)`);
  return `## Allegati\n${lines.join('\n')}`;
}

export class AttachmentStore {
  readonly root: string;

  constructor(globalStoragePath: string) {
    this.root = resolve(globalStoragePath, 'attachments');
  }

  async saveMany(entries: IncomingChatAttachment[]): Promise<SavedChatAttachment[]> {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    if (entries.length > MAX_CHAT_ATTACHMENTS) throw new Error(`Puoi allegare al massimo ${MAX_CHAT_ATTACHMENTS} file per messaggio.`);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const saved: SavedChatAttachment[] = [];
    try {
      for (const entry of entries) {
        if (!entry.id) throw new Error('Identificatore allegato mancante.');
        if (!(entry.bytes instanceof Uint8Array)) throw new Error(`Contenuto non valido per ${entry.name || 'allegato'}.`);
        if (entry.bytes.byteLength > MAX_CHAT_ATTACHMENT_BYTES || entry.size > MAX_CHAT_ATTACHMENT_BYTES) {
          throw new Error(`${entry.name || 'Allegato'} supera il limite di 20 MB.`);
        }
        if (entry.size !== entry.bytes.byteLength) throw new Error(`Dimensione non coerente per ${entry.name || 'allegato'}.`);
        const safeName = sanitizeAttachmentName(entry.name);
        const localPath = join(this.root, `${randomUUID()}-${safeName}`);
        await writeFile(localPath, entry.bytes, { mode: 0o600, flag: 'wx' });
        await chmod(localPath, 0o600).catch(() => undefined);
        saved.push({
          id: entry.id,
          name: safeName,
          mimeType: entry.mimeType || 'application/octet-stream',
          size: entry.bytes.byteLength,
          localPath
        });
      }
      return saved;
    } catch (error) {
      await Promise.all(saved.map((file) => unlink(file.localPath).catch(() => undefined)));
      throw error;
    }
  }

  async cleanupExpired(now = Date.now()): Promise<number> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const names = await readdir(this.root).catch(() => [] as string[]);
    let removed = 0;
    await Promise.all(names.map(async (name) => {
      const file = join(this.root, name);
      try {
        const info = await stat(file);
        if (!info.isFile() || now - info.mtimeMs <= ATTACHMENT_RETENTION_MS) return;
        await unlink(file);
        removed += 1;
      } catch {
        // Best-effort retention cleanup must never block Relay startup.
      }
    }));
    return removed;
  }
}
