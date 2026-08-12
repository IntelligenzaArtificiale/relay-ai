import { mkdir, readFile, readdir, rm, stat, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import JSZip from 'jszip';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type { ProviderId, RuleDocument } from '../core/types.js';

export interface SkillInventoryEntry {
  provider: ProviderId;
  scope: 'global' | 'project';
  name: string;
  description: string;
  filePath: string;
  managed: boolean;
  ruleId?: string;
}

export interface SkillProviderSupport {
  provider: ProviderId;
  available: boolean;
  projectDirectory?: string;
  globalDirectory?: string;
  note?: string;
  featureEnabled?: boolean;
}

export interface SkillSyncReport {
  created: number;
  updated: number;
  removed: number;
  skipped: number;
  errors: string[];
  syncedAt: string;
}

export interface SkillImportPreview {
  token?: string;
  status: 'valid' | 'warning' | 'incompatible' | 'missing_manifest' | 'unsupported_schema' | 'unknown_provider' | 'missing_entry' | 'unsafe_archive';
  name?: string;
  description?: string;
  schemaVersion?: number;
  providers: ProviderId[];
  scope: 'global' | 'project';
  mandatory: boolean;
  entry?: string;
  fileCount: number;
  warnings: string[];
  errors: string[];
  conflicts: string[];
}

export interface SkillImportDraft {
  preview: SkillImportPreview;
  content: string;
}

export interface SkillManagerSnapshot {
  items: SkillInventoryEntry[];
  providers: SkillProviderSupport[];
  lastReport?: SkillSyncReport;
}

interface SkillManagerOptions {
  homeDir?: string;
}

interface ParsedSkill {
  name: string;
  description: string;
  ruleId?: string;
}

const PROVIDERS: ProviderId[] = ['codex', 'claude', 'antigravity'];
const MAX_IMPORT_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_FILES = 200;

export class SkillManager {
  private readonly homeDir: string;
  private lastReport: SkillSyncReport | undefined;

  constructor(options: SkillManagerOptions = {}) {
    this.homeDir = options.homeDir ?? homedir();
  }

  async snapshot(workspaceRoot?: string): Promise<SkillManagerSnapshot> {
    const providers = await this.probeProviders(workspaceRoot);
    const items = await this.discover(workspaceRoot, providers);
    return {
      items,
      providers,
      ...(this.lastReport ? { lastReport: this.lastReport } : {})
    };
  }

  async syncAll(rules: RuleDocument[], workspaceRoot?: string): Promise<SkillSyncReport> {
    const report: SkillSyncReport = { created: 0, updated: 0, removed: 0, skipped: 0, errors: [], syncedAt: new Date().toISOString() };
    const providers = await this.probeProviders(workspaceRoot);
    const desired = new Map<string, { rule: RuleDocument; provider: ProviderId; scope: 'global' | 'project' }>();

    for (const rule of rules) {
      const publication = rule.skillPublication;
      if (!rule.enabled || !publication?.enabled) continue;
      if (!rule.description?.trim()) {
        report.errors.push(`${rule.name}: descrizione obbligatoria per pubblicare una skill.`);
        continue;
      }
      const targets = publication.providers?.length ? publication.providers : rule.providers;
      for (const provider of targets) {
        const support = providers.find((entry) => entry.provider === provider);
        const directory = rule.scope === 'global' ? support?.globalDirectory : support?.projectDirectory;
        if (!support?.available || !directory) {
          report.skipped += 1;
          continue;
        }
        const path = join(directory, slugify(rule.name), 'SKILL.md');
        desired.set(resolve(path), { rule, provider, scope: rule.scope });
      }
    }

    const existing = await this.discover(workspaceRoot, providers);
    const removedPaths = new Set<string>();
    for (const entry of existing) {
      if (!entry.managed || !entry.ruleId) continue;
      const target = desired.get(resolve(entry.filePath));
      if (target?.rule.id === entry.ruleId) continue;
      if (removedPaths.has(resolve(entry.filePath))) continue;
      try {
        await rm(dirname(entry.filePath), { recursive: true, force: true });
        removedPaths.add(resolve(entry.filePath));
        report.removed += 1;
      } catch (error) {
        report.errors.push(`Rimozione ${entry.filePath}: ${errorMessage(error)}`);
      }
    }

    for (const [path, target] of desired) {
      try {
        const current = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? undefined : Promise.reject(error));
        if (current !== undefined) {
          const parsed = parseSkill(current);
          if (!parsed?.ruleId) {
            report.skipped += 1;
            report.errors.push(`${path}: skill manuale non modificata.`);
            continue;
          }
          if (parsed.ruleId !== target.rule.id) {
            report.skipped += 1;
            report.errors.push(`${path}: appartiene a un'altra regola Relay.`);
            continue;
          }
        }
        const next = renderSkill(target.rule);
        if (current === next) {
          report.skipped += 1;
          continue;
        }
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, next, { mode: 0o600 });
        if (current === undefined) report.created += 1;
        else report.updated += 1;
      } catch (error) {
        report.errors.push(`Sincronizzazione ${target.rule.name}/${target.provider}: ${errorMessage(error)}`);
      }
    }

    this.lastReport = report;
    return report;
  }

  async removeRule(ruleId: string, workspaceRoot?: string): Promise<number> {
    const providers = await this.probeProviders(workspaceRoot);
    const items = await this.discover(workspaceRoot, providers);
    let removed = 0;
    const removedPaths = new Set<string>();
    for (const item of items) {
      if (!item.managed || item.ruleId !== ruleId || removedPaths.has(resolve(item.filePath))) continue;
      await rm(dirname(item.filePath), { recursive: true, force: true });
      removedPaths.add(resolve(item.filePath));
      removed += 1;
    }
    return removed;
  }

  // Connects/disconnects a discovered skill (managed or not) to one specific
  // provider by copying/removing its native SKILL.md folder directly, without
  // requiring a Relay rule. Used by the "Skill trovate" card's per-provider
  // toggles.
  async setSkillProvider(name: string, provider: ProviderId, enable: boolean, workspaceRoot?: string): Promise<void> {
    const providers = await this.probeProviders(workspaceRoot);
    const items = await this.discover(workspaceRoot, providers);
    const matches = items.filter((entry) => entry.name === name);
    if (enable) {
      if (matches.some((entry) => entry.provider === provider)) return;
      const source = matches[0];
      if (!source) throw new Error(`Skill "${name}" non trovata.`);
      const raw = await readFile(source.filePath, 'utf8');
      const support = providers.find((entry) => entry.provider === provider);
      const directory = source.scope === 'global' ? support?.globalDirectory : support?.projectDirectory;
      if (!support?.available || !directory) throw new Error(`${provider} non disponibile per l'ambito ${source.scope === 'global' ? 'globale' : 'progetto'}.`);
      const target = join(directory, slugify(name), 'SKILL.md');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, raw, { mode: 0o600 });
    } else {
      const removedPaths = new Set<string>();
      for (const entry of matches.filter((item) => item.provider === provider)) {
        if (removedPaths.has(resolve(entry.filePath))) continue;
        await rm(dirname(entry.filePath), { recursive: true, force: true });
        removedPaths.add(resolve(entry.filePath));
      }
    }
  }

  // Removes a discovered skill's native folder from every provider/scope it
  // was found in, regardless of whether it originated from a Relay rule.
  async removeSkillEverywhere(name: string, workspaceRoot?: string): Promise<number> {
    const providers = await this.probeProviders(workspaceRoot);
    const items = await this.discover(workspaceRoot, providers);
    let removed = 0;
    const removedPaths = new Set<string>();
    for (const entry of items) {
      if (entry.name !== name || removedPaths.has(resolve(entry.filePath))) continue;
      await rm(dirname(entry.filePath), { recursive: true, force: true });
      removedPaths.add(resolve(entry.filePath));
      removed += 1;
    }
    return removed;
  }

  async enableCodexSkills(): Promise<void> {
    const path = join(this.homeDir, '.codex', 'config.toml');
    const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
    let parsed: Record<string, any>;
    try {
      parsed = raw.trim() ? parseToml(raw) as Record<string, any> : {};
    } catch (error) {
      throw new Error(`config.toml Codex non valido: ${errorMessage(error)}`);
    }
    parsed.features = { ...(parsed.features ?? {}), skills: true };
    await mkdir(dirname(path), { recursive: true });
    if (raw) await copyFile(path, `${path}.relay-bak`);
    await writeFile(path, stringifyToml(parsed as any), { mode: 0o600 });
  }

  async previewImportZip(input: { name: string; size: number; bytes: Uint8Array }, rules: RuleDocument[]): Promise<SkillImportDraft> {
    const warnings: string[] = [];
    const errors: string[] = [];
    // .skill is the extension some skill directories/tools use for the same
    // zip payload the Agent Skills spec (agentskills.io) describes; both are
    // parsed identically here.
    if (!/\.(zip|skill)$/i.test(input.name)) {
      errors.push('Il pacchetto deve essere un file .zip o .skill.');
      return invalidPreview('incompatible', warnings, errors);
    }
    if (input.size > MAX_IMPORT_SIZE_BYTES || input.bytes.byteLength > MAX_IMPORT_SIZE_BYTES) {
      errors.push('Archivio troppo grande: limite 5 MB.');
      return invalidPreview('incompatible', warnings, errors);
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(input.bytes, { checkCRC32: true });
    } catch (error) {
      errors.push(`Archivio ZIP non leggibile: ${errorMessage(error)}`);
      return invalidPreview('incompatible', warnings, errors);
    }

    const entries = Object.values(zip.files);
    if (entries.length > MAX_IMPORT_FILES) {
      errors.push(`Archivio con troppi file: limite ${MAX_IMPORT_FILES}.`);
      return invalidPreview('incompatible', warnings, errors, entries.length);
    }
    for (const entry of entries) {
      if (isUnsafeZipPath(entry.name) || isZipSymlink(entry)) {
        errors.push(`Archivio non sicuro: ${entry.name}`);
        return invalidPreview('unsafe_archive', warnings, errors, entries.length);
      }
    }

    // Optional legacy Relay manifest: if present, it can declare providers,
    // scope and mandatory that the open Agent Skills spec has no field for.
    const manifestEntry = zip.file('skill.json');
    let manifest: any;
    if (manifestEntry) {
      try {
        manifest = JSON.parse(await manifestEntry.async('string'));
      } catch (error) {
        errors.push(`Manifest skill.json non valido: ${errorMessage(error)}`);
        return invalidPreview('incompatible', warnings, errors, entries.length);
      }
      if (manifest?.schemaVersion !== undefined && manifest.schemaVersion !== 1) {
        errors.push('Versione schema non supportata.');
        return invalidPreview('unsupported_schema', warnings, errors, entries.length, manifest);
      }
    }

    // Real-world skill packages (per agentskills.io) rarely ship skill.json:
    // the SKILL.md YAML frontmatter alone is the manifest. Locate it wherever
    // it is in the archive (zip root, a single wrapping folder as produced by
    // GitHub's "Download ZIP", or a custom `entry` from the legacy manifest).
    const explicitEntry = typeof manifest?.entry === 'string' && manifest.entry.trim() ? manifest.entry.trim() : undefined;
    const skillEntry = explicitEntry
      ? zip.file(explicitEntry)
      : findSkillMdEntry(zip);
    if (!skillEntry) {
      errors.push(explicitEntry ? `File entry mancante: ${explicitEntry}.` : 'SKILL.md non trovato nell’archivio.');
      return invalidPreview(manifestEntry ? 'missing_entry' : 'missing_manifest', warnings, errors, entries.length, manifest);
    }
    const rawContent = await skillEntry.async('string');
    if (!rawContent.trim()) {
      errors.push('Il file SKILL.md è vuoto.');
      return invalidPreview('incompatible', warnings, errors, entries.length, manifest);
    }

    const frontmatter = splitSkillFrontmatter(rawContent);
    const content = (frontmatter?.body ?? rawContent).trim();
    const folderName = skillEntry.name.includes('/') ? skillEntry.name.split('/').slice(-2, -1)[0] : undefined;
    const name = String(manifest?.name ?? frontmatter?.meta.name ?? folderName ?? '').trim();
    if (!name) errors.push('Nome skill non determinabile (assente da SKILL.md e dal nome cartella).');
    const description = String(manifest?.description ?? frontmatter?.meta.description ?? '').trim();
    if (!description) warnings.push('Descrizione assente: potrai aggiungerla dopo l’import.');

    const declaredProviders = Array.isArray(manifest?.providers) ? manifest.providers : undefined;
    const providers = declaredProviders ? declaredProviders.filter(isSkillProvider) as ProviderId[] : [];
    const unknownProviders = declaredProviders ? declaredProviders.filter((value: unknown) => !isSkillProvider(value)) : [];
    if (unknownProviders.length) {
      errors.push(`Provider non riconosciuti: ${unknownProviders.join(', ')}.`);
      return invalidPreview('unknown_provider', warnings, errors, entries.length, manifest);
    }
    if (!declaredProviders || !providers.length) warnings.push('Nessun provider dichiarato: userò Codex, Claude Code e Antigravity.');

    const scope = manifest?.scope === 'global' ? 'global' : 'project';
    const conflicts = name ? rules.filter((rule) => rule.name.toLowerCase() === name.toLowerCase()).map((rule) => rule.name) : [];
    if (conflicts.length) warnings.push('Esiste già una regola con lo stesso nome: verrà creato un nome copia.');

    return {
      preview: {
        status: errors.length ? 'incompatible' : warnings.length ? 'warning' : 'valid',
        name,
        description,
        schemaVersion: 1,
        providers: providers.length ? providers : PROVIDERS,
        scope,
        mandatory: Boolean(manifest?.mandatory),
        entry: skillEntry.name,
        fileCount: entries.length,
        warnings,
        errors,
        conflicts
      },
      content
    };
  }

  private async probeProviders(workspaceRoot?: string): Promise<SkillProviderSupport[]> {
    const codexConfig = join(this.homeDir, '.codex', 'config.toml');
    const codexFeatureEnabled = await readCodexSkillsFlag(codexConfig);
    const antigravityProject = workspaceRoot ? join(workspaceRoot, '.agents', 'skills') : undefined;
    const antigravityGlobalCandidates = [
      join(this.homeDir, '.gemini', 'config', 'skills'),
      join(this.homeDir, '.gemini', 'antigravity', 'skills'),
      join(this.homeDir, '.gemini', 'antigravity-cli', 'skills'),
      join(this.homeDir, '.gemini', 'skills')
    ];
    const antigravityGlobal = await firstExistingDirectory(antigravityGlobalCandidates) ?? antigravityGlobalCandidates[0];
    return [
      {
        provider: 'claude', available: true,
        ...(workspaceRoot ? { projectDirectory: join(workspaceRoot, '.claude', 'skills') } : {}),
        globalDirectory: join(this.homeDir, '.claude', 'skills')
      },
      {
        provider: 'codex', available: true,
        ...(workspaceRoot ? { projectDirectory: join(workspaceRoot, '.agents', 'skills') } : {}),
        globalDirectory: join(this.homeDir, '.codex', 'skills'),
        featureEnabled: codexFeatureEnabled,
        ...(!codexFeatureEnabled ? { note: 'Le skill potrebbero richiedere features.skills=true in ~/.codex/config.toml.' } : {})
      },
      {
        provider: 'antigravity', available: true,
        ...(antigravityProject ? { projectDirectory: antigravityProject } : {}),
        globalDirectory: antigravityGlobal,
        note: 'Global: ~/.gemini/config/skills (unica area letta da AGY, AGY CLI e AGY IDE). Progetto: .agents/skills.'
      }
    ];
  }

  private async discover(workspaceRoot: string | undefined, providers: SkillProviderSupport[]): Promise<SkillInventoryEntry[]> {
    const items: SkillInventoryEntry[] = [];
    for (const provider of providers) {
      for (const [scope, directory] of [['global', provider.globalDirectory], ['project', provider.projectDirectory]] as const) {
        if (!directory) continue;
        const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? [] : Promise.reject(error));
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const filePath = join(directory, entry.name, 'SKILL.md');
          const raw = await readFile(filePath, 'utf8').catch(() => undefined);
          if (!raw) continue;
          const parsed = parseSkill(raw);
          if (!parsed) continue;
          items.push({
            provider: provider.provider,
            scope,
            name: parsed.name || entry.name,
            description: parsed.description,
            filePath,
            managed: Boolean(parsed.ruleId),
            ...(parsed.ruleId ? { ruleId: parsed.ruleId } : {})
          });
        }
      }
    }
    return dedupeInventory(items).sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
  }
}

