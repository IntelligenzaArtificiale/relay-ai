import type { ProviderId, ProviderStatus, UsageBucket, UsageSnapshot } from '../../core/types.js';
import { button, el, formatPercent, formatRelativeTime, formatReset, icon, providerGlyph, select } from '../dom.js';
import type { UiRuntime } from '../types.js';
import { preferredUsageBucket, usageReferenceLabel, withPreferredUsage } from '../../services/usage-selection.js';

export function renderUsage(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const page = el('section', 'content-page usage-page');
  const header = el('header', 'page-header page-header--compact');
  const copy = el('div');
  copy.append(el('span', 'eyebrow', 'Capacity'));
  copy.append(el('h1', '', 'Utilizzo'));
  copy.append(el('p', '', 'Finestre e reset letti dai provider locali.'));
  header.append(copy);

  const refresh = button(`button button--secondary usage-refresh ${state.usageRefreshing ? 'is-loading' : ''}`);
  refresh.disabled = state.usageRefreshing;
  refresh.append(icon('refresh', 15), el('span', '', state.usageRefreshing ? 'Aggiornamento…' : 'Aggiorna'));
  refresh.addEventListener('click', () => runtime.post({ type: 'refreshUsage' }));
  header.append(refresh);
  page.append(header);

  const strip = el('div', 'usage-policy-strip');
  const policyCopy = el('div');
  policyCopy.append(el('strong', '', 'Uso nelle deleghe'), el('span', '', 'Relay può considerare la capacità residua quando sceglie provider e modelli.'));
  const policySelect = select(state.preferences.quotaPolicy, [
    { value: 'balanced', label: 'Bilanciato' },
    { value: 'preserve', label: 'Preserva quota' },
    { value: 'unrestricted', label: 'Senza vincoli' }
  ], 'premium-select');
  policySelect.addEventListener('change', () => runtime.post({ type: 'updatePreferences', payload: { quotaPolicy: policySelect.value } }));
  const shell = el('span', 'select-shell');
  shell.append(policySelect, icon('chevronDown', 14));
  strip.append(policyCopy, shell);
  page.append(strip);

  const list = el('div', 'capacity-list');
  for (const provider of state.providers) {
    list.append(renderCapacityCard(runtime, provider, state.usage.find((entry) => entry.provider === provider.id)));
  }
  page.append(list);

  const footer = el('p', 'capacity-footnote', 'Durante un task Relay mantiene l’ultimo dato valido e aggiorna la capacità appena il provider torna libero.');
  page.append(footer);
  return page;
}

