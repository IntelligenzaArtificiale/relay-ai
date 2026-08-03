import { randomUUID } from 'node:crypto';
import { delimiter, dirname, join, basename as pathBasename, resolve, relative, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import * as vscode from 'vscode';
import type {
  ActiveRunState,
  ConversationMention,
  DiagnosticEntry,
  AgentEvent,
  AgentRunResult,
  DelegationPolicy,
  DelegationRecord,
  DelegationTaskRecord,
  ParallelTaskInput,
  PendingDelegation,
  ProjectRecord,
  ProviderId,
  ProviderStatus,
  ProviderFailure,
  ModelOption,
  RelayDelegationRequest,
  RelayDelegationTaskRequest,
  TaskComplexity,
  RelayPreferences,
  RuleDocument,
  McpServerRecord,
  McpAuthType,
  RelayAutomation,
  RunPermission,
  UsageSnapshot,
  WorkspaceContextItem,
  RemoteAccessSnapshot,
  RemoteAccessMode
} from '../core/types.js';
import { errorMessage } from '../core/errors.js';
import { CodexProvider } from '../providers/codex-provider.js';
import { ClaudeProvider } from '../providers/claude-provider.js';
import { AntigravityProvider } from '../providers/antigravity-provider.js';
import { CopilotProvider } from '../providers/copilot-provider.js';
import { ProviderRegistry } from './provider-registry.js';
import { buildProviderRecoveryBundle, recoveryCandidates } from './provider-recovery.js';
import { buildRunErrorRecoveryBundle, selectRunRecoveryProvider } from './run-error-recovery.js';
import { classifyProviderFailure } from './provider-failure.js';
import { RunScheduler } from './run-scheduler.js';
import { WorktreeManager, type WorktreeLease } from './worktree-manager.js';
import { RulesEngine } from './rules-engine.js';
import { RuleStore } from './rule-store.js';
import { SkillManager, type SkillImportDraft, type SkillManagerSnapshot } from './skill-manager.js';
import { McpManager, type McpInventorySnapshot } from './mcp-manager.js';
import { AutomationStore, type AutomationDraftInput } from './automation-store.js';
import { AutomationScheduler, computeNextRun } from './automation-scheduler.js';
import { ConversationStore } from './conversation-store.js';
import { PreferencesStore, DEFAULT_PREFERENCES } from './preferences-store.js';
import { ProjectStore, projectId } from './project-store.js';
import { mergeUsageSnapshots, shouldRetryUsageSnapshot, usageRetryDelays } from './usage-state.js';
import { preferredUsageBucket } from './usage-selection.js';
import { clearExecutableResolutionCache, resolveExecutable } from './executable-resolver.js';
import { runCommand } from './command-runner.js';
import { listWorkspaceContext } from './workspace-context.js';
import { AntigravityUsageBridge, type AntigravityBridgeStatus } from './antigravity-usage-bridge.js';
import { AgentStore, type CustomAgentRecord, visibleAgentsForProject, agentToken } from './agent-store.js';
import { AGENT_TEMPLATE_VERSION, instantiateBundledTemplates } from './agent-templates.js';
import { chooseEconomicalTemplateModel, inferDelegationPermission } from './delegation-policy.js';
import { AttachmentStore, type IncomingChatAttachment, type SavedChatAttachment } from './attachment-store.js';
import { RemoteAccessServer } from './remote-access-server.js';
import { discoverRemoteArtifacts } from './remote-artifacts.js';
import { consumePendingExtensionUpdate, installVsixWithFallback, resolveVsixUpdatePath, writePendingExtensionUpdate } from './extension-update.js';
import {
  TunnelManager,
  linuxOperatorCommand,
  tailscaleInstallPlan,
  windowsServiceRestartCommand,
  type TailscaleTunnelSnapshot
} from './tunnel-manager.js';
import {
  componentById,
  componentInstallPlan,
  detectSystemReadiness,
  missingProviderInstallerComponent,
  type SystemComponentId,
  type SystemReadinessSnapshot
} from './system-readiness.js';
import { normalizeRunSelection, resolveDelegationModelSelection } from './model-capabilities.js';
import { inferTaskComplexity, chooseDelegationProvider, chooseDelegationModel, chooseDelegationReasoning, modelTier } from './delegation-router.js';
import { describeVeloCommand, isVeloAvailable, resetVeloAvailabilityCache } from './gdpr-velo.js';
import { ResourceOpenService } from './resource-open-service.js';
import {
  containsDelegationStart,
  delegationProtocolInstructions,
  parseDelegationResponse
} from './delegation-parser.js';

export type RelayOutboundMessage =
  | { type: 'state'; payload: RelayViewState }
  | { type: 'usageState'; payload: { usage: UsageSnapshot[]; usageRefreshing: boolean } }
  | { type: 'agentEvent'; payload: AgentEvent }
  | { type: 'parallelUpdate'; payload: unknown }
  | { type: 'uiCommand'; payload: { action: 'open-chat' | 'focus-composer' | 'open-history' | 'open-projects' | 'open-agents' | 'open-usage' | 'open-remote' | 'close-rule' | 'reset-ui' } }
  | { type: 'notice'; payload: { level: 'info' | 'warning' | 'error'; message: string } }
  | { type: 'skillImportPreview'; payload: SkillImportDraft['preview'] }
  | { type: 'attachmentsSaved'; payload: { requestId: string; files?: SavedChatAttachment[]; error?: string } }
  | { type: 'initializationError'; payload: { message: string; detail?: string } };

export interface RelayViewState {
  workspace: { id: string; name: string; cwd?: string; isGit: boolean };
  projects: ProjectRecord[];
  providers: ProviderStatus[];
  usage: UsageSnapshot[];
  conversation: Awaited<ReturnType<ConversationStore['getOrCreate']>>;
  conversations: Awaited<ReturnType<ConversationStore['list']>>;
  archivedConversations: Awaited<ReturnType<ConversationStore['listArchived']>>;
  rules: RuleDocument[];
  skills: SkillManagerSnapshot;
  mcp: McpInventorySnapshot;
  automations: RelayAutomation[];
  scheduler: ReturnType<RunScheduler['snapshot']>;
  activeRuns: ActiveRunState[];
  pendingDelegations: PendingDelegation[];
  projectConversations: Record<string, Awaited<ReturnType<ConversationStore['list']>>>;
  projectArchivedConversations: Record<string, Awaited<ReturnType<ConversationStore['listArchived']>>>;
  diagnostics: DiagnosticEntry[];
  preferences: RelayPreferences;
  onboardingComplete: boolean;
  usageRefreshing: boolean;
  contextItems: WorkspaceContextItem[];
  antigravityUsageBridge: AntigravityBridgeStatus;
  agents: CustomAgentRecord[];
  remoteAccess: RemoteAccessSnapshot;
  systemReadiness: SystemReadinessSnapshot;
}


interface RootRunContext {
  project: ProjectRecord;
  conversationId: string;
  rootRunId: string;
  provider: ProviderId;
  model?: string;
  reasoning?: string;
  permission: RunPermission;
  originalPrompt: string;
  delegationPolicy: DelegationPolicy;
  sessionId?: string;
  depth: number;
  agentId?: string;
}


interface PendingApprovalState {
  record: PendingDelegation;
  resolve: (approved: boolean) => void;
}

interface ProviderSetupProgress {
  phase: 'installing' | 'login' | 'error';
  message: string;
  detail?: string;
  startedAt: string;
}

interface TrackedTerminalResult {
  exitCode?: number;
  output: string;
  timedOut: boolean;
  tracked: boolean;
}

const ONBOARDING_VERSION = 4;
const ONBOARDING_GLOBAL_KEY = 'relay.onboardingComplete';
const PENDING_PROJECT_ACTION_KEY = 'relay.pendingProjectAction';
const COPILOT_BILLING_TOKEN_KEY = 'relay.copilotBillingToken';
const MAX_DELEGATION_DEPTH = 4;
const MAX_DELEGATION_TASKS = 8;
const MAX_TOTAL_CHILD_RUNS = 16;
const DELEGATION_TAG = '<relay-delegate>';
const AGENT_TEMPLATE_GLOBAL_KEY = 'relay.agentTemplatesVersion';
const GDPR_RULE_ID = 'relay:bundled:gdpr';
const PROJECT_REFRESH_TTL_MS = 30_000;
const STATE_EMIT_DEBOUNCE_MS = 30;

export class RelayController implements vscode.Disposable {
  private registry: ProviderRegistry;
  private registrySubscription: { dispose(): void } | undefined;
  private scheduler: RunScheduler;
  private readonly rulesEngine = new RulesEngine();
  private readonly ruleStore: RuleStore;
  private readonly skillManager: SkillManager;
  private readonly mcpManager: McpManager;
  private readonly automationStore: AutomationStore;
  private readonly automationScheduler: AutomationScheduler;
  private readonly conversationStore: ConversationStore;
  private readonly preferencesStore: PreferencesStore;
  private readonly projectStore: ProjectStore;
  private readonly agentStore: AgentStore;
  private readonly attachmentStore: AttachmentStore;
  private readonly worktrees: WorktreeManager;
  private providers: ProviderStatus[] = [];
  private usage: UsageSnapshot[] = [];
  private rules: RuleDocument[] = [];
  private preferences: RelayPreferences = DEFAULT_PREFERENCES;
  private agents: CustomAgentRecord[] = [];
  private currentProject: ProjectRecord | undefined;
  private readonly activeRuns = new Map<string, ActiveRunState>();
  private readonly resourceOpen = new ResourceOpenService();
  private readonly pendingSkillImports = new Map<string, SkillImportDraft>();
  private readonly pendingApprovals = new Map<string, PendingApprovalState>();
  private readonly listeners = new Set<(message: RelayOutboundMessage) => void>();
  private readonly diagnostics = vscode.window.createOutputChannel('Relay Diagnostics', { log: true });
  private usageTimer: NodeJS.Timeout | undefined;
  private usageRefreshing = false;
  private usageRefreshPromise: Promise<void> | undefined;
  private initialization: Promise<void> | undefined;
  private backgroundInitializationStarted = false;
  private stateRevision = 0;
  private stateEmitTimer: NodeJS.Timeout | undefined;
  private projectRefreshedAt = 0;
  private projectRefreshPath: string | undefined;
  private integrationTail: Promise<void> = Promise.resolve();
  private readonly recoveryIncidents = new Set<ProviderId>();
  private readonly runRecoveryIncidents = new Set<string>();
  private readonly recoveryTargetsByRun = new Map<string, ProviderId>();
  private readonly heartbeatDiagnosticAt = new Map<string, number>();
  private readonly diagnosticRecords: DiagnosticEntry[] = [];
  private readonly antigravityUsageBridge: AntigravityUsageBridge;
  private readonly remoteAccess: RemoteAccessServer;
  private readonly tunnelManager: TunnelManager;
  private tunnelTimer: NodeJS.Timeout | undefined;
  private tunnelOperation: Promise<TailscaleTunnelSnapshot> | undefined;
  private readonly providerSetup = new Map<ProviderId, ProviderSetupProgress>();
  private systemReadiness: SystemReadinessSnapshot = {
    checkedAt: new Date(0).toISOString(), platform: process.platform, arch: process.arch, components: [],
    features: {
      remote: { ready: true, title: 'Accesso remoto', detail: 'Runtime integrato.', missing: [] },
      parallelWrites: { ready: false, title: 'Scritture parallele isolate', detail: 'Controllo non ancora eseguito.', missing: ['git'] },
      browserAutomation: { ready: false, title: 'Browser Agent', detail: 'Controllo non ancora eseguito.', missing: ['browser'] }
    }
  };

  constructor(private readonly context: vscode.ExtensionContext) {
    const storage = context.globalStorageUri.fsPath;
    this.antigravityUsageBridge = new AntigravityUsageBridge(storage);
    this.remoteAccess = new RemoteAccessServer(
      () => this.state(),
      (message) => this.handle(message),
      join(this.context.globalStorageUri.fsPath, 'remote-session-history.json'),
      () => this.emitState(),
      () => this.remoteActionState(),
      async (conversationId, messageId, artifactId) => {
        const project = this.currentProject;
        if (!project?.path) return undefined;
        const conversation = await this.conversationStore.read(project.id, conversationId);
        const message = conversation?.messages.find((entry) => entry.id === messageId);
        const artifact = message?.artifacts?.find((entry) => entry.id === artifactId);
        return artifact ? { workspaceRoot: project.path, artifact } : undefined;
      }
    );
    this.tunnelManager = new TunnelManager({
      openExternal: async (url) => { await vscode.env.openExternal(vscode.Uri.parse(url)); },
      onChanged: () => {
        const snapshot = this.tunnelManager.snapshot();
        void this.remoteAccess.configureExposure(this.remoteMode(), snapshot.baseUrl, snapshot);
        this.emitState();
      }
    });
    this.registry = this.createRegistry();
    this.bindRegistry();
    const maxRuns = vscode.workspace.getConfiguration('relay').get<number>('parallelism.maxRuns', 3);
    this.scheduler = new RunScheduler(this.registry, maxRuns);
    this.ruleStore = new RuleStore(join(storage, 'rules.json'));
    this.skillManager = new SkillManager();
    this.mcpManager = new McpManager({ storagePath: storage });
    this.automationStore = new AutomationStore(join(storage, 'automations.json'));
    this.automationScheduler = new AutomationScheduler({
      store: this.automationStore,
      execute: (automation) => this.executeAutomation(automation),
      onChanged: () => this.emitState()
    });
    this.conversationStore = new ConversationStore(join(storage, 'conversations.json'));
    this.preferencesStore = new PreferencesStore(join(storage, 'preferences.json'));
    this.projectStore = new ProjectStore(join(storage, 'projects.json'));
    this.agentStore = new AgentStore(join(storage, 'agents.json'));
    this.attachmentStore = new AttachmentStore(storage);
    const configuredRoot = vscode.workspace.getConfiguration('relay').get<string>('worktrees.root', '').trim();
    this.worktrees = new WorktreeManager(configuredRoot || join(storage, 'worktrees'));
  }

  onMessage(listener: (message: RelayOutboundMessage) => void): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  openUiSection(section: 'agents' | 'usage' | 'remote'): void {
    this.emit({ type: 'uiCommand', payload: { action: section === 'agents' ? 'open-agents' : section === 'remote' ? 'open-remote' : 'open-usage' } });
  }

  resetUi(): void {
    this.emit({ type: 'uiCommand', payload: { action: 'reset-ui' } });
  }

  async initialize(): Promise<RelayViewState> {
    if (!this.initialization) {
      this.initialization = this.initializeCriticalState().catch((error) => {
        // Never cache a rejected initialization forever: that leaves every
        // future webview on the loading screen even after reinstall/reload.
        this.recordDiagnostic('error', 'startup', `Avvio critico non completato: ${errorMessage(error)}`, {
          detail: error instanceof Error ? error.stack : undefined
        });
      });
    }
    await this.initialization;
    const payload = await this.stateWithRecovery();
    this.startBackgroundInitialization();
    return payload;
  }

  private async initializeCriticalState(): Promise<void> {
    this.recordDiagnostic('info', 'startup', 'Avvio Relay: lettura storage locale.');
    await this.consumePendingUpdateMarker();
    void this.attachmentStore.cleanupExpired().then((removed) => {
      if (removed > 0) this.recordDiagnostic('info', 'attachments', `${removed} allegati temporanei scaduti rimossi.`);
    }).catch((error) => this.recordDiagnostic('warning', 'attachments', `Cleanup allegati non completato: ${errorMessage(error)}`));
    this.preferences = await this.preferencesStore.read().catch((error) => {
      this.recordDiagnostic('warning', 'startup:preferences', `Preferenze non leggibili, uso valori predefiniti: ${errorMessage(error)}`);
      return structuredClone(DEFAULT_PREFERENCES);
    });
    const onboardingRemembered = this.context.globalState.get<boolean>(ONBOARDING_GLOBAL_KEY, false);
    if (onboardingRemembered && this.preferences.onboardingVersion < ONBOARDING_VERSION) {
      this.preferences = await this.preferencesStore.update({ onboardingVersion: ONBOARDING_VERSION }).catch(() => this.preferences);
    } else if (this.preferences.onboardingVersion >= ONBOARDING_VERSION && !onboardingRemembered) {
      await this.context.globalState.update(ONBOARDING_GLOBAL_KEY, true).then(() => undefined, () => undefined);
    }
    this.agents = await this.agentStore.read().catch((error) => {
      this.recordDiagnostic('warning', 'startup:agents', `Agenti non leggibili, continuo con libreria vuota: ${errorMessage(error)}`);
      return [];
    });
    const storedRules = await this.ruleStore.read().catch((error) => {
      this.recordDiagnostic('warning', 'startup:rules', `Regole non leggibili, continuo senza regole: ${errorMessage(error)}`);
      return [];
    });
    this.rules = await this.ensureBundledRules(storedRules);
    await withTimeout(this.refreshProject(true), 4_000, 'Rilevamento progetto').catch((error) => {
      this.recordDiagnostic('warning', 'startup:project', errorMessage(error));
    });
    await withTimeout(this.applyPendingProjectAction(), 4_000, 'Ripristino progetto').catch((error) => {
      this.recordDiagnostic('warning', 'startup:project-action', errorMessage(error));
    });
    // Provider detection is progressive and never blocks first paint. Each
    // provider publishes its own state as soon as its probes complete.
    this.providers = this.registry.currentStatuses().map((provider) => this.applyProviderConnectionState(provider));
    void this.refreshProviders(false).catch((error) => {
      this.recordDiagnostic('warning', 'startup:providers', `${errorMessage(error)}. Relay resta utilizzabile e i controlli possono essere rilanciati.`);
    });
    this.configureUsageTimer();
    this.recordDiagnostic('info', 'startup', 'Stato essenziale pronto; apertura interfaccia.');
  }

  private startBackgroundInitialization(): void {
    if (this.backgroundInitializationStarted) return;
    this.backgroundInitializationStarted = true;
    void (async () => {
      await withTimeout(this.refreshSystemReadiness(false), 15_000, 'Controllo componenti').catch((error) => {
        this.recordDiagnostic('warning', 'startup:readiness', `${errorMessage(error)}. Il controllo potrà essere rilanciato da Diagnostica.`);
      });
      this.emitState();
      await this.restoreRemoteAccessIfNeeded();
      await this.automationScheduler.start().catch((error) => this.recordDiagnostic('warning', 'automations', `Scheduler non avviato: ${errorMessage(error)}`));
      await this.refreshUsage(true).catch((error) => this.recordDiagnostic('warning', 'usage', `Usage refresh failed: ${errorMessage(error)}`));
    })();
  }

  private async stateWithRecovery(): Promise<RelayViewState> {
    try {
      return await withTimeout(this.state(), 10_000, 'Costruzione stato interfaccia');
    } catch (error) {
      this.recordDiagnostic('error', 'startup:state', `Stato completo non disponibile: ${errorMessage(error)}`, {
        detail: error instanceof Error ? error.stack : undefined
      });
      return this.emergencyState();
    }
  }

  private emergencyState(): RelayViewState {
    const project = this.currentProject ?? emptyProject();
    const defaults = this.preferences.providerDefaults[this.preferences.defaultProvider] ?? DEFAULT_PREFERENCES.providerDefaults.codex;
    const conversation = emptyConversation(project.id, this.preferences.defaultProvider, this.preferences.delegationPolicy, defaults.permission, defaults.model, defaults.reasoning);
    return {
      workspace: { id: project.id, name: project.name, ...(project.path ? { cwd: project.path } : {}), isGit: project.isGit },
      projects: project.path ? [project] : [],
      providers: this.providers.map((provider) => this.withSetupProgress(provider)),
      usage: this.usage,
      conversation,
      conversations: [],
      archivedConversations: [],
      rules: this.rulesForProject(project.id),
      skills: { items: [], providers: [] },
      mcp: { servers: [], refreshedAt: new Date(0).toISOString(), errors: [] },
      automations: [],
      scheduler: this.scheduler.snapshot(),
      activeRuns: [...this.activeRuns.values()],
      pendingDelegations: [...this.pendingApprovals.values()].map((entry) => entry.record),
      projectConversations: { [project.id]: [] },
      projectArchivedConversations: { [project.id]: [] },
      diagnostics: this.diagnosticRecords.slice(-250),
      preferences: this.preferences,
      onboardingComplete: this.preferences.onboardingVersion >= ONBOARDING_VERSION || this.context.globalState.get<boolean>(ONBOARDING_GLOBAL_KEY, false),
      usageRefreshing: this.usageRefreshing,
      contextItems: [],
      antigravityUsageBridge: {
        enabled: false,
        settingsPath: join(homedir(), '.gemini', 'antigravity-cli', 'settings.json'),
        cachePath: this.antigravityUsageBridge.cachePath
      },
      agents: this.agents,
      remoteAccess: this.remoteAccess.snapshot(),
      systemReadiness: this.systemReadiness,
    };
  }

  async handle(message: any): Promise<any> {
    try {
      switch (message?.type) {
        case 'initialize':
          this.emit({ type: 'state', payload: await this.initialize() });
          return;
        case 'refreshProviders':
          await this.refreshProviders(true);
          return;
        case 'copyProviderDiagnostics':
          await this.copyProviderDiagnostics(asProviderId(message.payload?.provider));
          return;
        case 'recoverProvider':
          await this.recoverProvider(asProviderId(message.payload?.provider), message.payload?.helper ? asProviderId(message.payload.helper) : undefined);
          return;
        case 'continueFailedRun':
          await this.continueFailedRun(String(message.payload?.runId ?? ''), asProviderId(message.payload?.provider));
          return;
        case 'resolveRunError':
          await this.resolveRunError(String(message.payload?.runId ?? ''));
          return;
        case 'runSystemDoctor':
          await this.runSystemDoctor();
          return;
        case 'refreshSystemReadiness':
          await this.refreshSystemReadiness(true);
          return;
        case 'installSystemComponent':
          await this.installSystemComponent(String(message.payload?.component ?? '') as SystemComponentId);
          return;
        case 'refreshUsage':
          await this.refreshUsage(true);
          return;
        case 'enableAntigravityUsage':
          await this.enableAntigravityUsage();
          return;
        case 'configureCopilotUsage':
          await this.configureCopilotUsage();
          return;
        case 'setRemoteAccessMode':
          await this.setRemoteAccessMode(asRemoteAccessMode(message.payload?.mode));
          return;
        case 'detectRemoteTunnel':
          await this.refreshRemoteTunnel(true, true);
          return;
        case 'installTailscale':
          await this.installTailscale();
          return;
        case 'loginTailscale':
          await this.loginTailscale();
          return;
        case 'activateRemoteTunnel':
          await this.activateRemoteTunnel();
          return;
        case 'remediateRemoteTunnel':
          await this.remediateRemoteTunnel();
          return;
        case 'copyRemoteDiagnostic':
          await this.copyRemoteDiagnostic();
          return;
        case 'recoverRemoteTunnel':
          await this.recoverRemoteTunnel();
          return;
        case 'startRemoteAccess':
          await this.startRemoteAccess();
          return;
        case 'stopRemoteAccess':
          await this.stopRemoteAccess();
          return;
        case 'rotateRemotePairing':
          await this.rotateRemotePairing();
          return;
        case 'closeRemoteSession':
          await this.closeRemoteSession(String(message.payload?.sessionId ?? ''));
          return;
        case 'updateExtensionFromVsix':
          await this.updateExtensionFromVsix(String(message.payload?.path ?? ''), message.payload?.confirmed === true);
          return;
        case 'clearRemoteHistory':
          this.remoteAccess.clearHistory();
          this.emitState();
          this.emit({ type: 'notice', payload: { level: 'info', message: 'Cronologia connessioni remote eliminata.' } });
          return;
        case 'reportUiError':
          this.recordDiagnostic('error', 'webview', String(message.payload?.message ?? 'Errore UI sconosciuto'), { detail: String(message.payload?.stack ?? '') });
          return;
        case 'clearCopilotUsageToken':
          await this.context.secrets.delete(COPILOT_BILLING_TOKEN_KEY);
          await this.refreshProviders(false);
          await this.refreshUsage(true);
          this.emit({ type: 'notice', payload: { level: 'info', message: 'Token GitHub usage rimosso.' } });
          return;
        case 'exportBackup':
          await this.exportBackup();
          return;
        case 'importBackup':
          await this.importBackup();
          return;
        case 'resetAllData':
          await this.resetAllData();
          return;
        case 'saveChatAttachments':
          return await this.saveChatAttachments(message.payload);
        case 'sendMessage':
          await this.sendMessage(message.payload);
          return;
        case 'cancelRun':
          this.cancelRunTree(String(message.payload?.runId ?? ''));
          return;
        case 'newConversation':
          await this.newConversation(asProviderId(message.payload?.provider));
          await this.emitStateNow();
          this.emit({ type: 'uiCommand', payload: { action: 'open-chat' } });
          this.emit({ type: 'uiCommand', payload: { action: 'focus-composer' } });
          return;
        case 'selectConversation':
          await this.conversationStore.setActive(this.requireProject().id, String(message.payload?.id ?? ''));
          await this.emitStateNow();
          this.emit({ type: 'uiCommand', payload: { action: 'open-chat' } });
          return;
        case 'renameConversation':
          await this.renameConversation(String(message.payload?.id ?? ''));
          return;
        case 'archiveConversation':
          await this.archiveConversation(
            String(message.payload?.id ?? ''),
            stringOrUndefined(message.payload?.projectId),
            message.payload?.stay === 'projects' || message.payload?.stay === 'history' ? message.payload.stay : undefined
          );
          return;
        case 'restoreConversation':
          await this.restoreConversation(
            String(message.payload?.id ?? ''),
            stringOrUndefined(message.payload?.projectId),
            message.payload?.stay === 'projects' || message.payload?.stay === 'history' ? message.payload.stay : undefined
          );
          return;
        case 'deleteConversation':
          await this.deleteConversation(
            String(message.payload?.id ?? ''),
            stringOrUndefined(message.payload?.projectId),
            message.payload?.stay === 'projects' || message.payload?.stay === 'history' ? message.payload.stay : undefined
          );
          return;
        case 'pinConversation':
          await this.conversationStore.setPinned(this.requireProject().id, String(message.payload?.id ?? ''), Boolean(message.payload?.pinned));
          this.emitState();
          return;
        case 'setSelection': {
          const provider = asProviderId(message.payload?.provider);
          const project = this.requireProject();
          await this.ensureActiveConversation(provider);
          await this.conversationStore.updateSelection(
            project.id,
            provider,
            stringOrUndefined(message.payload?.model),
            stringOrUndefined(message.payload?.reasoning),
            asPermission(message.payload?.permission)
          );
          this.emitState();
          return;
        }
        case 'setPermission': {
          const project = this.requireProject();
          await this.ensureActiveConversation();
          await this.conversationStore.setPermission(project.id, asPermission(message.payload?.permission));
          this.emitState();
          return;
        }
        case 'setDelegationPolicy': {
          const project = this.requireProject();
          await this.ensureActiveConversation();
          await this.conversationStore.setDelegationPolicy(project.id, asDelegationPolicy(message.payload?.policy));
          this.emitState();
          return;
        }
        case 'approveDelegation':
          this.resolveDelegationApproval(String(message.payload?.id ?? ''), true);
          return;
        case 'rejectDelegation':
          this.resolveDelegationApproval(String(message.payload?.id ?? ''), false);
          return;
        case 'updatePreferences':
          this.preferences = await this.preferencesStore.update(normalizePreferencePatch(message.payload));
          this.configureUsageTimer();
          this.emitState();
          return;
        case 'updateProviderDefaults': {
          const provider = asProviderId(message.payload?.provider);
          this.preferences = await this.preferencesStore.updateProvider(provider, {
            ...(stringOrUndefined(message.payload?.model) ? { model: String(message.payload.model) } : {}),
            ...(stringOrUndefined(message.payload?.reasoning) ? { reasoning: String(message.payload.reasoning) } : {}),
            ...(message.payload?.permission ? { permission: asPermission(message.payload.permission) } : {}),
            ...(stringOrUndefined(message.payload?.delegationModel) ? { delegationModel: String(message.payload.delegationModel) } : {})
          });
          this.emitState();
          return;
        }
        case 'updateAllProviderPermissions': {
          const permission = asPermission(message.payload?.permission);
          this.preferences = await this.preferencesStore.update({
            providerDefaults: {
              codex: { ...this.preferences.providerDefaults.codex, permission },
              claude: { ...this.preferences.providerDefaults.claude, permission },
              antigravity: { ...this.preferences.providerDefaults.antigravity, permission },
              copilot: { ...this.preferences.providerDefaults.copilot, permission }
            }
          });
          this.emitState();
          return;
        }
        case 'selectAgent':
          await this.selectAgent(String(message.payload?.agentId ?? ''));
          return;
        case 'saveAgent':
          await this.saveAgent(message.payload);
          return;
        case 'deleteAgent':
          await this.deleteAgent(String(message.payload?.agentId ?? ''));
          return;
        case 'toggleAgent':
          await this.toggleAgent(String(message.payload?.agentId ?? ''), Boolean(message.payload?.enabled));
          return;
        case 'setDefaultAgent':
          await this.setDefaultAgent(String(message.payload?.agentId ?? ''));
          return;
        case 'toggleAgentProject':
          await this.toggleAgentProject(String(message.payload?.agentId ?? ''));
          return;
        case 'upgradeProvider':
          await this.upgradeProvider(asProviderId(message.payload?.provider));
          return;
        case 'runParallel':
          await this.runParallel(message.payload);
          return;
        case 'saveRule':
          await this.saveRule(message.payload);
          return;
        case 'syncSkills':
          await this.syncSkills();
          return;
        case 'previewSkillImport':
          await this.previewSkillImport(message.payload);
          return;
        case 'confirmSkillImport':
          await this.confirmSkillImport(String(message.payload?.token ?? ''));
          return;
        case 'enableCodexSkills':
          await this.skillManager.enableCodexSkills();
          this.emit({ type: 'notice', payload: { level: 'info', message: 'Supporto skill Codex abilitato. Riavvia Codex per applicare la configurazione.' } });
          this.emitState();
          return;
        case 'openSkillFile':
          await this.openWorkspaceResource(String(message.payload?.path ?? ''));
          return;
        case 'deleteManagedSkill':
          await this.deleteManagedSkill(String(message.payload?.ruleId ?? ''));
          return;
        case 'refreshMcp':
        case 'listMcp':
          this.mcpManager.invalidate();
          this.emitState();
          return;
        case 'toggleMcp':
          await this.mcpManager.toggle({
            provider: asProviderId(message.payload?.provider),
            name: String(message.payload?.name ?? ''),
            scope: message.payload?.scope === 'project' ? 'project' : 'global'
          }, Boolean(message.payload?.enabled), this.currentProject?.path, this.providers);
          this.emitState();
          return;
        case 'addMcp':
          await this.mcpManager.add({
            name: String(message.payload?.name ?? '').trim(),
            transport: message.payload?.transport === 'stdio' ? 'stdio' : 'http',
            target: String(message.payload?.target ?? '').trim(),
            command: stringOrUndefined(message.payload?.command),
            args: cleanAgentArray(message.payload?.args, 100, 1000),
            env: stringMap(message.payload?.env),
            authType: asMcpAuthType(message.payload?.authType),
            headers: stringMap(message.payload?.headers),
            bearerToken: stringOrUndefined(message.payload?.bearerToken),
            oauthClientId: stringOrUndefined(message.payload?.oauthClientId),
            oauthClientSecret: stringOrUndefined(message.payload?.oauthClientSecret),
            scope: message.payload?.scope === 'project' ? 'project' : 'global',
            providers: asRuleProviders(message.payload?.providers)
          }, this.currentProject?.path, this.providers);
          this.emit({ type: 'notice', payload: { level: 'info', message: 'Server MCP verificato e salvato.' } });
          this.emitState();
          return;
        case 'removeMcp':
          await this.mcpManager.remove({
            provider: asProviderId(message.payload?.provider),
            name: String(message.payload?.name ?? ''),
            scope: message.payload?.scope === 'project' ? 'project' : 'global'
          }, this.currentProject?.path, this.providers);
          this.emitState();
          return;
        case 'verifyMcp': {
          const target = stringOrUndefined(message.payload?.target);
          const result = target
            ? await this.mcpManager.verifyConnection({
              target,
              transport: message.payload?.transport === 'stdio' ? 'stdio' : 'http',
              command: stringOrUndefined(message.payload?.command),
              args: cleanAgentArray(message.payload?.args, 100, 1000),
              env: stringMap(message.payload?.env),
              authType: asMcpAuthType(message.payload?.authType),
              headers: stringMap(message.payload?.headers),
              bearerToken: stringOrUndefined(message.payload?.bearerToken),
              oauthClientId: stringOrUndefined(message.payload?.oauthClientId),
              oauthClientSecret: stringOrUndefined(message.payload?.oauthClientSecret)
            })
            : await this.mcpManager.verifyExisting({
              provider: asProviderId(message.payload?.provider),
              name: String(message.payload?.name ?? ''),
              scope: message.payload?.scope === 'project' ? 'project' : 'global'
            }, this.currentProject?.path, this.providers);
          this.emit({ type: 'notice', payload: { level: result.ok ? 'info' : 'warning', message: result.message } });
          this.emitState();
          return;
        }
        case 'listAutomations':
          this.emitState();
          return;
        case 'saveAutomation':
          await this.saveAutomation(message.payload);
          return;
        case 'toggleAutomation':
          await this.toggleAutomation(String(message.payload?.id ?? ''), Boolean(message.payload?.enabled));
          return;
        case 'runAutomationNow': {
          const automationId = String(message.payload?.id ?? '');
          void this.automationScheduler.runNow(automationId).catch((error) => {
            this.recordDiagnostic('error', 'automations', `Esecuzione manuale non riuscita: ${errorMessage(error)}`);
            this.emit({ type: 'notice', payload: { level: 'error', message: `Automazione non riuscita: ${errorMessage(error)}` } });
            this.emitState();
          });
          this.emitState();
          return;
        }
        case 'duplicateAutomation':
          await this.duplicateAutomation(String(message.payload?.id ?? ''));
          return;
        case 'deleteAutomation':
          await this.automationStore.remove(String(message.payload?.id ?? ''));
          await this.automationScheduler.refresh();
          this.emitState();
          return;
        case 'deleteRule':
          await this.deleteRule(String(message.payload?.id ?? ''), Boolean(message.payload?.confirmed));
          return;
        case 'showNotice':
          this.emit({
            type: 'notice',
            payload: {
              level: message.payload?.level === 'error' || message.payload?.level === 'warning' ? message.payload.level : 'info',
              message: String(message.payload?.message ?? '')
            }
          });
          return;
        case 'toggleRule':
          if (String(message.payload?.id) === GDPR_RULE_ID && Boolean(message.payload?.enabled)) {
            await this.ensureGdprVeloReady();
          }
          this.rules = await this.ruleStore.toggle(String(message.payload?.id), Boolean(message.payload?.enabled));
          await this.skillManager.syncAll(this.rules, this.currentProject?.path).catch((error) => this.recordDiagnostic('warning', 'skills', errorMessage(error)));
          this.emitState();
          return;
        case 'installProvider':
          await this.installProvider(asProviderId(message.payload?.provider));
          return;
        case 'openProviderSetup':
          await this.openProviderSetup(asProviderId(message.payload?.provider));
          return;
        case 'disconnectProvider':
          await this.disconnectProvider(asProviderId(message.payload?.provider));
          return;
        case 'connectProvider':
          await this.connectProvider(asProviderId(message.payload?.provider));
          return;
        case 'completeOnboarding':
          this.preferences = await this.preferencesStore.update({ onboardingVersion: ONBOARDING_VERSION });
          await this.context.globalState.update(ONBOARDING_GLOBAL_KEY, true);
          await this.ensureBundledAgentTemplates().catch((error) => {
            this.recordDiagnostic('warning', 'agent-templates', `Template agenti non inizializzati: ${errorMessage(error)}`);
          });
          this.emitState();
          return;
        case 'showOnboarding':
          this.preferences = await this.preferencesStore.update({ onboardingVersion: 0 });
          await this.context.globalState.update(ONBOARDING_GLOBAL_KEY, false);
          this.emitState();
          return;
        case 'openProject':
          await this.openProjectPicker();
          return;
        case 'requestRemoteProjectPicker':
          await this.requestRemoteProjectPicker();
          return;
        case 'requestRemoteProjectOpen':
          await this.requestRemoteProjectOpen(String(message.payload?.path ?? ''));
          return;
        case 'openRecentProject':
          {
            const conversationId = stringOrUndefined(message.payload?.conversationId);
            await this.openRecentProject({
              path: String(message.payload?.path ?? ''),
              newConversation: Boolean(message.payload?.newConversation),
              ...(conversationId ? { conversationId } : {}),
              openHistory: Boolean(message.payload?.openHistory)
            });
          }
          return;
        case 'openRecentProjectConfirm':
          await this.confirmAndOpenRecentProject(String(message.payload?.path ?? ''));
          return;
        case 'openExternalUrl':
          {
            const url = String(message.payload?.url ?? '');
            if (/^https:\/\/github\.com\//i.test(url)) await vscode.env.openExternal(vscode.Uri.parse(url));
          }
          return;
        case 'openFile':
          await this.openWorkspaceResource(String(message.payload?.path ?? ''));
          return;
        case 'openSettings':
          await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:intelligenza-artificiale-italia.relay-agent-workspace');
          return;
        case 'openDiagnostics':
          this.diagnostics.show(true);
          return;
        case 'copyDiagnostics':
          await vscode.env.clipboard.writeText(this.formatDiagnostics());
          this.emit({ type: 'notice', payload: { level: 'info', message: 'Diagnostica copiata negli appunti.' } });
          return;
        case 'exportDiagnostics':
          await this.exportDiagnostics();
          return;
      }
    } catch (error) {
      const messageText = errorMessage(error);
      this.recordDiagnostic('error', 'controller', messageText, { detail: error instanceof Error ? error.stack : undefined });
      this.emit({ type: 'notice', payload: { level: 'error', message: messageText } });
    }
  }

  async runSystemDoctor(): Promise<void> {
    this.recordDiagnostic('info', 'doctor', `Sistema: ${process.platform} ${process.arch}${vscode.env.remoteName ? ` · remoto ${vscode.env.remoteName}` : ''}`);
    clearExecutableResolutionCache();
    await this.refreshProviders(false);
    await this.refreshSystemReadiness(false);
    for (const provider of this.providers) {
      this.recordDiagnostic(
        provider.available && provider.authenticated !== false ? 'info' : 'warning',
        `doctor:${provider.id}`,
        `${provider.label}: ${provider.available ? 'rilevato' : 'non rilevato'}${provider.authenticated === false ? ' · autenticazione richiesta' : ''}`,
        { detail: provider.executable }
      );
    }
    const git = componentById(this.systemReadiness, 'git');
    this.recordDiagnostic(
      git?.state === 'ready' ? 'info' : 'warning',
      'doctor:git',
      git?.state === 'ready' ? (git.version || 'Git rilevato') : 'Git non disponibile',
      { detail: git?.path || git?.detail }
    );
    const browser = componentById(this.systemReadiness, 'browser');
    this.recordDiagnostic(
      browser?.state === 'ready' ? 'info' : 'warning',
      'doctor:browser',
      browser?.state === 'ready' ? 'Browser desktop rilevato' : 'Chrome, Edge o Chromium non rilevato',
      { detail: browser?.path ?? browser?.detail ?? 'Apri il wizard Componenti per installare un browser compatibile.' }
    );
    const project = this.currentProject;
    if (project?.path) {
      this.recordDiagnostic('info', 'doctor:workspace', `Workspace ${project.isGit ? 'Git' : 'locale'} accessibile`, { detail: project.path });
      if (!project.isGit) this.recordDiagnostic('warning', 'doctor:parallelism', 'I writer paralleli verranno serializzati perché il progetto non è un repository Git.');
    }
    const bridge = await this.antigravityUsageBridge.status();
    this.recordDiagnostic(
      bridge.enabled ? 'info' : 'warning',
      'doctor:antigravity-usage',
      bridge.enabled ? 'Bridge utilizzo Antigravity attivo' : 'Bridge utilizzo Antigravity non collegato',
      { detail: bridge.settingsPath }
    );
    const remote = this.remoteAccess.snapshot();
    this.recordDiagnostic(
      remote.tunnel?.state === 'DEGRADED' || remote.tunnel?.state === 'ERROR' ? 'warning' : 'info',
      'doctor:remote-access',
      remote.enabled ? `${remoteModeLabel(this.remoteMode())} attivo${remote.url ? ` su ${remote.url}` : ''}` : `${remoteModeLabel(this.remoteMode())} pronto dalla sezione Remoto.`,
      { detail: `Piattaforma=${remote.platform} · Bind=${remote.bindAddress ?? 'spento'} · Tailscale=${remote.tunnel?.state ?? 'non richiesto'}` }
    );
    this.emitState();
    this.emit({ type: 'notice', payload: { level: 'info', message: 'Controllo sistema completato. Apri Diagnostica per i dettagli.' } });
  }

  private async refreshSystemReadiness(emit = true): Promise<SystemReadinessSnapshot> {
    this.systemReadiness = await detectSystemReadiness(this.providers, vscode.env.remoteName);
    if (emit) {
      this.emitState();
      this.emit({ type: 'notice', payload: { level: 'info', message: 'Componenti e compatibilità ricontrollati.' } });
    }
    return this.systemReadiness;
  }

  private async installSystemComponent(component: SystemComponentId): Promise<void> {
    const readiness = await this.refreshSystemReadiness(false);
    const current = componentById(readiness, component);
    if (!current) throw new Error('Componente di sistema non riconosciuto.');
    if (current.state === 'ready') {
      this.emit({ type: 'notice', payload: { level: 'info', message: `${current.label} è già disponibile.` } });
      return;
    }
    const plan = componentInstallPlan(component, readiness);
    if (!plan) {
      this.emit({ type: 'notice', payload: { level: 'warning', message: `Relay non dispone di un installer automatico sicuro per ${current.label}.` } });
      return;
    }
    const primaryAction = plan.mode === 'terminal' ? 'Apri installer' : 'Apri download';
    const action = await vscode.window.showInformationMessage(
      `Preparare ${plan.label}?`,
      { modal: true, detail: `${plan.detail}${plan.command ? `

Comando:
${plan.command}` : ''}` },
      primaryAction,
      ...(plan.command ? ['Copia comando'] : [])
    );
    if (!action) return;
    if (action === 'Copia comando' && plan.command) {
      await vscode.env.clipboard.writeText(plan.command);
      this.emit({ type: 'notice', payload: { level: 'info', message: `Comando ${plan.label} copiato. Eseguilo nel terminale e poi premi Ricontrolla.` } });
      return;
    }
    if (plan.mode === 'external' && plan.url) {
      await vscode.env.openExternal(vscode.Uri.parse(plan.url));
    } else if (plan.command) {
      const terminal = vscode.window.createTerminal({
        name: `Relay Setup — ${plan.label}`,
        cwd: this.workspacePath() ?? homedir(),
        env: { PATH: enhancedTerminalPath(), Path: enhancedTerminalPath() },
        ...(process.platform === 'win32' ? { shellPath: 'powershell.exe', shellArgs: ['-NoLogo', '-NoExit'] } : {})
      });
      terminal.show(false);
      terminal.sendText(plan.command, true);
    }
    void this.watchSystemComponent(component, plan.label);
    const recheck = await vscode.window.showInformationMessage(
      `${plan.label}: completa l’installazione, poi torna in Relay. Il controllo automatico resta attivo per due minuti.`,
      'Ricontrolla ora'
    );
    if (recheck === 'Ricontrolla ora') await this.refreshSystemReadiness(true);
    else this.emitState();
  }

  private async watchSystemComponent(componentId: SystemComponentId, label: string): Promise<void> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await delay(10_000);
      const readiness = await this.refreshSystemReadiness(false);
      if (componentById(readiness, componentId)?.state !== 'ready') continue;
      this.emitState();
      this.emit({ type: 'notice', payload: { level: 'info', message: `${label} rilevato. Le funzioni collegate sono ora disponibili.` } });
      return;
    }
  }

  private async ensureProviderInstallerRequirements(provider: ProviderId): Promise<boolean> {
    const readiness = await this.refreshSystemReadiness(false);
    const missing = missingProviderInstallerComponent(provider, readiness);
    if (!missing) return true;
    const component = componentById(readiness, missing);
    const action = await vscode.window.showWarningMessage(
      `${providerLabel(provider)} non può essere installato automaticamente: manca ${component?.label ?? missing}.`,
      { modal: true, detail: 'Relay può aprire un wizard guidato. In alternativa installa il componente manualmente e poi torna qui.' },
      'Apri wizard'
    );
    if (action === 'Apri wizard') await this.installSystemComponent(missing);
    return false;
  }

  private async ensureOptionalComponent(componentId: SystemComponentId, context: string): Promise<'ready' | 'continue' | 'cancel'> {
    const readiness = await this.refreshSystemReadiness(false);
    const component = componentById(readiness, componentId);
    if (!component || component.state === 'ready') return 'ready';
    const action = await vscode.window.showWarningMessage(
      `${context}: ${component.label} non è stato rilevato.`,
      { modal: true, detail: `${component.detail}

Puoi aprire il wizard Relay oppure continuare sapendo che la funzione potrebbe richiedere un passaggio manuale.` },
      'Apri wizard',
      'Continua comunque'
    );
    if (action === 'Apri wizard') {
      await this.installSystemComponent(componentId);
      return 'cancel';
    }
    return action === 'Continua comunque' ? 'continue' : 'cancel';
  }

  async refreshProviders(emit = true): Promise<void> {
    if (emit) clearExecutableResolutionCache();
    this.providers = this.registry.currentStatuses().map((provider) => this.applyProviderConnectionState(provider));
    if (emit) this.emitState();
    const detected = await this.registry.detectAll({ force: emit, timeoutMs: 25_000 });
    this.providers = detected.map((provider) => this.applyProviderConnectionState(provider));
    await this.ensureBundledAgentTemplates().catch((error) => {
      this.recordDiagnostic('warning', 'agent-templates', `Template agenti non inizializzati: ${errorMessage(error)}`);
    });
    if (emit) this.emitState();
  }

  private async ensureBundledAgentTemplates(): Promise<void> {
    const installedVersion = this.context.globalState.get<number>(AGENT_TEMPLATE_GLOBAL_KEY, 0);
    if (installedVersion >= AGENT_TEMPLATE_VERSION) return;
    const provider = this.providers.find((entry) => entry.connected !== false && entry.healthState === 'ready')
      ?? this.providers.find((entry) => entry.connected !== false && entry.available);
    if (!provider) return;
    const model = chooseEconomicalTemplateModel(provider.models);
    this.agents = await this.agentStore.ensureTemplates(instantiateBundledTemplates(provider.id, model));
    await this.context.globalState.update(AGENT_TEMPLATE_GLOBAL_KEY, AGENT_TEMPLATE_VERSION);
    this.recordDiagnostic('info', 'agent-templates', `Creati 5 template agenti disattivati con ${provider.label}${model !== 'auto' ? ` · ${model}` : ''}.`);
  }

  async refreshUsage(emit = true): Promise<void> {
    if (this.usageRefreshPromise) {
      if (emit) this.emitUsageState();
      return this.usageRefreshPromise;
    }
    this.usageRefreshing = true;
    if (emit) this.emitUsageState();
    this.usageRefreshPromise = (async () => {
      try {
        const activeProviders = new Set(
          [...this.activeRuns.values()]
            .filter((run) => !['completed', 'failed', 'cancelled'].includes(run.phase))
            .map((run) => run.provider)
        );
        const refreshed = await Promise.all(this.providers.map(async (provider) => {
          if (provider.connected === false) {
            return {
              provider: provider.id,
              available: false,
              detail: 'Provider scollegato da Relay.',
              source: 'unavailable' as const,
              confidence: 'unknown' as const,
              updatedAt: new Date().toISOString()
            };
          }
          if (activeProviders.has(provider.id)) {
            return {
              provider: provider.id,
              available: false,
              detail: 'Aggiornamento rimandato: il provider sta eseguendo un task.',
              source: 'unavailable' as const,
              confidence: 'unknown' as const,
              updatedAt: new Date().toISOString()
            };
          }
          return this.readProviderUsage(provider.id);
        }));
        this.usage = mergeUsageSnapshots(
          this.providers.map((provider) => provider.id),
          this.usage,
          refreshed
        );
      } finally {
        this.usageRefreshing = false;
        this.usageRefreshPromise = undefined;
        if (emit) this.emitUsageState();
      }
    })();
    return this.usageRefreshPromise;
  }

  private async readProviderUsage(provider: ProviderId): Promise<UsageSnapshot> {
    const registered = this.registry.get(provider);
    let snapshot = await registered.getUsage();
    if (provider === 'claude' || !shouldRetryUsageSnapshot(snapshot)) return snapshot;
    for (const waitMs of usageRetryDelays(process.platform)) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      snapshot = await registered.getUsage();
      if (!shouldRetryUsageSnapshot(snapshot)) break;
    }
    return snapshot;
  }

  dispose(): void {
    if (this.usageTimer) clearInterval(this.usageTimer);
    if (this.tunnelTimer) clearInterval(this.tunnelTimer);
    if (this.stateEmitTimer) clearTimeout(this.stateEmitTimer);
    this.automationScheduler.dispose();
    for (const pending of this.pendingApprovals.values()) pending.resolve(false);
    this.pendingApprovals.clear();
    this.registrySubscription?.dispose();
    void this.registry.dispose();
    void this.remoteAccess.dispose();
    this.diagnostics.dispose();
    this.listeners.clear();
  }

  private async saveChatAttachments(payload: any): Promise<{ attachmentsSaved: { requestId: string; files?: SavedChatAttachment[]; error?: string } } | undefined> {
    const requestId = String(payload?.requestId ?? '');
    if (!requestId) return undefined;
    try {
      const raw = Array.isArray(payload?.attachments) ? payload.attachments : [];
      const attachments: IncomingChatAttachment[] = raw.map((entry: any) => {
        const bytes = entry?.bytes instanceof Uint8Array
          ? entry.bytes
          : entry?.bytes instanceof ArrayBuffer
            ? new Uint8Array(entry.bytes)
            : Array.isArray(entry?.bytes)
              ? Uint8Array.from(entry.bytes)
              : new Uint8Array();
        return {
          id: String(entry?.id ?? ''),
          name: String(entry?.name ?? 'allegato'),
          mimeType: String(entry?.mimeType ?? 'application/octet-stream'),
          size: Number(entry?.size ?? bytes.byteLength),
          bytes
        };
      });
      const files = await this.attachmentStore.saveMany(attachments);
      const result = { requestId, files };
      this.emit({ type: 'attachmentsSaved', payload: result });
      return { attachmentsSaved: result };
    } catch (error) {
      const message = errorMessage(error);
      this.recordDiagnostic('warning', 'attachments', message);
      const result = { requestId, error: message };
      this.emit({ type: 'attachmentsSaved', payload: result });
      return { attachmentsSaved: result };
    }
  }

  private async sendMessage(payload: any, options?: { project?: ProjectRecord; conversation?: Awaited<ReturnType<ConversationStore['newConversation']>>; awaitCompletion?: boolean }): Promise<{ runId: string; conversationId: string } | undefined> {
    const project = options?.project ?? this.requireProject();
    const rawPrompt = String(payload?.prompt ?? '').trim();
    if (!rawPrompt) return;
    const explicitlySelectedAgent = this.agentById(String(payload?.agentId ?? ''));
    const displayPrompt = typeof payload?.displayPrompt === 'string' && payload.displayPrompt.trim()
      ? payload.displayPrompt.trim()
      : this.displayAgentMentions(rawPrompt);
    const mentions = normalizeConversationMentions(payload?.mentions, displayPrompt);
    const mentionedAgents = this.resolveAgentMentions(mentions);
    // Selecting an agent from the composer makes it the primary execution entity.
    // Mentioning an agent only exposes a delegation target to the selected provider.
    const requestedAgent = explicitlySelectedAgent;
    const provider = requestedAgent?.provider ?? asProviderId(payload?.provider);
    const prompt = this.normalizeAgentMentions(rawPrompt);
    this.recordDiagnostic('info', 'request', 'Nuova richiesta inviata.', { provider, detail: `cwd=${project.path}
promptLength=${prompt.length}${requestedAgent ? `\nagent=${requestedAgent.name}` : ''}` });
    const providerStatus = this.providers.find((entry) => entry.id === provider);
    if (providerStatus?.connected === false) throw new Error(`${providerLabel(provider)} è scollegato da Relay. Ricollegalo dalle Impostazioni prima di usarlo.`);
    if (!providerStatus?.available) throw new Error(`${providerLabel(provider)} non è disponibile. Apri Impostazioni e verifica la CLI.`);
    const defaults = this.preferences.providerDefaults[provider];
    const rawModel = normalizedSelection(requestedAgent?.model ?? payload?.model, defaults.model);
    const rawReasoning = normalizedSelection(requestedAgent?.reasoning ?? payload?.reasoning, defaults.reasoning);
    const normalized = normalizeRunSelection({ provider, model: rawModel, reasoning: rawReasoning, providers: this.providers });
    for (const notice of normalized.notices) this.recordDiagnostic('info', 'model-capability', notice, { provider });
    if (normalized.notices.length) this.emit({ type: 'notice', payload: { level: 'info', message: normalized.notices[0]! } });
    const model = normalizedSelection(normalized.model, defaults.model);
    const reasoning = normalizedSelection(normalized.reasoning, defaults.reasoning);
    const permission = requestedAgent?.permission ?? (payload?.permission ? asPermission(payload.permission) : defaults.permission);
    const conversation = options?.conversation ?? await this.conversationStore.getOrCreate(
      project.id,
      provider,
      this.preferences.delegationPolicy,
      permission,
      model,
      reasoning
    );
    const rootRunId = randomUUID();
    if (payload?.recoveryTarget) this.recoveryTargetsByRun.set(rootRunId, asProviderId(payload.recoveryTarget));

    if (options?.conversation) await this.conversationStore.updateSelectionForConversation(project.id, conversation.id, provider, model, reasoning, permission, requestedAgent?.id);
    else await this.conversationStore.updateSelection(project.id, provider, model, reasoning, permission, requestedAgent?.id);
    await this.conversationStore.appendToConversation(project.id, conversation.id, {
      role: 'user',
      text: displayPrompt,
      provider,
      runId: rootRunId,
      ...(mentions.length ? { mentions } : {}),
      ...(requestedAgent ? { agentId: requestedAgent.id, agentName: requestedAgent.name } : {}),
      ...(model && model !== 'auto' ? { model } : {}),
      ...(reasoning && reasoning !== 'auto' ? { reasoning } : {})
    } as any);

    this.activeRuns.set(rootRunId, {
      id: rootRunId,
      conversationId: conversation.id,
      provider,
      permission,
      phase: 'queued',
      status: 'In coda…',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activities: [],
      kind: 'primary',
      rootRunId,
      depth: 0,
      originalPrompt: prompt,
      partialOutput: '',
      ...(requestedAgent ? { agentId: requestedAgent.id, agentName: requestedAgent.name } : {}),
      ...(model && model !== 'auto' ? { model } : {}),
      ...(reasoning && reasoning !== 'auto' ? { reasoning } : {})
    } as any);
    this.emitState();

    const sessionId = conversation.providerSessions?.[provider];
    const handoff = sessionId ? '' : buildConversationHandoff(conversation.messages, provider);
    const mentionContext = await this.compileMentionContext(mentions, project);
    const mentionRouting = !requestedAgent && mentionedAgents.length
      ? `# Relay mentioned-agent routing\nThe current provider remains the primary agent for this request. The user mentioned ${mentionedAgents.map((agent) => agent.name).join(', ')} as collaboration/delegation target${mentionedAgents.length === 1 ? '' : 's'}. Do not impersonate or replace the primary provider with a mentioned agent. Delegate only the relevant subtask through the Relay collaboration protocol when the request calls for that agent's contribution.`
      : '';
    const initialPrompt = [handoff, mentionContext, mentionRouting, `# Current user request\n${prompt}`].filter(Boolean).join('\n\n');
    const context: RootRunContext = {
      project,
      conversationId: conversation.id,
      rootRunId,
      provider,
      permission,
      originalPrompt: prompt,
      delegationPolicy: requestedAgent?.canDelegate === false ? 'disabled' : conversation.delegationPolicy,
      depth: 0,
      ...(requestedAgent ? { agentId: requestedAgent.id } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(model && model !== 'auto' ? { model } : {}),
      ...(reasoning && reasoning !== 'auto' ? { reasoning } : {})
    };

    const execution = this.executeRootTurn(context, initialPrompt).catch(async (error) => {
      await this.failRootRun(context, error);
      throw error;
    });
    if (options?.awaitCompletion) await execution;
    else void execution.catch(() => undefined);
    return { runId: rootRunId, conversationId: conversation.id };
  }

  private async saveAutomation(payload: any): Promise<void> {
    const schedule = payload?.schedule as RelayAutomation['schedule'];
    const input: AutomationDraftInput = {
      ...(String(payload?.id ?? '') ? { id: String(payload.id) } : {}),
      name: String(payload?.name ?? ''),
      prompt: String(payload?.prompt ?? ''),
      projectId: payload?.projectId ? String(payload.projectId) : null,
      ...(payload?.provider ? { provider: asProviderId(payload.provider) } : {}),
      ...(payload?.agentId ? { agentId: String(payload.agentId) } : {}),
      permission: asPermission(payload?.permission ?? 'workspace-write'),
      delegationPolicy: payload?.delegationPolicy === 'automatic' || payload?.delegationPolicy === 'disabled' ? payload.delegationPolicy : 'confirm',
      schedule,
      enabled: payload?.enabled !== false,
      missedPolicy: payload?.missedPolicy === 'catchUpOnce' ? 'catchUpOnce' : 'skip'
    };
    await this.automationStore.upsert(input, computeNextRun(schedule, new Date())?.toISOString());
    await this.automationScheduler.refresh();
    this.emitState();
  }

  private async toggleAutomation(id: string, enabled: boolean): Promise<void> {
    const current = await this.automationStore.get(id);
    if (!current) throw new Error('Automazione non trovata.');
    await this.automationStore.toggle(id, enabled, enabled ? computeNextRun(current.schedule, new Date())?.toISOString() : undefined);
    await this.automationScheduler.refresh();
    this.emitState();
  }

  private async duplicateAutomation(id: string): Promise<void> {
    const current = await this.automationStore.get(id);
    if (!current) throw new Error('Automazione non trovata.');
    await this.automationStore.duplicate(id, computeNextRun(current.schedule, new Date())?.toISOString());
    await this.automationScheduler.refresh();
    this.emitState();
  }

  private async executeAutomation(automation: RelayAutomation): Promise<{ conversationId?: string; detail?: string }> {
    const projects = await this.projectStore.list();
    const project = automation.projectId ? projects.find((entry) => entry.id === automation.projectId) : this.currentProject;
    if (!project?.path) throw new Error('Il progetto dell’automazione non è disponibile.');
    const agent = automation.agentId ? this.agentById(automation.agentId) : undefined;
    const provider = agent?.provider ?? automation.provider ?? this.preferences.defaultProvider;
    const defaults = this.preferences.providerDefaults[provider] ?? DEFAULT_PREFERENCES.providerDefaults[provider];
    const conversation = await this.conversationStore.newConversation(
      project.id, provider, automation.delegationPolicy, automation.permission,
      agent?.model ?? defaults.model, agent?.reasoning ?? defaults.reasoning, agent?.id, false
    );
    await this.conversationStore.rename(project.id, conversation.id, `⏱ ${automation.name} · ${new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}`);
    await this.sendMessage({
      prompt: automation.prompt,
      provider,
      model: agent?.model ?? defaults.model,
      reasoning: agent?.reasoning ?? defaults.reasoning,
      permission: automation.permission,
      ...(agent ? { agentId: agent.id } : {})
    }, { project, conversation, awaitCompletion: true });
    return { conversationId: conversation.id, detail: 'Esecuzione completata nella nuova conversazione.' };
  }

  private resolveAgentMentions(mentions: ConversationMention[]): CustomAgentRecord[] {
    const matched = new Map<string, CustomAgentRecord>();
    for (const mention of mentions.filter((entry) => entry.kind === 'agent')) {
      const agent = this.agentById(mention.entityId);
      if (agent) matched.set(agent.id, agent);
    }
    return [...matched.values()];
  }

  private displayAgentMentions(prompt: string): string {
    let result = prompt;
    for (const agent of this.agents) {
      result = result.replace(new RegExp(`@agent\\[${escapeRegExp(agent.id)}\\]`, 'gi'), agentMentionLabel(agent));
    }
    return result;
  }

  private normalizeAgentMentions(prompt: string): string {
    return this.displayAgentMentions(prompt);
  }

  private async compileMentionContext(mentions: ConversationMention[], project: ProjectRecord): Promise<string> {
    const fileMentions = mentions.filter((entry) => entry.kind === 'file').map((entry) => entry.resolvedValue || entry.entityId);
    const skillMentions = mentions.filter((entry) => entry.kind === 'skill').map((entry) => entry.label.replace(/^\//, '') || entry.entityId);
    const mcpMentions = mentions.filter((entry) => entry.kind === 'mcp').map((entry) => entry.label.replace(/^\//, '') || entry.entityId);
    const agentMentions = this.resolveAgentMentions(mentions);
    if (![fileMentions, skillMentions, mcpMentions].some((values) => values.length) && agentMentions.length === 0) return '';

    const sections: string[] = ['# Explicit Relay mentions'];

    for (const agent of agentMentions) sections.push(formatAgentMention(agent));

    for (const raw of [...new Set(fileMentions)]) {
      const path = this.safeWorkspacePath(project.path, raw);
      if (!path) continue;
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
        const content = Buffer.from(bytes).toString('utf8').slice(0, 60_000);
        sections.push(`## Mentioned file: ${relative(project.path, path)}\n\`\`\`text\n${content}\n\`\`\``);
      } catch {
        sections.push(`## Mentioned file unavailable: ${raw}`);
      }
    }

    if (skillMentions.length) {
      const skills = await this.skillManager.snapshot(project.path);
      for (const raw of [...new Set(skillMentions.map((name) => name.toLowerCase()))]) {
        const skill = skills.items.find((entry) => entry.name.toLowerCase() === raw);
        if (!skill) continue;
        try {
          const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(skill.filePath));
          const content = Buffer.from(bytes).toString('utf8').slice(0, 60_000);
          sections.push(`## Invoked skill: ${skill.name}\n${content}`);
        } catch {
          sections.push(`## Invoked skill unavailable: ${skill.name}`);
        }
      }
    }
    if (mcpMentions.length) {
      const snapshot = await this.mcpManager.inventory(project.path, this.providers);
      for (const raw of [...new Set(mcpMentions.map((name) => name.toLowerCase()))]) {
        const server = snapshot.servers.find((entry) => entry.name.toLowerCase() === raw || `${entry.provider}:${entry.scope}:${entry.name}`.toLowerCase() === raw);
        if (server) {
          const bindings = Object.keys(server.providerBindings ?? {}).map((provider) => providerLabel(provider as ProviderId));
          sections.push([
            `## Selected MCP server: ${server.name}`,
            `Available provider bindings: ${bindings.join(', ') || providerLabel(server.provider)}`,
            `Transport: ${server.transport}`,
            `Endpoint: ${server.target}`,
            `Use ${server.name} directly through the current provider's MCP tools for this request.`,
            'Do not delegate this MCP request to another provider and do not substitute native browser, shell, or system-browser tools.'
          ].join('\n'));
        }
      }
    }
    return sections.join('\n\n');
  }

  private safeWorkspacePath(root: string, value: string): string | undefined {
    const decoded = decodeURIComponent(value.replace(/^file:\/\//i, '')).trim();
    const candidate = resolve(root, isAbsolute(decoded) ? relative(root, decoded) : decoded);
    const rel = relative(root, candidate);
    if (rel.startsWith('..') || isAbsolute(rel)) return undefined;
    return candidate;
  }

  private async executeRootTurn(context: RootRunContext, prompt: string): Promise<void> {
    if (this.isRunCancelled(context.rootRunId)) return;
    if (context.depth > MAX_DELEGATION_DEPTH) {
      throw new Error(`Relay ha fermato la catena dopo ${MAX_DELEGATION_DEPTH} livelli di delega.`);
    }

    const run = this.activeRuns.get(context.rootRunId);
    if (run) {
      run.provider = context.provider;
      run.phase = context.depth === 0 ? 'connecting' : 'integrating';
      run.status = context.depth === 0 ? `Connessione a ${providerLabel(context.provider)}…` : 'Ripresa dell’agente principale…';
      run.updatedAt = new Date().toISOString();
      run.heartbeatAt = run.updatedAt;
      run.depth = context.depth;
      delete run.error;
    }
    this.emitState();

    const capacity = this.preferences.exposeUsageToAgents
      ? buildCapacityContext(this.providers, this.usage, this.preferences)
      : '';
    const activeAgent = context.agentId ? this.agentById(context.agentId) : undefined;
    const agentBlock = activeAgent ? buildAgentPromptBlock(activeAgent) : '';
    const policy = activeAgent?.canDelegate === false ? 'disabled' : context.depth >= MAX_DELEGATION_DEPTH ? 'disabled' : context.delegationPolicy;
    const protocol = delegationProtocolInstructions({
      policy,
      providers: this.providers.map((provider) => ({
        id: provider.id,
        label: provider.label,
        available: provider.available,
        models: provider.models.map((model) => model.id)
      })),
      agents: this.visibleAgents(context.project.id)
        // canDelegate controls whether an agent used as the primary entity may
        // create further delegations. It does not control whether another
        // provider may delegate a task to that agent.
        .filter((agent) => agent.id !== activeAgent?.id)
        .map((agent) => {
          const provider = this.providers.find((entry) => entry.id === agent.provider);
          return {
            id: agent.id,
            name: agent.name,
            provider: agent.provider,
            model: agent.model,
            specialization: agent.specialization,
            permission: agent.permission,
            available: Boolean(provider?.available && provider.connected !== false)
          };
        }),
      maxTasks: MAX_DELEGATION_TASKS,
      maxDepth: MAX_DELEGATION_DEPTH,
      depth: context.depth
    } as any);
    const remoteDelivery = this.remoteAccess.snapshot().enabled
      ? [
          '# Relay remote delivery',
          'When the task creates or updates files, cite the relevant workspace paths in the final answer.',
          'When you actually start or test a web app on this computer, mention its exact loopback URL (http://127.0.0.1:<port> or http://localhost:<port>). Relay can turn cited files and real loopback URLs into authenticated mobile download and preview actions.',
          'Do not invent a URL, do not bind a preview server to 0.0.0.0, and do not expose secrets.'
        ].join('\n')
      : '';
    const effectivePrompt = [capacity, agentBlock, protocol, remoteDelivery, prompt].filter(Boolean).join('\n\n');
    const rules = this.rulesEngine.compile(context.provider, this.rulesForProject(context.project.id));

    const result = await this.runProviderTurn({
      runId: context.rootRunId,
      provider: context.provider,
      prompt: effectivePrompt,
      cwd: context.project.path,
      permission: context.permission,
      ...(context.sessionId ? { sessionId: context.sessionId } : {}),
      ...(context.model ? { model: context.model } : {}),
      ...(context.reasoning ? { reasoning: context.reasoning } : {}),
      ...(rules ? { rules } : {})
    }, context.rootRunId);

    if (result.sessionId) {
      context.sessionId = result.sessionId;
      await this.conversationStore.setProviderSessionForConversation(
        context.project.id,
        context.conversationId,
        context.provider,
        result.sessionId
      );
    }

    const parsed = parseDelegationResponse(result.text, MAX_DELEGATION_TASKS);
    if (parsed.request && context.depth < MAX_DELEGATION_DEPTH) {
      this.handleAgentEvent({ type: 'replace', runId: context.rootRunId, text: parsed.visibleText });
      const delegation = await this.createDelegation(context, parsed.request);
      const approved = await this.awaitDelegationApproval(context, delegation);
      if (this.isRunCancelled(context.rootRunId)) return;

      if (!approved) {
        await this.conversationStore.updateDelegationInConversation(
          context.project.id,
          context.conversationId,
          delegation.id,
          (current) => ({ ...current, status: 'cancelled', completedAt: new Date().toISOString() })
        );
        const continuation = `# Relay delegation result\nThe requested delegation was declined by the user. Continue the original task yourself. Do not request the same delegation again unless the user explicitly asks.\n\nOriginal request:\n${context.originalPrompt}`;
        await this.executeRootTurn({ ...context, depth: context.depth + 1 }, continuation);
        return;
      }

      const completed = await this.executeDelegation(context, delegation);
      if (this.isRunCancelled(context.rootRunId)) return;
      const continuation = formatDelegationResults(context.originalPrompt, completed);
      await this.executeRootTurn({ ...context, depth: context.depth + 1 }, continuation);
      return;
    }

    if (parsed.malformed && containsDelegationStart(result.text) && context.depth < MAX_DELEGATION_DEPTH) {
      const correction = `# Relay protocol correction\nYour delegation block was malformed: ${parsed.malformed}\nReturn a valid <relay-delegate> JSON block or complete the task yourself. Do not include explanatory text around the block.`;
      await this.executeRootTurn({ ...context, depth: context.depth + 1 }, correction);
      return;
    }

    const finalText = parsed.visibleText.trim() || result.text.trim() || 'Operazione completata senza un messaggio testuale.';
    const runState = this.activeRuns.get(context.rootRunId);
    const conversationBeforeResult = await this.conversationStore.read(context.project.id, context.conversationId);
    const delegatedFiles = conversationBeforeResult?.delegations
      .filter((delegation) => delegation.rootRunId === context.rootRunId)
      .flatMap((delegation) => delegation.tasks.flatMap((task) => task.changedFiles ?? [])) ?? [];
    const artifacts = await discoverRemoteArtifacts({
      workspaceRoot: context.project.path,
      text: finalText,
      changedFiles: [...(result.changedFiles ?? []), ...delegatedFiles],
      runFiles: runState?.partialChanges,
      serviceUrls: Array.isArray(runState?.previewUrls) ? runState.previewUrls as string[] : undefined
    }).catch((error) => {
      this.recordDiagnostic('warning', 'remote-artifacts', `Impossibile indicizzare gli artefatti del risultato: ${errorMessage(error)}`, {
        provider: context.provider,
        runId: context.rootRunId,
        conversationId: context.conversationId
      });
      return [];
    });
    await this.conversationStore.appendToConversation(context.project.id, context.conversationId, {
      role: 'assistant',
      text: finalText,
      provider: context.provider,
      runId: context.rootRunId,
      ...(artifacts.length ? { artifacts } : {}),
      ...(context.agentId ? { agentId: context.agentId, agentName: this.agentById(context.agentId)?.name } : {}),
      ...(result.model ? { model: result.model } : {}),
      ...(context.reasoning ? { reasoning: context.reasoning } : {})
    });
    this.handleAgentEvent({ type: 'complete', runId: context.rootRunId, result: { ...result, text: finalText } });
    if (context.agentId) this.agents = await this.agentStore.markUsed(context.agentId);
    this.finalizeRun(context.rootRunId, 'completed', { reason: 'root_complete' });
    await this.finishRecoveryIncident(context.rootRunId);
    await this.refreshUsage(false);
    this.emitState();
  }

  private async runProviderTurn(
    request: Parameters<RunScheduler['run']>[0],
    visibleRunId: string,
    suppressDeltas = false
  ): Promise<AgentRunResult> {
    let rawText = '';
    let mode: 'probing' | 'normal' | 'delegation' = 'probing';

    const result = await this.scheduler.run(request, (event) => {
      if (event.type === 'complete') return;
      if (event.type !== 'delta') {
        this.handleAgentEvent(event);
        return;
      }

      rawText += event.text;
      if (mode === 'delegation') return;
      if (mode === 'normal') {
        if (!suppressDeltas) this.handleAgentEvent({ type: 'delta', runId: visibleRunId, text: event.text });
        return;
      }

      const trimmed = rawText.trimStart();
      if (trimmed.startsWith(DELEGATION_TAG) || DELEGATION_TAG.startsWith(trimmed)) {
        if (trimmed.startsWith(DELEGATION_TAG)) {
          mode = 'delegation';
          this.handleAgentEvent({ type: 'status', runId: visibleRunId, message: 'Preparazione della delega…', phase: 'delegating' });
        }
        return;
      }

      if (rawText.length >= DELEGATION_TAG.length || /\s/.test(rawText.slice(0, 4)) === false) {
        mode = 'normal';
        if (!suppressDeltas) this.handleAgentEvent({ type: 'replace', runId: visibleRunId, text: rawText });
      }
    });

    const parsed = parseDelegationResponse(result.text, MAX_DELEGATION_TASKS);
    if (parsed.request) {
      this.handleAgentEvent({ type: 'replace', runId: visibleRunId, text: parsed.visibleText });
    } else {
      this.handleAgentEvent({ type: 'replace', runId: visibleRunId, text: result.text });
    }
    return result;
  }

  private async createDelegation(context: RootRunContext, request: RelayDelegationRequest): Promise<DelegationRecord> {
    const id = randomUUID();
    const aliases: string[] = [];
    const seenAliases = new Set<string>();
    for (let index = 0; index < request.tasks.slice(0, MAX_DELEGATION_TASKS).length; index += 1) {
      const task = request.tasks[index]!;
      let alias = task.id?.trim().slice(0, 80) || `task-${index + 1}`;
      while (seenAliases.has(alias)) alias = `${alias}-${index + 1}`;
      seenAliases.add(alias);
      aliases.push(alias);
    }
    const actualIdByAlias = new Map(aliases.map((alias) => [alias, `${id}:${alias}`]));
    const tasks = request.tasks.slice(0, MAX_DELEGATION_TASKS).map((task, index) => {
      const alias = aliases[index]!;
      const taskId = actualIdByAlias.get(alias)!;
      const routed = this.routeDelegationTask(context, task, request.intent);
      const routedAgent = routed.agentId ? this.agentById(routed.agentId) : undefined;
      const dependencies = task.dependsOn?.map((entry) => actualIdByAlias.get(entry.trim())).filter(Boolean) as string[] | undefined;
      return {
        id: taskId,
        provider: routed.provider,
        label: task.label?.trim().slice(0, 100) || `Task ${index + 1} · ${providerLabel(routed.provider)}`,
        prompt: task.prompt,
        permission: inferDelegationPermission({
          task,
          originalPrompt: context.originalPrompt,
          agentPermission: routedAgent?.permission,
          providerDefault: this.preferences.providerDefaults[routed.provider].permission
        }),
        status: 'pending',
        ...(routed.model ? { model: routed.model } : {}),
        ...(routed.reasoning ? { reasoning: routed.reasoning } : {}),
        ...(routed.agentId ? { agentId: routed.agentId } : {}),
        ...(routed.complexity ? { complexity: routed.complexity } : {}),
        ...(dependencies?.length ? { dependsOn: [...new Set(dependencies)] } : {}),
        ...(task.files?.length ? { files: [...new Set(task.files.map((entry) => entry.trim()).filter(Boolean))] } : {}),
        routingReason: routed.reason
      } satisfies DelegationTaskRecord;
    });

    if ((request.strategy ?? 'parallel') === 'parallel') applyFileScopeDependencies(tasks);

    const policy = context.delegationPolicy;
    const record: DelegationRecord = {
      id,
      rootRunId: context.rootRunId,
      requestedBy: context.provider,
      strategy: request.strategy ?? 'parallel',
      status: policy === 'confirm' ? 'pending-approval' : 'running',
      createdAt: new Date().toISOString(),
      depth: context.depth + 1,
      tasks,
      ...(request.reason ? { reason: request.reason } : {})
    };
    await this.conversationStore.addDelegationToConversation(context.project.id, context.conversationId, record);
    return record;
  }

  private routeDelegationTask(
    context: RootRunContext,
    task: RelayDelegationTaskRequest,
    intent?: RelayDelegationRequest['intent']
  ): { provider: ProviderId; model?: string; reasoning?: string; complexity: TaskComplexity; reason: string; agentId?: string } {
    const complexity = task.complexity ?? inferTaskComplexity(task.prompt);
    const requestedAgentReference = typeof (task as any).agent === 'string' && (task as any).agent !== 'auto'
      ? String((task as any).agent)
      : undefined;
    const routedAgent = requestedAgentReference
      ? this.resolveDelegationAgentReference(requestedAgentReference, context.project.id)
      : undefined;
    const requestedProvider = routedAgent?.provider ?? task.provider;
    const provider = requestedProvider === 'auto'
      ? chooseDelegationProvider({
          currentProvider: context.provider,
          prompt: task.prompt,
          permission: task.permission ?? 'read-only',
          complexity,
          providers: this.providers.map((provider) => this.withSetupProgress(provider)),
          usage: this.usage,
          preferences: this.preferences
        })
      : requestedProvider;
    const status = this.providers.find((entry) => entry.id === provider);
    const defaults = this.preferences.providerDefaults[provider];
    const explicitModel = normalizedSelection(task.model, 'auto');
    const agentModel = routedAgent?.provider === provider ? normalizedSelection(routedAgent.model, 'auto') : undefined;
    let selectedModel = resolveDelegationModelSelection({
      explicitModel,
      agentModel,
      configuredModel: defaults.delegationModel,
      smartModel: provider === 'copilot'
        ? 'auto'
        : chooseDelegationModel(status?.models ?? [], complexity, this.preferences.quotaPolicy, this.usage.find((entry) => entry.provider === provider)),
      fallbackModel: defaults.model
    });
    const explicitReasoning = normalizedSelection(task.reasoning, 'auto');
    const agentReasoning = routedAgent?.provider === provider ? normalizedSelection(routedAgent.reasoning, 'auto') : undefined;
    const costLimitedNotes: string[] = [];
    if (intent === 'cost' && !explicitModel && context.model && context.model !== 'auto' && selectedModel && modelTier(selectedModel) > modelTier(context.model)) {
      const parentTier = modelTier(context.model);
      const eligibleModels = (status?.models ?? []).filter((model) => !model.hidden && model.id !== 'auto' && modelTier(`${model.id} ${model.label}`) <= parentTier);
      selectedModel = eligibleModels.length
        ? chooseDelegationModel(eligibleModels, complexity, this.preferences.quotaPolicy, this.usage.find((entry) => entry.provider === provider)) ?? context.model
        : context.model;
      costLimitedNotes.push('limitato al livello del padre (delega per risparmio)');
    }
    let selectedReasoning = explicitReasoning ?? agentReasoning ?? chooseDelegationReasoning(status?.models ?? [], selectedModel, complexity, this.preferences.quotaPolicy, this.usage.find((entry) => entry.provider === provider)) ?? defaults.reasoning;
    if (intent === 'cost' && context.reasoning && context.reasoning !== 'auto' && selectedReasoning) {
      const order = ['minimal', 'low', 'medium', 'high', 'xhigh', 'extra-high', 'max', 'ultracode'];
      const parentIndex = order.indexOf(context.reasoning.toLowerCase());
      const selectedIndex = order.indexOf(selectedReasoning.toLowerCase());
      if (parentIndex >= 0 && selectedIndex > parentIndex) {
        selectedReasoning = context.reasoning;
        if (!costLimitedNotes.length) costLimitedNotes.push('limitato al livello del padre (delega per risparmio)');
      }
    }
    const normalized = normalizeRunSelection({ provider, model: selectedModel, reasoning: selectedReasoning, providers: this.providers });
    const route = routedAgent ? `agente ${routedAgent.name}` : requestedProvider === 'auto' ? `provider ${providerLabel(provider)} scelto automaticamente` : providerLabel(provider);
    const modelReason = normalized.model ? `modello ${normalized.model}` : 'modello predefinito';
    const parentModelTier = context.model && context.model !== 'auto' ? modelTier(context.model) : undefined;
    const childModelTier = normalized.model ? modelTier(normalized.model) : undefined;
    const intentNote = costLimitedNotes.length
      ? `; ${costLimitedNotes.join('; ')}`
      : (intent === 'specialist' || intent === 'user-request') && parentModelTier !== undefined && childModelTier !== undefined && childModelTier > parentModelTier
        ? `; livello superiore giustificato da ${intent}`
        : '';
    return {
      provider,
      ...(normalized.model ? { model: normalized.model } : {}),
      ...(normalized.reasoning ? { reasoning: normalized.reasoning } : {}),
      ...(routedAgent ? { agentId: routedAgent.id } : {}),
      complexity,
      reason: `${route}; ${modelReason}; complessità ${complexity}${intentNote}${normalized.notices.length ? `; ${normalized.notices.join(' ')}` : ''}`
    };
  }

  private async awaitDelegationApproval(context: RootRunContext, delegation: DelegationRecord): Promise<boolean> {
    const policy = context.delegationPolicy;
    if (policy === 'disabled') return false;
    if (policy === 'automatic') return true;

    const run = this.activeRuns.get(context.rootRunId);
    if (run) {
      run.phase = 'awaiting-approval';
      run.status = 'In attesa della conferma per la delega…';
      run.updatedAt = new Date().toISOString();
    }

    const pending: PendingDelegation = {
      id: delegation.id,
      conversationId: context.conversationId,
      rootRunId: context.rootRunId,
      requestedBy: context.provider,
      strategy: delegation.strategy,
      tasks: delegation.tasks,
      createdAt: delegation.createdAt,
      ...(delegation.reason ? { reason: delegation.reason } : {})
    };
    const approved = await new Promise<boolean>((resolve) => {
      this.pendingApprovals.set(delegation.id, { record: pending, resolve });
      this.emitState();
    });
    this.pendingApprovals.delete(delegation.id);
    this.emitState();
    return approved;
  }

  private resolveDelegationApproval(id: string, approved: boolean): void {
    const pending = this.pendingApprovals.get(id);
    if (!pending) return;
    this.pendingApprovals.delete(id);
    pending.resolve(approved);
    this.emitState();
  }

  private async executeDelegation(context: RootRunContext, delegation: DelegationRecord): Promise<DelegationRecord> {
    const run = this.activeRuns.get(context.rootRunId);
    if (run) {
      run.phase = 'delegating';
      run.status = `${delegation.tasks.length} ${delegation.tasks.length === 1 ? 'delega attiva' : 'deleghe attive'}…`;
      run.updatedAt = new Date().toISOString();
    }
    await this.conversationStore.updateDelegationInConversation(
      context.project.id,
      context.conversationId,
      delegation.id,
      (current) => ({ ...current, status: 'running' })
    );
    this.emitState();

    const writerTasks = delegation.tasks.filter((task) => task.permission !== 'read-only');
    const workspaceClean = context.project.isGit ? await this.worktrees.isClean(context.project.path) : false;
    const useWorktrees = delegation.strategy === 'parallel'
      && delegation.tasks.length > 1
      && writerTasks.length > 0
      && context.project.isGit
      && workspaceClean
      && vscode.workspace.getConfiguration('relay').get<boolean>('worktrees.enabled', true);
    const effectiveStrategy = delegation.strategy === 'parallel' && writerTasks.length > 0 && !useWorktrees
      ? 'sequential'
      : delegation.strategy;

    if (delegation.strategy === 'parallel' && effectiveStrategy === 'sequential' && writerTasks.length > 0) {
      this.handleAgentEvent({
        type: 'activity',
        runId: context.rootRunId,
        title: 'Scrittura serializzata',
        detail: context.project.isGit
          ? 'Il workspace Git contiene modifiche non salvate: Relay esegue i task in sequenza per evitare conflitti.'
          : 'Il progetto non è Git: Relay esegue i task in sequenza per proteggere i file.'
      });
    }

    const executeOne = async (task: DelegationTaskRecord): Promise<DelegationTaskRecord> => {
      if (this.isRunCancelled(context.rootRunId)) return { ...task, status: 'cancelled', completedAt: new Date().toISOString() };
      const providerStatus = this.providers.find((provider) => provider.id === task.provider);
      if (!providerStatus?.available) {
        return { ...task, status: 'failed', error: `${providerLabel(task.provider)} non è disponibile.`, completedAt: new Date().toISOString() };
      }
      const childRunId = task.id;
      const shouldIsolate = useWorktrees && task.permission !== 'read-only' && !(task.dependsOn?.length);
      let lease: WorktreeLease | undefined;
      if (shouldIsolate) lease = await this.worktrees.create(context.project.path, task.id);
      let cwd = lease?.path ?? context.project.path;
      const now = new Date().toISOString();
      const taskAgent = (task as any).agentId ? this.agentById(String((task as any).agentId)) : undefined;
      this.activeRuns.set(childRunId, {
        id: childRunId,
        conversationId: context.conversationId,
        provider: task.provider,
        permission: task.permission,
        phase: 'queued',
        status: 'Delega in coda…',
        startedAt: now,
        updatedAt: now,
        activities: [],
        kind: 'delegation',
        parentRunId: context.rootRunId,
        rootRunId: context.rootRunId,
        delegationId: delegation.id,
        taskLabel: task.label,
        depth: delegation.depth,
        ...(task.model ? { model: task.model } : {}),
        ...(task.reasoning ? { reasoning: task.reasoning } : {}),
        ...(taskAgent ? { agentId: taskAgent.id, agentName: taskAgent.name } : {})
      } as any);
      await this.updateDelegationTask(context, delegation.id, task.id, (current) => ({ ...current, status: 'running', startedAt: now, ...(lease ? { worktree: lease.path, branch: lease.branch } : {}) }));
      this.emitState();

      try {
        const rules = this.rulesEngine.compile(task.provider, this.rulesForProject(context.project.id));
        const childPrompt = [
          '# Relay delegated task',
          taskAgent ? buildAgentPromptBlock(taskAgent) : '',
          `You are executing a focused task delegated by ${providerLabel(context.provider)}. Complete the task and return a concise result for the delegating agent. Do not search for or invoke other agent CLIs.`,
          task.files?.length ? `Expected file scope: ${task.files.join(', ')}. Do not edit outside this scope unless strictly required; report every exception.` : '',
          task.routingReason ? `Relay routing: ${task.routingReason}.` : '',
          task.prompt
        ].filter(Boolean).join('\n\n');
        const result = await this.scheduler.run({
          runId: childRunId,
          provider: task.provider,
          prompt: childPrompt,
          cwd,
          permission: task.permission,
          ...(task.model ? { model: task.model } : {}),
          ...(task.reasoning ? { reasoning: task.reasoning } : {}),
          ...(rules ? { rules } : {})
        }, (event) => {
          this.handleAgentEvent(event);
        });

        let changedFiles = result.changedFiles;
        if (lease) {
          const inspection = await this.integrateWorktree(lease);
          changedFiles = inspection.changedFiles;
        }

        const completed: DelegationTaskRecord = {
          ...task,
          status: 'completed',
          startedAt: now,
          completedAt: new Date().toISOString(),
          resultText: result.text,
          ...(changedFiles?.length ? { changedFiles } : {}),
          ...(lease ? { worktree: lease.path, branch: lease.branch } : {})
        };
        await this.updateDelegationTask(context, delegation.id, task.id, () => completed);
        if (taskAgent) this.agents = await this.agentStore.markUsed(taskAgent.id);
        this.finalizeRun(childRunId, 'completed', { reason: 'delegation_complete', parentRunId: context.rootRunId, delegationId: delegation.id });
        this.emitState();
        return completed;
      } catch (error) {
        if (lease) await this.worktrees.remove(lease, true).catch(() => undefined);
        const message = errorMessage(error);
        const failure = classifyProviderFailure(task.provider, error);
        const failed: DelegationTaskRecord = {
          ...task,
          status: this.isRunCancelled(context.rootRunId) ? 'cancelled' : 'failed',
          startedAt: now,
          completedAt: new Date().toISOString(),
          error: failure.category === 'permission-denied'
            ? antigravityPermissionMessage(task.provider, message)
            : message,
          ...(lease ? { worktree: lease.path, branch: lease.branch } : {})
        };
        await this.updateDelegationTask(context, delegation.id, task.id, () => failed);
        this.finalizeRun(childRunId, failed.status === 'cancelled' ? 'cancelled' : failure.category === 'permission-denied' ? 'permission_denied' : 'failed', {
          reason: failure.category === 'permission-denied' ? 'headless_permission_denied' : 'delegation_failed',
          error: failed.error,
          parentRunId: context.rootRunId,
          delegationId: delegation.id
        });
        this.emitState();
        return failed;
      }
    };

    const pending = new Map(delegation.tasks.slice(0, MAX_TOTAL_CHILD_RUNS).map((task) => [task.id, task]));
    const completedById = new Map<string, DelegationTaskRecord>();
    const results: DelegationTaskRecord[] = [];

    while (pending.size > 0) {
      if (this.isRunCancelled(context.rootRunId)) {
        for (const task of pending.values()) results.push({ ...task, status: 'cancelled', completedAt: new Date().toISOString() });
        break;
      }

      for (const task of [...pending.values()]) {
        const failedDependency = (task.dependsOn ?? []).find((dependency) => {
          const result = completedById.get(dependency);
          return result && result.status !== 'completed';
        });
        if (!failedDependency) continue;
        const blocked: DelegationTaskRecord = {
          ...task,
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: `Dipendenza ${failedDependency} non completata.`
        };
        pending.delete(task.id);
        completedById.set(task.id, blocked);
        results.push(blocked);
        await this.updateDelegationTask(context, delegation.id, task.id, () => blocked);
      }

      let ready = [...pending.values()].filter((task) => (task.dependsOn ?? []).every((dependency) => completedById.get(dependency)?.status === 'completed'));
      if (!ready.length) {
        for (const task of pending.values()) {
          const cyclic: DelegationTaskRecord = { ...task, status: 'failed', completedAt: new Date().toISOString(), error: 'Dipendenze cicliche o mancanti nel piano di delega.' };
          completedById.set(task.id, cyclic);
          results.push(cyclic);
          await this.updateDelegationTask(context, delegation.id, task.id, () => cyclic);
        }
        break;
      }

      // A writer that depends on previous changes runs alone in the active workspace,
      // so it sees the integrated results of its dependencies.
      const dependentWriter = ready.find((task) => task.permission !== 'read-only' && (task.dependsOn?.length ?? 0) > 0);
      if (dependentWriter) ready = [dependentWriter];
      else if (effectiveStrategy === 'sequential') ready = [ready[0]!];

      for (const task of ready) pending.delete(task.id);
      const wave = await Promise.all(ready.map(executeOne));
      for (const result of wave) {
        completedById.set(result.id, result);
        results.push(result);
      }
    }

    const orderedResults = delegation.tasks.map((task) => completedById.get(task.id) ?? results.find((entry) => entry.id === task.id) ?? task);
    const failed = orderedResults.some((task) => task.status === 'failed');
    const cancelled = orderedResults.some((task) => task.status === 'cancelled');
    const completed: DelegationRecord = {
      ...delegation,
      status: failed ? 'failed' : cancelled ? 'cancelled' : 'completed',
      completedAt: new Date().toISOString(),
      tasks: orderedResults
    };
    await this.conversationStore.updateDelegationInConversation(
      context.project.id,
      context.conversationId,
      delegation.id,
      () => completed
    );
    this.emitState();
    return completed;
  }


  private async integrateWorktree(lease: WorktreeLease): Promise<{ diff: string; changedFiles: string[] }> {
    const previous = this.integrationTail;
    let release: (() => void) | undefined;
    this.integrationTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const inspection = await this.worktrees.inspect(lease);
      if (inspection.diff.trim()) await this.worktrees.applyDiff(lease, inspection.diff);
      await this.worktrees.remove(lease, true).catch((error) => this.recordDiagnostic('warning', 'worktree', `Worktree cleanup failed: ${errorMessage(error)}`));
      return inspection;
    } finally {
      release?.();
    }
  }

  private async updateDelegationTask(
    context: RootRunContext,
    delegationId: string,
    taskId: string,
    updater: (task: DelegationTaskRecord) => DelegationTaskRecord
  ): Promise<void> {
    await this.conversationStore.updateDelegationInConversation(
      context.project.id,
      context.conversationId,
      delegationId,
      (delegation) => ({
        ...delegation,
        tasks: delegation.tasks.map((task) => task.id === taskId ? updater(task) : task)
      })
    );
  }

  private handleAgentEvent(event: AgentEvent): void {
    const run = this.activeRuns.get(event.runId);
    if (event.type === 'status') {
      this.recordDiagnostic('info', 'run-status', event.message, { provider: run?.provider, runId: event.runId, conversationId: run?.conversationId, detail: event.phase });
    } else if (event.type === 'activity') {
      const heartbeat = event.title === 'Processo attivo';
      const lastHeartbeat = this.heartbeatDiagnosticAt.get(event.runId) ?? 0;
      if (!heartbeat || Date.now() - lastHeartbeat >= 120_000) {
        this.recordDiagnostic('info', 'run-activity', event.title, { provider: run?.provider, runId: event.runId, conversationId: run?.conversationId, detail: event.detail });
        if (heartbeat) this.heartbeatDiagnosticAt.set(event.runId, Date.now());
      }
    } else if (event.type === 'open-url') {
      const open = vscode.env.openExternal(vscode.Uri.parse(event.url));
      this.recordDiagnostic('info', 'browser-open', 'Apertura URL richiesto dal provider.', { provider: run?.provider, runId: event.runId, conversationId: run?.conversationId, detail: event.url });
      void open.then((opened) => {
        if (!opened) {
          this.recordDiagnostic('warning', 'browser-open', 'Il sistema non ha confermato l’apertura del browser.', { provider: run?.provider, runId: event.runId, conversationId: run?.conversationId, detail: event.url });
        }
      }, (error) => {
        this.recordDiagnostic('error', 'browser-open', `Impossibile aprire il browser: ${errorMessage(error)}`, { provider: run?.provider, runId: event.runId, conversationId: run?.conversationId, detail: event.url });
      });
    } else if (event.type === 'error') {
      this.recordDiagnostic('error', 'run-event', event.message, { provider: run?.provider, runId: event.runId, conversationId: run?.conversationId });
    } else if (event.type === 'complete') {
      this.recordDiagnostic('info', 'run-complete', 'Esecuzione completata.', { provider: run?.provider, runId: event.runId, conversationId: run?.conversationId, detail: `model=${event.result.model ?? 'default'} textLength=${event.result.text.length}` });
    }
    if (run) {
      run.updatedAt = new Date().toISOString();
      if (event.type === 'open-url' && /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(event.url)) {
        const previewUrls = Array.isArray(run.previewUrls) ? run.previewUrls as string[] : [];
        run.previewUrls = [...new Set([...previewUrls, event.url])].slice(-5);
      }
      if (event.type === 'status') {
        run.status = event.message;
        if (event.phase) run.phase = event.phase;
      } else if (event.type === 'delta' || event.type === 'replace') {
        run.phase = 'working';
        run.status = 'Risposta in corso…';
        run.partialOutput = event.type === 'replace'
          ? event.text.slice(-120_000)
          : `${run.partialOutput ?? ''}${event.text}`.slice(-120_000);
        if (!run.firstOutputAt) run.firstOutputAt = new Date().toISOString();
      } else if (event.type === 'diff') {
        run.partialChanges = extractChangedFilesFromDiff(event.diff).slice(0, 200);
      } else if (event.type === 'activity') {
        run.phase = 'working';
        run.status = event.title;
        const activity = {
          title: event.title,
          createdAt: new Date().toISOString(),
          ...(event.detail ? { detail: event.detail } : {})
        };
        if (event.title === 'Processo attivo' && run.activities.at(-1)?.title === 'Processo attivo') run.activities[run.activities.length - 1] = activity;
        else run.activities.push(activity);
        run.activities = run.activities.slice(-30);
      } else if (event.type === 'error') {
        const failure = event.failure ?? classifyProviderFailure(run.provider, event.message);
        run.failure = failure;
        run.phase = failure.category === 'rate-limit'
          ? 'rate-limited'
          : failure.category === 'permission-denied'
            ? 'permission_denied'
            : failure.category === 'authentication'
              ? 'authentication'
              : 'failed';
        run.status = failure.message;
        run.error = failure.message;
      } else if (event.type === 'complete') {
        this.heartbeatDiagnosticAt.delete(event.runId);
        run.phase = 'completed';
        run.status = 'Completato';
      }
    }
    this.emit({ type: 'agentEvent', payload: event });
  }

  private cancelRunTree(runId: string): void {
    const rootId = this.activeRuns.get(runId)?.rootRunId ?? runId;
    for (const [id, run] of this.activeRuns) {
      if (id === rootId || run.rootRunId === rootId || run.parentRunId === rootId) {
        this.scheduler.cancel(id);
        this.finalizeRun(id, 'cancelled', { reason: 'user_cancelled', parentRunId: run.parentRunId, delegationId: String((run as any).delegationId ?? '') });
      }
    }
    for (const [id, pending] of this.pendingApprovals) {
      if (pending.record.rootRunId === rootId) {
        this.pendingApprovals.delete(id);
        pending.resolve(false);
      }
    }
    this.emitState();
    setTimeout(() => {
      for (const [id, run] of this.activeRuns) {
        if (id === rootId || run.rootRunId === rootId || run.parentRunId === rootId) this.activeRuns.delete(id);
      }
      this.emitState();
    }, 1800);
  }

  private isRunCancelled(rootRunId: string): boolean {
    const run = this.activeRuns.get(rootRunId);
    return !run || run.phase === 'cancelled';
  }

  private finalizeRun(runId: string, terminalState: 'completed' | 'failed' | 'cancelled' | 'timed_out' | 'permission_denied' | 'interrupted', metadata: { reason: string; error?: string; parentRunId?: string; delegationId?: string } = { reason: 'unknown' }): void {
    const run = this.activeRuns.get(runId);
    if (!run) return;
    const oldStatus = run.phase;
    const completedAt = new Date().toISOString();
    run.phase = terminalState;
    run.status = terminalState === 'completed'
      ? 'Completato'
      : terminalState === 'cancelled'
        ? 'Interrotto'
        : terminalState === 'permission_denied'
          ? antigravityPermissionMessage(run.provider, metadata.error)
          : terminalState === 'timed_out'
            ? 'Timeout'
            : terminalState === 'interrupted'
              ? 'Interrotto: processo non più attivo'
              : metadata.error ?? 'Errore';
    run.error = terminalState === 'completed' || terminalState === 'cancelled' ? undefined : run.status;
    run.updatedAt = completedAt;
    (run as any).completedAt = completedAt;
    this.scheduler.cancel(runId);
    this.heartbeatDiagnosticAt.delete(runId);
    this.recordDiagnostic('info', 'run-transition', `[run-transition] ${oldStatus} -> ${terminalState}`, {
      provider: run.provider,
      runId,
      conversationId: run.conversationId,
      detail: `conversation=${run.conversationId}\nrun=${runId}\nparent=${metadata.parentRunId ?? run.parentRunId ?? ''}\ndelegation=${metadata.delegationId ?? String((run as any).delegationId ?? '')}\nprovider=${run.provider}\nfrom=${oldStatus}\nto=${terminalState}\nreason=${metadata.reason}`
    });
    this.emit({ type: 'agentEvent', payload: { type: 'status', runId, message: run.status, phase: terminalState } });
    this.activeRuns.delete(runId);
  }

  private async failRootRun(context: RootRunContext, error: unknown): Promise<void> {
    if (this.isRunCancelled(context.rootRunId)) return;
    const messageText = errorMessage(error);
    const failure: ProviderFailure = (error as any)?.providerFailure ?? classifyProviderFailure(context.provider, error);
    const terminal = failure.category === 'permission-denied' ? 'permission_denied' : failure.category === 'timeout' ? 'timed_out' : 'failed';
    const run = this.activeRuns.get(context.rootRunId);
    if (run) run.failure = failure;
    await this.conversationStore.appendToConversation(context.project.id, context.conversationId, {
      role: 'assistant',
      text: humanizeProviderError(context.provider, failure.message),
      provider: context.provider,
      runId: context.rootRunId,
      error: true,
      ...(context.agentId ? { agentId: context.agentId, agentName: this.agentById(context.agentId)?.name } : {}),
      ...(context.model ? { model: context.model } : {}),
      ...(context.reasoning ? { reasoning: context.reasoning } : {})
    }).catch((appendError) => this.recordDiagnostic('error', 'persistence', `Unable to persist run error: ${errorMessage(appendError)}`, { provider: context.provider, runId: context.rootRunId, conversationId: context.conversationId }));
    this.recordDiagnostic('error', 'run', messageText, { provider: context.provider, runId: context.rootRunId, conversationId: context.conversationId, detail: error instanceof Error ? error.stack : undefined });
    this.emit({ type: 'notice', payload: { level: 'error', message: failure.message } });
    await this.finishRecoveryIncident(context.rootRunId);
    this.finalizeRun(context.rootRunId, terminal, { reason: failure.category === 'permission-denied' ? 'headless_permission_denied' : 'root_failed', error: failure.message });
    this.emitState();
  }

  private async runParallel(payload: any): Promise<void> {
    const project = this.requireProject();
    const tasks = Array.isArray(payload?.tasks) ? payload.tasks.map(normalizeTask).filter(Boolean) as ParallelTaskInput[] : [];
    if (tasks.length === 0) throw new Error('Aggiungi almeno un task parallelo.');
    const useWorktrees = payload?.useWorktrees !== false
      && vscode.workspace.getConfiguration('relay').get<boolean>('worktrees.enabled', true);
    if (useWorktrees) {
      const gitReadiness = await this.ensureOptionalComponent('git', 'Task paralleli con worktree');
      if (gitReadiness === 'cancel') return;
    }
    if (useWorktrees && !project.isGit) throw new Error('I task writer paralleli richiedono un repository Git con almeno un commit.');

    const leases = new Map<string, WorktreeLease>();
    const prepared = await Promise.all(tasks.map(async (task) => {
      if (!useWorktrees || task.permission === 'read-only') return { task, cwd: project.path };
      const lease = await this.worktrees.create(project.path, task.id);
      leases.set(task.id, lease);
      return { task, cwd: lease.path };
    }));

    this.emit({ type: 'parallelUpdate', payload: {
      type: 'started',
      tasks: prepared.map(({ task, cwd }) => ({ ...task, cwd, branch: leases.get(task.id)?.branch }))
    } });

    const results = await Promise.allSettled(prepared.map(async ({ task, cwd }) => {
      const result = await this.scheduler.run({
        runId: task.id,
        provider: task.provider,
        prompt: task.prompt,
        cwd,
        permission: task.permission,
        ...(task.model && task.model !== 'auto' ? { model: task.model } : {}),
        ...(task.reasoning && task.reasoning !== 'auto' ? { reasoning: task.reasoning } : {}),
        ...(this.rulesEngine.compile(task.provider, this.rulesForProject(project.id))
          ? { rules: this.rulesEngine.compile(task.provider, this.rulesForProject(project.id)) }
          : {})
      }, (event) => this.handleAgentEvent(event));
      const lease = leases.get(task.id);
      const inspection = lease ? await this.worktrees.inspect(lease) : undefined;
      return {
        task,
        result: {
          ...result,
          ...(inspection?.diff ? { diff: inspection.diff } : {}),
          ...(inspection?.changedFiles ? { changedFiles: inspection.changedFiles } : {})
        },
        ...(lease ? { worktree: lease.path, branch: lease.branch } : {})
      };
    }));

    this.emit({ type: 'parallelUpdate', payload: {
      type: 'completed',
      results: results.map((result, index) => result.status === 'fulfilled'
        ? { status: 'fulfilled', ...result.value }
        : { status: 'rejected', task: tasks[index], error: errorMessage(result.reason) })
    } });
    await this.refreshUsage(false);
    this.emitState();
  }

  private async renameConversation(conversationId: string): Promise<void> {
    const current = (await this.conversationStore.list(this.requireProject().id)).find((conversation) => conversation.id === conversationId);
    if (!current) return;
    const title = await vscode.window.showInputBox({
      title: 'Rinomina conversazione',
      value: current.title,
      prompt: 'Scegli un titolo breve e riconoscibile.'
    });
    if (title) await this.conversationStore.rename(this.requireProject().id, conversationId, title);
    this.emitState();
  }

  private async archiveConversation(
    conversationId: string,
    requestedProjectId?: string,
    stay?: 'projects' | 'history'
  ): Promise<void> {
    const targetProjectId = requestedProjectId ?? this.requireProject().id;
    const answer = await vscode.window.showWarningMessage(
      'Archiviare questa conversazione?',
      { modal: true, detail: 'La chat resta disponibile nella sezione Archiviate e può essere ripristinata in qualsiasi momento.' },
      'Archivia'
    );
    if (answer !== 'Archivia') return;
    await this.conversationStore.archive(targetProjectId, conversationId);
    if (stay === 'projects') this.emit({ type: 'uiCommand', payload: { action: 'open-projects' } });
    else this.emit({ type: 'uiCommand', payload: { action: 'open-history' } });
    this.emitState();
  }

  private async restoreConversation(
    conversationId: string,
    requestedProjectId?: string,
    stay?: 'projects' | 'history'
  ): Promise<void> {
    const targetProjectId = requestedProjectId ?? this.requireProject().id;
    await this.conversationStore.restore(targetProjectId, conversationId);
    if (stay === 'projects') this.emit({ type: 'uiCommand', payload: { action: 'open-projects' } });
    else this.emit({ type: 'uiCommand', payload: { action: 'open-history' } });
    this.emit({ type: 'notice', payload: { level: 'info', message: 'Conversazione ripristinata.' } });
    this.emitState();
  }

  private async deleteConversation(
    conversationId: string,
    requestedProjectId?: string,
    stay?: 'projects' | 'history'
  ): Promise<void> {
    const targetProjectId = requestedProjectId ?? this.requireProject().id;
    const answer = await vscode.window.showWarningMessage(
      'Eliminare definitivamente questa conversazione?',
      { modal: true, detail: 'Messaggi, deleghe e riferimenti alle sessioni verranno rimossi dalla cronologia Relay. I file del progetto non saranno toccati.' },
      'Elimina'
    );
    if (answer !== 'Elimina') return;
    await this.conversationStore.delete(targetProjectId, conversationId);
    if (targetProjectId === this.requireProject().id) {
      // Do not create a replacement chat while the user is browsing projects/history.
      // The store will lazily create one only when the chat surface is opened again.
      if (stay === 'projects') this.emit({ type: 'uiCommand', payload: { action: 'open-projects' } });
      else if (stay === 'history') this.emit({ type: 'uiCommand', payload: { action: 'open-history' } });
      else this.emit({ type: 'uiCommand', payload: { action: 'open-history' } });
    }
    this.emitState();
  }

  private async newConversation(provider: ProviderId): Promise<void> {
    const project = this.requireProject();
    const defaults = this.preferences.providerDefaults[provider];
    await this.conversationStore.newConversation(
      project.id,
      provider,
      this.preferences.delegationPolicy,
      defaults.permission,
      defaults.model,
      defaults.reasoning
    );
  }

  private async ensureActiveConversation(provider: ProviderId = this.preferences.defaultProvider) {
    const project = this.requireProject();
    const effectiveProvider = this.isProviderConnected(provider)
      ? provider
      : this.firstConnectedProvider() ?? provider;
    const defaults = this.preferences.providerDefaults[effectiveProvider];
    return this.conversationStore.getOrCreate(
      project.id,
      effectiveProvider,
      this.preferences.delegationPolicy,
      defaults.permission,
      defaults.model,
      defaults.reasoning
    );
  }


  private agentById(id: string): CustomAgentRecord | undefined {
    const cleaned = id.trim();
    if (!cleaned) return undefined;
    return this.agents.find((agent) => agent.id === cleaned && agent.enabled);
  }

  private resolveDelegationAgentReference(reference: string, projectId: string): CustomAgentRecord | undefined {
    const cleaned = reference
      .trim()
      .replace(/^@agent\[([^\]]+)\]$/i, '$1')
      .replace(/^@"([^"]+)"$/, '$1')
      .replace(/^@/, '')
      .trim();
    if (!cleaned || cleaned.toLowerCase() === 'auto') return undefined;
    const visible = this.visibleAgents(projectId);
    return visible.find((agent) => agent.id === cleaned)
      ?? visible.find((agent) => agent.name.localeCompare(cleaned, undefined, { sensitivity: 'accent' }) === 0);
  }

  private visibleAgents(projectId: string): CustomAgentRecord[] {
    return visibleAgentsForProject(this.agents, projectId);
  }

  private async selectAgent(agentId: string): Promise<void> {
    const project = this.requireProject();
    const agent = this.agentById(agentId);
    if (!agent) throw new Error('Agente non trovato o disattivato.');
    const providerStatus = this.providers.find((entry) => entry.id === agent.provider);
    if (!providerStatus?.available || providerStatus.connected === false) {
      throw new Error(`${providerLabel(agent.provider)} è scollegato o non disponibile per l’agente ${agent.name}.`);
    }
    await this.ensureActiveConversation(agent.provider);
    const defaults = this.preferences.providerDefaults[agent.provider];
    const normalized = normalizeRunSelection({ provider: agent.provider, model: agent.model ?? defaults.model, reasoning: agent.reasoning ?? defaults.reasoning, providers: this.providers });
    await this.conversationStore.updateSelection(
      project.id,
      agent.provider,
      normalizedSelection(normalized.model, defaults.model),
      normalizedSelection(normalized.reasoning, defaults.reasoning),
      agent.permission,
      agent.id
    );
    this.emitState();
  }

  private async saveAgent(payload: any): Promise<void> {
    const agentId = stringOrUndefined(payload?.agentId);
    const current = agentId ? this.agents.find((agent) => agent.id === agentId) : undefined;
    if (agentId && !current) throw new Error('Agente non trovato.');

    const name = cleanAgentText(payload?.name, 80);
    if (!name) throw new Error('Il nome dell’agente è obbligatorio.');
    const provider = asProviderId(payload?.provider);
    const defaults = this.preferences.providerDefaults[provider];
    const normalized = normalizeRunSelection({
      provider,
      model: cleanAgentText(payload?.model, 200) ?? 'auto',
      reasoning: cleanAgentText(payload?.reasoning, 100) ?? 'auto',
      providers: this.providers
    });
    const globalVisible = payload?.globalVisible !== false;
    const knownProjects = new Set((await this.projectStore.list()).map((project) => project.id));
    if (this.currentProject) knownProjects.add(this.currentProject.id);
    const projectIds = globalVisible
      ? []
      : cleanAgentArray(payload?.projectIds, 80, 120).filter((id) => knownProjects.has(id));
    if (!globalVisible && projectIds.length === 0) projectIds.push(this.requireProject().id);
    const patch: Partial<CustomAgentRecord> & { name: string; provider: ProviderId } = {
      name,
      provider,
      model: normalized.model,
      reasoning: normalized.reasoning,
      permission: asPermission(payload?.permission),
      bio: cleanAgentText(payload?.bio, 240) ?? '',
      specialization: cleanAgentText(payload?.specialization, 160) ?? '',
      instructions: cleanAgentMultiline(payload?.instructions, 12_000),
      enabled: payload?.enabled !== false,
      canDelegate: Boolean(payload?.canDelegate),
      visibleInChat: payload?.visibleInChat !== false,
      globalVisible,
      projectIds,
      isDefault: Boolean(payload?.isDefault)
    };

    if (patch.isDefault) {
      for (const agent of this.agents) {
        if (agent.id === agentId || !agent.isDefault) continue;
        this.agents = await this.agentStore.update(agent.id, { isDefault: false });
      }
      this.preferences = await this.preferencesStore.update({ defaultProvider: provider });
    }

    this.agents = current
      ? await this.agentStore.update(current.id, patch)
      : await this.agentStore.create(patch);
    this.emitState();
    this.emit({ type: 'notice', payload: { level: 'info', message: current ? `Agente ${name} aggiornato.` : `Agente ${name} creato.` } });
  }

  private async deleteAgent(agentId: string): Promise<void> {
    const current = this.agents.find((agent) => agent.id === agentId);
    if (!current) return;
    this.agents = await this.agentStore.delete(agentId);
    this.emitState();
    this.emit({ type: 'notice', payload: { level: 'info', message: `Agente ${current.name} eliminato.` } });
  }

  private async toggleAgent(agentId: string, enabled: boolean): Promise<void> {
    if (!this.agents.some((agent) => agent.id === agentId)) return;
    this.agents = await this.agentStore.update(agentId, { enabled });
    this.emitState();
  }

  private async setDefaultAgent(agentId: string): Promise<void> {
    if (!this.agents.some((agent) => agent.id === agentId)) return;
    for (const agent of this.agents) {
      if (agent.isDefault === (agent.id === agentId)) continue;
      this.agents = await this.agentStore.update(agent.id, { isDefault: agent.id === agentId });
    }
    const selected = this.agents.find((agent) => agent.id === agentId);
    if (selected) this.preferences = await this.preferencesStore.update({ defaultProvider: selected.provider });
    this.emitState();
  }

  private async toggleAgentProject(agentId: string): Promise<void> {
    const project = this.requireProject();
    const agent = this.agents.find((entry) => entry.id === agentId);
    if (!agent) return;
    const projectIds = agent.projectIds.includes(project.id)
      ? agent.projectIds.filter((id) => id !== project.id)
      : [...agent.projectIds, project.id];
    this.agents = await this.agentStore.update(agentId, { projectIds, globalVisible: false });
    this.emitState();
  }

  private async configureCopilotUsage(): Promise<void> {
    const existing = await this.context.secrets.get(COPILOT_BILLING_TOKEN_KEY);
    const action = await vscode.window.showInformationMessage(
      'Per leggere utilizzo e dettaglio per modello, GitHub richiede un token fine-grained con permesso utente “Plan: read”. Relay lo salva nel Secret Storage di VS Code e non lo inserisce nei backup.',
      { modal: true, detail: 'Il normale login di Copilot CLI espone la sessione, ma non garantisce accesso ai dati mensili di billing. Per piani gestiti da un’organizzazione servono anche i relativi permessi di billing.' },
      existing ? 'Sostituisci token' : 'Inserisci token',
      ...(existing ? ['Rimuovi token'] : [])
    );
    if (action === 'Rimuovi token') {
      await this.context.secrets.delete(COPILOT_BILLING_TOKEN_KEY);
      await this.refreshProviders(false);
      await this.refreshUsage(true);
      return;
    }
    if (action !== 'Inserisci token' && action !== 'Sostituisci token') return;
    const token = await vscode.window.showInputBox({
      title: 'GitHub usage · token fine-grained',
      prompt: 'Incolla un token con User permissions → Plan: Read-only.',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => value.trim().length >= 20 ? undefined : 'Token non valido o troppo corto.'
    });
    if (!token?.trim()) return;
    await this.context.secrets.store(COPILOT_BILLING_TOKEN_KEY, token.trim());
    await this.refreshProviders(false);
    await this.refreshUsage(true);
    this.emit({ type: 'notice', payload: { level: 'info', message: 'Utilizzo GitHub collegato. Relay aggiornerà i dati mensili tramite API ufficiale.' } });
  }

  private async upgradeProvider(provider: ProviderId): Promise<void> {
    const activeSetup = this.providerSetup.get(provider);
    if (activeSetup?.phase === 'installing' || activeSetup?.phase === 'login') {
      this.emit({ type: 'notice', payload: { level: 'info', message: `${providerLabel(provider)} è già in configurazione.` } });
      return;
    }
    if (!await this.ensureProviderInstallerRequirements(provider)) return;
    const installer = providerInstaller(provider);
    const confirmation = await vscode.window.showInformationMessage(
      `Aggiornare ${installer.label} CLI?`,
      { modal: true, detail: `Relay userà l’installer ufficiale/idempotente:\n${installer.command}\n\nDopo l’upgrade verificherà versione, PATH e login.` },
      'Aggiorna'
    );
    if (confirmation !== 'Aggiorna') return;
    const terminal = vscode.window.createTerminal({
      name: `Relay Upgrade — ${installer.label}`,
      cwd: this.workspacePath() ?? homedir(),
      env: { PATH: enhancedTerminalPath(), Path: enhancedTerminalPath() },
      ...(installer.shellPath ? { shellPath: installer.shellPath } : {}),
      ...(installer.shellArgs ? { shellArgs: installer.shellArgs } : {})
    });
    terminal.show(false);
    this.setProviderSetup(provider, { phase: 'installing', message: 'Upgrade CLI in corso…', startedAt: new Date().toISOString() });
    void this.runProviderInstallation(provider, installer.label, installer.command, terminal);
  }

  private async installProvider(provider: ProviderId): Promise<void> {
    const activeSetup = this.providerSetup.get(provider);
    if (activeSetup?.phase === 'installing' || activeSetup?.phase === 'login') {
      this.emit({ type: 'notice', payload: { level: 'info', message: `${providerLabel(provider)} è già in configurazione.` } });
      return;
    }

    if (!await this.ensureProviderInstallerRequirements(provider)) return;
    const installer = providerInstaller(provider);
    const confirmation = await vscode.window.showInformationMessage(
      `Installare ${installer.label} CLI tramite l’installer ufficiale?`,
      { modal: true, detail: `${installer.command}\n\nRelay seguirà il comando, mostrerà gli errori e avvierà automaticamente l’accesso quando necessario.` },
      'Installa'
    );
    if (confirmation !== 'Installa') return;

    const terminal = vscode.window.createTerminal({
      name: `Relay Setup — ${installer.label}`,
      cwd: this.workspacePath() ?? homedir(),
      env: { PATH: enhancedTerminalPath(), Path: enhancedTerminalPath() },
      ...(installer.shellPath ? { shellPath: installer.shellPath } : {}),
      ...(installer.shellArgs ? { shellArgs: installer.shellArgs } : {})
    });
    terminal.show(false);
    this.setProviderSetup(provider, {
      phase: 'installing',
      message: 'Avvio installer…',
      startedAt: new Date().toISOString()
    });
    this.emit({ type: 'notice', payload: { level: 'info', message: `Installer ${installer.label} avviato nel terminale. Relay ne controllerà esito e rilevamento.` } });
    void this.runProviderInstallation(provider, installer.label, installer.command, terminal);
  }

  private async runProviderInstallation(
    provider: ProviderId,
    label: string,
    command: string,
    terminal: vscode.Terminal
  ): Promise<void> {
    try {
      const result = await this.executeTrackedTerminalCommand(provider, terminal, command, 10 * 60_000, 'installing');
      if (result.timedOut) {
        this.failProviderSetup(provider, `Installazione ${label} oltre il tempo massimo.`, 'Il terminale è rimasto aperto: controlla l’ultimo messaggio e riprova dopo aver risolto l’errore.');
        return;
      }
      if (result.exitCode !== undefined && result.exitCode !== 0) {
        const detail = compactTerminalOutput(result.output) || `Il comando è terminato con codice ${result.exitCode}.`;
        this.failProviderSetup(provider, `Installazione ${label} non riuscita.`, detail);
        return;
      }

      this.setProviderSetup(provider, {
        phase: 'installing',
        message: 'Installer completato · rilevamento CLI…',
        ...(compactTerminalOutput(result.output) ? { detail: compactTerminalOutput(result.output) } : {}),
        startedAt: new Date().toISOString()
      });

      const detected = await this.waitForProviderDetection(provider, 45_000);
      if (!detected) {
        const detail = compactTerminalOutput(result.output) || 'L’installer è terminato, ma l’eseguibile non è stato trovato nei percorsi conosciuti.';
        this.failProviderSetup(provider, `${label} installato ma non rilevato.`, `${detail}\nApri Diagnostica oppure imposta manualmente il percorso CLI nelle impostazioni VS Code.`);
        return;
      }

      if (detected.executable && detected.executable !== 'Antigravity IDE native') {
        activateExecutableForCurrentProcess(detected.executable);
        await vscode.workspace.getConfiguration('relay').update(
          `executables.${provider}`,
          detected.executable,
          vscode.ConfigurationTarget.Global
        );
        await this.replaceRegistry();
      }
      await this.refreshProviders(false);
      const current = this.providers.find((entry) => entry.id === provider) ?? detected;

      if (current.authenticated === false || provider === 'copilot' || provider === 'antigravity') {
        this.emit({ type: 'notice', payload: { level: 'info', message: `${current.label} installato. Avvio automatico dell’accesso nel terminale.` } });
        await this.runProviderLogin(provider, current, terminal, true);
        return;
      }

      this.providerSetup.delete(provider);
      this.emitState();
      this.emit({ type: 'notice', payload: { level: 'info', message: `${current.label} è pronto in ${current.executable}.` } });
    } catch (error) {
      this.failProviderSetup(provider, `Configurazione ${label} interrotta.`, errorMessage(error));
    }
  }

  private async waitForProviderDetection(provider: ProviderId, timeoutMs: number): Promise<ProviderStatus | undefined> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      clearExecutableResolutionCache();
      const status = await this.registry.get(provider).detect().catch(() => undefined);
      const cliDetected = Boolean(status?.available && status.executable && status.executable !== 'Antigravity IDE native');
      if (status && cliDetected) return status;
      await delay(1500);
    }
    return undefined;
  }

  private async disconnectProvider(provider: ProviderId): Promise<void> {
    if (!this.isProviderConnected(provider)) {
      this.emit({ type: 'notice', payload: { level: 'info', message: `${providerLabel(provider)} è già scollegato da Relay.` } });
      return;
    }
    const status = this.providers.find((entry) => entry.id === provider) ?? this.applyProviderConnectionState(await this.registry.get(provider).detect());
    const disconnected = [...new Set([...(this.preferences.disconnectedProviders ?? []), provider])];
    const fallbackProvider = this.firstConnectedProvider(provider);
    this.preferences = await this.preferencesStore.update({
      disconnectedProviders: disconnected,
      ...(this.preferences.defaultProvider === provider && fallbackProvider ? { defaultProvider: fallbackProvider } : {})
    });
    await this.conversationStore.clearProviderSessions(provider);
    this.providerSetup.delete(provider);
    await this.refreshProviders(false);
    await this.refreshUsage(false);
    this.emitState();
    this.emit({
      type: 'notice',
      payload: { level: 'info', message: `${status.label} scollegato da Relay. Account, CLI e chat native non sono stati modificati.` }
    });
  }

  private async connectProvider(provider: ProviderId): Promise<void> {
    if (this.isProviderConnected(provider)) {
      this.emit({ type: 'notice', payload: { level: 'info', message: `${providerLabel(provider)} è già collegato a Relay.` } });
      return;
    }
    this.preferences = await this.preferencesStore.update({
      disconnectedProviders: (this.preferences.disconnectedProviders ?? []).filter((entry) => entry !== provider)
    });
    await this.refreshProviders(false);
    await this.refreshUsage(false);
    const status = this.providers.find((entry) => entry.id === provider);
    this.emitState();
    if (!status?.available || status.authenticated === false) {
      this.emit({ type: 'notice', payload: { level: 'warning', message: `${providerLabel(provider)} ricollegato, ma richiede configurazione o accesso.` } });
      return;
    }
    this.emit({ type: 'notice', payload: { level: 'info', message: `${providerLabel(provider)} ricollegato a Relay.` } });
  }

  private isProviderConnected(provider: ProviderId): boolean {
    return !(this.preferences.disconnectedProviders ?? []).includes(provider);
  }

  private firstConnectedProvider(exclude?: ProviderId): ProviderId | undefined {
    const order: ProviderId[] = ['codex', 'claude', 'antigravity', 'copilot'];
    return order.find((provider) => provider !== exclude && this.isProviderConnected(provider));
  }

  private async continueFailedRun(runId: string, provider: ProviderId): Promise<void> {
    const target = this.providers.find((entry) => entry.id === provider);
    if (!target || target.healthState !== 'ready' || target.connected === false) {
      throw new Error(`${providerLabel(provider)} non è pronto per continuare il task.`);
    }
    const project = this.requireProject();
    const conversation = await this.conversationStore.getOrCreate(
      project.id,
      this.preferences.defaultProvider,
      this.preferences.delegationPolicy,
      this.preferences.providerDefaults[this.preferences.defaultProvider].permission,
      this.preferences.providerDefaults[this.preferences.defaultProvider].model,
      this.preferences.providerDefaults[this.preferences.defaultProvider].reasoning
    );
    const original = [...conversation.messages].reverse().find((message) => message.role === 'user' && message.runId === runId);
    if (!original) throw new Error('La richiesta originale del run non è più disponibile.');
    const previous = [...conversation.messages].reverse().find((message) => message.role === 'assistant' && message.runId === runId);
    const active = this.activeRuns.get(runId);
    const permission = active?.permission ?? conversation.permission;
    if (permission !== 'read-only') {
      const choice = await vscode.window.showWarningMessage(
        `Continuare con ${providerLabel(provider)} dopo un task con permessi di scrittura?`,
        { modal: true, detail: 'Relay non rilancerà alla cieca le operazioni. Il nuovo provider dovrà prima ispezionare Git e i file già modificati, poi proseguire evitando duplicazioni.' },
        'Continua in sicurezza'
      );
      if (choice !== 'Continua in sicurezza') return;
    }
    const changed = active?.partialChanges ?? [];
    const partial = active?.partialOutput?.trim() || (previous?.error ? '' : previous?.text?.trim()) || '';
    const prompt = [
      '# Relay controlled failover',
      `Provider precedente: ${providerLabel(original.provider ?? conversation.provider)}. Run originale: ${runId}.`,
      'Prima di agire, controlla lo stato corrente del workspace e Git. Non ripetere modifiche già applicate e non assumere che il task precedente sia stato atomico.',
      changed.length ? `File rilevati come modificati: ${changed.join(', ')}` : 'Nessun elenco affidabile di file modificati è disponibile: ispeziona il workspace.',
      partial ? `Output parziale preservato:\n${partial.slice(-30_000)}` : 'Nessun output parziale affidabile disponibile.',
      `Richiesta originale:\n${original.text}`
    ].join('\n\n');
    await this.sendMessage({
      prompt,
      displayPrompt: `Continua il task precedente con ${providerLabel(provider)}`,
      provider,
      permission,
      model: this.preferences.providerDefaults[provider].model,
      reasoning: this.preferences.providerDefaults[provider].reasoning
    });
  }

  private async resolveRunError(runId: string): Promise<void> {
    if (!runId) throw new Error('Run non valido.');
    if (this.runRecoveryIncidents.has(runId)) {
      this.emit({ type: 'notice', payload: { level: 'warning', message: 'La risoluzione di questo errore è già in corso.' } });
      return;
    }
    const project = this.requireProject();
    const conversation = await this.conversationStore.getActive(project.id);
    if (!conversation) throw new Error('Conversazione non disponibile.');
    const activeRun = this.activeRuns.get(runId);
    const errorIndex = conversation.messages.findIndex((entry) => entry.runId === runId && entry.role === 'assistant' && entry.error);
    const errorMessageEntry = errorIndex >= 0 ? conversation.messages[errorIndex] : undefined;
    if (!activeRun?.error && !errorMessageEntry) throw new Error('L’errore del run non è più disponibile.');
    const failedProvider = activeRun?.provider ?? errorMessageEntry?.provider ?? conversation.provider;
    const helper = selectRunRecoveryProvider(failedProvider, this.providers, this.usage);
    if (!helper) {
      this.emit({ type: 'notice', payload: { level: 'warning', message: 'Nessun altro provider disponibile per risolvere questo errore.' } });
      return;
    }
    const previousUser = errorIndex > 0
      ? [...conversation.messages.slice(0, errorIndex)].reverse().find((entry) => entry.role === 'user')
      : undefined;
    const diagnostics = this.diagnosticRecords
      .filter((entry) => entry.runId === runId || entry.provider === failedProvider)
      .slice(-20)
      .map((entry) => `${entry.timestamp} [${entry.level}] ${entry.scope}: ${entry.message}${entry.detail ? `\n${entry.detail}` : ''}`)
      .join('\n');
    const remoteRelated = /remote|tunnel|tailscale|funnel|pairing/i.test(`${activeRun?.error ?? ''}\n${errorMessageEntry?.text ?? ''}\n${diagnostics}`);
    const bundle = buildRunErrorRecoveryBundle({
      runId,
      failedProvider,
      activeRun,
      errorMessage: errorMessageEntry,
      originalPrompt: activeRun?.originalPrompt ?? previousUser?.text,
      diagnostics,
      platform: process.platform,
      arch: process.arch,
      editor: vscode.env.appName,
      remoteName: vscode.env.remoteName,
      ...(remoteRelated ? { tunnel: this.tunnelManager.snapshot() } : {})
    });
    this.runRecoveryIncidents.add(runId);
    try {
      const prompt = [
        '# Relay run error recovery',
        `Risolvi chirurgicamente l’errore del run ${runId} fallito su ${providerLabel(failedProvider)}. Tu sei il provider di recovery ${providerLabel(helper)}.`,
        'Hai accesso completo per diagnosticare, modificare il codice e verificare il fix. Prima di cambiare installazioni globali, PATH, autenticazioni, servizi o configurazioni esterne chiedi comunque conferma esplicita.',
        'Controlla le modifiche parziali prima di agire, evita duplicazioni e non toccare aree non correlate. Esegui test mirati e riporta in chat cosa hai corretto e quali verifiche sono passate.',
        'Bundle sanitizzato:',
        '```json', JSON.stringify(bundle, null, 2), '```'
      ].join('\n\n');
      await this.newConversation(helper);
      await this.sendMessage({
        prompt,
        displayPrompt: `Risolvi errore ${providerLabel(failedProvider)} con ${providerLabel(helper)}`,
        provider: helper,
        permission: 'danger-full-access',
        model: this.preferences.providerDefaults[helper].model,
        reasoning: this.preferences.providerDefaults[helper].reasoning
      });
      this.emit({ type: 'notice', payload: { level: 'info', message: `${providerLabel(helper)} sta risolvendo l’errore di ${providerLabel(failedProvider)} con accesso completo.` } });
    } finally {
      this.runRecoveryIncidents.delete(runId);
    }
  }

  private providerRecoveryBundle(provider: ProviderId) {
    const status = this.providers.find((entry) => entry.id === provider) ?? this.registry.currentStatuses().find((entry) => entry.id === provider);
    if (!status) throw new Error(`Provider ${provider} non registrato.`);
    const related = this.diagnosticRecords
      .filter((entry) => entry.provider === provider)
      .slice(-12)
      .map((entry) => `${entry.timestamp} [${entry.level}] ${entry.scope}: ${entry.message}${entry.detail ? `\n${entry.detail}` : ''}`)
      .join('\n');
    return buildProviderRecoveryBundle({
      target: status,
      providers: this.providers,
      platform: process.platform,
      arch: process.arch,
      editor: vscode.env.appName,
      remoteName: vscode.env.remoteName,
      pathValue: process.env.PATH,
      diagnostics: related
    });
  }

  private async copyProviderDiagnostics(provider: ProviderId): Promise<void> {
    const bundle = this.providerRecoveryBundle(provider);
    await vscode.env.clipboard.writeText(JSON.stringify(bundle, null, 2));
    this.emit({ type: 'notice', payload: { level: 'info', message: `Diagnostica ${providerLabel(provider)} copiata senza token o prompt completi.` } });
  }

  private async recoverProvider(target: ProviderId, requestedHelper?: ProviderId): Promise<void> {
    if (this.recoveryIncidents.has(target)) {
      this.emit({ type: 'notice', payload: { level: 'warning', message: `Una recovery per ${providerLabel(target)} è già in corso.` } });
      return;
    }
    const candidates = recoveryCandidates(target, this.providers, this.usage);
    const helper = requestedHelper && candidates.includes(requestedHelper) ? requestedHelper : candidates[0];
    const bundle = this.providerRecoveryBundle(target);
    if (!helper) {
      await vscode.env.clipboard.writeText(JSON.stringify(bundle, null, 2));
      this.emit({ type: 'notice', payload: { level: 'warning', message: `Nessun provider sano può riparare ${providerLabel(target)}. Diagnostica manuale copiata.` } });
      return;
    }
    this.recoveryIncidents.add(target);
    const prompt = [
      '# Relay provider recovery incident',
      `Diagnostica e prova a correggere ${providerLabel(target)} senza modificare provider non correlati.`,
      'Inizia con probe non distruttivi. Hai accesso completo al task per leggere, testare e correggere il progetto Relay; non cambiare PATH globale, account, installazioni o configurazioni esterne senza conferma esplicita. Non aprire Browser Agent.',
      'Se il progetto Relay è aperto, analizza soltanto i file indicati nel bundle, applica una correzione locale coerente con il permesso e lancia i test mirati.',
      'Relay rilancerà automaticamente i probe del provider obiettivo al termine. Non dichiarare risolto senza evidenze.',
      'Bundle sanitizzato:',
      '```json', JSON.stringify(bundle, null, 2), '```'
    ].join('\n\n');
    await this.newConversation(helper);
    await this.sendMessage({
      prompt,
      provider: helper,
      permission: 'danger-full-access',
      model: this.preferences.providerDefaults[helper].model,
      reasoning: this.preferences.providerDefaults[helper].reasoning,
      recoveryTarget: target
    });
    this.emit({ type: 'notice', payload: { level: 'info', message: `${providerLabel(helper)} sta diagnosticando ${providerLabel(target)}. È consentito un solo handoff per questo incidente.` } });
  }

  private async finishRecoveryIncident(rootRunId: string): Promise<void> {
    const target = this.recoveryTargetsByRun.get(rootRunId);
    if (!target) return;
    this.recoveryTargetsByRun.delete(rootRunId);
    try {
      clearExecutableResolutionCache();
      const detected = await this.registry.detectAll({ force: true, timeoutMs: 25_000 });
      this.providers = detected.map((provider) => this.applyProviderConnectionState(provider));
      const current = this.providers.find((entry) => entry.id === target);
      const verification = current?.healthState === 'ready'
        ? `${providerLabel(target)} ha superato i controlli correnti.`
        : `${providerLabel(target)} risulta ancora ${current?.healthState ?? 'non disponibile'} nel processo editor attuale.`;
      const restartMessage = `${verification} Se la recovery ha modificato launcher, estensione, PATH o configurazione del provider, riavvia l’editor prima di riconnettere o riprovare: il processo corrente può conservare moduli e ambiente precedenti.`;
      this.emit({ type: 'notice', payload: { level: current?.healthState === 'ready' ? 'info' : 'warning', message: restartMessage } });
      void vscode.window.showInformationMessage(restartMessage, 'Riavvia editor', 'Più tardi').then(async (action) => {
        if (action === 'Riavvia editor') await vscode.commands.executeCommand('workbench.action.reloadWindow');
      });
    } finally {
      this.recoveryIncidents.delete(target);
    }
  }

  private applyProviderConnectionState(provider: ProviderStatus): ProviderStatus {
    if (this.isProviderConnected(provider.id)) return { ...provider, connected: true };
    return {
      ...provider,
      connected: false,
      available: false,
      operational: false,
      healthState: 'disconnected',
      detail: 'Scollegato da Relay. La CLI e l’account restano invariati.'
    };
  }

  private async openProviderSetup(provider: ProviderId): Promise<void> {
    if (!this.isProviderConnected(provider)) {
      await this.connectProvider(provider);
      return;
    }
    const activeSetup = this.providerSetup.get(provider);
    if (activeSetup?.phase === 'installing' || activeSetup?.phase === 'login') {
      this.emit({ type: 'notice', payload: { level: 'info', message: `${providerLabel(provider)} è già in configurazione.` } });
      return;
    }
    const status = this.providers.find((entry) => entry.id === provider) ?? await this.registry.get(provider).detect();
    if (!status.available || (provider === 'antigravity' && status.cliAvailable === false)) {
      await this.installProvider(provider);
      return;
    }
    const terminal = vscode.window.createTerminal({
      name: `Relay Login — ${status.label}`,
      cwd: this.workspacePath() ?? homedir(),
      env: { PATH: [dirname(status.executable), enhancedTerminalPath()].join(delimiter), Path: [dirname(status.executable), enhancedTerminalPath()].join(delimiter) },
      ...(process.platform === 'win32' ? { shellPath: 'powershell.exe', shellArgs: ['-NoLogo', '-NoExit'] } : {})
    });
    terminal.show(false);
    void this.runProviderLogin(provider, status, terminal, false);
  }

  private async runProviderLogin(
    provider: ProviderId,
    status: ProviderStatus,
    terminal: vscode.Terminal,
    automatic: boolean
  ): Promise<void> {
    this.setProviderSetup(provider, {
      phase: 'login',
      message: automatic ? 'Installato · accesso automatico in corso…' : 'Accesso in corso nel terminale…',
      detail: loginGuidance(provider),
      startedAt: new Date().toISOString()
    });
    terminal.show(false);
    this.emit({
      type: 'notice',
      payload: {
        level: 'info',
        message: `${loginGuidance(provider)} Il terminale è stato portato in primo piano: incolla lì l’eventuale codice richiesto.`
      }
    });

    try {
      const command = terminalLoginCommand(provider, status.executable);
      const result = await this.executeTrackedTerminalCommand(provider, terminal, command, 12 * 60_000, 'login');
      if (result.timedOut) {
        this.failProviderSetup(provider, `Accesso ${status.label} non completato.`, 'Tempo massimo superato. Il terminale resta aperto per terminare o riprovare la procedura.');
        return;
      }
      await this.refreshProviders(false);
      const refreshed = this.providers.find((entry) => entry.id === provider);
      if (result.exitCode !== undefined && result.exitCode !== 0) {
        this.failProviderSetup(provider, `Accesso ${status.label} non riuscito.`, compactTerminalOutput(result.output) || `Codice di uscita ${result.exitCode}.`);
        return;
      }
      if (refreshed?.authenticated === false) {
        this.failProviderSetup(provider, `Accesso ${status.label} non confermato.`, compactTerminalOutput(result.output) || 'La CLI risulta ancora non autenticata. Riapri Accedi e completa il flusso nel browser e nel terminale.');
        return;
      }
      this.providerSetup.delete(provider);
      this.emitState();
      this.emit({ type: 'notice', payload: { level: 'info', message: `${status.label} configurato e pronto.` } });
    } catch (error) {
      this.failProviderSetup(provider, `Accesso ${status.label} interrotto.`, errorMessage(error));
    }
  }

  private async executeTrackedTerminalCommand(
    provider: ProviderId,
    terminal: vscode.Terminal,
    command: string,
    timeoutMs: number,
    phase: 'installing' | 'login'
  ): Promise<TrackedTerminalResult> {
    const integration = await waitForShellIntegration(terminal, 4500);
    if (!integration) {
      this.recordDiagnostic('warning', 'provider-setup', `${providerLabel(provider)}: shell integration non disponibile; uso marker di uscita come fallback.`, { provider });
      return this.executeTerminalCommandWithMarker(provider, terminal, command, timeoutMs, phase);
    }

    const execution = integration.executeCommand(command);
    let output = '';
    let lastUiUpdate = 0;
    const streamTask = (async () => {
      for await (const chunk of execution.read()) {
        output = trimTerminalBuffer(output + stripTerminalControl(chunk), 16_000);
        const now = Date.now();
        if (now - lastUiUpdate > 1200) {
          lastUiUpdate = now;
          const latest = lastMeaningfulTerminalLine(output);
          if (latest) this.updateProviderSetupMessage(provider, phase, latest);
        }
      }
    })().catch(() => undefined);

    let endDisposable: vscode.Disposable | undefined;
    const ended = new Promise<number | undefined>((resolve) => {
      endDisposable = vscode.window.onDidEndTerminalShellExecution((event) => {
        if (event.execution !== execution) return;
        endDisposable?.dispose();
        resolve(event.exitCode);
      });
    });
    const timeout = delay(timeoutMs).then(() => Symbol.for('relay-timeout'));
    const outcome = await Promise.race([ended, timeout]);
    endDisposable?.dispose();
    await Promise.race([streamTask, delay(750)]);
    const timedOut = outcome === Symbol.for('relay-timeout');
    return {
      ...(typeof outcome === 'number' ? { exitCode: outcome } : {}),
      output,
      timedOut,
      tracked: true
    };
  }

  private async executeTerminalCommandWithMarker(
    provider: ProviderId,
    terminal: vscode.Terminal,
    command: string,
    timeoutMs: number,
    phase: 'installing' | 'login'
  ): Promise<TrackedTerminalResult> {
    const marker = vscode.Uri.joinPath(this.context.globalStorageUri, 'setup-markers', `${provider}-${randomUUID()}.exit`);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.context.globalStorageUri, 'setup-markers'));
    terminal.sendText(wrapCommandWithExitMarker(command, marker.fsPath), true);
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const raw = Buffer.from(await vscode.workspace.fs.readFile(marker)).toString('utf8').trim();
        const exitCode = Number(raw);
        try { await vscode.workspace.fs.delete(marker); } catch { /* marker already removed */ }
        return {
          ...(Number.isFinite(exitCode) ? { exitCode } : {}),
          output: '',
          timedOut: false,
          tracked: false
        };
      } catch {
        this.updateProviderSetupMessage(provider, phase, phase === 'installing' ? 'Installer in esecuzione nel terminale…' : 'Completa l’accesso nel browser e torna al terminale…');
        await delay(1000);
      }
    }
    return { output: '', timedOut: true, tracked: false };
  }

  private setProviderSetup(provider: ProviderId, progress: ProviderSetupProgress): void {
    this.providerSetup.set(provider, progress);
    this.emitState();
  }

  private updateProviderSetupMessage(provider: ProviderId, phase: 'installing' | 'login', detail: string): void {
    const current = this.providerSetup.get(provider);
    if (!current || current.phase !== phase) return;
    const cleaned = detail.replace(/\s+/g, ' ').trim().slice(0, 220);
    if (!cleaned || cleaned === current.detail) return;
    this.providerSetup.set(provider, { ...current, detail: cleaned });
    this.emitState();
  }

  private failProviderSetup(provider: ProviderId, message: string, detail: string): void {
    const cleaned = detail.trim().slice(-4000);
    this.providerSetup.set(provider, {
      phase: 'error',
      message,
      ...(cleaned ? { detail: cleaned } : {}),
      startedAt: new Date().toISOString()
    });
    this.recordDiagnostic('error', 'provider-setup', message, { provider, detail: cleaned });
    this.emitState();
    this.emit({ type: 'notice', payload: { level: 'error', message: cleaned ? `${message} ${lastMeaningfulTerminalLine(cleaned) || cleaned}` : message } });
  }

  private async enableAntigravityUsage(): Promise<void> {
    const confirmation = await vscode.window.showInformationMessage(
      'Collegare a Relay lo stato utilizzo di Antigravity?',
      { modal: true, detail: 'Relay aggiungerà un piccolo status-line bridge locale alla configurazione AGY. Il comando precedente viene preservato e il file quota resta sul tuo computer.' },
      'Collega utilizzo live'
    );
    if (confirmation !== 'Collega utilizzo live') return;
    const status = await this.antigravityUsageBridge.install();
    this.recordDiagnostic('info', 'antigravity-usage', `Bridge utilizzo Antigravity attivato: ${status.settingsPath}`);
    this.emit({ type: 'notice', payload: { level: 'info', message: 'Utilizzo Antigravity collegato. I dati compariranno durante il prossimo task AGY.' } });
    await this.refreshUsage(true);
  }


  private remoteMode(): RemoteAccessMode {
    return this.preferences.remoteAccessMode === 'funnel' || this.preferences.remoteAccessMode === 'tailnet'
      ? this.preferences.remoteAccessMode
      : 'lan';
  }

  private tunnelOptions(localPort?: number) {
    return {
      mode: this.remoteMode(),
      ...(localPort ? { localPort } : {}),
      ...(this.preferences.remoteAccessPublicPort ? { configuredPublicPort: this.preferences.remoteAccessPublicPort } : {}),
      ...(this.preferences.remoteAccessDnsName ? { previousDnsName: this.preferences.remoteAccessDnsName } : {})
    };
  }

  private async applyTunnelSnapshot(snapshot: TailscaleTunnelSnapshot, persist = true): Promise<TailscaleTunnelSnapshot> {
    await this.remoteAccess.configureExposure(this.remoteMode(), snapshot.baseUrl, snapshot);
    if (persist) {
      const patch: Partial<RelayPreferences> = {};
      if (snapshot.publicPort && snapshot.publicPort !== this.preferences.remoteAccessPublicPort) patch.remoteAccessPublicPort = snapshot.publicPort;
      if (snapshot.dnsName && snapshot.dnsName !== this.preferences.remoteAccessDnsName) patch.remoteAccessDnsName = snapshot.dnsName;
      if (Object.keys(patch).length) this.preferences = await this.preferencesStore.update(patch);
    }
    if (snapshot.changedUrl && snapshot.dnsName) {
      this.emit({ type: 'notice', payload: { level: 'warning', message: 'L’indirizzo remoto Tailscale è cambiato. Relay ha generato un nuovo QR: aggiornalo sul telefono.' } });
    }
    return snapshot;
  }

  private async ensureRemotePairingRoute(repair = true): Promise<void> {
    if (this.remoteMode() === 'lan') return;
    let verification = await this.remoteAccess.verifyPublicPairingRoute();
    if (verification.ok) return;
    this.recordDiagnostic('warning', 'remote-access:pairing-route', `Il QR pubblico non raggiunge l’istanza Relay corrente: ${verification.error ?? 'ticket differente'}`);
    if (!repair) throw new Error(verification.error ?? 'Il QR pubblico punta a un’istanza Relay precedente.');
    const server = this.remoteAccess.snapshot();
    if (!server.port) throw new Error('Porta locale Relay non disponibile per riparare il QR pubblico.');
    const snapshot = await this.tunnelManager.activate({ ...this.tunnelOptions(server.port), localPort: server.port, force: true });
    await this.applyTunnelSnapshot(snapshot);
    verification = await this.remoteAccess.verifyPublicPairingRoute();
    if (!verification.ok) throw new Error(`Il QR pubblico continua a puntare all’istanza sbagliata: ${verification.error ?? 'verifica fallita'}`);
    this.recordDiagnostic('info', 'remote-access:pairing-route', 'Instradamento QR pubblico riallineato all’istanza Relay corrente.');
  }

  private async refreshRemoteTunnel(force = false, probe = false): Promise<TailscaleTunnelSnapshot> {
    if (this.tunnelOperation && !force) return this.tunnelOperation;
    const task = (async () => {
      const mode = this.remoteMode();
      if (mode === 'lan') {
        const snapshot = await this.tunnelManager.detect({ mode: 'lan', force });
        await this.remoteAccess.configureExposure('lan', undefined, snapshot);
        return snapshot;
      }
      const server = this.remoteAccess.snapshot();
      let snapshot = await this.tunnelManager.detect({ ...this.tunnelOptions(server.port), force, probe: false });
      await this.applyTunnelSnapshot(snapshot);
      if (probe && server.enabled && snapshot.state === 'ACTIVE') {
        snapshot = await this.tunnelManager.probe({ ...this.tunnelOptions(server.port), force: true });
        await this.applyTunnelSnapshot(snapshot);
      }
      return snapshot;
    })().finally(() => {
      if (this.tunnelOperation === task) this.tunnelOperation = undefined;
    });
    this.tunnelOperation = task;
    const result = await task;
    this.emitState();
    return result;
  }

  private async setRemoteAccessMode(mode: RemoteAccessMode): Promise<void> {
    const previous = this.remoteMode();
    if (previous === mode) {
      await this.refreshRemoteTunnel(true, mode !== 'lan');
      return;
    }
    const server = this.remoteAccess.snapshot();
    if (server.enabled && previous !== 'lan' && server.port) {
      await this.tunnelManager.deactivate({ ...this.tunnelOptions(server.port), mode: previous, localPort: server.port }).catch(() => undefined);
    }
    await this.remoteAccess.stop(false);
    this.preferences = await this.preferencesStore.update({ remoteAccessMode: mode, remoteAccessAutoStart: false });
    if (mode === 'lan') await this.remoteAccess.configureExposure('lan');
    else await this.refreshRemoteTunnel(true, false);
    this.configureTunnelTimer();
    this.recordDiagnostic('info', 'remote-access:mode', `Modalità remota impostata su ${remoteModeLabel(mode)}.`);
    this.emitState();
  }

  private async installTailscale(): Promise<void> {
    this.tunnelManager.beginInstall();
    const plan = tailscaleInstallPlan(process.platform);
    const action = await vscode.window.showInformationMessage(
      `Installare ${plan.label}?`,
      { modal: true, detail: `${plan.detail}${plan.command ? `\n\nComando:\n${plan.command}` : ''}` },
      plan.mode === 'external' ? 'Apri download' : 'Installa automaticamente',
      ...(plan.command ? ['Copia comando'] : [])
    );
    if (!action) return;
    if (action === 'Copia comando' && plan.command) {
      await vscode.env.clipboard.writeText(plan.command);
      this.emit({ type: 'notice', payload: { level: 'info', message: 'Comando Tailscale copiato.' } });
      return;
    }
    if (plan.mode === 'external' && plan.url) {
      await vscode.env.openExternal(vscode.Uri.parse(plan.url));
    } else if (plan.command) {
      const terminal = vscode.window.createTerminal({
        name: 'Relay Setup — Tailscale',
        cwd: this.workspacePath() ?? homedir(),
        env: { PATH: enhancedTerminalPath(), Path: enhancedTerminalPath() },
        ...(process.platform === 'win32' ? { shellPath: 'powershell.exe', shellArgs: ['-NoLogo', '-NoExit'] } : {})
      });
      terminal.show(false);
      terminal.sendText(plan.command, true);
    }
    this.emit({ type: 'notice', payload: { level: 'info', message: 'Completa l’installazione; Relay ricontrollerà Tailscale automaticamente.' } });
    void this.watchTailscaleInstallation();
  }

  private async watchTailscaleInstallation(): Promise<void> {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await delay(5_000);
      const snapshot = await this.refreshRemoteTunnel(true, false).catch(() => undefined);
      if (!snapshot?.installed) continue;
      this.emit({ type: 'notice', payload: { level: 'info', message: 'Tailscale rilevato. Continua con il collegamento dell’account.' } });
      return;
    }
  }

  private async loginTailscale(): Promise<void> {
    const mode = this.remoteMode();
    if (mode === 'lan') return;
    let snapshot = await this.tunnelManager.login({ ...this.tunnelOptions(this.remoteAccess.snapshot().port), force: true });
    await this.applyTunnelSnapshot(snapshot);
    if (snapshot.backendState === 'Running') {
      this.emit({ type: 'notice', payload: { level: 'info', message: 'Account Tailscale collegato.' } });
      return;
    }
    if (process.platform === 'linux' && snapshot.state === 'ERROR') {
      const action = await vscode.window.showWarningMessage(
        'Tailscale richiede un’autorizzazione amministrativa iniziale su Linux.',
        { modal: true, detail: `Il permesso viene richiesto una sola volta. Relay eseguirà:\n\nsudo tailscale up\n${linuxOperatorCommand()}` },
        'Apri terminale sudo'
      );
      if (action === 'Apri terminale sudo') {
        const terminal = vscode.window.createTerminal({ name: 'Relay Tailscale Login', cwd: this.workspacePath() ?? homedir() });
        terminal.show(false);
        terminal.sendText(`sudo tailscale up && ${linuxOperatorCommand()}`, true);
      }
    } else if (snapshot.lastError) {
      this.emit({ type: 'notice', payload: { level: 'error', message: snapshot.lastError } });
    }
    this.emitState();
  }

  private async activateRemoteTunnel(): Promise<void> {
    const mode = this.remoteMode();
    if (mode === 'lan') {
      await this.startRemoteAccess();
      return;
    }
    try {
      const server = await this.remoteAccess.start(mode, this.preferences.remoteAccessLocalPort);
      if (!server.port) throw new Error('Il server locale Relay non ha una porta disponibile.');
      if (server.port !== this.preferences.remoteAccessLocalPort) this.preferences = await this.preferencesStore.update({ remoteAccessLocalPort: server.port });
      let snapshot = await this.tunnelManager.activate({ ...this.tunnelOptions(server.port), localPort: server.port, force: true });
      await this.applyTunnelSnapshot(snapshot);
      if (snapshot.state === 'ACTIVE') {
        snapshot = await this.tunnelManager.probe({ ...this.tunnelOptions(server.port), force: true });
        await this.applyTunnelSnapshot(snapshot);
        await this.ensureRemotePairingRoute(true);
      }
      const active = ['ACTIVE', 'PROPAGATING_DNS', 'DEGRADED', 'PROBING'].includes(snapshot.state);
      this.preferences = await this.preferencesStore.update({ remoteAccessAutoStart: active });
      this.configureTunnelTimer();
      if (snapshot.state === 'ACTIVE') {
        this.recordDiagnostic('info', 'remote-access:tunnel', `${remoteModeLabel(mode)} attivo e verificato.`, { detail: snapshot.baseUrl });
        this.emit({ type: 'notice', payload: { level: 'info', message: `${remoteModeLabel(mode)} attivo. Scansiona il QR per collegare il telefono.` } });
      } else if (snapshot.state === 'PROPAGATING_DNS') {
        this.emit({ type: 'notice', payload: { level: 'warning', message: 'Funnel configurato. La prima propagazione DNS può richiedere fino a 10 minuti.' } });
      } else {
        this.emit({ type: 'notice', payload: { level: snapshot.state === 'DEGRADED' ? 'warning' : 'error', message: snapshot.lastError ?? snapshot.transitions.at(-1)?.message ?? 'Attivazione Tailscale non completata.' } });
      }
      this.emitState();
    } catch (error) {
      const message = `Impossibile attivare ${remoteModeLabel(mode)}: ${errorMessage(error)}`;
      this.recordDiagnostic('error', 'remote-access:tunnel', message);
      this.emit({ type: 'notice', payload: { level: 'error', message } });
      this.emitState();
    }
  }

  private async remediateRemoteTunnel(): Promise<void> {
    const server = this.remoteAccess.snapshot();
    if (!server.port || this.remoteMode() === 'lan') return;
    let snapshot = await this.tunnelManager.remediate({ ...this.tunnelOptions(server.port), localPort: server.port, force: true });
    await this.applyTunnelSnapshot(snapshot);
    if (snapshot.state === 'ACTIVE') {
      this.emit({ type: 'notice', payload: { level: 'info', message: 'Connessione Tailscale ripristinata e verificata.' } });
      return;
    }
    const command = snapshot.remediationCommand ?? windowsServiceRestartCommand();
    if (command && process.platform === 'win32') {
      const action = await vscode.window.showWarningMessage(
        'Funnel risulta configurato ma non raggiungibile. È consigliato riavviare il servizio Tailscale.',
        { modal: true, detail: 'L’operazione richiede conferma amministratore e poi Relay ripeterà il probe end-to-end.' },
        'Riavvia servizio'
      );
      if (action === 'Riavvia servizio') {
        const terminal = vscode.window.createTerminal({ name: 'Relay Tailscale Recovery', shellPath: 'powershell.exe', shellArgs: ['-NoLogo', '-NoExit'] });
        terminal.show(false);
        terminal.sendText(command, true);
        setTimeout(() => void this.refreshRemoteTunnel(true, true), 15_000);
      }
    }
    this.emitState();
  }

  private async copyRemoteDiagnostic(): Promise<void> {
    await vscode.env.clipboard.writeText(JSON.stringify(this.tunnelManager.diagnosticBundle(), null, 2));
    this.emit({ type: 'notice', payload: { level: 'info', message: 'Diagnostica Tailscale copiata senza credenziali o prompt completi.' } });
  }

  private async recoverRemoteTunnel(): Promise<void> {
    const candidates = this.providers.filter((provider) => provider.healthState === 'ready' && provider.connected !== false).map((provider) => provider.id);
    const helper = candidates[0];
    const bundle = this.tunnelManager.diagnosticBundle();
    if (!helper) {
      await vscode.env.clipboard.writeText(JSON.stringify(bundle, null, 2));
      this.emit({ type: 'notice', payload: { level: 'warning', message: 'Nessun provider sano disponibile. Diagnostica manuale copiata.' } });
      return;
    }
    const approval = await vscode.window.showWarningMessage(
      `Far diagnosticare Tailscale a ${providerLabel(helper)}?`,
      { modal: true, detail: 'Il provider riceverà un bundle sanitizzato e accesso completo al progetto Relay. Modifiche a account, PATH, servizi o installazioni esterne richiederanno conferma.' },
      'Avvia recovery'
    );
    if (approval !== 'Avvia recovery') return;
    const prompt = [
      '# Relay Tailscale recovery',
      'Diagnostica e correggi il collegamento Tailscale di Relay. Non modificare provider non correlati e non aprire Browser Agent.',
      'Inizia con probe read-only. Puoi correggere il codice del progetto Relay e lanciare test. Non cambiare account, tailnet, hostname, PATH globale, servizio o installazioni senza conferma esplicita.',
      'Non sovrascrivere configurazioni Serve/Funnel dell’utente. Dopo la correzione esegui i test e indica che Relay deve rilanciare il probe /health.',
      'Bundle sanitizzato:',
      '```json', JSON.stringify(bundle, null, 2), '```'
    ].join('\n\n');
    await this.newConversation(helper);
    await this.sendMessage({
      prompt,
      displayPrompt: `Diagnostica accesso remoto Tailscale con ${providerLabel(helper)}`,
      provider: helper,
      permission: 'danger-full-access',
      model: this.preferences.providerDefaults[helper].model,
      reasoning: this.preferences.providerDefaults[helper].reasoning
    });
  }

  private async consumePendingUpdateMarker(): Promise<void> {
    const markerPath = join(this.context.globalStorageUri.fsPath, 'pending-update.json');
    const currentVersion = String(this.context.extension?.packageJSON?.version ?? 'unknown');
    const completed = await consumePendingExtensionUpdate(markerPath, currentVersion);
    if (!completed) return;
    this.recordDiagnostic('info', 'extension-update', `Aggiornamento a ${completed.toVersion} completato.`, {
      detail: `Versione precedente=${completed.fromVersion} · VSIX=${completed.vsixPath} · avviato=${completed.createdAt}`
    });
  }

  private async updateExtensionFromVsix(inputPath: string, confirmed: boolean): Promise<void> {
    if (!confirmed) throw new Error('Conferma esplicitamente il reload dell’editor prima di aggiornare Relay.');
    if (this.activeRuns.size) throw new Error('Termina i task attivi prima di aggiornare Relay.');
    const absolutePath = await resolveVsixUpdatePath(inputPath, this.workspacePath() ?? homedir());
    const currentVersion = String(this.context.extension?.packageJSON?.version ?? 'unknown');
    const markerPath = join(this.context.globalStorageUri.fsPath, 'pending-update.json');
    await writePendingExtensionUpdate(markerPath, {
      fromVersion: currentVersion,
      vsixPath: absolutePath,
      createdAt: new Date().toISOString()
    });
    const uri = vscode.Uri.file(absolutePath);
    try {
      const command = await installVsixWithFallback(uri, (name, ...args) => vscode.commands.executeCommand(name, ...args));
      if (command === 'workbench.extensions.command.installFromVSIX') {
        this.recordDiagnostic('warning', 'extension-update', 'Comando installExtension non disponibile: usato il fallback installFromVSIX.');
      }
    } catch (error) {
      await Promise.resolve(vscode.workspace.fs.delete(vscode.Uri.file(markerPath), { useTrash: false })).catch(() => undefined);
      throw new Error(`Installazione VSIX non riuscita: ${errorMessage(error)}`);
    }
    this.recordDiagnostic('info', 'extension-update', `VSIX installato da ${absolutePath}. Reload programmato.`, { detail: `Versione corrente=${currentVersion}` });
    this.emit({ type: 'notice', payload: { level: 'info', message: 'Aggiornamento installato. Relay ricaricherà l’editor e la sessione remota si riconnetterà automaticamente.' } });
    const reloadTimer = setTimeout(() => {
      void vscode.commands.executeCommand('workbench.action.reloadWindow');
    }, 750);
    reloadTimer.unref?.();
  }

  private configureTunnelTimer(): void {
    if (this.tunnelTimer) clearInterval(this.tunnelTimer);
    this.tunnelTimer = undefined;
    if (this.remoteMode() === 'lan' || !this.preferences.remoteAccessAutoStart) return;
    const intervalMs = this.tunnelManager.snapshot().state === 'PROPAGATING_DNS' ? 30_000 : 60_000;
    this.tunnelTimer = setInterval(() => {
      void this.refreshRemoteTunnel(false, true).catch((error) => {
        this.recordDiagnostic('warning', 'remote-access:probe', errorMessage(error));
      });
    }, intervalMs);
  }

  private async restoreRemoteAccessIfNeeded(): Promise<void> {
    this.configureTunnelTimer();
    const mode = this.remoteMode();
    if (mode === 'lan' || !this.preferences.remoteAccessAutoStart) {
      if (mode !== 'lan') await this.refreshRemoteTunnel(false, false).catch(() => undefined);
      return;
    }
    try {
      const server = await this.remoteAccess.start(mode, this.preferences.remoteAccessLocalPort);
      if (!server.port) return;
      if (server.port !== this.preferences.remoteAccessLocalPort) this.preferences = await this.preferencesStore.update({ remoteAccessLocalPort: server.port });
      let snapshot = await this.tunnelManager.detect({ ...this.tunnelOptions(server.port), force: true, probe: false });
      await this.applyTunnelSnapshot(snapshot);
      if (snapshot.backendState === 'Running' && snapshot.state !== 'ACTIVE') {
        snapshot = await this.tunnelManager.activate({ ...this.tunnelOptions(server.port), localPort: server.port, force: true });
        await this.applyTunnelSnapshot(snapshot);
      }
      if (snapshot.state === 'ACTIVE') {
        snapshot = await this.tunnelManager.probe({ ...this.tunnelOptions(server.port), force: true });
        await this.applyTunnelSnapshot(snapshot);
        await this.ensureRemotePairingRoute(true);
      }
    } catch (error) {
      this.recordDiagnostic('warning', 'remote-access:restore', `Ripristino remoto non completato: ${errorMessage(error)}`);
    }
  }

  private async startRemoteAccess(): Promise<void> {
    if (this.remoteMode() !== 'lan') {
      await this.activateRemoteTunnel();
      return;
    }
    try {
      await this.refreshSystemReadiness(false);
      if (vscode.env.remoteName) {
        const proceed = await vscode.window.showWarningMessage(
          'Relay è in esecuzione in un extension host remoto.',
          { modal: true, detail: `Ambiente: ${vscode.env.remoteName}. Il server mobile verrà avviato su quella macchina, container o host SSH: il telefono deve poterla raggiungere direttamente sulla rete.` },
          'Avvia comunque'
        );
        if (proceed !== 'Avvia comunque') return;
      }
      const snapshot = await this.remoteAccess.start('lan');
      await this.remoteAccess.configureExposure('lan');
      this.preferences = await this.preferencesStore.update({ remoteAccessAutoStart: false });
      this.recordDiagnostic('info', 'remote-access', 'Accesso remoto avviato sulla rete locale.', { detail: snapshot.url });
      this.emitState();
      if (!snapshot.urls.length) {
        this.emit({ type: 'notice', payload: { level: 'warning', message: 'Remoto avviato, ma Relay non rileva un indirizzo LAN raggiungibile. Controlla Wi-Fi, VPN e firewall.' } });
      } else {
        this.emit({ type: 'notice', payload: { level: 'info', message: 'Accesso remoto LAN avviato. Scansiona il QR e inserisci il codice di pairing.' } });
      }
    } catch (error) {
      const message = `Impossibile avviare l’accesso remoto: ${errorMessage(error)}`;
      this.recordDiagnostic('error', 'remote-access', message);
      this.emitState();
      this.emit({ type: 'notice', payload: { level: 'error', message } });
    }
  }

  private async stopRemoteAccess(): Promise<void> {
    const mode = this.remoteMode();
    const server = this.remoteAccess.snapshot();
    if (mode !== 'lan' && server.port) {
      await this.tunnelManager.deactivate({ ...this.tunnelOptions(server.port), localPort: server.port, force: true }).catch((error) => {
        this.recordDiagnostic('warning', 'remote-access:tunnel', `Tunnel non disattivato completamente: ${errorMessage(error)}`);
      });
    }
    await this.remoteAccess.stop();
    this.preferences = await this.preferencesStore.update({ remoteAccessAutoStart: false });
    this.configureTunnelTimer();
    this.recordDiagnostic('info', 'remote-access', 'Accesso remoto chiuso.');
    this.emitState();
    this.emit({ type: 'notice', payload: { level: 'info', message: 'Accesso remoto chiuso.' } });
  }

  private async rotateRemotePairing(): Promise<void> {
    try {
      await this.remoteAccess.rotatePairing();
      await this.ensureRemotePairingRoute(true);
      this.emitState();
      this.emit({ type: 'notice', payload: { level: 'info', message: 'Nuovo QR remoto generato.' } });
    } catch (error) {
      const message = `Impossibile rigenerare il QR remoto: ${errorMessage(error)}`;
      this.recordDiagnostic('error', 'remote-access', message);
      this.emit({ type: 'notice', payload: { level: 'error', message } });
    }
  }

  private async closeRemoteSession(sessionId: string): Promise<void> {
    this.remoteAccess.closeSession(sessionId);
    this.emitState();
    this.emit({ type: 'notice', payload: { level: 'info', message: 'Connessione remota chiusa.' } });
  }

  private async exportBackup(): Promise<void> {
    const createdAt = new Date().toISOString();
    const configuration = vscode.workspace.getConfiguration('relay');
    const backup = {
      format: 'relay-backup',
      schemaVersion: 1,
      createdAt,
      relayVersion: this.context.extension?.packageJSON?.version ?? 'unknown',
      data: {
        preferences: await this.readStorageJson('preferences.json', this.preferences),
        rules: await this.readStorageJson('rules.json', this.rules),
        agents: await this.readStorageJson('agents.json', this.agents),
        automations: await this.readStorageJson('automations.json', await this.automationStore.list()),
        conversations: await this.readStorageJson('conversations.json', { activeConversationByProject: {}, conversations: [] }),
        projects: await this.readStorageJson('projects.json', []),
        onboardingComplete: this.context.globalState.get<boolean>(ONBOARDING_GLOBAL_KEY, false),
        antigravityUsageBridge: await this.antigravityUsageBridge.status(),
        configuration: {
          executables: {
            codex: configuration.get<string>('executables.codex', 'codex'),
            claude: configuration.get<string>('executables.claude', 'claude'),
            antigravity: configuration.get<string>('executables.antigravity', 'agy'),
            copilot: configuration.get<string>('executables.copilot', 'copilot')
          },
          worktreesEnabled: configuration.get<boolean>('worktrees.enabled', true),
          worktreesRoot: configuration.get<string>('worktrees.root', ''),
          maxRuns: configuration.get<number>('parallelism.maxRuns', 3),
          useLoginShell: configuration.get<boolean>('detection.useLoginShell', true)
        }
      }
    };
    const uri = await vscode.window.showSaveDialog({
      title: 'Esporta backup Relay',
      defaultUri: vscode.Uri.file(join(homedir(), `relay-backup-${createdAt.replace(/[:.]/g, '-')}.json`)),
      filters: { 'Backup Relay': ['json'] }
    });
    if (!uri) return;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(`${JSON.stringify(backup, null, 2)}\n`, 'utf8'));
    this.emit({ type: 'notice', payload: { level: 'info', message: `Backup Relay esportato in ${uri.fsPath}.` } });
  }

  private async importBackup(): Promise<void> {
    if (this.activeRuns.size) {
      this.emit({ type: 'notice', payload: { level: 'warning', message: 'Termina i task attivi prima di ripristinare un backup.' } });
      return;
    }
    const selection = await vscode.window.showOpenDialog({
      title: 'Importa backup Relay',
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'Backup Relay': ['json'] }
    });
    const uri = selection?.[0];
    if (!uri) return;
    let parsed: any;
    try {
      parsed = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'));
    } catch (error) {
      this.emit({ type: 'notice', payload: { level: 'error', message: `Backup non leggibile: ${errorMessage(error)}` } });
      return;
    }
    if (parsed?.format !== 'relay-backup' || parsed?.schemaVersion !== 1 || !parsed?.data || typeof parsed.data !== 'object') {
      this.emit({ type: 'notice', payload: { level: 'error', message: 'Il file non è un backup Relay valido o usa una versione non supportata.' } });
      return;
    }
    const confirmation = await vscode.window.showWarningMessage(
      'Ripristinare questo backup Relay?',
      { modal: true, detail: 'Conversazioni, regole, preferenze, progetti recenti e percorsi CLI correnti verranno sostituiti. I file dei progetti e le CLI installate non verranno toccati.' },
      'Ripristina'
    );
    if (confirmation !== 'Ripristina') return;

    const data = parsed.data as Record<string, any>;
    await this.writeStorageJson('preferences.json', data.preferences ?? DEFAULT_PREFERENCES);
    await this.writeStorageJson('rules.json', Array.isArray(data.rules) ? data.rules : []);
    await this.writeStorageJson('agents.json', Array.isArray(data.agents) ? data.agents : []);
    await this.writeStorageJson('automations.json', Array.isArray(data.automations) ? data.automations : []);
    await this.writeStorageJson('conversations.json', data.conversations ?? { activeConversationByProject: {}, conversations: [] });
    await this.writeStorageJson('projects.json', Array.isArray(data.projects) ? data.projects : []);
    this.preferencesStore.invalidateCache();
    this.ruleStore.invalidateCache();
    this.agentStore.invalidateCache();
    this.automationStore.invalidate();
    this.conversationStore.invalidateCache();
    this.projectStore.invalidateCache();
    await this.context.globalState.update(ONBOARDING_GLOBAL_KEY, Boolean(data.onboardingComplete));

    const configuration = vscode.workspace.getConfiguration('relay');
    const importedConfiguration = data.configuration as Record<string, any> | undefined;
    const executables = importedConfiguration?.executables as Record<string, unknown> | undefined;
    for (const provider of ['codex', 'claude', 'antigravity', 'copilot'] as ProviderId[]) {
      const value = executables?.[provider];
      if (typeof value === 'string' && value.trim()) {
        await configuration.update(`executables.${provider}`, value, vscode.ConfigurationTarget.Global);
      }
    }
    if (typeof importedConfiguration?.worktreesEnabled === 'boolean') await configuration.update('worktrees.enabled', importedConfiguration.worktreesEnabled, vscode.ConfigurationTarget.Global);
    if (typeof importedConfiguration?.worktreesRoot === 'string') await configuration.update('worktrees.root', importedConfiguration.worktreesRoot, vscode.ConfigurationTarget.Global);
    if (typeof importedConfiguration?.maxRuns === 'number') await configuration.update('parallelism.maxRuns', importedConfiguration.maxRuns, vscode.ConfigurationTarget.Global);
    if (typeof importedConfiguration?.useLoginShell === 'boolean') await configuration.update('detection.useLoginShell', importedConfiguration.useLoginShell, vscode.ConfigurationTarget.Global);
    if (data.antigravityUsageBridge?.enabled === true) await this.antigravityUsageBridge.install();

    this.preferences = await this.preferencesStore.read();
    this.rules = await this.ruleStore.read();
    this.agents = await this.agentStore.read();
    this.providerSetup.clear();
    this.usage = [];
    await this.replaceRegistry();
    await this.refreshProviders(false);
    await this.refreshSystemReadiness(false);
    await this.refreshProject(true);
    this.configureUsageTimer();
    await this.automationScheduler.refresh();
    this.emitState();
    void this.refreshUsage(true);
    this.emit({ type: 'notice', payload: { level: 'info', message: 'Backup Relay ripristinato.' } });
  }

  private async resetAllData(): Promise<void> {
    if (this.activeRuns.size) {
      this.emit({ type: 'notice', payload: { level: 'warning', message: 'Termina o annulla i task attivi prima di ripristinare Relay.' } });
      return;
    }
    const first = await vscode.window.showWarningMessage(
      'Cancellare tutti i dati locali di Relay?',
      {
        modal: true,
        detail: 'Verranno rimossi tutti i dati e riferimenti creati da Relay: conversazioni Relay, progetti recenti, agenti, regole, preferenze, quote memorizzate, token, pairing e sessioni remote. Non verranno toccati i file dei progetti, le CLI o le chat native dei provider.'
      },
      'Continua'
    );
    if (first !== 'Continua') return;
    const typed = await vscode.window.showInputBox({
      title: 'Conferma cancellazione dati Relay',
      prompt: 'Scrivi ELIMINA RELAY per confermare. Questa operazione non è annullabile senza un backup.',
      placeHolder: 'ELIMINA RELAY',
      ignoreFocusOut: true,
      validateInput: (value) => value === 'ELIMINA RELAY' ? undefined : 'Scrivi esattamente ELIMINA RELAY'
    });
    if (typed !== 'ELIMINA RELAY') return;

    if (this.usageTimer) clearInterval(this.usageTimer);
    if (this.tunnelTimer) clearInterval(this.tunnelTimer);
    if (this.stateEmitTimer) clearTimeout(this.stateEmitTimer);
    this.automationScheduler.dispose();
    const remoteBeforeReset = this.remoteAccess.snapshot();
    if (this.remoteMode() !== 'lan' && remoteBeforeReset.port) {
      await this.tunnelManager.deactivate({ ...this.tunnelOptions(remoteBeforeReset.port), localPort: remoteBeforeReset.port, force: true }).catch((error) => {
        this.recordDiagnostic('warning', 'remote-access:tunnel', `Impossibile disattivare Tailscale durante il reset: ${errorMessage(error)}`);
      });
    }
    await this.remoteAccess.stop().catch((error) => {
      this.recordDiagnostic('warning', 'remote-access', `Impossibile chiudere l’accesso remoto: ${errorMessage(error)}`);
    });
    this.remoteAccess.clearHistory();
    await Promise.resolve(this.context.secrets.delete(COPILOT_BILLING_TOKEN_KEY)).catch(() => undefined);
    await this.antigravityUsageBridge.uninstall().catch((error) => {
      this.recordDiagnostic('warning', 'antigravity-usage', `Impossibile ripristinare la configurazione status-line: ${errorMessage(error)}`);
    });
    const configuration = vscode.workspace.getConfiguration('relay');
    for (const key of [
      'executables.codex',
      'executables.claude',
      'executables.antigravity',
      'executables.copilot',
      'worktrees.enabled',
      'worktrees.root',
      'parallelism.maxRuns',
      'delegation.defaultPolicy',
      'detection.useLoginShell'
    ]) await configuration.update(key, undefined, vscode.ConfigurationTarget.Global);
    // Future-proof reset: remove every Relay-owned storage entry, including
    // session references introduced by future versions, while preserving the
    // optional worktree directory and never touching provider-native chats.
    try {
      const entries = await vscode.workspace.fs.readDirectory(this.context.globalStorageUri);
      for (const [name] of entries) {
        if (name === 'worktrees') continue;
        await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.context.globalStorageUri, name), { recursive: true, useTrash: false });
      }
    } catch {
      // Missing storage is expected on fresh installs.
    }
    for (const key of this.context.globalState.keys().filter((entry) => entry.startsWith('relay.'))) {
      await this.context.globalState.update(key, undefined);
    }
    await this.context.globalState.update(ONBOARDING_GLOBAL_KEY, undefined);
    await this.context.globalState.update(PENDING_PROJECT_ACTION_KEY, undefined);
    await this.context.globalState.update('relay.onboardingComplete', undefined);

    for (const key of this.context.workspaceState.keys().filter((entry) => entry.startsWith('relay.'))) {
      await this.context.workspaceState.update(key, undefined);
    }
    this.preferencesStore.invalidateCache();
    this.ruleStore.invalidateCache();
    this.agentStore.invalidateCache();
    this.automationStore.invalidate();
    this.conversationStore.invalidateCache();
    this.projectStore.invalidateCache();
    this.preferences = structuredClone(DEFAULT_PREFERENCES);
    this.rules = [];
    this.agents = [];
    this.usage = [];
    this.providerSetup.clear();
    this.diagnosticRecords.length = 0;
    await this.replaceRegistry();
    await this.refreshProviders(false);
    await this.refreshSystemReadiness(false);
    await this.refreshProject(true);
    this.configureUsageTimer();
    await this.automationScheduler.start().catch(() => undefined);
    this.emitState();
    this.emit({ type: 'notice', payload: { level: 'info', message: 'Dati Relay cancellati. L’estensione è tornata allo stato iniziale.' } });
  }

  private async readStorageJson<T>(name: string, fallback: T): Promise<T> {
    try {
      const raw = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.context.globalStorageUri, name))).toString('utf8');
      return JSON.parse(raw) as T;
    } catch {
      return structuredClone(fallback);
    }
  }

  private async writeStorageJson(name: string, value: unknown): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(this.context.globalStorageUri, name),
      Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
    );
  }

  private async deleteRule(id: string, confirmed = false): Promise<void> {
    const rule = this.rules.find((entry) => entry.id === id);
    if (!rule) {
      this.emit({ type: 'notice', payload: { level: 'warning', message: 'La regola non esiste più.' } });
      return;
    }
    if (!confirmed) {
      this.emit({ type: 'notice', payload: { level: 'warning', message: 'Conferma l’eliminazione dalla card della regola.' } });
      return;
    }
    this.rules = await this.ruleStore.remove(id);
    await this.skillManager.removeRule(id, this.currentProject?.path).catch((error) => this.recordDiagnostic('warning', 'skills', errorMessage(error)));
    this.emit({ type: 'uiCommand', payload: { action: 'close-rule' } });
    this.emit({ type: 'notice', payload: { level: 'info', message: 'Regola eliminata.' } });
    this.emitState();
  }

  private async previewSkillImport(payload: any): Promise<void> {
    const bytes = Array.isArray(payload?.bytes) ? Uint8Array.from(payload.bytes.map((value: unknown) => Number(value) & 0xff)) : new Uint8Array();
    const draft = await this.skillManager.previewImportZip({
      name: String(payload?.name ?? ''),
      size: Number(payload?.size ?? bytes.byteLength),
      bytes
    }, this.rules);
    const token = randomUUID();
    const preview = { ...draft.preview, token };
    if (!preview.errors.length) this.pendingSkillImports.set(token, { ...draft, preview });
    this.emit({ type: 'skillImportPreview', payload: preview });
    const message = preview.errors.length
      ? preview.errors[0] ?? 'Import skill non valido.'
      : preview.warnings.length
        ? 'Skill valida con avvisi: controlla la preview prima di importare.'
        : 'Skill ZIP valida: pronta per l’import.';
    this.emit({ type: 'notice', payload: { level: preview.errors.length ? 'error' : preview.warnings.length ? 'warning' : 'info', message } });
  }

  private async confirmSkillImport(token: string): Promise<void> {
    const draft = this.pendingSkillImports.get(token);
    if (!draft) throw new Error('Preview import non più disponibile. Seleziona di nuovo lo ZIP.');
    this.pendingSkillImports.delete(token);
    if (draft.preview.errors.length) throw new Error('Il pacchetto ZIP contiene errori e non può essere importato.');
    const baseName = draft.preview.name?.trim() || 'skill-importata';
    const existingNames = new Set(this.rules.map((rule) => rule.name.toLowerCase()));
    const name = uniqueRuleName(baseName, existingNames);
    const id = `user:${draft.preview.scope}:${draft.preview.providers.join('+')}:${randomUUID()}`;
    const rule: RuleDocument = {
      id,
      name,
      description: draft.preview.description?.trim() || undefined,
      content: draft.content.trim(),
      scope: draft.preview.scope,
      providers: draft.preview.providers.length ? draft.preview.providers : ['codex', 'claude', 'antigravity'],
      priority: 100,
      mandatory: draft.preview.mandatory,
      enabled: true,
      path: `relay://rules/${id}`,
      source: 'user',
      updatedAt: new Date().toISOString(),
      ...(draft.preview.scope === 'project' ? { projectId: this.requireProject().id } : {}),
      skillPublication: { enabled: false, providers: [] }
    };
    this.rules = await this.ruleStore.upsert(rule);
    await this.skillManager.syncAll(this.rules, this.currentProject?.path).catch((error) => this.recordDiagnostic('warning', 'skills', errorMessage(error)));
    this.emit({ type: 'skillImportPreview', payload: { ...draft.preview, token: undefined, status: 'valid', warnings: ['Import completato.'], errors: [] } });
    this.emit({ type: 'notice', payload: { level: 'info', message: `Skill importata come regola “${name}”.` } });
    this.emitState();
  }

  private async saveRule(payload: any): Promise<void> {
    const name = String(payload?.name ?? '').trim();
    const content = String(payload?.content ?? '').trim();
    if (!name || !content) throw new Error('Nome e contenuto della regola sono obbligatori.');
    const scope = payload?.scope === 'project' ? 'project' : 'global';
    const providers = asRuleProviders(payload?.providers ?? payload?.provider);
    const priority = Number.isFinite(Number(payload?.priority)) ? Math.max(0, Math.min(999, Math.round(Number(payload.priority)))) : 100;
    const id = stringOrUndefined(payload?.id) ?? `user:${scope}:${providers.join('+')}:${randomUUID()}`;
    const rule: RuleDocument = {
      id,
      name: name.slice(0, 100),
      content,
      scope,
      providers,
      priority,
      mandatory: Boolean(payload?.mandatory),
      enabled: payload?.enabled !== false,
      path: `relay://rules/${id}`,
      source: 'user',
      updatedAt: new Date().toISOString(),
      ...(scope === 'project' ? { projectId: this.requireProject().id } : {}),
      ...(stringOrUndefined(payload?.description) ? { description: String(payload.description).trim() } : {}),
      ...(payload?.skillPublication ? {
        skillPublication: {
          enabled: Boolean(payload.skillPublication.enabled),
          providers: asRuleProviders(payload.skillPublication.providers ?? []),
          lastSyncAt: new Date().toISOString()
        }
      } : {})
    };
    if (rule.skillPublication?.enabled && !rule.description?.trim()) throw new Error('La descrizione è obbligatoria quando pubblichi una regola come skill.');
    if (rule.id === GDPR_RULE_ID && rule.enabled) await this.ensureGdprVeloReady();
    this.rules = await this.ruleStore.upsert(rule);
    await this.skillManager.syncAll(this.rules, this.currentProject?.path).catch((error) => this.recordDiagnostic('warning', 'skills', errorMessage(error)));
    this.emitState();
  }

  private async syncSkills(): Promise<void> {
    const report = await this.skillManager.syncAll(this.rules, this.currentProject?.path);
    const message = `Skill sincronizzate: ${report.created} create, ${report.updated} aggiornate, ${report.removed} rimosse, ${report.skipped} saltate${report.errors.length ? ` · ${report.errors.length} avvisi` : ''}.`;
    this.emit({ type: 'notice', payload: { level: report.errors.length ? 'warning' : 'info', message } });
    this.emitState();
  }

  private async deleteManagedSkill(ruleId: string): Promise<void> {
    if (!ruleId) throw new Error('La skill selezionata non è gestita da Relay.');
    const removed = await this.skillManager.removeRule(ruleId, this.currentProject?.path);
    this.emit({ type: 'notice', payload: { level: 'info', message: removed ? 'Skill Relay rimossa.' : 'Nessuna skill Relay da rimuovere.' } });
    this.emitState();
  }

  private async ensureBundledRules(storedRules: RuleDocument[]): Promise<RuleDocument[]> {
    const normalized = storedRules
      .filter((rule) => rule.source !== 'bundled' || rule.id === GDPR_RULE_ID)
      .map((rule) => rule.id === GDPR_RULE_ID ? {
        ...rule,
        providers: ['codex', 'claude', 'antigravity'] as ProviderId[],
        skillPublication: rule.skillPublication ? { ...rule.skillPublication, providers: ['codex', 'claude', 'antigravity'] as ProviderId[] } : rule.skillPublication
      } : rule);
    const hasGdpr = normalized.some((rule) => rule.id === GDPR_RULE_ID);
    const next = hasGdpr ? normalized : [await this.gdprRule(), ...normalized];
    if (JSON.stringify(next) !== JSON.stringify(storedRules)) await this.ruleStore.write(next).catch(() => undefined);
    return next;
  }

  private async gdprRule(): Promise<RuleDocument> {
    const veloCommand = await describeVeloCommand().catch(() => 'python3 -m velo anonimizza <input> -v <vault>');
    return {
      id: GDPR_RULE_ID,
      name: 'gdpr',
      description: 'Protocollo opzionale /gdpr per lavorare solo su copie anonimizzate con Velo.',
      content: [
        '# /gdpr document protocol',
        'Questa regola si applica solo quando il messaggio utente contiene `/gdpr` e cita documenti o file. Se `/gdpr` non e presente, ignorala.',
        '',
        'Quando e attiva:',
        '- Non leggere, analizzare o delegare file citati in chiaro come fonte di lavoro.',
        '- Crea una cartella temporanea di staging solo per raccogliere le copie necessarie, poi crea o riusa `gdpr_relay/` nel workspace.',
        '- Prima di lavorare sui contenuti, copia ogni documento richiesto in `gdpr_relay/` passando il testo attraverso Velo. Comando di riferimento: `' + veloCommand + '`.',
        '- Mantieni in `gdpr_relay/` solo output anonimizzati, vault/metadati necessari e un file di lock testuale che elenchi i percorsi originali bloccati.',
        '- Dopo il lock, tu e gli agenti delegati non dovete aprire i file originali citati: usate solo i file anonimizzati dentro `gdpr_relay/`.',
        '- Se deleghi, includi nel prompt del task lo stesso vincolo `/gdpr`, la posizione di `gdpr_relay/` e l’elenco dei file originali bloccati.',
        '- Se serve rileggere un originale in chiaro, fermati e chiedi all’utente di rimuovere quel riferimento dal lock e cancellare la copia anonimizzata corrispondente in `gdpr_relay/`.',
        '- Non promettere garanzie assolute: questo e un protocollo operativo via prompt per ridurre esposizione dei dati, non un sandbox di sicurezza.'
      ].join('\n'),
      scope: 'global',
      providers: ['codex', 'claude', 'antigravity'],
      priority: 10,
      mandatory: true,
      enabled: false,
      path: 'relay://rules/gdpr',
      source: 'bundled',
      updatedAt: new Date().toISOString(),
      skillPublication: {
        enabled: true,
        providers: ['codex', 'claude', 'antigravity']
      }
    };
  }

  private async ensureGdprVeloReady(): Promise<void> {
    resetVeloAvailabilityCache();
    if (await isVeloAvailable()) return;
    throw new Error('Impossibile abilitare /gdpr: Python con il modulo Velo integrato non è raggiungibile.');
  }

  private rulesForProject(currentProjectId: string): RuleDocument[] {
    return this.rules.filter((rule) => rule.scope === 'global' || rule.projectId === currentProjectId || rule.id.startsWith(`${currentProjectId}:`));
  }

  private bindRegistry(): void {
    this.registrySubscription?.dispose();
    this.providers = this.registry.currentStatuses().map((provider) => this.applyProviderConnectionState(provider));
    this.registrySubscription = this.registry.onStatus((status, all) => {
      this.providers = all.map((provider) => this.applyProviderConnectionState(provider));
      const effective = this.applyProviderConnectionState(status);
      if (effective.healthState !== 'detecting') {
        const detail = effective.detail ?? effective.failure?.message;
        this.recordDiagnostic(
          effective.healthState === 'ready' ? 'info' : 'warning',
          'provider-detection',
          `${effective.label}: ${effective.healthState ?? (effective.available ? 'ready' : 'unavailable')} · ${effective.executable}`,
          { provider: effective.id, ...(detail ? { detail } : {}) }
        );
      }
      this.emitState();
    });
  }

  private async replaceRegistry(): Promise<void> {
    this.registrySubscription?.dispose();
    await this.registry.dispose().catch(() => undefined);
    this.registry = this.createRegistry();
    this.bindRegistry();
    const maxRuns = vscode.workspace.getConfiguration('relay').get<number>('parallelism.maxRuns', 3);
    this.scheduler = new RunScheduler(this.registry, maxRuns);
  }

  private createRegistry(): ProviderRegistry {
    const configuration = vscode.workspace.getConfiguration('relay');
    return new ProviderRegistry([
      new CodexProvider(configuration.get<string>('executables.codex', 'codex')),
      new ClaudeProvider(configuration.get<string>('executables.claude', 'claude')),
      new AntigravityProvider(
        configuration.get<string>('executables.antigravity', 'agy'),
        this.antigravityUsageBridge.cachePath,
        configuration.get<string[]>('antigravity.permissions.allow', [])
      ),
      new CopilotProvider(
        configuration.get<string>('executables.copilot', 'copilot'),
        () => Promise.resolve(this.context.secrets.get(COPILOT_BILLING_TOKEN_KEY))
      )
    ]);
  }

  private async refreshProject(force = false): Promise<void> {
    const path = this.workspacePath();
    if (!path) {
      this.currentProject = undefined;
      this.projectRefreshPath = undefined;
      this.projectRefreshedAt = Date.now();
      return;
    }
    const now = Date.now();
    if (!force && this.currentProject?.path === path && this.projectRefreshPath === path && now - this.projectRefreshedAt < PROJECT_REFRESH_TTL_MS) return;
    const isGit = await this.worktrees.isGitRepository(path);
    const githubUrl = isGit ? await this.detectGithubRemoteUrl(path) : undefined;
    this.currentProject = await this.projectStore.touch(path, vscode.workspace.name ?? pathBasename(path), isGit, githubUrl);
    this.projectRefreshPath = path;
    this.projectRefreshedAt = now;
  }

  private async detectGithubRemoteUrl(cwd: string): Promise<string | undefined> {
    const result = await runCommand('git', ['remote', 'get-url', 'origin'], { cwd, timeoutMs: 4000 }).catch(() => null);
    if (!result || result.exitCode !== 0) return undefined;
    return normalizeGithubRemoteUrl(result.stdout.trim());
  }

  private async remoteActionState(): Promise<Pick<RelayViewState, 'conversation' | 'conversations' | 'activeRuns' | 'agents' | 'rules' | 'projects' | 'providers' | 'mcp' | 'automations'>> {
    const project = this.currentProject ?? emptyProject();
    const defaults = this.preferences.providerDefaults[this.preferences.defaultProvider] ?? DEFAULT_PREFERENCES.providerDefaults.codex;
    const conversation = await this.conversationStore.getActive(project.id)
      ?? emptyConversation(project.id, this.preferences.defaultProvider, this.preferences.delegationPolicy, defaults.permission, defaults.model, defaults.reasoning);
    const groupedConversations = await this.conversationStore.summariesByProject(project.id);
    return {
      conversation,
      conversations: groupedConversations.active[project.id] ?? [],
      activeRuns: [...this.activeRuns.values()],
      agents: this.agents,
      rules: this.rulesForProject(project.id),
      projects: await this.projectStore.list(),
      providers: this.providers,
      mcp: await this.mcpManager.inventory(project.path, this.providers),
      automations: await this.automationStore.list()
    };
  }

  private async state(): Promise<RelayViewState> {
    await this.refreshProject();
    const project = this.currentProject ?? emptyProject();
    const defaults = this.preferences.providerDefaults[this.preferences.defaultProvider];
    const conversation = await this.conversationStore.getActive(project.id)
      ?? emptyConversation(project.id, this.preferences.defaultProvider, this.preferences.delegationPolicy, defaults.permission, defaults.model, defaults.reasoning);
    const projects = await this.projectStore.list();
    const groupedConversations = await this.conversationStore.summariesByProject(project.id);
    const projectConversations = groupedConversations.active;
    const projectArchivedConversations = groupedConversations.archived;
    const conversations = projectConversations[project.id] ?? [];
    const archivedConversations = projectArchivedConversations[project.id] ?? [];
    if (!projectConversations[project.id]) projectConversations[project.id] = conversations;
    if (!projectArchivedConversations[project.id]) projectArchivedConversations[project.id] = archivedConversations;
    return {
      workspace: {
        id: project.id,
        name: project.name,
        ...(project.path ? { cwd: project.path } : {}),
        isGit: project.isGit
      },
      projects,
      providers: this.providers.map((provider) => this.withSetupProgress(provider)),
      usage: this.usage,
      conversation,
      conversations,
      archivedConversations,
      rules: this.rulesForProject(project.id),
      skills: await this.skillManager.snapshot(project.path),
      mcp: await this.mcpManager.inventory(project.path, this.providers),
      automations: await this.automationStore.list(),
      scheduler: this.scheduler.snapshot(),
      activeRuns: [...this.activeRuns.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
      pendingDelegations: [...this.pendingApprovals.values()].map((entry) => entry.record),
      projectConversations,
      projectArchivedConversations,
      diagnostics: this.diagnosticRecords.slice(-250),
      preferences: this.preferences,
      onboardingComplete: this.preferences.onboardingVersion >= ONBOARDING_VERSION || this.context.globalState.get<boolean>(ONBOARDING_GLOBAL_KEY, false),
      usageRefreshing: this.usageRefreshing,
      contextItems: project.path ? await listWorkspaceContext(project.path) : [],
      antigravityUsageBridge: await this.antigravityUsageBridge.status(),
      agents: this.agents,
      remoteAccess: this.remoteAccess.snapshot(),
      systemReadiness: this.systemReadiness,
    };
  }

  private emitState(): void {
    const revision = ++this.stateRevision;
    if (this.stateEmitTimer) clearTimeout(this.stateEmitTimer);
    this.stateEmitTimer = setTimeout(() => {
      this.stateEmitTimer = undefined;
      void this.state().then((payload) => {
        if (revision !== this.stateRevision) return;
        this.emit({ type: 'state', payload });
      }).catch((error) => this.recordDiagnostic('error', 'state', `State refresh failed: ${errorMessage(error)}`));
    }, STATE_EMIT_DEBOUNCE_MS);
  }

  private async emitStateNow(): Promise<void> {
    ++this.stateRevision;
    if (this.stateEmitTimer) {
      clearTimeout(this.stateEmitTimer);
      this.stateEmitTimer = undefined;
    }
    try {
      const payload = await this.state();
      this.emit({ type: 'state', payload });
    } catch (error) {
      this.recordDiagnostic('error', 'state', `State refresh failed: ${errorMessage(error)}`);
    }
  }

  private emitUsageState(): void {
    this.emit({
      type: 'usageState',
      payload: { usage: this.usage, usageRefreshing: this.usageRefreshing }
    });
  }

  private withSetupProgress(provider: ProviderStatus): ProviderStatus {
    const setup = this.providerSetup.get(provider.id);
    if (!setup) return provider;
    return {
      ...provider,
      setupInProgress: setup.phase === 'installing' || setup.phase === 'login',
      setupProgress: setup.message,
      ...(setup.phase === 'error' ? { setupError: setup.detail || setup.message } : {})
    };
  }

  private emit(message: RelayOutboundMessage): void {
    for (const listener of this.listeners) listener(message);
    if (message.type === 'state') this.remoteAccess.notifyStateChanged(message.payload);
    else if (message.type === 'usageState' || message.type === 'agentEvent') this.remoteAccess.notifyStateChanged();
  }

  private workspacePath(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private requireProject(): ProjectRecord {
    if (!this.currentProject?.path) throw new Error('Apri una cartella di progetto prima di avviare una sessione.');
    return this.currentProject;
  }

  private recordDiagnostic(
    level: DiagnosticEntry['level'],
    scope: string,
    message: string,
    meta: { provider?: ProviderId | undefined; runId?: string | undefined; conversationId?: string | undefined; detail?: string | undefined } = {}
  ): void {
    const entry: DiagnosticEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      scope,
      message: redactDiagnosticText(message),
      ...(meta.provider ? { provider: meta.provider } : {}),
      ...(meta.runId ? { runId: meta.runId } : {}),
      ...(meta.conversationId ? { conversationId: meta.conversationId } : {}),
      ...(meta.detail ? { detail: redactDiagnosticText(meta.detail).slice(0, 12_000) } : {})
    };
    this.diagnosticRecords.push(entry);
    if (this.diagnosticRecords.length > 500) this.diagnosticRecords.splice(0, this.diagnosticRecords.length - 500);
    const prefix = `[${scope}${meta.provider ? `:${meta.provider}` : ''}${meta.runId ? `:${meta.runId}` : ''}]`;
    const text = `${prefix} ${entry.message}${entry.detail ? `\n${entry.detail}` : ''}`;
    if (level === 'error') this.diagnostics.error(text);
    else if (level === 'warning') this.diagnostics.warn(text);
    else this.diagnostics.info(text);
  }

  private formatDiagnostics(): string {
    const header = [
      '# Relay diagnostics',
      `Generated: ${new Date().toISOString()}`,
      `Workspace: ${this.currentProject?.path ?? 'none'}`,
      `Providers: ${this.providers.map((provider) => `${provider.id}=${provider.available ? 'ready' : 'unavailable'} ${provider.version ?? ''}`).join(' | ')}`,
      ''
    ];
    const lines = this.diagnosticRecords.map((entry) => [
      `${entry.timestamp} [${entry.level.toUpperCase()}] [${entry.scope}]${entry.provider ? ` [${entry.provider}]` : ''}${entry.runId ? ` [run:${entry.runId}]` : ''} ${entry.message}`,
      entry.detail ? entry.detail : ''
    ].filter(Boolean).join('\n'));
    return [...header, ...lines].join('\n');
  }

  private async exportDiagnostics(): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      title: 'Esporta diagnostica Relay',
      defaultUri: vscode.Uri.file(join(homedir(), `relay-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.log`)),
      filters: { Log: ['log', 'txt'] }
    });
    if (!uri) return;
    await vscode.workspace.fs.writeFile(uri, Buffer.from(this.formatDiagnostics(), 'utf8'));
    this.emit({ type: 'notice', payload: { level: 'info', message: `Diagnostica esportata in ${uri.fsPath}` } });
  }

  private configureUsageTimer(): void {
    if (this.usageTimer) clearInterval(this.usageTimer);
    const minutes = Math.max(1, Math.min(60, this.preferences.usageAutoRefreshMinutes || 1));
    this.usageTimer = setInterval(() => void this.refreshUsage(true), minutes * 60_000);
  }


  private async requestRemoteProjectPicker(): Promise<void> {
    const action = await vscode.window.showInformationMessage(
      'Un dispositivo remoto chiede di scegliere un nuovo progetto.',
      { modal: true, detail: 'Per sicurezza il telefono non può esplorare il filesystem. Il selettore cartelle si aprirà soltanto su questo PC. Aprendo il progetto, la sessione remota corrente potrebbe interrompersi durante il cambio workspace.' },
      'Scegli cartella'
    );
    if (action !== 'Scegli cartella') return;
    await this.openProjectPicker();
  }

  private async requestRemoteProjectOpen(path: string): Promise<void> {
    const known = (await this.projectStore.list()).find((entry) => entry.path === path);
    if (!known) throw new Error('Il progetto richiesto non è registrato in Relay.');
    if (path === this.workspacePath()) {
      this.emit({ type: 'notice', payload: { level: 'info', message: `${known.name} è già il progetto aperto.` } });
      return;
    }
    const action = await vscode.window.showWarningMessage(
      `Aprire “${known.name}” richiesto dal telefono?`,
      { modal: true, detail: 'Relay cambierà workspace sul PC. La connessione remota può interrompersi e dovrà essere riavviata nella nuova finestra.' },
      'Apri progetto'
    );
    if (action !== 'Apri progetto') return;
    await this.openRecentProject({ path: known.path });
  }

  private async openProjectPicker(): Promise<void> {
    if (!await this.ensureWorkspaceSwitchSafe()) return;
    const selection = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      title: 'Apri un progetto in Relay'
    });
    const uri = selection?.[0];
    if (uri) await vscode.commands.executeCommand('vscode.openFolder', uri, false);
  }

  private async openRecentProject(action: {
    path: string;
    newConversation?: boolean;
    conversationId?: string;
    openHistory?: boolean;
  }): Promise<void> {
    if (!action.path) return;
    if (action.path === this.workspacePath()) {
      if (action.newConversation) await this.newConversation(this.preferences.defaultProvider);
      if (action.conversationId) await this.conversationStore.setActive(this.requireProject().id, action.conversationId);
      this.emitState();
      this.emit({ type: 'uiCommand', payload: { action: action.openHistory ? 'open-history' : 'open-chat' } });
      if (action.newConversation) this.emit({ type: 'uiCommand', payload: { action: 'focus-composer' } });
      return;
    }
    if (!await this.ensureWorkspaceSwitchSafe()) return;
    await this.context.globalState.update(PENDING_PROJECT_ACTION_KEY, action);
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(action.path), false);
  }

  private async confirmAndOpenRecentProject(path: string): Promise<void> {
    if (!path) return;
    if (path === this.workspacePath()) {
      this.emitState();
      return;
    }
    const known = (await this.projectStore.list()).find((entry) => entry.path === path);
    const name = known?.name ?? pathBasename(path);
    const REPLACE = 'Sostituisci workspace corrente';
    const NEW_WINDOW = 'Apri in nuova finestra';
    const choice = await vscode.window.showWarningMessage(
      `Aprire “${name}”?`,
      { modal: true, detail: 'Sostituisci il workspace corrente (chiude il progetto attuale in questa finestra) oppure apri il progetto in una nuova finestra dell’editor.' },
      REPLACE,
      NEW_WINDOW
    );
    if (choice === REPLACE) {
      await this.openRecentProject({ path });
      return;
    }
    if (choice === NEW_WINDOW) {
      await this.context.globalState.update(PENDING_PROJECT_ACTION_KEY, { path });
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path), true);
    }
  }

  private async ensureWorkspaceSwitchSafe(): Promise<boolean> {
    if (!this.activeRuns.size) return true;
    const roots = [...this.activeRuns.values()].filter((run) => !run.parentRunId).length || this.activeRuns.size;
    this.emit({ type: 'notice', payload: { level: 'warning', message: `${roots} attività in background: il cambio progetto resta disponibile, ma il reload dell’editor può interrompere processi locali.` } });
    return true;
  }

  private async applyPendingProjectAction(): Promise<void> {
    const action = this.context.globalState.get<{ path: string; newConversation?: boolean; conversationId?: string; openHistory?: boolean }>(PENDING_PROJECT_ACTION_KEY);
    if (!action || !this.currentProject?.path || action.path !== this.currentProject.path) return;
    await this.context.globalState.update(PENDING_PROJECT_ACTION_KEY, undefined);
    if (action.newConversation) await this.newConversation(this.preferences.defaultProvider);
    if (action.conversationId) await this.conversationStore.setActive(this.currentProject.id, action.conversationId);
    queueMicrotask(() => {
      this.emit({ type: 'uiCommand', payload: { action: action.openHistory ? 'open-history' : 'open-chat' } });
      if (action.newConversation) this.emit({ type: 'uiCommand', payload: { action: 'focus-composer' } });
    });
  }

  private async openWorkspaceResource(rawPath: string): Promise<void> {
    await this.resourceOpen.open(decodeURIComponent(rawPath.trim()), {
      workspaceRoot: this.currentProject?.path ?? this.workspacePath() ?? process.cwd(),
      log: (classification, action) => this.recordDiagnostic('info', 'resource-open', `Risorsa classificata: ${classification.kind}`, {
        detail: `raw=${classification.raw.slice(0, 240)}\nclassifiedAs=${classification.kind}\naction=${action}`
      })
    });
  }
}