function invalidPreview(
  status: SkillImportPreview['status'],
  warnings: string[],
  errors: string[],
  fileCount = 0,
  manifest?: any
): SkillImportDraft {
  return {
    preview: {
      status,
      name: typeof manifest?.name === 'string' ? manifest.name : undefined,
      description: typeof manifest?.description === 'string' ? manifest.description : undefined,
      schemaVersion: typeof manifest?.schemaVersion === 'number' ? manifest.schemaVersion : undefined,
      providers: [],
      scope: manifest?.scope === 'global' ? 'global' : 'project',
      mandatory: Boolean(manifest?.mandatory),
      entry: typeof manifest?.entry === 'string' ? manifest.entry : undefined,
      fileCount,
      warnings,
      errors,
      conflicts: []
    },
    content: ''
  };
}

function findSkillMdEntry(zip: JSZip): JSZip.JSZipObject | undefined {
  const candidates = Object.values(zip.files)
    .filter((entry) => !entry.dir && /(^|\/)SKILL\.md$/i.test(entry.name));
  if (!candidates.length) return undefined;
  // Prefer the shallowest match: a plain SKILL.md at the zip root, then one
  // inside a single wrapping folder (GitHub's "Download ZIP" adds one), etc.
  candidates.sort((a, b) => a.name.split('/').length - b.name.split('/').length);
  return candidates[0];
}

