import { button, el, formatClock, icon } from '../dom.js';
import type { UiRuntime } from '../types.js';

const PAGE_SIZE = 30;

export function renderDiagnostics(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const local = runtime as any;
  const page = el('section', 'content-page diagnostics-page diagnostics-page--compact');
  const header = el('header', 'page-header diagnostics-header');
  const copy = el('div');
  copy.append(el('span', 'eyebrow', 'Supporto tecnico'));
  copy.append(el('h1', '', 'Diagnostica'));
  copy.append(el('p', '', 'Compatibilità, stato operativo e log recenti senza sovraccaricare la schermata.'));
  const actions = el('div', 'diagnostics-actions diagnostics-actions--icons');
  actions.append(
    diagnosticIconAction('check', 'System Doctor', () => runtime.post({ type: 'runSystemDoctor' })),
    diagnosticIconAction('diagnostics', 'Apri output live', () => runtime.post({ type: 'openDiagnostics' })),
    diagnosticIconAction('copy', 'Copia log', () => runtime.post({ type: 'copyDiagnostics' })),
    diagnosticIconAction('arrowUp', 'Esporta diagnostica', () => runtime.post({ type: 'exportDiagnostics' }), true)
  );
  header.append(copy, actions);
  page.append(header);

  const errorCount = state.diagnostics.filter((entry) => entry.level === 'error').length;
  const warningCount = state.diagnostics.filter((entry) => entry.level === 'warning').length;
  const summary = el('div', 'diagnostics-summary diagnostics-summary--compact');
  summary.append(summaryItem('Eventi', String(state.diagnostics.length)));
  summary.append(summaryItem('Errori', String(errorCount), errorCount ? 'is-error' : ''));
  summary.append(summaryItem('Avvisi', String(warningCount), warningCount ? 'is-warning' : ''));
  summary.append(summaryItem('Run', String(state.activeRuns.length)));
  page.append(summary);

  const readiness = (state as any).systemReadiness;
  if (readiness) page.append(renderReadiness(runtime, readiness));

  const allEntries = [...state.diagnostics].reverse();
  const limit = Math.max(PAGE_SIZE, Number(local.diagnosticsLimit ?? PAGE_SIZE));
  const visibleEntries = allEntries.slice(0, limit);
  const logSection = el('section', 'diagnostics-log-section');
  const logHeader = el('div', 'diagnostics-log-header');
  const logCopy = el('div');
  logCopy.append(el('strong', '', 'Log recenti'), el('small', '', `${visibleEntries.length} di ${allEntries.length} eventi`));
  const resetPage = button('diagnostics-log-reset');
  resetPage.append(icon('refresh', 14));
  resetPage.title = 'Torna agli eventi più recenti';
  resetPage.setAttribute('aria-label', resetPage.title);
  resetPage.addEventListener('click', () => {
    local.diagnosticsLimit = PAGE_SIZE;
    runtime.render();
  });
  logHeader.append(logCopy, resetPage);
  logSection.append(logHeader);

  const list = el('div', 'diagnostics-list diagnostics-list--compact');
  for (const entry of visibleEntries) {
    const row = el('details', `diagnostic-entry diagnostic-entry--compact is-${entry.level}`) as HTMLDetailsElement;
    const summaryNode = el('summary', 'diagnostic-entry__summary');
    const level = el('span', `diagnostic-entry__level is-${entry.level}`);
    const main = el('span', 'diagnostic-entry__main');
    main.append(el('strong', '', entry.message));
    main.append(el('small', '', [entry.scope, entry.provider, entry.runId ? `run ${entry.runId.slice(0, 8)}` : '', formatClock(entry.timestamp ?? entry.createdAt ?? new Date().toISOString())].filter(Boolean).join(' · ')));
    summaryNode.append(level, main, icon('chevronDown', 13));
    row.append(summaryNode);
    if (entry.detail) row.append(el('pre', 'diagnostic-entry__detail', entry.detail));
    list.append(row);
  }
  if (!allEntries.length) list.append(el('div', 'empty-panel', 'Nessun evento diagnostico registrato in questa sessione.'));
  logSection.append(list);

  if (visibleEntries.length < allEntries.length) {
    const more = button('button button--secondary diagnostics-load-more', `Carica altri ${Math.min(PAGE_SIZE, allEntries.length - visibleEntries.length)}`);
    more.addEventListener('click', () => {
      local.diagnosticsLimit = limit + PAGE_SIZE;
      runtime.render();
    });
    logSection.append(more);
  }
  page.append(logSection);
  return page;
}

