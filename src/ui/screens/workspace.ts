import type { ConversationSummary, ProviderId, RuleDocument } from '../../core/types.js';
import { button, el, formatPercent, formatRelativeTime, icon, iconButton, providerGlyph } from '../dom.js';
import type { SectionId, UiRuntime } from '../types.js';
import { renderChat } from './chat.js';
import { renderProjects } from './projects.js';
import { renderAgents } from './agents.js';
import { renderRules } from './rules.js';
import { renderMcp } from './mcp.js';
import { renderAutomations } from './automations.js';
import { renderSettings } from './settings.js';
import { renderDiagnostics } from './diagnostics.js';
import { renderUsage } from './usage.js';
import { renderRemote } from './remote.js';

export function renderWorkspace(runtime: UiRuntime): HTMLElement {
  const app = el('div', 'workspace-app');
  app.append(renderTopbar(runtime));
  const body = el('div', 'workspace-body');
  body.append(renderPrimaryNav(runtime), renderLibrary(runtime));
  const main = el('main', 'workspace-main');
  if (runtime.section === 'chat') main.append(renderChat(runtime));
  if (runtime.section === 'projects') main.append(renderProjects(runtime));
  if (runtime.section === 'agents') main.append(renderAgents(runtime));
  if (runtime.section === 'usage') main.append(renderUsage(runtime));
  if (runtime.section === 'rules') main.append(renderRules(runtime));
  if (runtime.section === 'mcp') main.append(renderMcp(runtime));
  if (runtime.section === 'automations') main.append(renderAutomations(runtime));
  if (runtime.section === 'remote') main.append(renderRemote(runtime));
  if (runtime.section === 'diagnostics') main.append(renderDiagnostics(runtime));
  if (runtime.section === 'settings') main.append(renderSettings(runtime));
  body.append(main);
  app.append(body);
  if (runtime.toast) app.append(renderToast(runtime));
  return app;
}

function renderTopbar(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const topbar = el('header', 'app-topbar');
  const left = el('div', 'topbar-left');
  const brand = button('brand-lockup');
  const mark = el('span', 'product-mark');
  mark.append(icon('logo', 20));
  brand.append(mark, el('strong', '', 'Relay'));
  brand.addEventListener('click', () => runtime.setSection('chat'));
  left.append(brand, el('span', 'topbar-divider'));

  const project = button('project-switcher');
  const projectIcon = el('span', 'project-switcher__icon');
  projectIcon.append(icon('folder', 15));
  const copy = el('span', 'project-switcher__copy');
  copy.append(el('span', '', state.workspace.name));
  copy.append(el('small', '', state.workspace.isGit ? 'Git workspace' : state.workspace.cwd ? 'Cartella locale' : 'Apri un progetto'));
  project.append(projectIcon, copy, icon('chevronDown', 14));
  project.addEventListener('click', () => runtime.setSection('projects'));
  left.append(project);
  topbar.append(left);

  const right = el('div', 'topbar-right');
  right.append(renderTopbarSectionNav(runtime));
  const providerHealth = el('div', 'provider-health');
  for (const provider of state.providers) {
    const dot = button(`provider-health__item ${provider.available ? 'is-ready' : 'is-offline'}`);
    dot.append(providerGlyph(provider.id));
    dot.title = `${provider.label}: ${provider.available ? 'pronto' : 'non disponibile'}`;
    dot.addEventListener('click', () => runtime.setSection('settings'));
    providerHealth.append(dot);
  }
  right.append(providerHealth);

  const activeJobs = activePrimaryRunCount(runtime);
  if (activeJobs > 0) {
    const jobs = button('topbar-jobs');
    jobs.append(el('span', 'topbar-jobs__pulse'));
    jobs.append(el('span', '', activeJobs === 1 ? '1 in corso' : `${activeJobs} in corso`));
    jobs.title = 'Chat che stanno lavorando in background';
    jobs.addEventListener('click', () => { runtime.historyOpen = true; runtime.render(); });
    right.append(jobs);
  }

  const history = iconButton('history', 'Cronologia conversazioni', 'topbar-history');
  if (Object.keys(runtime.unseen).length > 0) {
    history.classList.add('has-unseen');
    history.append(el('span', 'topbar-unseen-dot'));
  }
  history.addEventListener('click', () => { runtime.historyOpen = true; runtime.render(); });
  right.append(history);
  const newChat = button('topbar-new-chat');
  newChat.append(icon('plus', 16), el('span', '', 'Nuova chat'));
  newChat.addEventListener('click', () => triggerNewConversation(runtime, state.conversation.provider));
  right.append(newChat);
  const settings = iconButton('settings', 'Impostazioni', `icon-button topbar-settings ${runtime.section === 'settings' ? 'is-active' : ''}`);
  settings.addEventListener('click', () => runtime.setSection('settings'));
  right.append(settings);
  topbar.append(right);
  return topbar;
}

