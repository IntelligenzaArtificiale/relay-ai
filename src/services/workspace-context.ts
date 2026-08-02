import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { WorkspaceContextItem } from '../core/types.js';

const IGNORED = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', 'vendor', '.cache', '.idea', '.vscode']);

export async function listWorkspaceContext(root: string, limit = 350, maxDepth = 4): Promise<WorkspaceContextItem[]> {
  if (!root) return [];
  const items: WorkspaceContextItem[] = [];
  const walk = async (directory: string, depth: number): Promise<void> => {
    if (items.length >= limit || depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (items.length >= limit || entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      if (IGNORED.has(entry.name)) continue;
      const path = join(directory, entry.name);
      const relativePath = relative(root, path).split(sep).join('/');
      if (entry.isDirectory()) {
        items.push({ kind: 'directory', name: entry.name, path, relativePath });
        await walk(path, depth + 1);
      } else if (entry.isFile()) {
        items.push({ kind: 'file', name: entry.name, path, relativePath });
      }
    }
  };
  await walk(root, 0);
  return items;
}
