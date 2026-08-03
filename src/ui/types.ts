import type {
  AgentActivity,
  ConversationMention,
  ProviderFailure,
  ProviderId,
  RuleDocument
} from '../core/types.js';
import type { RelayViewState } from '../services/relay-controller.js';

export type SectionId = 'chat' | 'projects' | 'agents' | 'usage' | 'rules' | 'mcp' | 'automations' | 'remote' | 'diagnostics' | 'settings';
export type WorkspaceViewState = RelayViewState;

export interface StreamRun {
  runId: string;
  conversationId: string;
  provider: ProviderId;
  text: string;
  status: string;
  phase: string;
  activities: AgentActivity[];
  startedAt: number;
  error?: string;
  failure?: ProviderFailure;
  model?: string;
  reasoning?: string;
  agentId?: string;
  agentName?: string;
  kind?: 'primary' | 'delegation';
  parentRunId?: string;
  rootRunId?: string;
  taskLabel?: string;
  delegationProtocolHidden?: boolean;
  delegationProtocolBuffer?: string;
}

export interface UiToast {
  id: number;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  localPath?: string;
  previewUrl?: string;
  file?: File;
  error?: string;
  consumed?: boolean;
}

export interface ChatDraft {
  text: string;
  mentions?: ConversationMention[];
  attachments: ChatAttachment[];
  sending?: boolean;
}

export interface SavedChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  localPath: string;
}

export interface UiRuntime {
  state: WorkspaceViewState | null;
  section: SectionId;
  onboardingStep: number;
  search: string;
  selectedRuleId?: string;
  streams: Map<string, StreamRun>;
  drafts: Record<string, ChatDraft>;
  scrollByConversation: Record<string, { top: number; stickToBottom: boolean }>;
  scrollBySection: Partial<Record<SectionId, number>>;
  historyOpen: boolean;
  usageOpen: boolean;
  pendingComposerFocus: boolean;
  pendingFullAccess?: boolean;
  mentionStart?: number;
  expandedPanels: Set<string>;
  expandedProjects: Set<string>;
  projectsVisibleLimit: number;
  projectSearch: string;
  unseen: Record<string, 'done' | 'error'>;
  renderedConversationId?: string;
  ruleDraft?: RuleDocument;
  toast?: UiToast;
  post(message: unknown): void;
  setSection(section: SectionId): void;
  render(): void;
  saveAttachments(attachments: ChatAttachment[]): Promise<SavedChatAttachment[]>;
  [key: string]: unknown;
}
