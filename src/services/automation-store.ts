import { randomUUID } from 'node:crypto';
import type { RelayAutomation, AutomationRunRecord, AutomationSchedule, DelegationPolicy, ProviderId, RunPermission } from '../core/types.js';
import { AtomicJsonStore } from './atomic-store.js';

export interface AutomationDraftInput {
  id?: string;
  name: string;
  prompt: string;
  projectId?: string | null;
  provider?: ProviderId;
  agentId?: string;
  permission?: RunPermission;
  delegationPolicy?: DelegationPolicy;
  schedule: AutomationSchedule;
  enabled?: boolean;
  missedPolicy?: 'skip' | 'catchUpOnce';
}

export class AutomationStore {
  private readonly store: AtomicJsonStore<RelayAutomation[]>;

  constructor(path: string) {
    this.store = new AtomicJsonStore(path, []);
  }

  invalidate(): void { this.store.invalidate(); }

  async list(): Promise<RelayAutomation[]> {
    const raw = await this.store.read();
    const normalized = raw.map(normalizeAutomation).filter((entry): entry is RelayAutomation => Boolean(entry));
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) await this.store.write(normalized);
    return normalized.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<RelayAutomation | undefined> {
    return (await this.list()).find((entry) => entry.id === id);
  }

  async upsert(input: AutomationDraftInput, nextRunAt?: string): Promise<RelayAutomation> {
    validateInput(input);
    const now = new Date().toISOString();
    let saved: RelayAutomation | undefined;
    await this.store.update((items) => {
      const current = input.id ? items.map(normalizeAutomation).find((entry) => entry?.id === input.id) : undefined;
      saved = {
        id: current?.id ?? randomUUID(),
        name: input.name.trim().slice(0, 100),
        prompt: input.prompt.trim(),
        projectId: input.projectId ?? null,
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.agentId ? { agentId: input.agentId } : {}),
        permission: input.permission ?? current?.permission ?? 'workspace-write',
        delegationPolicy: input.delegationPolicy ?? current?.delegationPolicy ?? 'confirm',
        schedule: normalizeSchedule(input.schedule),
        enabled: input.enabled ?? current?.enabled ?? true,
        ...(current?.lastRun ? { lastRun: current.lastRun } : {}),
        ...(current?.history ? { history: current.history.slice(-20) } : {}),
        ...(nextRunAt ? { nextRunAt } : current?.nextRunAt ? { nextRunAt: current.nextRunAt } : {}),
        missedPolicy: input.missedPolicy ?? current?.missedPolicy ?? 'skip',
        createdAt: current?.createdAt ?? now,
        updatedAt: now
      };
      return [saved, ...items.map(normalizeAutomation).filter((entry): entry is RelayAutomation => Boolean(entry) && entry!.id !== saved!.id)];
    });
    if (!saved) throw new Error('Impossibile salvare l’automazione.');
    return structuredClone(saved);
  }

  async remove(id: string): Promise<void> {
    await this.store.update((items) => items.filter((entry) => entry.id !== id));
  }

  async duplicate(id: string, nextRunAt?: string): Promise<RelayAutomation> {
    const current = await this.get(id);
    if (!current) throw new Error('Automazione non trovata.');
    return this.upsert({
      name: `${current.name} copia`, prompt: current.prompt, projectId: current.projectId, provider: current.provider,
      agentId: current.agentId, permission: current.permission, delegationPolicy: current.delegationPolicy,
      schedule: current.schedule, enabled: false, missedPolicy: current.missedPolicy
    }, nextRunAt);
  }

  async toggle(id: string, enabled: boolean, nextRunAt?: string): Promise<RelayAutomation> {
    let result: RelayAutomation | undefined;
    await this.store.update((items) => items.map((raw) => {
      const item = normalizeAutomation(raw);
      if (!item || item.id !== id) return raw;
      result = { ...item, enabled, ...(enabled && nextRunAt ? { nextRunAt } : {}), ...(!enabled ? { nextRunAt: undefined } : {}), updatedAt: new Date().toISOString() };
      return result;
    }));
    if (!result) throw new Error('Automazione non trovata.');
    return structuredClone(result);
  }

  async setNextRun(id: string, nextRunAt: string | undefined, disable = false): Promise<void> {
    await this.store.update((items) => items.map((raw) => {
      const item = normalizeAutomation(raw);
      if (!item || item.id !== id) return raw;
      const next = { ...item, enabled: disable ? false : item.enabled, updatedAt: new Date().toISOString() } as RelayAutomation;
      if (nextRunAt) next.nextRunAt = nextRunAt;
      else delete next.nextRunAt;
      return next;
    }));
  }

  async recordRun(id: string, record: AutomationRunRecord, nextRunAt?: string, disable = false): Promise<void> {
    await this.store.update((items) => items.map((raw) => {
      const item = normalizeAutomation(raw);
      if (!item || item.id !== id) return raw;
      const history = [...(item.history ?? []), record].slice(-20);
      const next: RelayAutomation = { ...item, lastRun: record, history, enabled: disable ? false : item.enabled, updatedAt: new Date().toISOString() };
      if (nextRunAt) next.nextRunAt = nextRunAt;
      else delete next.nextRunAt;
      return next;
    }));
  }
}