function diagnosticIconAction(name: Parameters<typeof icon>[0], label: string, handler: () => void, primary = false): HTMLButtonElement {
  const node = button(`diagnostics-icon-action ${primary ? 'is-primary' : ''}`.trim());
  node.append(icon(name, 16));
  node.title = label;
  node.setAttribute('aria-label', label);
  node.addEventListener('click', handler);
  return node;
}

function summaryItem(label: string, value: string, className = ''): HTMLElement {
  const item = el('div', `diagnostics-summary__item ${className}`.trim());
  item.append(el('strong', '', value), el('span', '', label));
  return item;
}

function renderReadiness(runtime: UiRuntime, readiness: any): HTMLElement {
  const section = el('details', 'readiness-panel readiness-panel--compact') as HTMLDetailsElement;
  section.open = runtime.expandedPanels.has('diagnostics:readiness');
  section.addEventListener('toggle', () => {
    if (section.open) runtime.expandedPanels.add('diagnostics:readiness');
    else runtime.expandedPanels.delete('diagnostics:readiness');
  });

  const summary = el('summary', 'readiness-panel__summary');
  const summaryCopy = el('div');
  const components = readiness.components ?? [];
  const readyCount = components.filter((entry: any) => entry.state === 'ready').length;
  summaryCopy.append(el('strong', '', 'Componenti e compatibilità'));
  summaryCopy.append(el('small', '', `${readyCount}/${components.length} pronti · ${platformLabel(readiness.platform)} ${readiness.arch ?? ''}`));
  const summaryMeta = el('div', 'readiness-panel__summary-actions');
  const refresh = button('diagnostics-icon-action');
  refresh.append(icon('refresh', 14));
  refresh.title = 'Ricontrolla componenti';
  refresh.setAttribute('aria-label', refresh.title);
  refresh.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    runtime.post({ type: 'refreshSystemReadiness' });
  });
  summaryMeta.append(refresh, icon('chevronDown', 14));
  summary.append(summaryCopy, summaryMeta);
  section.append(summary);

  const body = el('div', 'readiness-panel__body');
  const features = el('div', 'readiness-features readiness-features--compact');
  for (const feature of Object.values(readiness.features ?? {}) as any[]) {
    const item = el('div', `readiness-feature readiness-feature--compact ${feature.ready ? 'is-ready' : 'is-warning'}`);
    item.append(icon(feature.ready ? 'check' : 'warning', 14));
    const text = el('div');
    text.append(el('strong', '', feature.title ?? 'Funzione'), el('small', '', feature.detail ?? ''));
    item.append(text);
    features.append(item);
  }
  body.append(features);

  const visibleIds = new Set(['runtime', 'git', 'node', 'npm', 'curl', 'browser', 'powershell']);
  const componentList = el('div', 'readiness-components readiness-components--compact');
  for (const component of components.filter((entry: any) => visibleIds.has(entry.id))) {
    const row = el('div', `readiness-component readiness-component--compact is-${component.state}`);
    const status = el('span', 'readiness-component__status');
    status.append(icon(component.state === 'ready' ? 'check' : component.state === 'missing' || component.state === 'outdated' ? 'warning' : 'minus', 13));
    const info = el('div', 'readiness-component__copy');
    info.append(el('strong', '', component.label));
    info.append(el('small', '', component.version || component.detail));
    row.append(status, info);
    if ((component.state === 'missing' || component.state === 'outdated') && component.installable) {
      const install = button('button button--secondary button--small', component.state === 'outdated' ? 'Aggiorna' : 'Installa');
      install.addEventListener('click', () => runtime.post({ type: 'installSystemComponent', payload: { component: component.id } }));
      row.append(install);
    } else {
      row.append(el('span', `readiness-component__badge is-${component.state}`, component.state === 'ready' ? 'Pronto' : component.state === 'outdated' ? 'Da aggiornare' : 'Opzionale'));
    }
    componentList.append(row);
  }
  body.append(componentList);
  section.append(body);
  return section;
}

function platformLabel(value: string): string {
  if (value === 'win32') return 'Windows';
  if (value === 'darwin') return 'macOS';
  if (value === 'linux') return 'Linux';
  return value || 'Sistema';
}
