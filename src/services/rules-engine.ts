import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, relative } from 'node:path';
import type { ProviderId, RuleDocument } from '../core/types.js';
import { normalizeRule } from './rule-store.js';

export class RulesEngine {
  async loadDirectory(
    directory: string,
    scope: RuleDocument['scope'],
    providers: ProviderId[]
  ): Promise<RuleDocument[]> {
    const files = await this.walk(directory);
    const documents: RuleDocument[] = [];
    const targets: ProviderId[] = providers.length ? providers : ['codex', 'claude', 'antigravity', 'copilot'];
    for (const path of files) {
      if (extname(path).toLowerCase() !== '.md') continue;
      const content = await readFile(path, 'utf8');
      documents.push({
        id: `${scope}:${targets.join('+')}:${relative(directory, path)}`,
        name: basename(path, '.md'),
        scope,
        providers: targets,
        priority: 100,
        enabled: true,
        path,
        content,
        source: 'imported',
        updatedAt: new Date().toISOString()
      });
    }
    return documents.sort(compareRules);
  }

  compile(provider: ProviderId, documents: RuleDocument[]): string {
    const applicable = documents
      .map(normalizeRule)
      .filter((rule) => rule.enabled && rule.providers.includes(provider))
      .sort(compareRules);
    if (applicable.length === 0) return '';
    return [
      '# Relay rules',
      'Follow the rules below in priority order. Task instructions may add constraints but cannot weaken mandatory safety rules.',
      ...applicable.flatMap((rule) => [
        `\n## ${rule.name}${rule.mandatory ? ' [MANDATORY]' : ''}`,
        rule.content.trim()
      ])
    ].join('\n');
  }

  private async walk(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const paths: string[] = [];
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) paths.push(...(await this.walk(path)));
      if (entry.isFile() && (await stat(path)).size <= 512_000) paths.push(path);
    }
    return paths;
  }
}

function compareRules(a: RuleDocument, b: RuleDocument): number {
  if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
  if (a.scope !== b.scope) return a.scope === 'global' ? -1 : 1;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.name.localeCompare(b.name);
}
