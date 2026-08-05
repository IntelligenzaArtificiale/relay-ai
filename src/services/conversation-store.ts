import { randomUUID } from 'node:crypto';
import type {
  ConversationMessage,
  ConversationState,
  ConversationSummary,
  DelegationPolicy,
  DelegationRecord,
  ProviderId,
  RunPermission
} from '../core/types.js';
import { AtomicJsonStore } from './atomic-store.js';

interface PersistedState {
  activeConversationId?: string;
  activeConversationByProject?: Record<string, string>;
  conversations: ConversationState[];
}

export class ConversationStore {
  private readonly store: AtomicJsonStore<PersistedState>;
  private migrationPersisted = false;
  private cachedSummaries: {
    active: Record<string, ConversationSummary[]>;
    archived: Record<string, ConversationSummary[]>;
  } | undefined;

  constructor(path: string) {
    this.store = new AtomicJsonStore(path, { activeConversationByProject: {}, conversations: [] });
  }

  invalidateCache(): void {
    this.store.invalidate();
    this.migrationPersisted = false;
    this.cachedSummaries = undefined;
  }

  private async updateStore(updater: (raw: unknown) => PersistedState): Promise<PersistedState> {
    this.cachedSummaries = undefined;
    return this.store.update(updater);
  }

  async getOrCreate(
    projectId: string,
    provider: ProviderId,
    policy: DelegationPolicy,
    permission: RunPermission,
    model?: string,
    reasoning?: string
  ): Promise<ConversationState> {
    const state = await this.migrate(projectId);
    const activeId = state.activeConversationByProject?.[projectId];
    const active = state.conversations.find((conversation) => conversation.id === activeId && !conversation.archived);
    if (active) return active;
    return this.newConversation(projectId, provider, policy, permission, model, reasoning);
  }

  async getActive(projectId: string): Promise<ConversationState | undefined> {
    const state = await this.migrate(projectId);
    const activeId = state.activeConversationByProject?.[projectId];
    return state.conversations.find(
      (conversation) => conversation.id === activeId && conversation.projectId === projectId && !conversation.archived
    );
  }