function asProviderId(value: unknown): ProviderId {
  return value === 'claude' || value === 'antigravity' || value === 'copilot' ? value : 'codex';
}

function normalizeConversationMentions(value: unknown, text: string): ConversationMention[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ConversationMention[] => {
    const kind = entry?.kind;
    if (kind !== 'provider' && kind !== 'agent' && kind !== 'file' && kind !== 'directory' && kind !== 'skill' && kind !== 'mcp') return [];
    const start = Number(entry?.start);
    const endExclusive = Number(entry?.endExclusive);
    const rawText = String(entry?.rawText ?? '');
    if (!Number.isInteger(start) || !Number.isInteger(endExclusive) || endExclusive <= start) return [];
    if (!rawText || text.slice(start, endExclusive) !== rawText) return [];
    const label = String(entry?.label ?? '').trim();
    const entityId = String(entry?.entityId ?? '').trim();
    const resolvedValue = String((entry?.resolvedValue ?? entityId) || label).trim();
    if (!label || !entityId) return [];
    return [{ kind, entityId, label, rawText, start, endExclusive, resolvedValue }];
  }).sort((a, b) => a.start - b.start);
}

function asMcpAuthType(value: unknown): McpAuthType | undefined {
  return value === 'bearer' || value === 'headers' || value === 'oauth' || value === 'none' ? value : undefined;
}