function renderTopbarSectionNav(runtime: UiRuntime): HTMLElement {
  const nav = el('nav', 'topbar-section-nav');
  nav.setAttribute('aria-label', 'Sezioni Relay');
  const items: Array<{ id: SectionId; icon: Parameters<typeof icon>[0]; label: string }> = [
    { id: 'chat', icon: 'chat', label: 'Chat' },
    { id: 'projects', icon: 'folder', label: 'Progetti' },
    { id: 'agents', icon: 'sparkle', label: 'Agenti' },
    { id: 'usage', icon: 'gauge', label: 'Utilizzo' },
    { id: 'rules', icon: 'rules', label: 'Skills' },
    { id: 'mcp', icon: 'workflow', label: 'MCP' },
    { id: 'automations', icon: 'clock', label: 'Automazioni' },
    { id: 'remote', icon: 'remote', label: 'Remoto' },
    { id: 'diagnostics', icon: 'diagnostics', label: 'Diagnostica' }
  ];
  for (const item of items) {
    const control = iconButton(item.icon, item.label, `topbar-section-nav__item ${runtime.section === item.id ? 'is-active' : ''}`);
    if (runtime.section === item.id) control.setAttribute('aria-current', 'page');
    control.addEventListener('click', () => runtime.setSection(item.id));
    nav.append(control);
  }
  return nav;
}

function renderPrimaryNav(runtime: UiRuntime): HTMLElement {
  const nav = el('nav', 'primary-nav');
  const items: Array<{ id: SectionId; icon: Parameters<typeof icon>[0]; label: string }> = [
    { id: 'chat', icon: 'chat', label: 'Chat' },
    { id: 'projects', icon: 'folder', label: 'Progetti' },
    { id: 'agents', icon: 'sparkle', label: 'Agenti' },
    { id: 'usage', icon: 'gauge', label: 'Utilizzo' },
    { id: 'rules', icon: 'rules', label: 'Skills' },
    { id: 'mcp', icon: 'workflow', label: 'MCP' },
    { id: 'automations', icon: 'clock', label: 'Automazioni' },
    { id: 'remote', icon: 'remote', label: 'Remoto' },
    { id: 'diagnostics', icon: 'diagnostics', label: 'Diagnostica' }
  ];
  for (const item of items) {
    const control = button(`primary-nav__item ${runtime.section === item.id ? 'is-active' : ''}`);
    control.append(icon(item.icon, 19));
    control.title = item.label;
    control.setAttribute('aria-label', item.label);
    control.addEventListener('click', () => runtime.setSection(item.id));
    nav.append(control);
  }
  nav.append(el('span', 'primary-nav__spacer'));
  const settings = button(`primary-nav__item ${runtime.section === 'settings' ? 'is-active' : ''}`);
  settings.append(icon('settings', 19));
  settings.title = 'Impostazioni';
  settings.addEventListener('click', () => runtime.setSection('settings'));
  nav.append(settings);
  return nav;
}

