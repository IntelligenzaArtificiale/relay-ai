import type { AutomationRunRecord, AutomationSchedule, RelayAutomation } from '../core/types.js';
import type { AutomationStore } from './automation-store.js';

export interface AutomationExecutionResult { conversationId?: string; detail?: string }
export interface AutomationSchedulerOptions {
  store: AutomationStore;
  execute: (automation: RelayAutomation) => Promise<AutomationExecutionResult>;
  now?: () => Date;
  setTimer?: (callback: () => void, delay: number) => NodeJS.Timeout;
  clearTimer?: (timer: NodeJS.Timeout) => void;
  onChanged?: () => void;
}

const MAX_TIMER_MS = 6 * 60 * 60 * 1000;
const DAY_NAMES = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

export class AutomationScheduler {
  private readonly now: () => Date;
  private readonly setTimerFn: (callback: () => void, delay: number) => NodeJS.Timeout;
  private readonly clearTimerFn: (timer: NodeJS.Timeout) => void;
  private timer: NodeJS.Timeout | undefined;
  private started = false;
  private readonly running = new Set<string>();

  constructor(private readonly options: AutomationSchedulerOptions) {
    this.now = options.now ?? (() => new Date());
    this.setTimerFn = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimerFn = options.clearTimer ?? ((timer) => clearTimeout(timer));
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.reconcileMissed();
    await this.arm();
  }

  dispose(): void { if (this.timer) this.clearTimerFn(this.timer); this.timer = undefined; this.started = false; }

  async refresh(): Promise<void> { if (!this.started) return; if (this.timer) this.clearTimerFn(this.timer); this.timer = undefined; await this.arm(); }

  async runNow(id: string): Promise<void> {
    const item = await this.options.store.get(id);
    if (!item) throw new Error('Automazione non trovata.');
    await this.executeOne(item, false, true);
    await this.arm();
  }

  isRunning(id: string): boolean { return this.running.has(id); }

  private async reconcileMissed(): Promise<void> {
    const now = this.now();
    const items = await this.options.store.list();
    for (const item of items) {
      if (!item.enabled) continue;
      const due = item.nextRunAt ? new Date(item.nextRunAt) : undefined;
      if (!due || !Number.isFinite(due.getTime())) {
        await this.options.store.setNextRun(item.id, computeNextRun(item.schedule, now)?.toISOString(), item.schedule.kind === 'once' && !computeNextRun(item.schedule, now));
        continue;
      }
      if (due.getTime() > now.getTime()) continue;
      if (item.missedPolicy === 'catchUpOnce') await this.executeOne(item, true);
      else {
        const next = computeNextRun(item.schedule, now);
        await this.options.store.recordRun(item.id, { at: now.toISOString(), outcome: 'skipped', detail: 'Saltata durante la chiusura dell’editor.' }, next?.toISOString(), !next);
      }
    }
    this.options.onChanged?.();
  }

  private async arm(): Promise<void> {
    if (!this.started) return;
    if (this.timer) this.clearTimerFn(this.timer);
    const now = this.now();
    const items = (await this.options.store.list()).filter((entry) => entry.enabled);
    let nextAt = Infinity;
    for (const item of items) {
      let next = item.nextRunAt ? new Date(item.nextRunAt) : undefined;
      if (!next || !Number.isFinite(next.getTime())) {
        next = computeNextRun(item.schedule, now);
        await this.options.store.setNextRun(item.id, next?.toISOString(), !next);
      }
      if (next) nextAt = Math.min(nextAt, next.getTime());
    }
    const delay = Number.isFinite(nextAt) ? Math.max(0, Math.min(MAX_TIMER_MS, nextAt - now.getTime())) : MAX_TIMER_MS;
    this.timer = this.setTimerFn(() => { void this.tick(); }, delay);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    this.timer = undefined;
    const now = this.now();
    const due = (await this.options.store.list()).filter((entry) => entry.enabled && entry.nextRunAt && new Date(entry.nextRunAt).getTime() <= now.getTime());
    await Promise.all(due.map((entry) => this.executeOne(entry, false)));
    await this.arm();
  }