  async list(projectId: string): Promise<ConversationSummary[]> {
    const state = await this.migrate(projectId);
    return state.conversations
      .filter((conversation) => conversation.projectId === projectId && !conversation.archived)
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt))
      .map((conversation) => ({
        id: conversation.id,
        projectId: conversation.projectId,
        title: conversation.title,
        provider: conversation.provider,
        pinned: Boolean(conversation.pinned),
        archived: Boolean(conversation.archived),
        messageCount: conversation.messages.length,
        updatedAt: conversation.updatedAt
      }));
  }

  async listArchived(projectId: string): Promise<ConversationSummary[]> {
    const state = await this.migrate(projectId);
    return state.conversations
      .filter((conversation) => conversation.projectId === projectId && conversation.archived)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((conversation) => ({
        id: conversation.id,
        projectId: conversation.projectId,
        title: conversation.title,
        provider: conversation.provider,
        pinned: Boolean(conversation.pinned),
        archived: true,
        messageCount: conversation.messages.length,
        updatedAt: conversation.updatedAt
      }));
  }

  async summariesByProject(projectIdForLegacy = ''): Promise<{
    active: Record<string, ConversationSummary[]>;
    archived: Record<string, ConversationSummary[]>;
  }> {
    if (this.cachedSummaries) return this.cachedSummaries;
    const state = await this.migrate(projectIdForLegacy);
    const active: Record<string, ConversationSummary[]> = {};
    const archived: Record<string, ConversationSummary[]> = {};
    for (const conversation of state.conversations) {
      const target = conversation.archived ? archived : active;
      const list = target[conversation.projectId] ?? [];
      list.push(summaryOf(conversation));
      target[conversation.projectId] = list;
    }
    for (const list of Object.values(active)) {
      list.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt));
    }
    for (const list of Object.values(archived)) list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this.cachedSummaries = { active, archived };
    return this.cachedSummaries;
  }

  async read(projectId: string, conversationId: string): Promise<ConversationState | undefined> {
    const state = await this.migrate(projectId);
    return state.conversations.find(
      (conversation) => conversation.id === conversationId && conversation.projectId === projectId && !conversation.archived
    );
  }

  async setActive(projectId: string, conversationId: string): Promise<ConversationState> {
    let selected: ConversationState | undefined;
    await this.updateStore((raw) => {
      const state = normalizeState(raw, projectId);
      selected = state.conversations.find(
        (conversation) => conversation.id === conversationId && conversation.projectId === projectId && !conversation.archived
      );
      if (!selected) throw new Error('Conversation not found for this project.');
      return {
        ...state,
        activeConversationByProject: {
          ...state.activeConversationByProject,
          [projectId]: conversationId
        }
      };
    });
    if (!selected) throw new Error('Unable to activate conversation.');
    return selected;
  }

  async updateSelection(
    projectId: string,
    provider: ProviderId,
    model?: string,
    reasoning?: string,
    permission?: RunPermission,
    agentId?: string
  ): Promise<ConversationState> {
    return this.updateActive(projectId, (conversation) => {
      const updated: ConversationState = {
        ...conversation,
        provider,
        permission: permission ?? conversation.permission,
        updatedAt: new Date().toISOString()
      };
      if (model) updated.model = model;
      else delete updated.model;
      if (reasoning) updated.reasoning = reasoning;
      else delete updated.reasoning;
      if (agentId) (updated as any).agentId = agentId;
      else delete (updated as any).agentId;
      return updated;
    });
  }

  async updateSelectionForConversation(
    projectId: string,
    conversationId: string,
    provider: ProviderId,
    model?: string,
    reasoning?: string,
    permission?: RunPermission,
    agentId?: string
  ): Promise<ConversationState> {
    return this.updateByIdReturning(projectId, conversationId, (conversation) => {
      const updated: ConversationState = { ...conversation, provider, permission: permission ?? conversation.permission, updatedAt: new Date().toISOString() };
      if (model) updated.model = model; else delete updated.model;
      if (reasoning) updated.reasoning = reasoning; else delete updated.reasoning;
      if (agentId) (updated as any).agentId = agentId; else delete (updated as any).agentId;
      return updated;
    });
  }


  async clearProviderSessions(provider: ProviderId): Promise<void> {
    await this.updateStore((raw) => {
      const state = normalizeState(raw, '');
      return {
        ...state,
        conversations: state.conversations.map((conversation) => {
          if (!conversation.providerSessions?.[provider]) return conversation;
          const providerSessions = { ...conversation.providerSessions };
          delete providerSessions[provider];
          return { ...conversation, providerSessions, updatedAt: new Date().toISOString() };
        })
      };
    });
  }

  async setProviderSession(projectId: string, provider: ProviderId, sessionId: string): Promise<ConversationState> {
    return this.updateActive(projectId, (conversation) => ({
      ...conversation,
      providerSessions: {
        ...conversation.providerSessions,
        [provider]: sessionId
      },
      updatedAt: new Date().toISOString()
    }));
  }

  async setProviderSessionForConversation(
    projectId: string,
    conversationId: string,
    provider: ProviderId,
    sessionId: string
  ): Promise<ConversationState> {
    return this.updateByIdReturning(projectId, conversationId, (conversation) => ({
      ...conversation,
      providerSessions: {
        ...conversation.providerSessions,
        [provider]: sessionId
      },
      updatedAt: new Date().toISOString()
    }));
  }

  async append(projectId: string, message: Omit<ConversationMessage, 'id' | 'createdAt'>): Promise<ConversationState> {
    const nextMessage: ConversationMessage = { ...(message as ConversationMessage), id: randomUUID(), createdAt: new Date().toISOString() };
    return this.updateActive(projectId, (conversation) => ({
      ...conversation,
      messages: [...conversation.messages, nextMessage],
      title: conversation.messages.length === 0 && message.role === 'user' && !conversation.title.startsWith('⏱ ')
        ? titleFromMessage(message.text)
        : conversation.title,
      updatedAt: new Date().toISOString()
    }));
  }

  async appendToConversation(
    projectId: string,
    conversationId: string,
    message: Omit<ConversationMessage, 'id' | 'createdAt'>
  ): Promise<ConversationState> {
    const nextMessage: ConversationMessage = { ...(message as ConversationMessage), id: randomUUID(), createdAt: new Date().toISOString() };
    return this.updateByIdReturning(projectId, conversationId, (conversation) => ({
      ...conversation,
      messages: [...conversation.messages, nextMessage],
      title: conversation.messages.length === 0 && message.role === 'user' && !conversation.title.startsWith('⏱ ')
        ? titleFromMessage(message.text)
        : conversation.title,
      updatedAt: new Date().toISOString()
    }));
  }

  async addDelegation(projectId: string, delegation: DelegationRecord): Promise<ConversationState> {
    return this.updateActive(projectId, (conversation) => ({
      ...conversation,
      delegations: [...conversation.delegations, delegation],
      updatedAt: new Date().toISOString()
    }));
  }

  async addDelegationToConversation(
    projectId: string,
    conversationId: string,
    delegation: DelegationRecord
  ): Promise<ConversationState> {
    return this.updateByIdReturning(projectId, conversationId, (conversation) => ({
      ...conversation,
      delegations: [...conversation.delegations, delegation],
      updatedAt: new Date().toISOString()
    }));
  }

  async updateDelegation(
    projectId: string,
    delegationId: string,
    updater: (delegation: DelegationRecord) => DelegationRecord
  ): Promise<ConversationState> {
    return this.updateActive(projectId, (conversation) => ({
      ...conversation,
      delegations: conversation.delegations.map((delegation) => delegation.id === delegationId ? updater(delegation) : delegation),
      updatedAt: new Date().toISOString()
    }));
  }

  async updateDelegationInConversation(
    projectId: string,
    conversationId: string,
    delegationId: string,
    updater: (delegation: DelegationRecord) => DelegationRecord
  ): Promise<ConversationState> {
    return this.updateByIdReturning(projectId, conversationId, (conversation) => ({
      ...conversation,
      delegations: conversation.delegations.map((delegation) => delegation.id === delegationId ? updater(delegation) : delegation),
      updatedAt: new Date().toISOString()
    }));
  }

  async setPermission(projectId: string, permission: RunPermission): Promise<ConversationState> {
    return this.updateActive(projectId, (conversation) => ({
      ...conversation,
      permission,
      updatedAt: new Date().toISOString()
    }));
  }

  async setDelegationPolicy(projectId: string, policy: DelegationPolicy): Promise<ConversationState> {
    return this.updateActive(projectId, (conversation) => ({ ...conversation, delegationPolicy: policy, updatedAt: new Date().toISOString() }));
  }

  async rename(projectId: string, conversationId: string, title: string): Promise<void> {
    const cleaned = title.replace(/\s+/g, ' ').trim().slice(0, 90);
    if (!cleaned) return;
    await this.updateById(projectId, conversationId, (conversation) => ({
      ...conversation,
      title: cleaned,
      updatedAt: new Date().toISOString()
    }));
  }

  async setPinned(projectId: string, conversationId: string, pinned: boolean): Promise<void> {
    await this.updateById(projectId, conversationId, (conversation) => ({
      ...conversation,
      pinned,
      updatedAt: new Date().toISOString()
    }));
  }

  async archive(projectId: string, conversationId: string): Promise<void> {
    await this.updateStore((raw) => {
      const state = normalizeState(raw, projectId);
      const conversations = state.conversations.map((conversation) => conversation.id === conversationId && conversation.projectId === projectId
        ? { ...conversation, archived: true, updatedAt: new Date().toISOString() }
        : conversation);
      const activeConversationByProject = { ...state.activeConversationByProject };
      if (activeConversationByProject[projectId] === conversationId) delete activeConversationByProject[projectId];
      return { ...state, conversations, activeConversationByProject };
    });
  }


  async restore(projectId: string, conversationId: string): Promise<void> {
    await this.updateStore((raw) => {
      const state = normalizeState(raw, projectId);
      const conversations = state.conversations.map((conversation) =>
        conversation.id === conversationId && conversation.projectId === projectId
          ? { ...conversation, archived: false, updatedAt: new Date().toISOString() }
          : conversation
      );
      return { ...state, conversations };
    });
  }

  async delete(projectId: string, conversationId: string): Promise<void> {
    await this.updateStore((raw) => {
      const state = normalizeState(raw, projectId);
      const conversations = state.conversations.filter(
        (conversation) => !(conversation.id === conversationId && conversation.projectId === projectId)
      );
      const activeConversationByProject = { ...state.activeConversationByProject };
      if (activeConversationByProject[projectId] === conversationId) delete activeConversationByProject[projectId];
      return { ...state, conversations, activeConversationByProject };
    });
  }

  async newConversation(
    projectId: string,
    provider: ProviderId,
    policy: DelegationPolicy,
    permission: RunPermission,
    model?: string,
    reasoning?: string,
    agentId?: string,
    activate = true
  ): Promise<ConversationState> {
    const conversation = this.create(projectId, provider, policy, permission, model, reasoning, agentId);
    await this.updateStore((raw) => {
      const state = normalizeState(raw, projectId);
      return {
        ...state,
        activeConversationByProject: activate ? {
          ...state.activeConversationByProject,
          [projectId]: conversation.id
        } : state.activeConversationByProject,
        conversations: [conversation, ...state.conversations]
      };
    });
    return conversation;
  }

  private create(
    projectId: string,
    provider: ProviderId,
    policy: DelegationPolicy,
    permission: RunPermission,
    model?: string,
    reasoning?: string,
    agentId?: string
  ): ConversationState {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      projectId,
      title: 'Nuova conversazione',
      provider,
      permission,
      delegationPolicy: policy,
      messages: [],
      delegations: [],
      createdAt: now,
      updatedAt: now,
      ...(model ? { model } : {}),
      ...(reasoning ? { reasoning } : {}),
      ...(agentId ? { agentId } : {})
    };
  }

  private async updateActive(
    projectId: string,
    updater: (conversation: ConversationState) => ConversationState
  ): Promise<ConversationState> {
    let result: ConversationState | undefined;
    await this.updateStore((raw) => {
      const state = normalizeState(raw, projectId);
      const activeId = state.activeConversationByProject?.[projectId];
      const index = state.conversations.findIndex((conversation) => conversation.id === activeId);
      if (index < 0) throw new Error('No active conversation.');
      const current = state.conversations[index];
      if (!current) throw new Error('Active conversation is invalid.');
      result = updater(current);
      const conversations = [...state.conversations];
      conversations[index] = result;
      return { ...state, conversations };
    });
    if (!result) throw new Error('Conversation update failed.');
    return result;
  }

  private async updateByIdReturning(
    projectId: string,
    conversationId: string,
    updater: (conversation: ConversationState) => ConversationState
  ): Promise<ConversationState> {
    let result: ConversationState | undefined;
    await this.updateStore((raw) => {
      const state = normalizeState(raw, projectId);
      const conversations = state.conversations.map((conversation) => {
        if (conversation.id !== conversationId || conversation.projectId !== projectId) return conversation;
        result = updater(conversation);
        return result;
      });
      return { ...state, conversations };
    });
    if (!result) throw new Error('Conversation not found.');
    return result;
  }

  private async updateById(
    projectId: string,
    conversationId: string,
    updater: (conversation: ConversationState) => ConversationState
  ): Promise<void> {
    await this.store.update((raw) => {
      const state = normalizeState(raw, projectId);
      const conversations = state.conversations.map((conversation) =>
        conversation.id === conversationId && conversation.projectId === projectId ? updater(conversation) : conversation
      );
      return { ...state, conversations };
    });
  }

  private async migrate(projectId: string): Promise<PersistedState> {
    const raw = await this.store.read();
    const normalized = normalizeState(raw, projectId);
    if (!this.migrationPersisted) {
      this.migrationPersisted = true;
      if (JSON.stringify(raw) !== JSON.stringify(normalized)) await this.store.write(normalized);
    }
    return normalized;
  }
}