function renderLibrary(runtime: UiRuntime): HTMLElement {
  const pane = el('aside', 'library-pane');
  if (runtime.section === 'chat') pane.append(renderConversationLibrary(runtime));
  if (runtime.section === 'projects') pane.append(renderProjectLibrary(runtime));
  if (runtime.section === 'agents') pane.append(renderAgentLibrary(runtime));
  if (runtime.section === 'usage') pane.append(renderUsageLibrary(runtime));
  if (runtime.section === 'rules') pane.append(renderRuleLibrary(runtime));
  if (runtime.section === 'mcp') pane.append(renderMcpLibrary(runtime));
  if (runtime.section === 'automations') pane.append(renderAutomationLibrary(runtime));
  if (runtime.section === 'remote') pane.append(renderRemoteLibrary(runtime));
  if (runtime.section === 'diagnostics') pane.append(renderDiagnosticsLibrary(runtime));
  if (runtime.section === 'settings') pane.append(renderSettingsLibrary(runtime));
  return pane;
}

export function renderHistoryDrawer(runtime: UiRuntime): HTMLElement {
  const overlay = el('div', 'history-overlay');
  overlay.addEventListener('click', (event) => {
    if (event.target !== overlay) return;
    runtime.historyOpen = false;
    runtime.render();
  });
  const drawer = el('aside', 'history-drawer');
  const top = el('header', 'history-drawer__header');
  const copy = el('div');
  copy.append(el('span', 'library-kicker', runtime.state!.workspace.name), el('h2', '', 'Conversazioni'));
  const close = iconButton('close', 'Chiudi cronologia');
  close.addEventListener('click', () => { runtime.historyOpen = false; runtime.render(); });
  top.append(copy, close);
  drawer.append(top, renderConversationLibrary(runtime, true));
  overlay.append(drawer);
  return overlay;
}

let isCreatingConversation = false;
function triggerNewConversation(runtime: UiRuntime, provider: ProviderId): void {
  if (isCreatingConversation) return;
  isCreatingConversation = true;
  setTimeout(() => { isCreatingConversation = false; }, 600);
  runtime.historyOpen = false;
  runtime.render();
  runtime.post({ type: 'newConversation', payload: { provider } });
}

function renderConversationLibrary(runtime: UiRuntime, compact = false): HTMLElement {
  const state = runtime.state!;
  const section = el('section', `conversation-library ${compact ? 'is-drawer' : ''}`);
  if (!compact) {
    const heading = el('div', 'library-heading');
    const copy = el('div');
    copy.append(el('span', 'library-kicker', 'Workspace'), el('h2', '', 'Conversazioni'));
    const add = iconButton('plus', 'Nuova conversazione', 'library-add');
    add.addEventListener('click', () => triggerNewConversation(runtime, state.conversation.provider));
    heading.append(copy, add);
    section.append(heading);
  } else {
    const add = button('history-new-chat');
    add.append(icon('plus', 15), el('span', '', 'Nuova conversazione'));
    add.addEventListener('click', () => triggerNewConversation(runtime, state.conversation.provider));
    section.append(add);
  }

  const search = el('label', 'library-search');
  search.append(icon('search', 15));
  const input = el('input') as HTMLInputElement;
  input.placeholder = 'Cerca chat';
  input.value = runtime.search;
  input.addEventListener('input', () => { runtime.search = input.value; runtime.render(); });
  search.append(input);
  section.append(search);

  const list = el('div', 'conversation-list');
  const query = runtime.search.trim().toLowerCase();
  const conversations = state.conversations.filter((conversation) => !query || conversation.title.toLowerCase().includes(query));
  const archived = (state.archivedConversations ?? []).filter((conversation) => !query || conversation.title.toLowerCase().includes(query));
  const pinned = conversations.filter((conversation) => conversation.pinned);
  const others = conversations.filter((conversation) => !conversation.pinned);
  if (pinned.length) {
    list.append(el('span', 'list-section-label', 'In evidenza'));
    for (const conversation of pinned) list.append(conversationItem(runtime, conversation));
  }
  if (others.length) {
    list.append(el('span', 'list-section-label', 'Recenti'));
    for (const conversation of others) list.append(conversationItem(runtime, conversation));
  }
  if (archived.length) {
    const archivedDetails = el('details', 'archived-conversations') as HTMLDetailsElement;
    const archivedSummary = el('summary', 'archived-conversations__summary');
    archivedSummary.append(icon('archive', 14), el('span', '', `Archiviate (${archived.length})`), icon('chevronDown', 13));
    archivedDetails.append(archivedSummary);
    const archivedList = el('div', 'archived-conversations__list');
    for (const conversation of archived) archivedList.append(archivedConversationItem(runtime, conversation));
    archivedDetails.append(archivedList);
    list.append(archivedDetails);
  }
  if (!conversations.length && !archived.length) list.append(el('div', 'library-empty', query ? 'Nessun risultato' : 'La cronologia comparirà qui.'));
  section.append(list);

  const footer = el('div', 'library-footer');
  footer.append(el('span', '', state.workspace.name), el('span', '', `${state.conversations.length} chat${(state.archivedConversations ?? []).length ? ` · ${(state.archivedConversations ?? []).length} archiviate` : ''}`));
  section.append(footer);
  return section;
}