  private async executeOne(item: RelayAutomation, catchUp: boolean, preserveSchedule = false): Promise<void> {
    const at = this.now();
    if (this.running.has(item.id)) {
      const next = preserveSchedule ? (item.nextRunAt ? new Date(item.nextRunAt) : undefined) : computeNextRun(item.schedule, at);
      await this.options.store.recordRun(item.id, { at: at.toISOString(), outcome: 'skipped', detail: 'Saltata perché l’esecuzione precedente è ancora in corso.' }, next?.toISOString(), preserveSchedule ? false : !next);
      this.options.onChanged?.();
      return;
    }
    this.running.add(item.id);
    try {
      const result = await this.options.execute(item);
      const next = preserveSchedule ? (item.nextRunAt ? new Date(item.nextRunAt) : undefined) : computeNextRun(item.schedule, this.now());
      const record: AutomationRunRecord = { at: at.toISOString(), outcome: 'ok', ...(result.conversationId ? { conversationId: result.conversationId } : {}), ...(result.detail ? { detail: result.detail } : {}), ...(catchUp ? { detail: [result.detail, 'Recuperata dopo la riapertura dell’editor.'].filter(Boolean).join(' ') } : {}) };
      await this.options.store.recordRun(item.id, record, next?.toISOString(), preserveSchedule ? false : item.schedule.kind === 'once' || !next);
    } catch (error) {
      const next = preserveSchedule ? (item.nextRunAt ? new Date(item.nextRunAt) : undefined) : computeNextRun(item.schedule, this.now());
      await this.options.store.recordRun(item.id, { at: at.toISOString(), outcome: 'error', detail: error instanceof Error ? error.message : String(error) }, next?.toISOString(), preserveSchedule ? false : item.schedule.kind === 'once' || !next);
    } finally {
      this.running.delete(item.id);
      this.options.onChanged?.();
    }
  }
}

export function computeNextRun(schedule: AutomationSchedule, from: Date): Date | undefined {
  const origin = new Date(from.getTime());
  const activeFrom = schedule.activeFrom ? new Date(schedule.activeFrom) : undefined;
  const activeTo = schedule.activeTo ? new Date(schedule.activeTo) : undefined;
  if (activeTo && activeTo.getTime() <= origin.getTime()) return undefined;
  const floor = activeFrom && activeFrom.getTime() > origin.getTime() ? activeFrom : origin;
  let next: Date | undefined;
  if (schedule.kind === 'once') {
    const at = new Date(schedule.at);
    if (at.getTime() > origin.getTime() && (!activeFrom || at >= activeFrom)) next = at;
  } else if (schedule.kind === 'interval') {
    const every = Math.max(5, Math.floor(schedule.everyMinutes)) * 60_000;
    if (activeFrom) {
      if (origin < activeFrom) next = new Date(activeFrom);
      else next = new Date(activeFrom.getTime() + (Math.floor((origin.getTime() - activeFrom.getTime()) / every) + 1) * every);
    } else next = new Date(origin.getTime() + every);
  } else if (schedule.kind === 'daily') {
    next = candidateAt(floor, schedule.time);
    if (next.getTime() <= origin.getTime() || (activeFrom && next < activeFrom)) {
      next.setDate(next.getDate() + 1);
      next = candidateAt(next, schedule.time);
    }
  } else {
    const allowed = new Set(schedule.days);
    for (let add = 0; add <= 14; add += 1) {
      const day = new Date(floor);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() + add);
      if (!allowed.has(day.getDay())) continue;
      const candidate = candidateAt(day, schedule.time);
      if (candidate.getTime() > origin.getTime() && (!activeFrom || candidate >= activeFrom)) { next = candidate; break; }
    }
  }
  if (!next || !Number.isFinite(next.getTime())) return undefined;
  if (activeTo && next > activeTo) return undefined;
  return next;
}

export function describeSchedule(schedule: AutomationSchedule): string {
  const period = schedule.activeFrom || schedule.activeTo ? ` · periodo ${schedule.activeFrom ? shortDate(schedule.activeFrom) : 'subito'}–${schedule.activeTo ? shortDate(schedule.activeTo) : 'senza fine'}` : '';
  if (schedule.kind === 'interval') return `Ogni ${schedule.everyMinutes} minuti${period}`;
  if (schedule.kind === 'daily') return `Ogni giorno alle ${schedule.time}${period}`;
  if (schedule.kind === 'once') return `Una volta il ${new Date(schedule.at).toLocaleString('it-IT')}${period}`;
  const days = schedule.days.map((day) => DAY_NAMES[day]).filter(Boolean);
  return `Ogni ${joinNatural(days)} alle ${schedule.time}${period}`;
}

function candidateAt(day: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const candidate = new Date(day);
  candidate.setHours(hours || 0, minutes || 0, 0, 0);
  return candidate;
}
function joinNatural(values: string[]): string { return values.length <= 1 ? (values[0] ?? '') : `${values.slice(0, -1).join(', ')} e ${values.at(-1)}`; }
function shortDate(value: string): string { return new Date(value).toLocaleDateString('it-IT'); }