function asRuleProviders(value: unknown): ProviderId[] {
  const values = Array.isArray(value) ? value : [value];
  const providers = values.filter((entry): entry is ProviderId => entry === 'codex' || entry === 'claude' || entry === 'antigravity' || entry === 'copilot');
  return providers.length ? [...new Set(providers)] : ['codex', 'claude', 'antigravity', 'copilot'];
}

function uniqueRuleName(base: string, existing: Set<string>): string {
  const root = base.trim() || 'Skill importata';
  let candidate = root;
  let index = 2;
  while (existing.has(candidate.toLowerCase())) {
    candidate = `${root} copia ${index}`;
    index += 1;
  }
  return candidate;
}

function asDelegationPolicy(value: unknown): DelegationPolicy {
  return value === 'automatic' || value === 'disabled' ? value : 'confirm';
}

function asPermission(value: unknown): RunPermission {
  if (value === 'read-only' || value === 'danger-full-access') return value;
  return 'workspace-write';
}

function cleanAgentText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function cleanAgentMultiline(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim().slice(0, maxLength);
}

function cleanAgentArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => cleanAgentText(entry, maxLength) ?? []).slice(0, maxItems))];
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, entry]) => [key.trim(), typeof entry === 'string' ? entry : String(entry ?? '')] as const)
    .filter(([key]) => key);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function normalizedSelection(value: unknown, fallback: string): string | undefined {
  const selected = stringOrUndefined(value) ?? fallback;
  return selected && selected !== 'auto' ? selected : undefined;
}

