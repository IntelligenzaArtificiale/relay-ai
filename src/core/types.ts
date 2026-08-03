export type ProviderId = 'codex' | 'claude' | 'antigravity' | 'copilot';
export type DelegationProvider = ProviderId | 'auto';
export type RemoteAccessMode = 'lan' | 'funnel' | 'tailnet';
export type RunPermission = 'read-only' | 'workspace-write' | 'danger-full-access';
export type DelegationPolicy = 'confirm' | 'automatic' | 'disabled';
export type TaskComplexity = 'light' | 'standard' | 'complex';

export type ProviderHealthState =
  | 'disconnected'
  | 'detecting'
  | 'not-installed'
  | 'installed'
  | 'launchable'
  | 'needs-login'
  | 'degraded'
  | 'rate-limited'
  | 'ready'
  | 'unavailable';

export type ProviderFailureCategory =
  | 'not-installed'
  | 'launch-failed'
  | 'authentication'
  | 'model-discovery'
  | 'rate-limit'
  | 'permission-denied'
  | 'timeout'
  | 'payload-too-large'
  | 'protocol'
  | 'unknown';

export type RecoveryAction =
  | 'retry'
  | 'open-login'
  | 'configure-path'
  | 'refresh-models'
  | 'review-permissions'
  | 'continue-other-provider'
  | 'repair-with-provider'
  | 'copy-diagnostics';

export interface ProviderFailure {
  provider: ProviderId;
  category: ProviderFailureCategory;
  message: string;
  technicalDetail?: string;
  retryable: boolean;
  resetAt?: string;
  suggestedActions: RecoveryAction[];
}

export interface ProviderProbeResult {
  id: 'resolve' | 'version' | 'launch' | 'authentication' | 'models' | 'smoke';
  ok: boolean;
  startedAt: string;
  durationMs: number;
  message: string;
  detail?: string;
}

export interface ProviderRecoveryBundle {
  incidentId: string;
  targetProvider: ProviderId;
  createdAt: string;
  environment: { platform: string; arch: string; editor: string; remoteName?: string };
  configuredExecutable?: string;
  resolvedExecutable?: string;
  resolutionSource?: string;
  relevantPathEntries: string[];
  healthState: ProviderHealthState;
  probes: ProviderProbeResult[];
  models: string[];
  probableRelayFiles: string[];
  technicalDetail: string;
  constraints: string[];
}

export interface ReasoningOption { id: string; label: string; description?: string }
export interface ModelOption {
  id: string;
  label: string;
  description?: string;
  family?: string;
  reasoning: ReasoningOption[];
  defaultReasoning?: string;
  isDefault?: boolean;
  hidden?: boolean;
}

export interface ProviderCapabilities {
  streaming?: boolean;
  sessions?: boolean;
  modelSelection?: boolean;
  reasoningSelection?: boolean;
  usageReporting?: boolean;
  fileEditing?: boolean;
  browser?: boolean;
  mcp?: boolean;
  [key: string]: unknown;
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  available: boolean;
  executable: string;
  configuredExecutable?: string;
  resolutionSource?: string;
  setupState?: string;
  setupInProgress?: boolean;
  setupProgress?: string;
  setupError?: string;
  installAvailable?: boolean;
  authenticated?: boolean;
  connected?: boolean;
  cliAvailable?: boolean;
  nativeBridgeAvailable?: boolean;
  version?: string;
  plan?: string;
  detail?: string;
  models: ModelOption[];
  capabilities?: ProviderCapabilities;
  healthState?: ProviderHealthState;
  probes?: ProviderProbeResult[];
  operational?: boolean;
  lastCheckedAt?: string;
  failure?: ProviderFailure;
}

export interface UsageBucket {
  id: string;
  label: string;
  kind?: 'session' | 'five-hour' | 'daily' | 'weekly' | 'monthly' | 'other';
  group?: string;
  remainingFraction?: number;
  usedFraction?: number;
  used?: number;
  limit?: number;
  unit?: 'credits' | 'requests' | 'tokens' | string;
  resetsAt?: string;
  reached?: boolean;
}

export interface UsageSnapshot {
  provider: ProviderId;
  available: boolean;
  remainingFraction?: number;
  usedFraction?: number;
  resetsAt?: string;
  plan?: string;
  detail?: string;
  lastError?: string;
  source?: 'native-api' | 'provider' | 'provider-reported' | 'cache' | 'estimate' | 'unavailable' | string;
  confidence?: 'exact' | 'provider-reported' | 'estimated' | 'unknown' | string;
  updatedAt: string;
  lastSuccessfulAt?: string;
  stale?: boolean;
  buckets?: UsageBucket[];
  tokenSummary?: {
    lifetimeTokens?: number;
    peakDailyTokens?: number;
    currentStreakDays?: number;
    longestRunningTurnSeconds?: number;
  };
}