function conversationItem(runtime: UiRuntime, conversation: ConversationSummary): HTMLElement {
  const state = runtime.state!;
  const job = conversationJobState(runtime, conversation.id);
  const item = el('div', `conversation-item ${conversation.id === state.conversation.id ? 'is-active' : ''} ${job ? `has-job is-job-${job}` : ''}`);
  const open = button('conversation-item__main');
  open.append(providerGlyph(conversation.provider));
  const copy = el('span', 'conversation-item__copy');
  copy.append(el('strong', '', conversation.title), el('small', '', jobSubtitle(job) ?? `${formatRelativeTime(conversation.updatedAt)} · ${conversation.messageCount} messaggi`));
  open.append(copy);
  if (job) {
    const status = el('span', `conversation-item__status is-${job}`);
    status.title = job === 'running' ? 'Agente al lavoro' : job === 'error' ? 'Terminata con errore' : 'Terminata · da leggere';
    if (job === 'running') status.append(el('span', 'conversation-item__status-pulse'));
    else status.append(icon(job === 'error' ? 'warning' : 'check', 11));
    open.append(status);
  }
  open.addEventListener('click', () => {
    let shouldRender = false;
    if (runtime.historyOpen) {
      runtime.historyOpen = false;
      shouldRender = true;
    }
    if (runtime.unseen[conversation.id]) {
      delete runtime.unseen[conversation.id];
      shouldRender = true;
    }
    if (shouldRender) {
      runtime.render();
    }
    runtime.post({ type: 'selectConversation', payload: { id: conversation.id } });
  });
  item.append(open);

  const menu = el('details', 'conversation-menu');
  const trigger = el('summary', 'conversation-menu__trigger');
  trigger.append(icon('more', 16));
  trigger.title = 'Azioni conversazione';
  menu.append(trigger);
  const actions = el('div', 'conversation-menu__popover');
  actions.append(conversationAction('pin', conversation.pinned ? 'Rimuovi dai preferiti' : 'Metti in evidenza', () => {
    runtime.post({ type: 'pinConversation', payload: { id: conversation.id, pinned: !conversation.pinned } });
  }));
  actions.append(conversationAction('edit', 'Rinomina', () => runtime.post({ type: 'renameConversation', payload: { id: conversation.id } })));
  actions.append(conversationAction('archive', 'Archivia', () => runtime.post({ type: 'archiveConversation', payload: { id: conversation.id, stay: 'history' } })));
  actions.append(conversationAction('trash', 'Elimina definitivamente', () => {
    runtime.post({ type: 'deleteConversation', payload: { id: conversation.id, stay: 'history' } });
  }, true));
  menu.append(actions);
  item.append(menu);
  return item;
}