function normalizeTask(value: any): ParallelTaskInput | undefined {
  const prompt = String(value?.prompt ?? '').trim();
  if (!prompt) return undefined;
  const model = stringOrUndefined(value?.model);
  const reasoning = stringOrUndefined(value?.reasoning);
  return {
    id: typeof value?.id === 'string' && value.id ? value.id : randomUUID(),
    provider: asProviderId(value?.provider),
    prompt,
    permission: asPermission(value?.permission),
    ...(model ? { model } : {}),
    ...(reasoning ? { reasoning } : {})
  };
}

function normalizePreferencePatch(value: any): Partial<RelayPreferences> {
  const patch: Partial<RelayPreferences> = {};
  if (value?.defaultProvider) patch.defaultProvider = asProviderId(value.defaultProvider);
  if (value?.delegationPolicy) patch.delegationPolicy = asDelegationPolicy(value.delegationPolicy);
  if (value?.quotaPolicy === 'preserve' || value?.quotaPolicy === 'unrestricted') patch.quotaPolicy = value.quotaPolicy;
  else if (value?.quotaPolicy === 'balanced') patch.quotaPolicy = 'balanced';
  if (typeof value?.exposeUsageToAgents === 'boolean') patch.exposeUsageToAgents = value.exposeUsageToAgents;
  if (Number.isFinite(Number(value?.usageAutoRefreshMinutes))) patch.usageAutoRefreshMinutes = Math.max(1, Math.min(60, Math.round(Number(value.usageAutoRefreshMinutes))));
  if (Number.isFinite(Number(value?.quotaWarningThreshold))) patch.quotaWarningThreshold = clampFraction(Number(value.quotaWarningThreshold));
  if (Number.isFinite(Number(value?.quotaCriticalThreshold))) patch.quotaCriticalThreshold = clampFraction(Number(value.quotaCriticalThreshold));
  if (Number.isFinite(Number(value?.onboardingVersion))) patch.onboardingVersion = Number(value.onboardingVersion);
  return patch;
}