export interface RemoteSessionSummary { id: string; name: string; address: string; userAgent?: string; pairedAt: string; lastSeenAt: string }
export interface RemoteAccessSnapshot { enabled: boolean; mode?: RemoteAccessMode; bindAddress?: string; secure?: boolean; url?: string; qrDataUrl?: string; pairingCode?: string; pairingExpiresAt?: string; pairingId?: string; ticketUsed?: boolean; port?: number; host?: string; urls?: Array<{ label: string; url: string; address: string }>; diagnostics?: Array<{ level: 'info' | 'warning'; title: string; detail: string }>; activeSessions: RemoteSessionSummary[]; sessionHistory?: unknown[]; tunnel?: import('../services/tunnel-manager.js').TailscaleTunnelSnapshot; lastError?: string; startedAt?: string; platform: string; computerName: string }


export interface RelayPreferences {
  defaultProvider: ProviderId;
  delegationPolicy: DelegationPolicy;
  quotaPolicy: 'balanced' | 'preserve' | 'unrestricted';
  usageAutoRefreshMinutes: number;
  exposeUsageToAgents: boolean;
  quotaWarningThreshold: number;
  quotaCriticalThreshold: number;
  onboardingVersion: number;
  disconnectedProviders: ProviderId[];
  remoteAccessMode?: RemoteAccessMode;
  remoteAccessPublicPort?: number;
  remoteAccessLocalPort?: number;
  remoteAccessDnsName?: string;
  remoteAccessAutoStart?: boolean;
  providerDefaults: Record<ProviderId, { model: string; reasoning: string; permission: RunPermission; delegationModel: string }>;
}

export interface ProjectRecord { id: string; path: string; name: string; isGit: boolean; lastOpenedAt: string; githubUrl?: string }
export interface WorkspaceContextItem { kind: 'file' | 'directory'; relativePath: string; name?: string; path?: string }
export interface DiagnosticEntry { id: string; level: 'info' | 'warning' | 'error'; scope: string; message: string; createdAt?: string; timestamp?: string; provider?: ProviderId; runId?: string; conversationId?: string; detail?: string }

export interface SkillPublicationConfig {
  enabled: boolean;
  providers: ProviderId[];
  lastSyncAt?: string;
}

export interface RuleDocument {
  id: string;
  name: string;
  content: string;
  scope: 'global' | 'project';
  providers: ProviderId[];
  priority: number;
  mandatory?: boolean;
  enabled: boolean;
  path: string;
  source?: 'user' | 'bundled' | 'imported';
  updatedAt?: string;
  projectId?: string;
  description?: string;
  provider?: ProviderId | 'all';
  skillPublication?: SkillPublicationConfig;
}

export interface McpTemplateDef {
  id: string;
  name: string;
  vendor: string;
  description: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  target?: string;
  supportedProviders: ProviderId[];
  setupState: 'ready' | 'setup-required' | 'error';
}

export const MCP_TEMPLATES: McpTemplateDef[] = [
  {
    id: 'chrome-devtools',
    name: 'Browser',
    vendor: 'Google Chrome DevTools',
    description: 'Automazione ed ispezione del browser visibile tramite Chrome DevTools MCP.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@1.6.0', '--no-usage-statistics', '--no-performance-crux'],
    target: 'npx -y chrome-devtools-mcp@1.6.0 --no-usage-statistics --no-performance-crux',
    supportedProviders: ['codex', 'claude', 'antigravity'],
    setupState: 'setup-required'
  }
];

export type McpTransport = 'http' | 'stdio';
export type McpScope = 'global' | 'project';
export type McpAuthType = 'none' | 'bearer' | 'headers' | 'oauth';
export interface McpServerRecord {
  provider: ProviderId;
  name: string;
  transport: McpTransport;
  target: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  bearerToken?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  scope: McpScope;
  enabled: boolean;
  status?: 'connected' | 'failed' | 'unknown';
  statusDetail?: string;
  sourcePath?: string;
  authType?: McpAuthType;
  protocolVersion?: string;
  lastTestedAt?: string;
  lastError?: string;
}

export type AutomationSchedule =
  | { kind: 'interval'; everyMinutes: number; activeFrom?: string; activeTo?: string }
  | { kind: 'daily'; time: string; activeFrom?: string; activeTo?: string }
  | { kind: 'weekly'; days: number[]; time: string; activeFrom?: string; activeTo?: string }
  | { kind: 'once'; at: string; activeFrom?: string; activeTo?: string };

export interface AutomationRunRecord {
  at: string;
  outcome: 'ok' | 'error' | 'skipped';
  conversationId?: string;
  detail?: string;
}

export interface RelayAutomation {
  id: string;
  name: string;
  prompt: string;
  projectId: string | null;
  provider?: ProviderId;
  agentId?: string;
  permission: RunPermission;
  delegationPolicy: DelegationPolicy;
  schedule: AutomationSchedule;
  enabled: boolean;
  lastRun?: AutomationRunRecord;
  history?: AutomationRunRecord[];
  nextRunAt?: string;
  missedPolicy: 'skip' | 'catchUpOnce';
  createdAt: string;
  updatedAt: string;
}

