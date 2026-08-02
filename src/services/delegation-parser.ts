import type { DelegationProvider, ProviderId, RelayDelegationRequest, RelayDelegationTaskRequest, RunPermission, TaskComplexity } from '../core/types.js';

const OPEN = '<relay-delegate>';
const CLOSE = '</relay-delegate>';

export interface DelegationParseResult {
  visibleText: string;
  request?: RelayDelegationRequest;
  malformed?: string;
}

export function delegationProtocolInstructions(options: {
  policy: 'confirm' | 'automatic' | 'disabled';
  providers: Array<{ id: ProviderId; label: string; available: boolean; models: string[] }>;
  agents?: Array<{ id: string; name: string; provider: ProviderId; model?: string; specialization?: string; permission?: RunPermission; available: boolean }>;
  maxTasks: number;
  maxDepth: number;
  depth: number;
}): string {
  if (options.policy === 'disabled' || options.depth >= options.maxDepth) {
    return '# Relay collaboration\nDelegation to other agents is disabled for this turn. Complete the task yourself and do not search the filesystem for other agent executables.';
  }

  const providerLines = options.providers
    .filter((provider) => provider.available)
    .map((provider) => `- ${provider.id}: ${provider.label}${provider.models.length ? `; models: ${provider.models.slice(0, 8).join(', ')}` : ''}`)
    .join('\n');
  const agentLines = (options.agents ?? [])
    .filter((agent) => agent.available)
    .map((agent) => `- name="${agent.name}"; id=${agent.id}; provider=${agent.provider}${agent.model ? `; model=${agent.model}` : ''}${agent.specialization ? `; specialization=${agent.specialization}` : ''}${agent.permission ? `; permission=${agent.permission}` : ''}`)
    .join('\n');

  return `# Relay collaboration protocol
Relay can invoke the other configured coding agents for you. Do not run, locate, or inspect the codex, claude, agy, or copilot executables yourself. Do not pretend to delegate in prose.

Available providers:
${providerLines || '- No provider is currently available.'}

Available custom agents that may receive delegated tasks:
${agentLines || '- No custom delegable agent is currently available.'}

When another agent is genuinely needed, respond with only this exact XML block and valid JSON inside it:
${OPEN}
{"reason":"brief reason","intent":"specialist","strategy":"parallel","tasks":[{"id":"scan","provider":"auto","agent":"auto","label":"short visible task label","prompt":"complete self-contained task","model":"auto","reasoning":"auto","permission":"read-only","complexity":"light","files":["src/example.ts"],"dependsOn":[]}]}
${CLOSE}

Rules:
- Maximum ${options.maxTasks} tasks in one request.
- strategy is "parallel" only for independent work; use "sequential" or dependsOn when order matters.
- provider may be codex, claude, antigravity, copilot, or auto. You may delegate to the same provider as yourself with a different model.
- agent may be auto, an exact custom agent id, or the exact custom agent name listed above. Prefer the exact id in generated JSON. Use an agent when the user names it (with or without @) or when its specialization materially helps; otherwise keep agent auto.
- A user mention such as @AgentName selects that agent as a delegation target; it does not replace you as the primary provider. Delegate the relevant subtask and then synthesize the result.
- Multiple tasks may target the same provider and run in parallel when their files and dependencies do not overlap.
- Delegate only when the user explicitly asks for another agent/provider, or when specialization/parallelism is expected to save more tokens or time than the handoff costs. Do not delegate simple work merely because another provider is available.
- reason must state the concrete delegation value: explicit user request, specialist knowledge, parallel speed-up, or token/context saving.
- intent must be one of: cost (delegating to save tokens or quota), specialist (another provider or model is materially better for this work), user-request (the user explicitly asked for that agent or provider), parallel (independent work split for speed). Choose the one that actually drives the decision.
- permission must be read-only, workspace-write, or danger-full-access.
- For analysis, review, mapping, or planning use read-only unless a report file must be written.
- When the user explicitly asks the delegated agent to solve, repair, implement, patch, build, or apply a fix, use danger-full-access so the child can inspect, edit, run commands, test, and build. Do not mark an implementation task read-only.
- complexity may be light, standard, or complex. Use light for bounded mechanical work and complex only when deeper reasoning is justified.
- Use model/reasoning "auto" unless a specific choice is important. Relay considers current quotas and available model capabilities.
- Give every task a stable id when another task depends on it. dependsOn contains task ids.
- files should list likely file scopes when known; Relay uses them to avoid unsafe parallel writes.
- The delegated prompt must contain all context the target needs.
- Output no commentary before or after the block.
- After Relay returns results, continue the original task and synthesize the final answer.
- Delegation policy for this conversation: ${options.policy}.`;
}