function buildCapacityContext(
  providers: ProviderStatus[],
  usage: UsageSnapshot[],
  preferences: RelayPreferences
): string {
  const lines = providers.map((provider) => {
    const snapshot = usage.find((entry) => entry.provider === provider.id);
    if (!snapshot?.available) return `- ${provider.label}: quota non disponibile; non assumere che sia illimitata.`;
    const remaining = snapshot.remainingFraction !== undefined
      ? `${Math.round(snapshot.remainingFraction * 100)}% disponibile`
      : 'disponibilità non quantificata';
    const reset = snapshot.resetsAt ? `, reset ${snapshot.resetsAt}` : '';
    const status = snapshot.remainingFraction !== undefined && snapshot.remainingFraction <= preferences.quotaCriticalThreshold
      ? 'CRITICA'
      : snapshot.remainingFraction !== undefined && snapshot.remainingFraction <= preferences.quotaWarningThreshold
        ? 'BASSA'
        : 'OK';
    return `- ${provider.label}: ${remaining}${reset}; stato ${status}.`;
  });
  return [
    '# Relay capacity context',
    `Politica quota: ${preferences.quotaPolicy}.`,
    'Usa questi dati per scegliere in modo responsabile provider, modello e reasoning nelle deleghe. Non inventare dati mancanti.',
    ...lines
  ].join('\n');
}