export type ConversationArtifactKind = 'file' | 'static-site' | 'local-service' | 'bundle';
export interface ConversationArtifact {
  id: string;
  kind: ConversationArtifactKind;
  name: string;
  relativePath?: string;
  localUrl?: string;
  files?: string[];
  mimeType?: string;
  size?: number;
  createdAt: string;
}
export type ConversationMentionKind = 'agent' | 'file' | 'skill' | 'mcp';
export interface ConversationMention {
  kind: ConversationMentionKind;
  entityId: string;
  label: string;
  rawText: string;
  start: number;
  endExclusive: number;
  resolvedValue: string;
}
export interface ConversationMessage { id: string; role: 'user' | 'assistant'; text: string; createdAt: string; provider?: ProviderId; runId?: string; model?: string; reasoning?: string; error?: boolean; artifacts?: ConversationArtifact[]; mentions?: ConversationMention[];[key: string]: any }
export interface ConversationSummary { id: string; projectId: string; title: string; provider: ProviderId; pinned?: boolean; archived?: boolean; messageCount: number; updatedAt: string }
export interface ConversationState {
  id: string;
  projectId: string;
  title: string;
  provider: ProviderId;
  permission: RunPermission;
  delegationPolicy: DelegationPolicy;
  model?: string;
  reasoning?: string;
  agentId?: string;
  messages: ConversationMessage[];
  delegations: DelegationRecord[];
  providerSessions?: Partial<Record<ProviderId, string>>;
  pinned?: boolean;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AgentActivity { title: string; detail?: string; createdAt?: string }
export interface ActiveRunState { id: string; conversationId: string; provider: ProviderId; permission: RunPermission; phase: string; status: string; startedAt: string; updatedAt: string; activities: AgentActivity[]; kind?: 'primary' | 'delegation'; rootRunId?: string; parentRunId?: string; taskLabel?: string; depth?: number; model?: string; reasoning?: string; error?: string; failure?: ProviderFailure; heartbeatAt?: string; partialChanges?: string[]; originalPrompt?: string; partialOutput?: string;[key: string]: unknown }

export type AgentEvent =
  | { type: 'status'; runId: string; message: string; phase?: string }
  | { type: 'delta'; runId: string; text: string }
  | { type: 'replace'; runId: string; text: string }
  | { type: 'activity'; runId: string; title: string; detail?: string }
  | { type: 'usage'; runId: string; inputTokens?: number; outputTokens?: number; costUsd?: number }
  | { type: 'diff'; runId: string; diff: string }
  | { type: 'ide-browser-handoff'; runId: string; cwd?: string }
  | { type: 'open-url'; runId: string; url: string; reason?: string }
  | { type: 'error'; runId: string; message: string; failure?: ProviderFailure }
  | { type: 'complete'; runId: string; result: AgentRunResult };

export interface AgentRunRequest { runId: string; provider: ProviderId; prompt: string; cwd: string; permission: RunPermission; model?: string; reasoning?: string; rules?: string; sessionId?: string; signal?: AbortSignal; antigravityMode?: 'cli' | 'browser' }
export interface AgentRunResult { runId: string; provider: ProviderId; text: string; sessionId?: string; model?: string; changedFiles?: string[];[key: string]: unknown }

export interface RelayDelegationTaskRequest { id?: string; provider: DelegationProvider; agent?: string; label?: string; prompt: string; model?: string; reasoning?: string; permission?: RunPermission; complexity?: TaskComplexity; files?: string[]; dependsOn?: string[] }
export interface RelayDelegationRequest { reason?: string; intent?: 'cost' | 'specialist' | 'user-request' | 'parallel'; strategy?: 'parallel' | 'sequential'; tasks: RelayDelegationTaskRequest[] }
export interface DelegationTaskRecord extends RelayDelegationTaskRequest { id: string; provider: ProviderId; permission: RunPermission; status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; startedAt?: string; completedAt?: string; resultText?: string; error?: string; routingReason?: string; changedFiles?: string[]; worktree?: string; branch?: string; agentId?: string }
export interface DelegationRecord { id: string; rootRunId: string; requestedBy: ProviderId; strategy: 'parallel' | 'sequential'; status: 'pending-approval' | 'running' | 'completed' | 'failed' | 'cancelled'; createdAt: string; completedAt?: string; depth: number; tasks: DelegationTaskRecord[]; reason?: string }
export interface PendingDelegation { id: string; conversationId: string; rootRunId: string; requestedBy: ProviderId; strategy: 'parallel' | 'sequential'; tasks: DelegationTaskRecord[]; createdAt: string; reason?: string }
export interface DelegationTaskResult { task: DelegationTaskRecord; result?: AgentRunResult; error?: string }
export interface ParallelTaskInput { id: string; provider: ProviderId; prompt: string; permission: RunPermission; model?: string; reasoning?: string }
