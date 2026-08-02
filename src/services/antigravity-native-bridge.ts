import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentEventHandler } from '../core/provider.js';
import type { AgentRunRequest, AgentRunResult, RunPermission } from '../core/types.js';
import { RelayError, errorMessage } from '../core/errors.js';

export interface AntigravityNativeCapabilities {
  hostDetected: boolean;
  sendPrompt: boolean;
  openPanel: boolean;
  submit: boolean;
  acceptEdit: boolean;
  acceptTerminal: boolean;
  acceptBrowserPermission: boolean;
  rejectStep: boolean;
  commands: string[];
}

export interface AntigravityCommandHost {
  readonly appName: string;
  getCommands(): Promise<string[]>;
  execute<T = unknown>(command: string, ...args: unknown[]): Promise<T>;
}

interface NativeResultPayload {
  status?: 'completed' | 'failed' | 'cancelled';
  response?: string;
  summary?: string;
  details?: string;
  model?: string;
  changedFiles?: string[];
  screenshots?: string[];
  urls?: string[];
  consoleErrors?: string[];
  networkErrors?: string[];
  error?: string;
}

const COMMANDS = {
  send: 'antigravity.sendPromptToAgentPanel',
  open: ['antigravity.agentSidePanel.open', 'antigravity.agentPanel.open', 'antigravity.openAgent'],
  focus: [
    'antigravity.agentSidePanel.focus',
    'antigravity.agentPanel.focus',
    'antigravity.toggleChatFocus',
    'workbench.action.chat.focusInput',
    'chat.action.focusInput'
  ],
  submit: [
    'antigravity.agentSidePanel.submit',
    'antigravity.agentPanel.submit',
    'antigravity.agent.submit',
    'antigravity.chat.submit',
    'antigravity.agent.sendMessage',
    'workbench.action.chat.submit',
    'chat.action.acceptInput'
  ],
  acceptEdit: ['antigravity.agent.acceptAgentStep', 'antigravity.command.accept'],
  acceptTerminal: ['antigravity.terminalCommand.accept', 'antigravity.terminalCommand.run'],
  acceptBrowserPermission: [
    'antigravity.browserPermission.alwaysAllow',
    'antigravity.browserPermission.allowOnce',
    'antigravity.browser.alwaysAllow',
    'antigravity.browser.allowOnce',
    'antigravity.permission.alwaysAllow',
    'antigravity.permission.allowOnce',
    'antigravity.agent.approvePermission',
    'antigravity.agent.allowPermission'
  ],
  reject: ['antigravity.agent.rejectAgentStep', 'antigravity.command.reject', 'antigravity.terminalCommand.reject']
} as const;

export function browserApprovalCommands(commands: string[], preferAlways = true): string[] {
  const explicit = COMMANDS.acceptBrowserPermission.filter((command) => commands.includes(command));
  const discovered = commands.filter((command) => {
    const normalized = command.toLowerCase();
    if (!normalized.includes('antigravity')) return false;
    const concernsPermission = /(browser|permission|consent|website|domain|url)/.test(normalized);
    const approves = /(allow|accept|approve|grant)/.test(normalized);
    const rejects = /(deny|reject|revoke|remove|settings|configure|open)/.test(normalized);
    return concernsPermission && approves && !rejects;
  });
  const unique = [...new Set([...explicit, ...discovered])];
  return unique.sort((a, b) => {
    if (!preferAlways) return Number(/always/i.test(a)) - Number(/always/i.test(b));
    return Number(/always/i.test(b)) - Number(/always/i.test(a));
  });
}

export function antigravitySubmitCommands(commands: string[]): string[] {
  const available = new Set(commands);
  const explicit = COMMANDS.submit.filter((command) => available.has(command));
  const discovered = commands.filter((command) => {
    if (command === COMMANDS.send) return false;
    const normalized = command.toLowerCase();
    if (!normalized.includes('antigravity')) return false;
    const submits = /(submit|sendmessage|send-message|acceptinput|accept-input|executeprompt|execute-prompt|runprompt|run-prompt)/.test(normalized);
    const unrelated = /(feedback|rating|report|issue|settings|configure)/.test(normalized);
    return submits && !unrelated;
  });
  // Antigravity-specific commands must win over the generic VS Code chat
  // submit command, which can target the wrong chat surface in forked IDEs.
  return [...new Set([...discovered, ...explicit])].sort((a, b) => {
    const genericA = /^(?:workbench|chat)\./.test(a) ? 1 : 0;
    const genericB = /^(?:workbench|chat)\./.test(b) ? 1 : 0;
    return genericA - genericB;
  });
}

