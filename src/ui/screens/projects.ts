import type { ConversationSummary, ProjectRecord } from '../../core/types.js';
import { button, el, formatRelativeTime, icon, providerGlyph } from '../dom.js';
import type { UiRuntime } from '../types.js';

const PAGE_SIZE = 5;
const CHAT_PREVIEW_LIMIT = 4;

export function renderProjects(runtime: UiRuntime): HTMLElement {
  const state = runtime.state!;
  const page = el('section', 'content-page projects-page projects-page--compact');
  const header = el('header', 'page-header projects-header');
  const copy = el('div');
  copy.append(el('span', 'eyebrow', 'Workspace'), el('h1', '', 'Progetti'));
  copy.append(el('p', '', 'Apri un progetto, riprendi una chat o creane una nuova.'));
  const open = button('button button--primary');
  open.append(icon('folder', 16), el('span', '', 'Apri progetto'));
  open.addEventListener('click', () => runtime.post({ type: 'openProject' }));
  header.append(copy, open);
  page.append(header);

  const search = el('label', 'projects-search');
  search.append(icon('search', 15));
  const input = el('input') as HTMLInputElement;
  input.placeholder = 'Cerca progetto';
  input.value = runtime.projectSearch;
  input.addEventListener('input', () => {
    runtime.projectSearch = input.value;
    runtime.projectsVisibleLimit = PAGE_SIZE;
    runtime.render();
  });
  search.append(input);
  page.append(search);

  const query = runtime.projectSearch.trim().toLowerCase();
  const projects = [...state.projects]
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
    .filter((project) => !query || project.name.toLowerCase().includes(query) || project.path.toLowerCase().includes(query));
  const visible = projects.slice(0, runtime.projectsVisibleLimit);

  const list = el('div', 'projects-list projects-list--collapsed');
  for (const project of visible) {
    list.append(renderProject(runtime, project, state.projectConversations[project.id] ?? []));
  }
  if (!projects.length) {
    const empty = el('div', 'projects-empty');
    empty.append(icon('folder', 22), el('strong', '', query ? 'Nessun progetto trovato' : 'Nessun progetto recente'));
    empty.append(el('span', '', query ? 'Prova un nome o un percorso diverso.' : 'Apri una cartella per iniziare.'));
    list.append(empty);
  }
  page.append(list);

  if (visible.length < projects.length) {
    const more = button('projects-load-more');
    more.append(el('span', '', `Carica altri ${Math.min(PAGE_SIZE, projects.length - visible.length)}`), icon('chevronDown', 14));
    more.addEventListener('click', () => {
      runtime.projectsVisibleLimit += PAGE_SIZE;
      runtime.render();
    });
    page.append(more);
  }
  return page;
}