function archivedConversationItem(runtime: UiRuntime, conversation: ConversationSummary): HTMLElement {
  const item = el('div', 'conversation-item is-archived');
  const main = el('div', 'conversation-item__main');
  main.append(providerGlyph(conversation.provider));
  const copy = el('span', 'conversation-item__copy');
  copy.append(el('strong', '', conversation.title), el('small', '', `${formatRelativeTime(conversation.updatedAt)} · ${conversation.messageCount} messaggi`));
  main.append(copy);
  item.append(main);

  const actions = el('div', 'archived-conversation-actions');
  const restore = iconButton('refresh', 'Ripristina conversazione', 'archived-conversation-action');
  restore.addEventListener('click', () => runtime.post({ type: 'restoreConversation', payload: { id: conversation.id, stay: 'history' } }));
  const remove = iconButton('trash', 'Elimina definitivamente', 'archived-conversation-action is-danger');
  remove.addEventListener('click', () => runtime.post({ type: 'deleteConversation', payload: { id: conversation.id, stay: 'history' } }));
  actions.append(restore, remove);
  item.append(actions);
  return item;
}

type ConversationJobState = 'running' | 'done' | 'error';

function conversationJobState(runtime: UiRuntime, conversationId: string): ConversationJobState | undefined {
  const running = runtime.state!.activeRuns.some((run) =>
    run.conversationId === conversationId
    && run.kind !== 'delegation'
    && !['completed', 'failed', 'cancelled'].includes(run.phase)
  );
  if (running) return 'running';
  if (conversationId === runtime.state!.conversation.id) return undefined;
  return runtime.unseen[conversationId];
}

function jobSubtitle(job: ConversationJobState | undefined): string | undefined {
  if (job === 'running') return 'In esecuzione…';
  if (job === 'done') return 'Completata · da leggere';
  if (job === 'error') return 'Errore · da rivedere';
  return undefined;
}

function activePrimaryRunCount(runtime: UiRuntime): number {
  return runtime.state!.activeRuns.filter((run) =>
    run.kind !== 'delegation' && !['completed', 'failed', 'cancelled'].includes(run.phase)
  ).length;
}

function conversationAction(iconName: Parameters<typeof icon>[0], label: string, action: () => void, danger = false): HTMLElement {
  const control = button(`conversation-menu__item ${danger ? 'is-danger' : ''}`);
  control.append(icon(iconName, 14), el('span', '', label));
  control.addEventListener('click', (event) => {
    event.preventDefault();
    const details = control.closest('details');
    if (details) details.open = false;
    action();
  });
  return control;
}

function renderProjectLibrary(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const section = el('section', 'library-section');
  section.append(libraryTitle('Progetti', 'Workspace locali'));
  const list = el('div', 'simple-library-list');
  const recentProjects = [...state.projects]
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
    .slice(0, 5);
  for (const project of recentProjects) {
    const item = button(`simple-library-item ${project.id === state.workspace.id ? 'is-active' : ''}`);
    const visual = el('span', 'simple-library-item__icon');
    visual.append(icon('folder', 16));
    const copy = el('span');
    copy.append(el('strong', '', project.name), el('small', '', project.isGit ? 'Git' : 'Locale'));
    item.append(visual, copy);
    item.addEventListener('click', () => runtime.post({ type: 'openRecentProject', payload: { path: project.path } }));
    list.append(item);
  }
  section.append(list);
  if (state.projects.length > recentProjects.length) {
    const all = button('library-secondary-action');
    all.append(el('span', '', `Vedi tutti i ${state.projects.length} progetti`), icon('arrowUp', 13));
    all.addEventListener('click', () => runtime.setSection('projects'));
    section.append(all);
  }
  const open = button('library-primary-action');
  open.append(icon('plus', 15), el('span', '', 'Apri un progetto'));
  open.addEventListener('click', () => runtime.post({ type: 'openProject' }));
  section.append(open);
  return section;
}