export class AntigravityNativeBridge {
  private cachedCapabilities: AntigravityNativeCapabilities | undefined;
  private checkedAt = 0;

  constructor(
    private readonly storageRoot: string,
    private readonly host: AntigravityCommandHost
  ) {}

  async capabilities(force = false): Promise<AntigravityNativeCapabilities> {
    if (!force && this.cachedCapabilities && Date.now() - this.checkedAt < 15_000) return this.cachedCapabilities;
    const commands = await this.host.getCommands().catch(() => []);
    const available = new Set(commands);
    const hostDetected = /antigravity/i.test(this.host.appName) || available.has(COMMANDS.send);
    const capabilities: AntigravityNativeCapabilities = {
      hostDetected,
      sendPrompt: available.has(COMMANDS.send),
      openPanel: COMMANDS.open.some((command) => available.has(command)),
      submit: antigravitySubmitCommands(commands).length > 0,
      acceptEdit: COMMANDS.acceptEdit.some((command) => available.has(command)),
      acceptTerminal: COMMANDS.acceptTerminal.some((command) => available.has(command)),
      acceptBrowserPermission: browserApprovalCommands(commands, true).length > 0,
      rejectStep: COMMANDS.reject.some((command) => available.has(command)),
      commands
    };
    this.cachedCapabilities = capabilities;
    this.checkedAt = Date.now();
    return capabilities;
  }

  async available(): Promise<boolean> {
    const capabilities = await this.capabilities();
    return capabilities.hostDetected && capabilities.sendPrompt;
  }

  async run(request: AgentRunRequest, onEvent: AgentEventHandler): Promise<AgentRunResult> {
    const capabilities = await this.capabilities(true);
    if (!capabilities.hostDetected || !capabilities.sendPrompt) {
      throw new RelayError(
        'Il bridge nativo Antigravity IDE non è disponibile in questa finestra. Apri Relay dentro Antigravity IDE o usa AGY per i task senza browser.',
        'ANTIGRAVITY_NATIVE_BRIDGE_UNAVAILABLE'
      );
    }

    const responseDirectory = join(request.cwd, '.relay', 'antigravity-native');
    const responsePath = join(responseDirectory, `${request.runId}.json`);
    await mkdir(responseDirectory, { recursive: true });
    await rm(responsePath, { force: true }).catch(() => undefined);

    const nativePrompt = buildNativePrompt(request, responsePath);
    onEvent({ type: 'status', runId: request.runId, message: 'Apertura di Antigravity Agent…', phase: 'starting-session' });
    await this.openPanel(capabilities.commands);

    onEvent({ type: 'status', runId: request.runId, message: 'Invio del task al Browser Agent…', phase: 'starting-turn' });
    await this.host.execute(COMMANDS.send, nativePrompt);
    await this.submitDraft(capabilities.commands, request.runId, onEvent);
    if (request.permission !== 'read-only') await this.acceptPendingSteps(capabilities.commands, request.permission);

    if (request.permission === 'danger-full-access') {
      onEvent({
        type: 'activity',
        runId: request.runId,
        title: 'Consensi Browser Agent',
        detail: capabilities.acceptBrowserPermission
          ? 'Relay proverà ad approvare automaticamente i consensi browser esposti da questa build di Antigravity.'
          : 'Questa build non espone un comando VS Code per i consensi browser. Usa “Always Allow” una volta nelle impostazioni/popup di Antigravity.'
      });
    }

    onEvent({ type: 'status', runId: request.runId, message: 'Antigravity IDE sta lavorando nel browser…', phase: 'working' });
    const startedAt = Date.now();
    let lastHeartbeat = 0;
    const approvalTimer = request.permission === 'read-only'
      ? undefined
      : setInterval(() => void this.acceptPendingSteps(capabilities.commands, request.permission), 1600);

    const abort = async () => {
      await this.rejectPendingStep(capabilities.commands);
      throw new RelayError('Task Antigravity IDE annullato.', 'RUN_CANCELLED');
    };

    try {
      while (Date.now() - startedAt < 20 * 60_000) {
        if (request.signal?.aborted) return await abort();
        const payload = await readNativeResult(responsePath);
        if (payload) {
          if (payload.status === 'failed') {
            throw new RelayError(payload.error || payload.details || 'Antigravity IDE non ha completato il task.', 'ANTIGRAVITY_NATIVE_TASK_FAILED', payload);
          }
          if (payload.status === 'cancelled') throw new RelayError('Task Antigravity IDE annullato.', 'RUN_CANCELLED');
          const text = formatNativeResponse(payload);
          const result: AgentRunResult = {
            runId: request.runId,
            provider: 'antigravity',
            text,
            ...(payload.model || request.model ? { model: payload.model ?? request.model } : {}),
            ...(payload.changedFiles?.length ? { changedFiles: payload.changedFiles } : {})
          };
          onEvent({ type: 'complete', runId: request.runId, result });
          await rm(responsePath, { force: true }).catch(() => undefined);
          return result;
        }

        const elapsed = Date.now() - startedAt;
        if (elapsed - lastHeartbeat >= 8_000) {
          lastHeartbeat = elapsed;
          onEvent({
            type: 'status',
            runId: request.runId,
            message: `Browser Agent attivo · ${Math.max(1, Math.floor(elapsed / 1000))}s`,
            phase: 'working'
          });
        }
        await delay(750);
      }
      throw new RelayError('Timeout: Antigravity IDE non ha restituito il risultato entro 20 minuti.', 'ANTIGRAVITY_NATIVE_TIMEOUT');
    } finally {
      if (approvalTimer) clearInterval(approvalTimer);
    }
  }

