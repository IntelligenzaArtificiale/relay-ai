import type { ProviderFailure, ProviderId, RecoveryAction } from '../core/types.js';
import { RelayError, errorMessage } from '../core/errors.js';

export function classifyProviderFailure(provider: ProviderId, error: unknown, combinedOutput = ''): ProviderFailure {
  const raw = [errorMessage(error), combinedOutput].filter(Boolean).join('\n').trim();
  const lower = raw.toLowerCase();
  const actions: RecoveryAction[] = [];
  let category: ProviderFailure['category'] = 'unknown';
  let message = userSafeMessage(raw) || 'Il provider ha restituito un errore non riconosciuto.';
  let retryable = false;
  let resetAt: string | undefined;

  if (/\be2big\b|argument list too long|payload too large/.test(lower)) {
    category = 'payload-too-large';
    message = 'Il task è troppo grande per il metodo di trasporto usato dal provider.';
    actions.push('retry', 'copy-diagnostics');
  } else if (/rate[_ -]?limit|session limit|out_of_credits|out of credits|quota exceeded|too many requests|429/.test(lower)) {
    category = 'rate-limit';
    message = /out_of_credits|out of credits/.test(lower)
      ? 'La quota o i crediti del provider sono esauriti.'
      : /session limit/.test(lower)
        ? 'Il provider ha raggiunto il limite della sessione.'
        : 'Il provider ha raggiunto un limite di utilizzo.';
    resetAt = extractResetAt(raw);
    retryable = Boolean(resetAt);
    actions.push('continue-other-provider', 'copy-diagnostics');
  } else if (/not logged in|login required|authentication|unauthenticated|token expired|401|accesso richiesto/.test(lower)) {
    category = 'authentication';
    message = 'L’account del provider richiede un nuovo accesso.';
    actions.push('open-login', 'retry', 'copy-diagnostics');
  } else if (/permission denied|permission[_ -]?denied|not allowed|auto-denied|command permission|operation not permitted|eacces/.test(lower)) {
    category = 'permission-denied';
    message = 'Il provider non ha ottenuto il permesso necessario per completare l’operazione.';
    actions.push('review-permissions', 'continue-other-provider', 'copy-diagnostics');
  } else if (/timed out|timeout|deadline exceeded|first output timeout/.test(lower)) {
    category = 'timeout';
    message = 'Il provider non ha risposto entro il tempo previsto.';
    retryable = true;
    actions.push('retry', 'continue-other-provider', 'copy-diagnostics');
  } else if (/model.*(?:not found|invalid|unsupported)|unknown model|does not support.*model/.test(lower)) {
    category = 'model-discovery';
    message = 'Il modello richiesto non è disponibile per questo provider.';
    actions.push('refresh-models', 'retry', 'copy-diagnostics');
  } else if (/spawn|unable to start|failed to start|app-server stopped|command_start_failed|non .* riconosciuto/.test(lower)) {
    category = 'launch-failed';
    message = 'Relay non è riuscito ad avviare il processo del provider.';
    retryable = true;
    actions.push('retry', 'configure-path', 'repair-with-provider', 'copy-diagnostics');
  } else if (/not installed|not found|enoent/.test(lower)) {
    category = 'not-installed';
    message = 'La CLI del provider non è installata o non è raggiungibile dall’editor.';
    actions.push('configure-path', 'copy-diagnostics');
  } else if (/protocol|invalid json|rpc/.test(lower)) {
    category = 'protocol';
    message = 'Il provider ha restituito una risposta non compatibile con il protocollo atteso.';
    retryable = true;
    actions.push('retry', 'copy-diagnostics');
  }

  return {
    provider,
    category,
    message: resetAt ? `${message} Ripristino previsto: ${resetAt}.` : message,
    technicalDetail: sanitizeTechnicalDetail(raw),
    retryable,
    ...(resetAt ? { resetAt } : {}),
    suggestedActions: [...new Set(actions)]
  };
}

export function providerFailureError(provider: ProviderId, error: unknown, output = ''): RelayError {
  const failure = classifyProviderFailure(provider, error, output);
  return new RelayError(failure.message, `PROVIDER_${failure.category.toUpperCase().replaceAll('-', '_')}`, error, failure);
}

function extractResetAt(raw: string): string | undefined {
  const jsonMatch = raw.match(/"reset(?:At|_at|Time|_time)"\s*:\s*"([^"]+)"/i);
  if (jsonMatch?.[1]) return jsonMatch[1];
  const textMatch = raw.match(/resets?\s+(?:at\s+)?([^\n·,;]+)/i);
  return textMatch?.[1]?.trim();
}

function userSafeMessage(raw: string): string {
  return raw.replace(/\{[\s\S]{200,}\}/g, '[dettaglio strutturato omesso]').split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 500) ?? '';
}

export function sanitizeTechnicalDetail(raw: string): string {
  return raw
    .replace(/Bearer\s+[^\s\"']+/gi, 'Bearer [REDACTED]')
    .replace(/(?:sk-|ghp_|github_pat_)[A-Za-z0-9_\-.]{12,}/gi, '[REDACTED]')
    .replace(/"(?:token|accessToken|refreshToken|apiKey|authorization)"\s*:\s*"[^"]+"/gi, '"$1":"[REDACTED]"')
    .slice(-8_000);
}
