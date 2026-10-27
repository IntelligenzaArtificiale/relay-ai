// Read the model actually used and terminal errors from Claude stream-json results.
export function claudeResultModel(event: Record<string, any>, current?: string): string | undefined {
  const entries = event.modelUsage && typeof event.modelUsage === 'object' ? Object.entries(event.modelUsage) : [];
  const entry = entries.find(([id]) => id === current) ?? (entries.length === 1 ? entries[0] : undefined);
  if (!entry) return current;
  const usage = entry[1] as Record<string, unknown> | null;
  return typeof usage?.canonicalModel === 'string' ? usage.canonicalModel
    : typeof usage?.model === 'string' ? usage.model : entry[0];
}

export function claudeResultError(event: Record<string, any>): string | undefined {
  if (event.type !== 'result' || (!event.is_error && !/^error_/.test(String(event.subtype ?? '')))) return undefined;
  return (Array.isArray(event.errors) ? event.errors.filter((value: unknown) => typeof value === 'string').join('\n') : '')
    || (typeof event.result === 'string' ? event.result : '')
    || `Claude Code: ${event.subtype || 'esecuzione fallita'}`;
}