  private async openPanel(commands: string[]): Promise<void> {
    const available = new Set(commands);
    for (const command of [...COMMANDS.open, ...COMMANDS.focus]) {
      if (!available.has(command)) continue;
      try {
        await this.host.execute(command);
        return;
      } catch {
        // Try the next command exposed by this Antigravity build.
      }
    }
  }

  private async focusPanel(commands: string[]): Promise<void> {
    const available = new Set(commands);
    for (const command of COMMANDS.focus) {
      if (!available.has(command)) continue;
      try {
        await this.host.execute(command);
        return;
      } catch {
        // Try the next focus command exposed by this Antigravity build.
      }
    }
  }

  private async submitDraft(commands: string[], runId: string, onEvent: AgentEventHandler): Promise<void> {
    const candidates = antigravitySubmitCommands(commands);
    if (!candidates.length) {
      throw new RelayError(
        'Antigravity IDE ha ricevuto il prompt, ma questa build non espone un comando pubblico per inviarlo automaticamente.',
        'ANTIGRAVITY_NATIVE_SUBMIT_UNAVAILABLE'
      );
    }

    // sendPromptToAgentPanel can resolve before React has committed the draft.
    // Refocus the Antigravity composer and wait for the UI before submitting.
    await delay(650);
    await this.focusPanel(commands);
    await delay(120);

    let submittedWith: string | undefined;
    for (const command of candidates) {
      try {
        await this.host.execute(command);
        submittedWith = command;
        break;
      } catch {
        // Try the next command. Generic workbench submit is intentionally last.
      }
    }
    if (!submittedWith) {
      throw new RelayError(
        'Relay ha inserito il prompt nel pannello Antigravity, ma tutti i comandi di invio disponibili hanno fallito.',
        'ANTIGRAVITY_NATIVE_SUBMIT_FAILED'
      );
    }

    onEvent({
      type: 'activity',
      runId,
      title: 'Prompt Browser Agent inviato',
      detail: `Comando: ${submittedWith}`
    });

    // Generic VS Code chat commands can acknowledge before the Antigravity
    // input has mounted. Retry only that fallback path: after a successful send
    // the composer is empty, while a still-populated draft is dispatched.
    if (/^(?:workbench|chat)\./.test(submittedWith)) {
      await delay(900);
      await this.focusPanel(commands);
      await delay(80);
      try { await this.host.execute(submittedWith); } catch { /* best-effort retry */ }
    }
  }