export function parseDelegationResponse(text: string, maxTasks = 8): DelegationParseResult {
  const start = text.indexOf(OPEN);
  if (start < 0) return { visibleText: text };
  const end = text.indexOf(CLOSE, start + OPEN.length);
  if (end < 0) return { visibleText: text.slice(0, start).trim(), malformed: 'Delegation block is missing its closing tag.' };

  const before = text.slice(0, start).trim();
  const after = text.slice(end + CLOSE.length).trim();
  const raw = text.slice(start + OPEN.length, end).trim();
  try {
    const value = JSON.parse(raw) as unknown;
    const request = normalizeRequest(value, maxTasks);
    if (!request) return { visibleText: [before, after].filter(Boolean).join('\n\n'), malformed: 'Delegation JSON is invalid or contains no valid tasks.' };
    return { visibleText: [before, after].filter(Boolean).join('\n\n'), request };
  } catch (error) {
    return {
      visibleText: [before, after].filter(Boolean).join('\n\n'),
      malformed: error instanceof Error ? error.message : 'Delegation JSON could not be parsed.'
    };
  }
}

export function containsDelegationStart(text: string): boolean {
  return text.includes(OPEN) || OPEN.startsWith(text.trimStart());
}

function normalizeRequest(value: unknown, maxTasks: number): RelayDelegationRequest | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const object = value as Record<string, unknown>;
  const rawTasks = Array.isArray(object.tasks) ? object.tasks.slice(0, maxTasks) : [];
  const tasks = rawTasks.map(normalizeTask).filter(Boolean) as RelayDelegationTaskRequest[];
  if (tasks.length === 0) return undefined;
  const reason = cleanString(object.reason, 500);
  const intent = object.intent === 'cost' || object.intent === 'specialist' || object.intent === 'user-request' || object.intent === 'parallel' ? object.intent : undefined;
  return {
    tasks,
    strategy: object.strategy === 'sequential' ? 'sequential' : 'parallel',
    ...(intent ? { intent } : {}),
    ...(reason ? { reason } : {})
  };
}

function normalizeTask(value: unknown): RelayDelegationTaskRequest | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const object = value as Record<string, unknown>;
  const provider = asProvider(object.provider);
  const prompt = cleanString(object.prompt, 30_000);
  if (!provider || !prompt) return undefined;
  const label = cleanString(object.label, 100);
  const model = cleanString(object.model, 200);
  const agent = cleanString(object.agent, 120);
  const reasoning = cleanString(object.reasoning, 100);
  const permission = asPermission(object.permission);
  const complexity = asComplexity(object.complexity);
  const id = cleanString(object.id, 100);
  const dependsOn = cleanStringArray(object.dependsOn, 24, 100);
  const files = cleanStringArray(object.files, 80, 500);
  return {
    provider,
    prompt,
    ...(id ? { id } : {}),
    ...(label ? { label } : {}),
    ...(model ? { model } : {}),
    ...(agent ? { agent } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(permission ? { permission } : {}),
    ...(complexity ? { complexity } : {}),
    ...(dependsOn.length ? { dependsOn } : {}),
    ...(files.length ? { files } : {})
  };
}

function asProvider(value: unknown): DelegationProvider | undefined {
  return value === 'codex' || value === 'claude' || value === 'antigravity' || value === 'copilot' || value === 'auto' ? value : undefined;
}

function asComplexity(value: unknown): TaskComplexity | undefined {
  return value === 'light' || value === 'standard' || value === 'complex' ? value : undefined;
}

function cleanStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => cleanString(entry, maxLength) ?? []).slice(0, maxItems))];
}

function asPermission(value: unknown): RunPermission | undefined {
  return value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access' ? value : undefined;
}

function cleanString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}
