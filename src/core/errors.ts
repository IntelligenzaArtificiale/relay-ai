import type { ProviderFailure } from './types.js';

export class RelayError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly causeValue?: unknown,
    readonly providerFailure?: ProviderFailure
  ) {
    super(message);
    this.name = 'RelayError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unknown error';
}
