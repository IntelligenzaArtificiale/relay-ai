import type { AgentEvent, AgentRunRequest, AgentRunResult, ProviderId, ProviderStatus, UsageSnapshot } from './types.js';

export type AgentEventHandler = (event: AgentEvent) => void;

export interface AgentProvider {
  readonly id: ProviderId;
  detect(signal?: AbortSignal): Promise<ProviderStatus>;
  listModels?(signal?: AbortSignal): Promise<ProviderStatus['models']>;
  getUsage(): Promise<UsageSnapshot>;
  run(request: AgentRunRequest, onEvent: AgentEventHandler): Promise<AgentRunResult>;
  dispose(): Promise<void> | void;
}
