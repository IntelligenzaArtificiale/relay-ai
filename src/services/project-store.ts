import { createHash } from 'node:crypto';
import type { ProjectRecord } from '../core/types.js';
import { AtomicJsonStore } from './atomic-store.js';

export class ProjectStore {
  private readonly store: AtomicJsonStore<ProjectRecord[]>;

  constructor(path: string) {
    this.store = new AtomicJsonStore(path, []);
  }

  invalidateCache(): void { this.store.invalidate(); }

  async touch(path: string, name: string, isGit: boolean, githubUrl?: string): Promise<ProjectRecord> {
    const id = projectId(path);
    let record: ProjectRecord = { id, path, name, isGit, lastOpenedAt: new Date().toISOString(), ...(githubUrl ? { githubUrl } : {}) };
    await this.store.update((stored) => {
      const projects = normalizeProjects(stored);
      const existing = projects.find((project) => project.id === id);
      record = { ...existing, ...record };
      return [record, ...projects.filter((project) => project.id !== record.id)].slice(0, 30);
    });
    return record;
  }

  async list(): Promise<ProjectRecord[]> {
    return normalizeProjects(await this.store.read()).sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  }
}

function normalizeProjects(value: unknown): ProjectRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ProjectRecord => Boolean(
    entry && typeof entry === 'object' &&
    typeof (entry as ProjectRecord).id === 'string' &&
    typeof (entry as ProjectRecord).path === 'string' &&
    typeof (entry as ProjectRecord).name === 'string' &&
    typeof (entry as ProjectRecord).lastOpenedAt === 'string'
  )).map((entry) => ({
    id: entry.id,
    path: entry.path,
    name: entry.name,
    isGit: entry.isGit === true,
    lastOpenedAt: entry.lastOpenedAt,
    ...(typeof entry.githubUrl === 'string' && entry.githubUrl ? { githubUrl: entry.githubUrl } : {})
  }));
}

export function projectId(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 20);
}