function splitSkillFrontmatter(raw: string): { meta: Record<string, string>; body: string } | undefined {
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return undefined;
  const lines = normalized.split('\n');
  const end = lines.indexOf('---', 1);
  if (end < 0) return undefined;
  const meta: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = parseYamlScalar(line.slice(separator + 1).trim());
    meta[key] = value;
  }
  return { meta, body: lines.slice(end + 1).join('\n').trim() };
}

function isSkillProvider(value: unknown): value is ProviderId {
  return value === 'codex' || value === 'claude' || value === 'antigravity';
}

function isUnsafeZipPath(value: string): boolean {
  return value.startsWith('/') || value.includes('\\') || value.includes('\0') || value.split('/').some((part) => part === '..');
}

function isZipSymlink(entry: JSZip.JSZipObject): boolean {
  const mode = typeof entry.unixPermissions === 'number' ? entry.unixPermissions : undefined;
  return Boolean(mode && (mode & 0o170000) === 0o120000);
}

export function renderSkill(rule: RuleDocument): string {
  const name = slugify(rule.name);
  const description = rule.description?.trim() ?? '';
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\nx-relay-managed: ${JSON.stringify(rule.id)}\n---\n\n${rule.content.trim()}\n`;
}

export function parseSkill(raw: string): ParsedSkill | undefined {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) return undefined;
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const end = lines.indexOf('---', 1);
  if (end < 0) return undefined;
  const values: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = parseYamlScalar(line.slice(separator + 1).trim());
    values[key] = value;
  }
  return {
    name: values.name ?? '',
    description: values.description ?? '',
    ...(values['x-relay-managed'] ? { ruleId: values['x-relay-managed'] } : {})
  };
}

export function slugify(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'relay-skill';
}

export async function readCodexSkillsFlag(path: string): Promise<boolean> {
  const raw = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? '' : Promise.reject(error));
  if (!raw.trim()) return false;
  try {
    const parsed = parseToml(raw) as Record<string, any>;
    return parsed.features?.skills === true;
  } catch {
    return false;
  }
}

function parseYamlScalar(value: string): string {
  if (!value) return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    if (value.startsWith('"')) {
      try { return JSON.parse(value); } catch { return value.slice(1, -1); }
    }
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

async function firstExistingDirectory(paths: string[]): Promise<string | undefined> {
  for (const path of paths) {
    const info = await stat(path).catch(() => undefined);
    if (info?.isDirectory()) return path;
  }
  return undefined;
}

function dedupeInventory(items: SkillInventoryEntry[]): SkillInventoryEntry[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.provider}:${resolve(item.filePath)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