function clampFraction(value: number): number {
  const normalized = value > 1 ? value / 100 : value;
  return Math.min(1, Math.max(0, normalized));
}

function buildConversationHandoff(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; text: string; provider?: ProviderId }>,
  targetProvider: ProviderId,
  maxCharacters = 24_000
): string {
  if (messages.length === 0) return '';
  const lines = messages.map((message) => {
    const speaker = message.role === 'assistant' ? `${message.provider ?? 'agent'} assistant` : message.role;
    return `## ${speaker}\n${message.text.trim()}`;
  });
  let transcript = lines.join('\n\n');
  if (transcript.length > maxCharacters) transcript = `[Conversazione precedente ridotta per il limite di contesto.]\n\n${transcript.slice(-maxCharacters)}`;
  return [
    '# Conversation handoff',
    `Stai continuando una conversazione Relay esistente come ${targetProvider}.`,
    'Preserva le decisioni precedenti e segnala le contraddizioni invece di modificarle silenziosamente.',
    transcript
  ].join('\n\n');
}

function formatDelegationResults(originalPrompt: string, delegation: DelegationRecord): string {
  const tasks = delegation.tasks.map((task, index) => {
    const outcome = task.status === 'completed'
      ? task.resultText || 'Completato senza messaggio testuale.'
      : `FAILED: ${task.error || task.status}`;
    const files = task.changedFiles?.length ? `\nChanged files: ${task.changedFiles.join(', ')}` : '';
    return `## Delegation ${index + 1}: ${task.label}\nProvider: ${task.provider}\nStatus: ${task.status}${files}\n\n${outcome}`;
  }).join('\n\n');
  return [
    '# Relay delegation results',
    `Original user request:\n${originalPrompt}`,
    delegation.reason ? `Delegation reason:\n${delegation.reason}` : '',
    tasks,
    'Continue the original task now. Synthesize the delegated results, verify them critically, and provide the final answer. You may request another delegation only if a genuinely new need remains.'
  ].filter(Boolean).join('\n\n');
}