function renderCapacityCard(
  runtime: UiRuntime,
  providerStatus: ProviderStatus,
  usage: UsageSnapshot | undefined
): HTMLElement {
  const provider = providerStatus.id;
  const label = providerStatus.label;
  const providerPlan = providerStatus.plan;
  const version = providerStatus.version;
  const modelReference = usageModelReference(runtime, providerStatus);
  const displayUsage = withPreferredUsage(provider, usage, modelReference);
  const primaryBucket = preferredUsageBucket(provider, usage?.buckets, modelReference);
  const expandKey = `usage:card:${provider}`;
  const isExpanded = runtime.expandedPanels.has(expandKey);
  const card = el('details', `capacity-card ${displayUsage?.stale ? 'is-stale' : ''} capacity-card--collapsible`) as HTMLDetailsElement;
  card.open = isExpanded;
  card.addEventListener('toggle', () => {
    if (card.open) runtime.expandedPanels.add(expandKey);
    else runtime.expandedPanels.delete(expandKey);
  });
  const head = el('summary', 'capacity-card__head');
  const identity = el('div', 'capacity-card__identity');
  identity.append(providerGlyph(provider));
  const copy = el('div');
  copy.append(el('strong', '', label));
  copy.append(el('span', '', displayUsage?.plan ? displayUsage.plan : providerPlan ? `Piano ${providerPlan}` : compactVersion(version)));
  if (displayUsage?.available && primaryBucket) copy.append(el('small', 'capacity-card__reference', `Riferimento: ${usageReferenceLabel(provider, primaryBucket)}`));
  identity.append(copy);
  head.append(identity);
  const status = el('span', `capacity-card__status ${displayUsage?.available ? usageTone(displayUsage.remainingFraction) : 'is-unknown'}`);
  status.textContent = displayUsage?.available ? formatUsageStatus(displayUsage) : '—';
  if (primaryBucket) status.title = usageReferenceLabel(provider, primaryBucket);
  head.append(status, icon('chevronDown', 14));
  card.append(head);

  const buckets = normalizedBuckets(displayUsage);
  if (buckets.length) {
    const rows = el('div', 'capacity-windows');
    for (const bucket of buckets) rows.append(renderBucket(bucket));
    card.append(rows);
    if (provider === 'antigravity' && antigravityWindowCoverage(buckets) < 4) {
      const partial = el('div', 'capacity-partial-warning');
      partial.append(icon('warning', 14), el('span', '', `${antigravityWindowCoverage(buckets)}/4 finestre rilevate. Relay conserva il dato valido e riprova le sorgenti locali.`));
      const retry = button('button button--ghost button--small', 'Riprova');
      retry.addEventListener('click', () => runtime.post({ type: 'refreshUsage' }));
      partial.append(retry);
      card.append(partial);
    }
  } else {
    const empty = el('div', 'capacity-empty');
    empty.append(el('span', '', displayUsage?.lastError || displayUsage?.detail || 'Il provider non espone una quota leggibile.'));
    if (provider === 'antigravity' && !runtime.state!.antigravityUsageBridge.enabled) {
      const connect = button('button button--secondary button--small', 'Collega utilizzo live');
      connect.addEventListener('click', () => runtime.post({ type: 'enableAntigravityUsage' }));
      empty.append(connect);
    } else if (provider === 'antigravity' && runtime.state!.antigravityUsageBridge.enabled) {
      empty.append(el('small', 'capacity-bridge-hint', 'Bridge attivo. I dati arrivano dalla status line durante i task AGY.'));
    }
    if (provider === 'copilot') {
      const connected = Boolean(providerStatus.capabilities?.billingUsageConfigured);
      const connect = button('button button--secondary button--small', connected ? 'Aggiorna token GitHub' : 'Collega utilizzo GitHub');
      connect.addEventListener('click', () => runtime.post({ type: 'configureCopilotUsage' }));
      empty.append(connect);
    }
    card.append(empty);
  }

  const meta = el('footer', 'capacity-card__meta');
  if (provider === 'copilot' && providerStatus.available) card.append(renderCopilotModelAccess(providerStatus, displayUsage));

  const updated = displayUsage?.lastSuccessfulAt ?? displayUsage?.updatedAt;
  meta.append(el('span', '', updated ? `Aggiornato ${formatRelativeTime(updated)}` : 'Mai aggiornato'));
  if (displayUsage?.stale) meta.append(el('span', 'capacity-stale', 'Ultimo dato valido'));
  else if (displayUsage?.confidence === 'exact') meta.append(el('span', '', 'Dati API'));
  else if (displayUsage?.confidence === 'provider-reported') meta.append(el('span', '', 'Dato provider'));
  card.append(meta);
  return card;
}

function renderBucket(bucket: UsageBucket): HTMLElement {
  const row = el('div', 'capacity-window');
  const title = el('div', 'capacity-window__title');
  title.append(el('strong', '', bucket.group ? `${bucket.group} · ${bucket.label}` : bucket.label));
  title.append(el('span', '', formatReset(bucket.resetsAt)));
  row.append(title);

  const valueText = bucket.remainingFraction !== undefined
    ? formatPercent(bucket.remainingFraction)
    : formatAbsoluteUsage(bucket);
  const value = el('strong', `capacity-window__value ${usageTone(bucket.remainingFraction)}`, valueText);
  row.append(value);
  if (bucket.remainingFraction !== undefined) {
    const bar = el('div', 'capacity-window__bar');
    const fill = el('span', usageTone(bucket.remainingFraction));
    fill.style.width = `${Math.round(bucket.remainingFraction * 100)}%`;
    bar.append(fill);
    row.append(bar);
  } else if (bucket.used !== undefined) {
    row.append(el('div', 'capacity-window__absolute', bucket.limit !== undefined
      ? `${formatNumber(bucket.used)} su ${formatNumber(bucket.limit)}`
      : 'Consumo account del mese corrente'));
  }
  return row;
}

function usageModelReference(runtime: UiRuntime, providerStatus: ProviderStatus): string | undefined {
  const state = runtime.state!;
  const activeAgent = state.conversation.agentId
    ? state.agents.find((agent) => agent.id === state.conversation.agentId && agent.provider === providerStatus.id)
    : undefined;
  const configured = activeAgent?.model ?? (state.conversation.provider === providerStatus.id
    ? state.conversation.model
    : state.preferences.providerDefaults[providerStatus.id]?.model);
  const model = providerStatus.models.find((entry) => entry.id === configured)
    ?? providerStatus.models.find((entry) => entry.isDefault);
  if (configured && configured !== 'auto') return model?.family ?? model?.label ?? configured;
  return model?.id === 'auto' ? undefined : model?.family ?? model?.label;
}