function renderAgentLibrary(runtime: UiRuntime): HTMLElement {
  const state = runtime.state! as any;
  const local = runtime as any;
  const section = el('section', 'library-section');
  const heading = el('div', 'library-heading');
  const copy = el('div');
  copy.append(el('span', 'library-kicker', 'Orchestration'), el('h2', '', 'Agenti'));
  const add = iconButton('plus', 'Nuovo agente', 'library-add');
  add.addEventListener('click', () => {
    local.agentEditorDraft = undefined;
    local.agentEditorId = undefined;
    runtime.setSection('agents');
    const trigger = document.querySelector<HTMLButtonElement>('.agents-header .button--primary');
    trigger?.click();
  });
  heading.append(copy, add);
  section.append(heading);

  const list = el('div', 'simple-library-list');
  const agents = Array.isArray(state.agents) ? state.agents : [];
  for (const agent of agents.slice(0, 8)) {
    const item = button(`simple-library-item ${agent.enabled ? '' : 'is-muted'}`);
    const visual = el('span', 'simple-library-item__icon');
    visual.append(providerGlyph(agent.provider));
    const rowCopy = el('span');
    rowCopy.append(el('strong', '', agent.name), el('small', '', `${agent.taskCount ?? 0} task · ${agent.globalVisible ? 'globale' : 'progetti'}`));
    item.append(visual, rowCopy);
    item.addEventListener('click', () => {
      local.agentEditorDraft = {
        id: agent.id,
        name: agent.name ?? '',
        bio: agent.bio ?? '',
        provider: agent.provider,
        model: agent.model ?? 'auto',
        reasoning: agent.reasoning ?? 'auto',
        specialization: agent.specialization ?? '',
        instructions: agent.instructions ?? '',
        enabled: agent.enabled !== false,
        canDelegate: Boolean(agent.canDelegate),
        visibleInChat: agent.visibleInChat !== false,
        globalVisible: agent.globalVisible !== false,
        projectIds: [...(agent.projectIds ?? [])],
        mcpServers: (agent.mcpServers ?? []).join(', '),
        isDefault: Boolean(agent.isDefault)
      };
      local.agentEditorId = agent.id;
      runtime.setSection('agents');
    });
    list.append(item);
  }
  if (!agents.length) list.append(el('div', 'library-empty', 'Nessun agente configurato.'));
  section.append(list);
  const manage = button('library-primary-action');
  manage.append(icon('sparkle', 15), el('span', '', agents.length ? 'Gestisci agenti' : 'Crea agente'));
  manage.addEventListener('click', () => runtime.setSection('agents'));
  section.append(manage);
  return section;
}

function renderUsageLibrary(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const section = el('section', 'library-section');
  section.append(libraryTitle('Utilizzo', 'Quote provider'));
  const list = el('div', 'usage-library-list');
  for (const provider of state.providers) {
    const usage = state.usage.find((entry) => entry.provider === provider.id);
    const row = el('div', 'usage-library-item');
    row.append(providerGlyph(provider.id));
    const copy = el('div');
    copy.append(el('strong', '', provider.label), el('span', '', usage?.available ? `${formatPercent(usage.remainingFraction)} disponibile` : 'Non esposto'));
    row.append(copy);
    list.append(row);
  }
  section.append(list);
  const refresh = button(`library-primary-action usage-refresh ${state.usageRefreshing ? 'is-loading' : ''}`);
  refresh.disabled = state.usageRefreshing;
  refresh.append(icon('refresh', 15), el('span', '', state.usageRefreshing ? 'Aggiornamento…' : 'Aggiorna limiti'));
  refresh.addEventListener('click', () => runtime.post({ type: 'refreshUsage' }));
  section.append(refresh);
  return section;
}