function renderProject(runtime: UiRuntime, project: ProjectRecord, conversations: ConversationSummary[]): HTMLElement {
  const current = project.id === runtime.state!.workspace.id;
  const expanded = runtime.expandedProjects.has(project.id);
  const card = el('section', `project-row project-row--compact ${current ? 'is-current' : ''} ${expanded ? 'is-expanded' : ''}`);

  const top = el('div', 'project-row__top');

  const identity = button('project-row__identity project-row__identity--button');
  identity.title = expanded ? 'Comprimi progetto' : 'Espandi progetto';
  const visual = el('span', 'project-row__visual');
  visual.append(icon('folder', 18));
  const projectCopy = el('span', 'project-row__copy');
  const titleLine = el('span', 'project-row__title-line');
  titleLine.append(el('strong', '', project.name));
  if (current) titleLine.append(el('span', 'project-current-indicator', 'Aperto'));
  projectCopy.append(titleLine, el('small', 'project-row__path', project.path));
  const meta = el('span', 'project-row__meta');
  meta.append(el('span', '', project.isGit ? 'Git' : 'Locale'));
  meta.append(el('span', '', `${conversations.length} chat`));
  meta.append(el('span', '', formatRelativeTime(project.lastOpenedAt)));
  projectCopy.append(meta);
  identity.append(visual, projectCopy);
  identity.addEventListener('click', () => {
    if (expanded) runtime.expandedProjects.delete(project.id);
    else runtime.expandedProjects.add(project.id);
    runtime.render();
  });
  top.append(identity);

  const actions = el('div', 'project-row__actions');

  if (current && runtime.state!.privacyShieldSetup.provisioned) {
    const shieldMenu = el('details', 'project-privacy-menu');
    shieldMenu.addEventListener('click', (event) => event.stopPropagation());

    const resolved = project.privacyShieldOverride && project.privacyShieldOverride !== 'inherit'
      ? project.privacyShieldOverride === 'on'
      : runtime.state!.preferences.privacyShield;
    const status = resolved ? (project.privacyShieldComplete ? 'Protezione completa' : 'Copertura parziale') : 'Disattivo';
    const statusClass = resolved ? (project.privacyShieldComplete ? 'is-complete' : 'is-partial') : 'is-off';

    const trigger = el('summary', `project-privacy-trigger ${statusClass}`);
    trigger.title = `Privacy Shield: ${status}`;
    trigger.setAttribute('aria-label', `Privacy Shield: ${status}`);
    trigger.append(icon('shield', 14));
    shieldMenu.append(trigger);

    const popover = el('div', 'project-privacy-popover');
    const header = el('div', 'project-privacy-popover__header');
    header.append(
      el('strong', '', 'Privacy Shield'),
      el('span', `project-privacy-popover__status ${statusClass}`, status)
    );
    popover.append(header);

    const options = el('div', 'project-privacy-popover__options');
    const globalDefaultText = runtime.state!.preferences.privacyShield ? 'Attivo' : 'Disattivo';
    for (const option of [
      { value: 'inherit', label: `Eredita (${globalDefaultText})` },
      { value: 'on', label: 'Sempre attivo' },
      { value: 'off', label: 'Sempre disattivo' }
    ]) {
      const isSelected = (project.privacyShieldOverride ?? 'inherit') === option.value;
      const optBtn = button(`project-privacy-popover__option ${isSelected ? 'is-selected' : ''}`);
      optBtn.append(el('span', '', option.label));
      if (isSelected) {
        optBtn.append(icon('check', 13));
      }
      optBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        shieldMenu.removeAttribute('open');
        runtime.post({ type: 'updateProjectPrivacyShield', payload: { projectId: project.id, override: option.value } });
      });
      options.append(optBtn);
    }
    popover.append(options);
    shieldMenu.append(popover);
    actions.append(shieldMenu);
  }

  if (current) {
    const rules = button('project-row__rules icon-button');
    rules.append(icon('rules', 14));
    rules.title = 'Regole del progetto';
    rules.setAttribute('aria-label', 'Regole del progetto');
    rules.addEventListener('click', (event) => {
      event.stopPropagation();
      runtime.setSection('rules');
    });
    actions.append(rules);
  }

  const quick = button('project-row__quick-add icon-button');
  quick.append(icon('plus', 14));
  quick.title = `Nuova chat in ${project.name}`;
  quick.setAttribute('aria-label', `Nuova chat in ${project.name}`);
  quick.addEventListener('click', (event) => {
    event.stopPropagation();
    if (current) runtime.post({ type: 'newConversation', payload: { provider: runtime.state!.conversation.provider } });
    else runtime.post({ type: 'openRecentProject', payload: { path: project.path, newConversation: true } });
  });
  actions.append(quick);

  const expandBtn = button('project-row__expand icon-button');
  expandBtn.append(icon('chevronDown', 15));
  expandBtn.title = expanded ? 'Comprimi' : 'Espandi';
  expandBtn.setAttribute('aria-label', expanded ? 'Comprimi' : 'Espandi');
  expandBtn.setAttribute('aria-expanded', String(expanded));
  expandBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (expanded) runtime.expandedProjects.delete(project.id);
    else runtime.expandedProjects.add(project.id);
    runtime.render();
  });
  actions.append(expandBtn);

  top.append(actions);
  card.append(top);

  if (expanded) {
    const chats = el('div', 'project-chat-list project-chat-list--compact');
    const visible = conversations.slice(0, CHAT_PREVIEW_LIMIT);
    if (visible.length) {
      for (const conversation of visible) chats.append(renderConversation(runtime, project, conversation, current));
      if (conversations.length > CHAT_PREVIEW_LIMIT) {
        const history = button('project-chat-more');
        history.append(el('span', '', `Vedi tutte le ${conversations.length} conversazioni`), icon('arrowUp', 13));
        history.addEventListener('click', () => {
          if (!current) {
            runtime.post({ type: 'openRecentProject', payload: { path: project.path, openHistory: true } });
            return;
          }
          runtime.historyOpen = true;
          runtime.render();
        });
        chats.append(history);
      }
    } else {
      chats.append(el('div', 'project-chat-empty', 'Nessuna conversazione. Usa + per iniziare.'));
    }
    card.append(chats);
  }
  return card;
}

function renderConversation(runtime: UiRuntime, project: ProjectRecord, conversation: ConversationSummary, interactive: boolean): HTMLElement {
  const item = el('div', `project-chat-item ${interactive ? '' : 'is-preview'}`);
  const open = button('project-chat-item__main');
  open.append(providerGlyph(conversation.provider));
  const copy = el('span', 'project-chat-item__copy');
  copy.append(el('strong', '', conversation.title));
  copy.append(el('small', '', `${conversation.messageCount} messaggi · ${formatRelativeTime(conversation.updatedAt)}`));
  open.append(copy);
  open.addEventListener('click', () => {
    if (!interactive) {
      runtime.post({ type: 'openRecentProject', payload: { path: project.path, conversationId: conversation.id } });
      return;
    }
    runtime.post({ type: 'selectConversation', payload: { id: conversation.id } });
    runtime.setSection('chat');
  });
  item.append(open);
  const remove = button('project-chat-item__delete');
  remove.append(icon('trash', 13));
  remove.title = 'Elimina conversazione';
  remove.setAttribute('aria-label', 'Elimina conversazione');
  remove.addEventListener('click', () => {
    runtime.post({ type: 'deleteConversation', payload: { id: conversation.id, projectId: project.id, stay: 'projects' } });
  });
  item.append(remove);
  return item;
}