function renderCopilotModelAccess(provider: ProviderStatus, usage: UsageSnapshot | undefined): HTMLElement {
  const section = el('section', 'capacity-model-access');
  const visible = provider.models.filter((model) => !model.hidden);
  const explicit = visible.filter((model) => model.id !== 'auto');
  const source = String(provider.capabilities?.modelInventorySource ?? 'fallback');
  const mode = String(provider.capabilities?.modelAccessMode ?? (explicit.length ? 'explicit' : 'auto-only'));
  const head = el('div', 'capacity-model-access__head');
  head.append(el('strong', '', 'Modelli utilizzabili'));
  const inventoryLabel = mode === 'auto-only'
    ? 'Solo Automatico: tipico di Copilot Free/Student o di una policy restrittiva'
    : source === 'cli-help'
      ? `${explicit.length} esposti dalla Copilot CLI locale per account e policy correnti`
      : `${explicit.length} dal catalogo compatibile Relay · verifica effettiva al primo utilizzo`;
  head.append(el('span', '', inventoryLabel));
  section.append(head);
  if (usage?.plan) section.append(el('div', 'capacity-model-access__plan', usage.plan));
  const chips = el('div', 'capacity-model-access__chips');
  const shown = mode === 'auto-only' ? visible.filter((model) => model.id === 'auto') : explicit;
  for (const model of shown.slice(0, 10)) {
    const chip = el('span', 'capacity-model-chip');
    chip.append(el('span', '', model.label));
    if (model.reasoning.length) chip.append(el('small', '', 'reasoning'));
    chips.append(chip);
  }
  if (shown.length > 10) chips.append(el('span', 'capacity-model-chip is-muted', `+${shown.length - 10}`));
  section.append(chips);
  return section;
}

function formatUsageStatus(usage: UsageSnapshot): string {
  if (usage.remainingFraction !== undefined) return formatPercent(usage.remainingFraction);
  const absolute = usage.buckets?.find((bucket) => bucket.used !== undefined);
  return absolute ? formatAbsoluteUsage(absolute) : '—';
}

function formatAbsoluteUsage(bucket: UsageBucket): string {
  if (bucket.used === undefined) return '—';
  const suffix = bucket.unit === 'credits' ? ' cr' : bucket.unit === 'requests' ? ' req' : '';
  return `${formatNumber(bucket.used)}${suffix}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(value);
}

function normalizedBuckets(usage: UsageSnapshot | undefined): UsageBucket[] {
  if (usage?.buckets?.length) {
    return [...usage.buckets].sort((a, b) => (groupOrder(a) - groupOrder(b)) || (bucketOrder(a) - bucketOrder(b)));
  }
  if (usage?.available && (usage.remainingFraction !== undefined || usage.usedFraction !== undefined)) {
    return [{
      id: 'primary',
      label: 'Limite principale',
      kind: 'other',
      ...(usage.remainingFraction !== undefined ? { remainingFraction: usage.remainingFraction } : {}),
      ...(usage.usedFraction !== undefined ? { usedFraction: usage.usedFraction } : {}),
      ...(usage.resetsAt ? { resetsAt: usage.resetsAt } : {})
    }];
  }
  return [];
}

function antigravityWindowCoverage(buckets: UsageBucket[]): number {
  return new Set(buckets
    .filter((bucket) => bucket.group && (bucket.kind === 'weekly' || bucket.kind === 'five-hour' || bucket.kind === 'session'))
    .map((bucket) => `${bucket.group}:${bucket.kind === 'session' ? 'five-hour' : bucket.kind}`)).size;
}

function groupOrder(bucket: UsageBucket): number {
  const group = bucket.group?.toLowerCase() ?? '';
  if (group.includes('gemini')) return 0;
  if (group.includes('claude') || group.includes('gpt')) return 1;
  return 0;
}

function bucketOrder(bucket: UsageBucket): number {
  if (bucket.kind === 'five-hour' || bucket.kind === 'session') return 0;
  if (bucket.kind === 'daily') return 1;
  if (bucket.kind === 'weekly') return 2;
  return 3;
}

function usageTone(remaining: number | undefined): string {
  if (remaining === undefined) return 'is-unknown';
  if (remaining <= 0.15) return 'is-critical';
  if (remaining <= 0.35) return 'is-warning';
  return 'is-healthy';
}

function compactVersion(value: string | undefined): string {
  if (!value) return 'Provider locale';
  return value
    .replace(/\s*\(Claude Code\)\s*/i, '')
    .replace(/^GitHub\s+Copilot(?:\s+CLI)?\s*/i, '')
    .replace(/\.\s*Run ['"]?copilot update['"]?[^.]*\.?/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