function renderRuleLibrary(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const section = el('section', 'library-section');
  const heading = el('div', 'library-heading');
  const copy = el('div');
  copy.append(el('span', 'library-kicker', 'Workspace'), el('h2', '', 'Skills'));
  const add = iconButton('plus', 'Nuova regola', 'library-add');
  add.addEventListener('click', () => {
    runtime.ruleDraft = { id: `draft:${Date.now()}`, name: 'Nuova regola', scope: 'project', projectId: state.workspace.id, providers: ['codex', 'claude', 'antigravity', 'copilot'], priority: 100, enabled: true, path: '', content: '' };
    delete runtime.selectedRuleId;
    runtime.render();
  });
  heading.append(copy, add);
  section.append(heading);
  const grouped = groupRules(state.rules);
  const list = el('div', 'rule-library-list');
  for (const [label, rules] of grouped) {
    list.append(el('span', 'list-section-label', label));
    for (const rule of rules) {
      const item = button(`rule-library-item ${runtime.selectedRuleId === rule.id || (!runtime.selectedRuleId && !runtime.ruleDraft && state.rules[0]?.id === rule.id) ? 'is-active' : ''}`);
      const stateDot = el('span', `rule-state ${rule.enabled ? 'is-enabled' : ''}`);
      const itemCopy = el('span');
      itemCopy.append(el('strong', '', rule.name), el('small', '', rule.providers.length === 4 ? 'Tutti i provider' : rule.providers.map((id) => id === 'claude' ? 'Claude' : id === 'antigravity' ? 'Antigravity' : id === 'copilot' ? 'Copilot' : 'Codex').join(' · ')));
      item.append(stateDot, itemCopy);
      item.addEventListener('click', () => { delete runtime.ruleDraft; runtime.selectedRuleId = rule.id; runtime.render(); });
      list.append(item);
    }
  }
  if (!state.rules.length) list.append(el('div', 'library-empty', 'Nessuna regola configurata.'));
  section.append(list);
  return section;
}


function renderAutomationLibrary(runtime: UiRuntime): HTMLElement {
  const pane = el('section', 'library-section');
  pane.append(el('span', 'eyebrow', 'Programmate'), el('h2', '', 'Automazioni'));
  pane.append(el('p', 'library-copy', `${runtime.state!.automations.filter((item) => item.enabled).length} attive · ${runtime.state!.automations.length} totali`));
  const newAutomation = button('button button--primary button--small', 'Nuova');
  newAutomation.addEventListener('click', () => { (runtime as any).automationDraft = { name: '', prompt: '', projectId: runtime.state!.workspace.id, permission: 'workspace-write', delegationPolicy: 'confirm', schedule: { kind: 'daily', time: '09:00' }, enabled: true, missedPolicy: 'skip' }; runtime.setSection('automations'); });
  pane.append(newAutomation);
  return pane;
}

function renderMcpLibrary(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const section = el('section', 'library-section');
  section.append(libraryTitle('MCP', 'Server context protocol'));
  const groups = new Map<string, number>();
  for (const server of state.mcp.servers) groups.set(server.provider, (groups.get(server.provider) ?? 0) + 1);
  const list = el('div', 'simple-library-list');
  for (const provider of state.providers.filter((entry) => entry.available)) {
    const item = el('div', 'simple-library-item is-static');
    const visual = el('span', 'simple-library-item__icon');
    visual.append(providerGlyph(provider.id));
    const copy = el('span');
    copy.append(el('strong', '', provider.label), el('small', '', `${groups.get(provider.id) ?? 0} server`));
    item.append(visual, copy);
    list.append(item);
  }
  section.append(list);
  const add = button('library-primary-action');
  add.append(icon('plus', 15), el('span', '', 'Aggiungi MCP'));
  add.addEventListener('click', () => {
    (runtime as any).mcpEditorDraft = { name: '', transport: 'stdio', target: '', scope: 'project', providers: [] };
    runtime.setSection('mcp');
  });
  section.append(add);
  return section;
}

function renderRemoteLibrary(runtime: UiRuntime): HTMLElement {
  const remote = (runtime.state! as any).remoteAccess ?? { enabled: false, activeSessions: [] };
  const section = el('section', 'mini-library');
  section.append(el('span', 'library-kicker', 'LAN'), el('h2', '', 'Remoto'));
  const status = el('div', 'library-metric');
  status.append(el('strong', '', remote.enabled ? 'Attivo' : 'Spento'), el('span', '', remote.enabled ? `${remote.activeSessions?.length ?? 0} connessioni` : 'QR non generato'));
  section.append(status);
  const action = button('button button--secondary remote-library-action', remote.enabled ? 'Nuovo QR' : 'Avvia remoto');
  action.addEventListener('click', () => runtime.post({ type: remote.enabled ? 'rotateRemotePairing' : 'startRemoteAccess' }));
  section.append(action);
  return section;
}