function applyFileScopeDependencies(tasks: DelegationTaskRecord[]): void {
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index]!;
    if (task.permission === 'read-only' || !task.files?.length) continue;
    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previous = tasks[previousIndex]!;
      if (previous.permission === 'read-only' || !previous.files?.length) continue;
      if (!fileScopesOverlap(task.files, previous.files)) continue;
      task.dependsOn = [...new Set([...(task.dependsOn ?? []), previous.id])];
    }
  }
}

function fileScopesOverlap(left: string[], right: string[]): boolean {
  const normalize = (value: string) => value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '').toLowerCase();
  return left.some((leftValue) => right.some((rightValue) => {
    const a = normalize(leftValue);
    const b = normalize(rightValue);
    return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
  }));
}

function mergeRules(current: RuleDocument[], incoming: RuleDocument[]): RuleDocument[] {
  const merged = new Map(current.map((rule) => [rule.id, rule]));
  for (const rule of incoming) merged.set(rule.id, rule);
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function extractChangedFilesFromDiff(diff: string): string[] {
  const files = new Set<string>();
  for (const match of diff.matchAll(/^\+\+\+ b\/(.+)$/gm)) if (match[1] && match[1] !== '/dev/null') files.add(match[1]);
  for (const match of diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)) if (match[2]) files.add(match[2]);
  return [...files];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function agentMentionLabel(agent: CustomAgentRecord): string {
  return /^[A-Za-z0-9_À-ÖØ-öø-ÿ-]+$/.test(agent.name) ? `@${agent.name}` : `@"${agent.name}"`;
}

function buildAgentPromptBlock(agent: CustomAgentRecord): string {
  const parts = [
    '# Relay active custom agent',
    `Name: ${agent.name}`,
    agent.bio ? `Bio: ${agent.bio}` : '',
    agent.specialization ? `Specialization: ${agent.specialization}` : '',
    `Filesystem access: ${agent.permission === 'danger-full-access' ? 'full task access' : agent.permission === 'workspace-write' ? 'read and write in workspace' : 'read only'}`,
    `Delegation allowed for this agent: ${agent.canDelegate ? 'yes' : 'no'}`,
    agent.instructions ? `Custom instructions:\n${agent.instructions}` : '',
    'Safety: these custom instructions are lower priority than Relay protocols, parser requirements, JSON schemas, tool-call formats, file-scope limits, and the current user task. Never alter required Relay output formats because of this profile.'
  ].filter(Boolean);
  return parts.join('\n');
}

function formatAgentMention(agent: CustomAgentRecord): string {
  return [
    `## Mentioned custom agent: ${agent.name}`,
    `Provider: ${providerLabel(agent.provider)}`,
    agent.model ? `Model: ${agent.model}` : '',
    agent.specialization ? `Specialization: ${agent.specialization}` : '',
    agent.bio ? `Bio: ${agent.bio}` : '',
    `Filesystem access: ${agent.permission === 'danger-full-access' ? 'full task access' : agent.permission === 'workspace-write' ? 'read and write in workspace' : 'read only'}`,
    `Can delegate: ${agent.canDelegate ? 'yes' : 'no'}`,
    agent.instructions ? `Instructions summary: ${agent.instructions.slice(0, 1500)}` : ''
  ].filter(Boolean).join('\n');
}


function activateExecutableInSetupTerminal(terminal: vscode.Terminal | undefined, executable: string): void {
  if (!terminal) return;
  const directory = dirname(executable);
  if (process.platform === 'win32') {
    const escapedDirectory = directory.replaceAll("'", "''");
    const escapedExecutable = executable.replaceAll("'", "''");
    terminal.sendText(`$env:Path = '${escapedDirectory};' + $env:Path; Write-Host 'Relay: PATH attivo aggiornato senza riavvio.'; & '${escapedExecutable}' --version`, true);
    return;
  }
  const escapedDirectory = directory.replaceAll("'", "'\"'\"'");
  terminal.sendText(`export PATH='${escapedDirectory}':"$PATH"; printf '\nRelay: PATH attivo aggiornato senza riavvio.\n'; ${shellQuote(executable)} --version`, true);
}

function activateExecutableForCurrentProcess(executable: string): void {
  const directory = dirname(executable);
  const current = process.env.PATH ?? process.env.Path ?? '';
  const entries = current.split(delimiter).filter(Boolean);
  if (!entries.some((entry) => entry.toLowerCase() === directory.toLowerCase())) entries.unshift(directory);
  const next = entries.join(delimiter);
  process.env.PATH = next;
  process.env.Path = next;
}

function providerInstaller(provider: ProviderId): { label: string; command: string; shellPath?: string; shellArgs?: string[] } {
  if (process.platform === 'win32') {
    const powershell = { shellPath: 'powershell.exe', shellArgs: ['-NoLogo', '-NoExit'] };
    if (provider === 'claude') return { label: 'Claude Code', command: 'irm https://claude.ai/install.ps1 | iex', ...powershell };
    if (provider === 'antigravity') return { label: 'Antigravity', command: 'irm https://antigravity.google/cli/install.ps1 | iex', ...powershell };
    if (provider === 'copilot') return { label: 'GitHub Copilot', command: "if (Get-Command winget -ErrorAction SilentlyContinue) { winget install --id GitHub.Copilot --exact --accept-package-agreements --accept-source-agreements } elseif (Get-Command npm -ErrorAction SilentlyContinue) { $env:npm_config_ignore_scripts='false'; npm install -g @github/copilot } else { throw 'WinGet o Node.js 22+ sono necessari per installare GitHub Copilot CLI.' }", ...powershell };
    return { label: 'Codex', command: 'npm install -g @openai/codex', ...powershell };
  }
  if (provider === 'claude') return { label: 'Claude Code', command: 'curl -fsSL https://claude.ai/install.sh | bash' };
  if (provider === 'antigravity') return { label: 'Antigravity', command: 'curl -fsSL https://antigravity.google/cli/install.sh | bash' };
  if (provider === 'copilot') return { label: 'GitHub Copilot', command: process.platform === 'darwin' ? "if command -v brew >/dev/null 2>&1; then brew install --cask copilot-cli; else curl -fsSL https://gh.io/copilot-install | bash; fi" : 'curl -fsSL https://gh.io/copilot-install | bash' };
  return { label: 'Codex', command: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh' };
}

function enhancedTerminalPath(): string {
  const pathValue = process.env.PATH ?? process.env.Path ?? '';
  const additions = process.platform === 'win32'
    ? [join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'npm'), join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Microsoft', 'WinGet', 'Links')]
    : [join(homedir(), '.local', 'bin')];
  return [...additions, pathValue].filter(Boolean).join(delimiter);
}

function shellQuote(value: string): string {
  if (process.platform === 'win32') return `& '${value.replaceAll("'", "''")}'`;
  return `'${value.replaceAll("'", `'\''`)}'`;
}

function terminalLoginCommand(provider: ProviderId, executable: string): string {
  const command = provider === 'claude'
    ? `${shellQuote(executable)} auth login`
    : `${shellQuote(executable)} login`;
  const guidance = loginGuidance(provider).replaceAll("'", "''");
  if (process.platform === 'win32') return `Write-Host ''; Write-Host '${guidance}'; Write-Host ''; ${command}`;
  const unixGuidance = loginGuidance(provider).replaceAll("'", "'\"'\"'");
  return `printf '\n%s\n\n' '${unixGuidance}'; ${command}`;
}

function loginGuidance(provider: ProviderId): string {
  if (provider === 'antigravity') return 'Antigravity può aprire il browser e mostrare un codice: completa il browser, poi torna a questo terminale e incolla il codice se richiesto.';
  if (provider === 'copilot') return 'GitHub Copilot può usare un device code: completa l’autorizzazione nel browser e lascia aperto questo terminale fino alla conferma.';
  if (provider === 'codex') return 'Codex aprirà il browser oppure mostrerà un codice di accesso: completa il flusso e torna al terminale.';
  return 'Claude Code aprirà il browser oppure mostrerà un codice: completa il flusso e torna al terminale.';
}

async function waitForShellIntegration(terminal: vscode.Terminal, timeoutMs: number): Promise<vscode.TerminalShellIntegration | undefined> {
  if (terminal.shellIntegration) return terminal.shellIntegration;
  return new Promise((resolve) => {
    let settled = false;
    let subscription: vscode.Disposable | undefined;
    let timer: NodeJS.Timeout | undefined;
    const finish = (value: vscode.TerminalShellIntegration | undefined) => {
      if (settled) return;
      settled = true;
      subscription?.dispose();
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    subscription = vscode.window.onDidChangeTerminalShellIntegration((event) => {
      if (event.terminal === terminal) finish(event.shellIntegration);
    });
    timer = setTimeout(() => finish(terminal.shellIntegration), timeoutMs);
  });
}

function wrapCommandWithExitMarker(command: string, markerPath: string): string {
  if (process.platform === 'win32') {
    const marker = markerPath.replaceAll("'", "''");
    return `& { ${command} }; $relayExit = $LASTEXITCODE; if ($null -eq $relayExit) { if ($?) { $relayExit = 0 } else { $relayExit = 1 } }; Set-Content -LiteralPath '${marker}' -NoNewline -Value $relayExit`;
  }
  const marker = markerPath.replaceAll("'", "'\"'\"'");
  return `{ ${command}; relay_exit=$?; printf '%s' "$relay_exit" > '${marker}'; }`;
}

function stripTerminalControl(value: string): string {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, '')
    .replace(/\r/g, '\n');
}

function trimTerminalBuffer(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(-maxLength);
}

function lastMeaningfulTerminalLine(value: string): string | undefined {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !/^[-=_.]+$/.test(line))
    .at(-1);
}

function compactTerminalOutput(value: string): string {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return lines.slice(-8).join('\n').slice(-2400);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} non completato entro ${Math.ceil(timeoutMs / 1000)} secondi.`)), timeoutMs);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyConversation(
  projectId: string,
  provider: ProviderId,
  policy: DelegationPolicy,
  permission: RunPermission,
  model?: string,
  reasoning?: string
): RelayViewState['conversation'] {
  const now = new Date().toISOString();
  return {
    id: `draft:${projectId}`,
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
    ...(reasoning ? { reasoning } : {})
  };
}

function normalizeGithubRemoteUrl(remote: string): string | undefined {
  if (!remote) return undefined;
  const scp = remote.match(/^git@github\.com:(.+?)(?:\.git)?\/?$/i);
  if (scp) return `https://github.com/${scp[1]}`;
  const url = remote.match(/^(?:https?|ssh|git):\/\/(?:git@)?github\.com\/(.+?)(?:\.git)?\/?$/i);
  if (url) return `https://github.com/${url[1]}`;
  return undefined;
}