function summaryOf(conversation: ConversationState): ConversationSummary {
  return {
    id: conversation.id,
    projectId: conversation.projectId,
    title: conversation.title,
    provider: conversation.provider,
    pinned: Boolean(conversation.pinned),
    archived: Boolean(conversation.archived),
    messageCount: conversation.messages.length,
    updatedAt: conversation.updatedAt
  };
}

function normalizeState(raw: unknown, projectId: string): PersistedState {
  const candidate = raw && typeof raw === 'object' ? raw as Partial<PersistedState> : {};
  const activeConversationByProject = candidate.activeConversationByProject && typeof candidate.activeConversationByProject === 'object'
    ? { ...candidate.activeConversationByProject }
    : {};
  const sourceConversations = Array.isArray(candidate.conversations) ? candidate.conversations : [];
  const conversations = sourceConversations.filter((conversation): conversation is ConversationState => Boolean(conversation && typeof conversation === 'object' && typeof conversation.id === 'string')).map((conversation) => ({
    ...conversation,
    projectId: conversation.projectId || projectId,
    permission: conversation.permission ?? 'workspace-write',
    messages: conversation.messages ?? [],
    delegations: conversation.delegations ?? []
  }));
  if (candidate.activeConversationId && !activeConversationByProject[projectId]) {
    const legacy = conversations.find((conversation) => conversation.id === candidate.activeConversationId);
    if (legacy) activeConversationByProject[legacy.projectId] = legacy.id;
  }
  return { activeConversationByProject, conversations };
}

function titleFromMessage(text: string): string {
  const cleaned = text.replace(/[`*_#>]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 62) || 'Nuova conversazione';
}