export function normalizeSchedule(schedule: AutomationSchedule): AutomationSchedule {
  const activeFrom = validIso(schedule.activeFrom) ? schedule.activeFrom : undefined;
  const activeTo = validIso(schedule.activeTo) ? schedule.activeTo : undefined;
  if (schedule.kind === 'interval') return { kind: 'interval', everyMinutes: Math.max(5, Math.floor(Number(schedule.everyMinutes) || 5)), ...(activeFrom ? { activeFrom } : {}), ...(activeTo ? { activeTo } : {}) };
  if (schedule.kind === 'daily') return { kind: 'daily', time: normalizeTime(schedule.time), ...(activeFrom ? { activeFrom } : {}), ...(activeTo ? { activeTo } : {}) };
  if (schedule.kind === 'weekly') return { kind: 'weekly', days: [...new Set(schedule.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort(), time: normalizeTime(schedule.time), ...(activeFrom ? { activeFrom } : {}), ...(activeTo ? { activeTo } : {}) };
  return { kind: 'once', at: validIso(schedule.at) ? new Date(schedule.at).toISOString() : new Date().toISOString(), ...(activeFrom ? { activeFrom } : {}), ...(activeTo ? { activeTo } : {}) };
}

function normalizeAutomation(raw: unknown): RelayAutomation | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<RelayAutomation>;
  if (!value.id || !value.name || !value.prompt || !value.schedule) return undefined;
  try {
    return {
      id: String(value.id), name: String(value.name).slice(0, 100), prompt: String(value.prompt), projectId: value.projectId ? String(value.projectId) : null,
      ...(value.provider ? { provider: value.provider } : {}), ...(value.agentId ? { agentId: String(value.agentId) } : {}),
      permission: value.permission ?? 'workspace-write', delegationPolicy: value.delegationPolicy ?? 'confirm', schedule: normalizeSchedule(value.schedule),
      enabled: value.enabled !== false, ...(value.lastRun ? { lastRun: value.lastRun } : {}), ...(Array.isArray(value.history) ? { history: value.history.slice(-20) } : {}),
      ...(validIso(value.nextRunAt) ? { nextRunAt: new Date(value.nextRunAt!).toISOString() } : {}), missedPolicy: value.missedPolicy === 'catchUpOnce' ? 'catchUpOnce' : 'skip',
      createdAt: validIso(value.createdAt) ? new Date(value.createdAt!).toISOString() : new Date().toISOString(),
      updatedAt: validIso(value.updatedAt) ? new Date(value.updatedAt!).toISOString() : new Date().toISOString()
    };
  } catch { return undefined; }
}

function validateInput(input: AutomationDraftInput): void {
  if (!input.name?.trim()) throw new Error('Nome automazione obbligatorio.');
  if (!input.prompt?.trim()) throw new Error('Prompt automazione obbligatorio.');
  const schedule = normalizeSchedule(input.schedule);
  if (schedule.kind === 'weekly' && schedule.days.length === 0) throw new Error('Seleziona almeno un giorno della settimana.');
  if (schedule.activeFrom && schedule.activeTo && new Date(schedule.activeFrom) >= new Date(schedule.activeTo)) throw new Error('La fine del periodo deve essere successiva all’inizio.');
}

function normalizeTime(value: string): string {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '09:00';
  return `${String(Math.min(23, Number(match[1]))).padStart(2, '0')}:${String(Math.min(59, Number(match[2]))).padStart(2, '0')}`;
}
function validIso(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(new Date(value).getTime()); }