function renderDiagnosticsLibrary(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const section = el('section', 'library-section');
  section.append(libraryTitle('Diagnostica', 'Runtime locale'));
  const list = el('div', 'simple-library-list');
  const errors = state.diagnostics.filter((entry) => entry.level === 'error').length;
  const warnings = state.diagnostics.filter((entry) => entry.level === 'warning').length;
  for (const [title, subtitle, iconName] of [
    ['Eventi sessione', `${state.diagnostics.length} registrati`, 'diagnostics'],
    ['Errori', `${errors} errori · ${warnings} avvisi`, 'warning'],
    ['Run attivi', `${state.activeRuns.length} attivi · ${state.scheduler.queued.length} in coda`, 'gauge']
  ] as const) {
    const item = el('div', 'simple-library-item is-static');
    const visual = el('span', 'simple-library-item__icon');
    visual.append(icon(iconName, 16));
    const copy = el('span');
    copy.append(el('strong', '', title), el('small', '', subtitle));
    item.append(visual, copy);
    list.append(item);
  }
  section.append(list);
  const copyLogs = button('library-primary-action');
  copyLogs.append(icon('copy', 15), el('span', '', 'Copia diagnostica'));
  copyLogs.addEventListener('click', () => runtime.post({ type: 'copyDiagnostics' }));
  section.append(copyLogs);
  return section;
}

function renderSettingsLibrary(runtime: UiRuntime): HTMLElement {
  const section = el('section', 'library-section');
  section.append(libraryTitle('Impostazioni', 'Relay locale'));
  const list = el('div', 'simple-library-list');
  const items = [
    ['settings', 'Generali', 'Default e deleghe'],
    ['sparkle', 'Provider', 'Modelli e thinking'],
    ['diagnostics', 'Installazione', 'CLI e diagnostica']
  ] as const;
  for (const [iconName, title, subtitle] of items) {
    const item = el('div', 'simple-library-item is-static');
    const visual = el('span', 'simple-library-item__icon');
    visual.append(icon(iconName, 16));
    const copy = el('span');
    copy.append(el('strong', '', title), el('small', '', subtitle));
    item.append(visual, copy);
    list.append(item);
  }
  section.append(list);
  const setup = button('library-primary-action');
  setup.append(icon('refresh', 15), el('span', '', 'Riapri onboarding'));
  setup.addEventListener('click', () => runtime.post({ type: 'showOnboarding' }));
  section.append(setup);
  return section;
}

function libraryTitle(title: string, subtitle: string): HTMLElement {
  const heading = el('div', 'library-heading');
  const copy = el('div');
  copy.append(el('span', 'library-kicker', subtitle), el('h2', '', title));
  heading.append(copy);
  return heading;
}

function groupRules(rules: RuleDocument[]): Array<[string, RuleDocument[]]> {
  const active = rules.filter((rule) => rule.enabled);
  const inactive = rules.filter((rule) => !rule.enabled);
  const groups: Array<[string, RuleDocument[]]> = [];
  if (active.length) groups.push(['Attive', active]);
  if (inactive.length) groups.push(['Disattivate', inactive]);
  return groups;
}

function renderToast(runtime: UiRuntime): HTMLElement {
  const toast = el('div', `toast toast--${runtime.toast!.level}`);
  const visual = el('span', 'toast__icon');
  visual.append(icon(runtime.toast!.level === 'error' ? 'warning' : runtime.toast!.level === 'warning' ? 'warning' : 'check', 17));
  toast.append(visual, el('span', '', runtime.toast!.message));
  const close = iconButton('close', 'Chiudi', 'toast__close');
  close.addEventListener('click', () => { delete runtime.toast; runtime.render(); });
  toast.append(close);
  return toast;
}
