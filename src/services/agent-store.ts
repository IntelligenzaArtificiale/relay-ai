import { randomUUID } from 'node:crypto';
import type { ProviderId, RunPermission } from '../core/types.js';
import { AtomicJsonStore } from './atomic-store.js';

export interface CustomAgentRecord {
  id: string;
  name: string;
  bio: string;
  provider: ProviderId;
  model?: string;
  reasoning?: string;
  permission: RunPermission;
  templateId?: string;
  bundledTemplate?: boolean;
  specialization?: string;
  instructions?: string;
  enabled: boolean;
  canDelegate: boolean;
  visibleInChat: boolean;
  globalVisible: boolean;
  projectIds: string[];
  mcpServers: string[];
  taskCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  isDefault?: boolean;
}

export class AgentStore {
  private readonly store: AtomicJsonStore<CustomAgentRecord[]>;

  constructor(path: string) {
    this.store = new AtomicJsonStore(path, []);
  }

  invalidateCache(): void { this.store.invalidate(); }


  async read(): Promise<CustomAgentRecord[]> {
    return normalizeAgents(await this.store.read());
  }

  async create(input: Partial<CustomAgentRecord> & { name: string; provider: ProviderId }): Promise<CustomAgentRecord[]> {
    const now = new Date().toISOString();
    return this.store.update((current) => normalizeAgents([
      ...current,
      normalizeAgent({
        id: randomUUID(),
        name: input.name,
        bio: input.bio ?? '',
        provider: input.provider,
        model: input.model,
        reasoning: input.reasoning,
        permission: normalizePermission(input.permission),
        ...(input.templateId ? { templateId: input.templateId } : {}),
        ...(input.bundledTemplate ? { bundledTemplate: true } : {}),
        specialization: input.specialization ?? '',
        instructions: input.instructions ?? '',
        enabled: input.enabled ?? true,
        canDelegate: input.canDelegate ?? false,
        visibleInChat: input.visibleInChat ?? true,
        globalVisible: input.globalVisible ?? true,
        projectIds: input.projectIds ?? [],
        mcpServers: input.mcpServers ?? [],
        taskCount: input.taskCount ?? 0,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: input.lastUsedAt,
        isDefault: input.isDefault
      })
    ]));
  }


  async ensureTemplates(inputs: Array<Partial<CustomAgentRecord> & { templateId: string; name: string; provider: ProviderId }>): Promise<CustomAgentRecord[]> {
    return this.store.update((current) => {
      const normalized = normalizeAgents(current);
      const existing = new Set(normalized.flatMap((agent) => agent.templateId ? [agent.templateId] : []));
      const existingNames = new Set(normalized.map((agent) => agent.name.trim().toLocaleLowerCase()));
      const now = new Date().toISOString();
      const additions = inputs
        .filter((input) => !existing.has(input.templateId) && !existingNames.has(input.name.trim().toLocaleLowerCase()))
        .map((input) => normalizeAgent({
          id: randomUUID(),
          name: input.name,
          bio: input.bio ?? '',
          provider: input.provider,
          model: input.model,
          reasoning: input.reasoning,
          permission: normalizePermission(input.permission),
          specialization: input.specialization ?? '',
          instructions: input.instructions ?? '',
          enabled: input.enabled ?? false,
          canDelegate: input.canDelegate ?? false,
          visibleInChat: input.visibleInChat ?? true,
          globalVisible: input.globalVisible ?? true,
          projectIds: input.projectIds ?? [],
          mcpServers: input.mcpServers ?? [],
          taskCount: input.taskCount ?? 0,
          createdAt: now,
          updatedAt: now,
          templateId: input.templateId,
          bundledTemplate: true,
          isDefault: false
        }));
      return normalizeAgents([...normalized, ...additions]);
    });
  }