  private async acceptPendingSteps(commands: string[], permission: RunPermission): Promise<void> {
    const available = new Set(commands);
    const candidates = permission === 'danger-full-access'
      ? [...COMMANDS.acceptEdit, ...COMMANDS.acceptTerminal, ...browserApprovalCommands(commands, true)]
      : [...COMMANDS.acceptEdit];
    for (const command of [...new Set(candidates)]) {
      if (!available.has(command)) continue;
      try { await this.host.execute(command); } catch { /* no pending step or unsupported state */ }
    }
  }

  private async rejectPendingStep(commands: string[]): Promise<void> {
    const available = new Set(commands);
    for (const command of COMMANDS.reject) {
      if (!available.has(command)) continue;
      try { await this.host.execute(command); } catch { /* best effort */ }
    }
  }
}

function buildNativePrompt(request: AgentRunRequest, responsePath: string): string {
  const permissionPolicy = permissionInstructions(request.permission);
  return [
    '/browser',
    '# Relay native Antigravity task',
    `Workspace root: ${request.cwd}`,
    `Relay run id: ${request.runId}`,
    request.model && request.model !== 'auto'
      ? `Requested model: ${request.model}. If the active model differs, state it in the result instead of pretending.`
      : 'Use the model currently selected in Antigravity IDE.',
    permissionPolicy,
    '',
    request.rules ? `# Applicable rules\n${request.rules}` : '',
    '# User task',
    request.prompt,
    '',
    '# Completion contract',
    'Use the native Antigravity Browser Subagent and keep its browser window visible to the user.',
    'Perform the requested interactions for real. Capture useful screenshots and inspect console/network when relevant.',
    `Before finishing, write one UTF-8 JSON object to this exact path: ${responsePath}`,
    'The JSON must use this shape:',
    JSON.stringify({
      status: 'completed',
      response: 'Final answer for the user',
      summary: 'Short result summary',
      details: 'Optional technical detail',
      model: 'Actual model used',
      changedFiles: ['relative/or/absolute/path'],
      screenshots: ['path/to/screenshot.png'],
      urls: ['http://127.0.0.1:3000'],
      consoleErrors: [],
      networkErrors: []
    }, null, 2),
    'Do not end the task until this file has been written. If the task fails, write status="failed" and include error/details.'
  ].filter(Boolean).join('\n\n');
}

function permissionInstructions(permission: RunPermission): string {
  if (permission === 'read-only') return 'Permission policy: inspect and test only. Do not modify project files or approve write actions.';
  if (permission === 'workspace-write') return 'Permission policy: project file edits are allowed and Relay may approve edit steps. Terminal, browser-domain and destructive approvals still require the user.';
  return 'Permission policy: full task permissions are enabled. Relay may auto-approve edit, terminal and browser-domain steps exposed through Antigravity commands. Prefer persistent Always Allow for browser domains when the IDE offers it.';
}

async function readNativeResult(path: string): Promise<NativeResultPayload | undefined> {
  try {
    const raw = (await readFile(path, 'utf8')).trim();
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as NativeResultPayload;
    } catch {
      return { status: 'completed', response: raw };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new RelayError(`Impossibile leggere il risultato Antigravity IDE: ${errorMessage(error)}`, 'ANTIGRAVITY_NATIVE_RESULT_READ_FAILED', error);
  }
}

function formatNativeResponse(payload: NativeResultPayload): string {
  const sections: string[] = [];
  const primary = payload.response?.trim() || payload.summary?.trim() || payload.details?.trim();
  if (primary) sections.push(primary);
  if (payload.summary && payload.summary.trim() !== primary) sections.push(`## Riepilogo\n${payload.summary.trim()}`);
  if (payload.details && payload.details.trim() !== primary) sections.push(`## Dettagli\n${payload.details.trim()}`);
  if (payload.urls?.length) sections.push(`## URL verificati\n${payload.urls.map((url) => `- ${url}`).join('\n')}`);
  if (payload.screenshots?.length) sections.push(`## Screenshot\n${payload.screenshots.map((path) => `- [${path}](${path})`).join('\n')}`);
  if (payload.consoleErrors?.length) sections.push(`## Errori console\n${payload.consoleErrors.map((item) => `- ${item}`).join('\n')}`);
  if (payload.networkErrors?.length) sections.push(`## Errori network\n${payload.networkErrors.map((item) => `- ${item}`).join('\n')}`);
  return sections.join('\n\n') || 'Task Antigravity IDE completato.';
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