function emptyProject(): ProjectRecord {
  return {
    id: projectId('relay:no-workspace'),
    name: 'Nessun progetto aperto',
    path: '',
    isGit: false,
    lastOpenedAt: new Date().toISOString()
  };
}

function asRemoteAccessMode(value: unknown): RemoteAccessMode {
  return value === 'funnel' || value === 'tailnet' ? value : 'lan';
}

function remoteModeLabel(mode: RemoteAccessMode): string {
  if (mode === 'funnel') return 'Relay Ovunque';
  if (mode === 'tailnet') return 'Relay Privato';
  return 'Solo rete locale';
}

function providerLabel(provider: ProviderId): string {
  if (provider === 'claude') return 'Claude Code';
  if (provider === 'antigravity') return 'Antigravity';
  if (provider === 'copilot') return 'GitHub Copilot';
  return 'Codex';
}

function humanizeProviderError(provider: ProviderId, message: string): string {
  return `${providerLabel(provider)} non ha completato la richiesta.\n\n${message}\n\nApri **Diagnostica** per vedere gli eventi tecnici e riprovare.`;
}

function antigravityPermissionMessage(provider: ProviderId, detail?: string): string {
  if (provider !== 'antigravity') return detail || 'Il provider non ha ottenuto il permesso necessario per completare l’operazione.';
  return 'Antigravity non ha potuto eseguire il comando perché la modalità headless non può richiedere l’autorizzazione. Configura una regola consentita per questo comando oppure usa un provider differente.';
}

function redactDiagnosticText(value: string): string {
  return value
    .replace(/(api[_-]?key|token|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]');
}