  async update(id: string, patch: Partial<CustomAgentRecord>): Promise<CustomAgentRecord[]> {
    return this.store.update((current) => normalizeAgents(current.map((agent) => agent.id === id
      ? normalizeAgent({ ...agent, ...patch, id: agent.id, updatedAt: new Date().toISOString() })
      : agent
    )));
  }

  async delete(id: string): Promise<CustomAgentRecord[]> {
    return this.store.update((current) => normalizeAgents(current.filter((agent) => agent.id !== id)));
  }

  async markUsed(id: string): Promise<CustomAgentRecord[]> {
    return this.store.update((current) => normalizeAgents(current.map((agent) => agent.id === id
      ? { ...agent, taskCount: Math.max(0, Number(agent.taskCount ?? 0)) + 1, lastUsedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      : agent
    )));
  }

  async replace(value: unknown): Promise<CustomAgentRecord[]> {
    const agents = Array.isArray(value) ? normalizeAgents(value) : [];
    await this.store.write(agents);
    return agents;
  }
}

export function visibleAgentsForProject(agents: CustomAgentRecord[], projectId: string): CustomAgentRecord[] {
  return agents
    .filter((agent) => agent.enabled && agent.visibleInChat)
    .filter((agent) => agent.globalVisible || agent.projectIds.includes(projectId))
    .sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || a.name.localeCompare(b.name));
}

export function agentToken(agent: CustomAgentRecord): string {
  return `@agent[${agent.id}]`;
}

function normalizeAgents(value: unknown): CustomAgentRecord[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const agents: CustomAgentRecord[] = [];
  for (const raw of value) {
    const agent = normalizeAgent(raw);
    if (!agent || seen.has(agent.id)) continue;
    seen.add(agent.id);
    agents.push(agent);
  }
  return agents;
}

function normalizeAgent(raw: any): CustomAgentRecord {
  const now = new Date().toISOString();
  const provider = raw?.provider === 'claude' || raw?.provider === 'antigravity' || raw?.provider === 'copilot' ? raw.provider : 'codex';
  return {
    id: clean(raw?.id, 120) ?? randomUUID(),
    name: clean(raw?.name, 80) ?? 'Nuovo agente',
    bio: clean(raw?.bio, 240) ?? '',
    provider,
    ...(clean(raw?.model, 200) ? { model: clean(raw.model, 200) } : {}),
    ...(clean(raw?.reasoning, 100) ? { reasoning: clean(raw.reasoning, 100) } : {}),
    permission: normalizePermission(raw?.permission),
    ...(clean(raw?.templateId, 120) ? { templateId: clean(raw.templateId, 120) } : {}),
    ...(raw?.bundledTemplate ? { bundledTemplate: true } : {}),
    specialization: clean(raw?.specialization, 160) ?? '',
    instructions: clean(raw?.instructions, 12_000) ?? '',
    enabled: raw?.enabled !== false,
    canDelegate: Boolean(raw?.canDelegate),
    visibleInChat: raw?.visibleInChat !== false,
    globalVisible: raw?.globalVisible !== false,
    projectIds: cleanArray(raw?.projectIds, 80, 120),
    mcpServers: cleanArray(raw?.mcpServers, 20, 120),
    taskCount: Math.max(0, Number(raw?.taskCount ?? 0) || 0),
    createdAt: clean(raw?.createdAt, 50) ?? now,
    updatedAt: clean(raw?.updatedAt, 50) ?? now,
    ...(clean(raw?.lastUsedAt, 50) ? { lastUsedAt: clean(raw.lastUsedAt, 50) } : {}),
    ...(raw?.isDefault ? { isDefault: true } : {})
  };
}


function normalizePermission(value: unknown): RunPermission {
  return value === 'danger-full-access' ? 'danger-full-access' : value === 'workspace-write' ? 'workspace-write' : 'read-only';
}

function clean(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : undefined;
}

function cleanArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => clean(entry, maxLength) ?? []).slice(0, maxItems))];
}
