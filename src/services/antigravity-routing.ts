/**
 * Returns true only when the user is explicitly asking Relay to operate a
 * visible browser session. Merely discussing browser code, Browser Subagent,
 * screenshots, console/network APIs, or explicitly saying that a browser is
 * not needed must stay on the normal AGY CLI path.
 */
export function requiresAntigravityBrowser(prompt: string): boolean {
  const source = String(prompt ?? '').trim();
  if (!source) return false;

  // `/browser` is an explicit Relay/Antigravity browser request only when used
  // as a command, not when quoted inside an analysis paragraph.
  if (/^\s*\/browser(?:\s|$)/im.test(source)) return true;

  const normalized = source
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'");

  // Remove clauses that explicitly reject browser execution. This is crucial
  // for prompts such as "non serve aprire un browser" that may still discuss
  // Browser Subagent internals later in the same task.
  const withoutNegatedBrowserClauses = normalized.replace(
    /\b(?:non|senza|evita(?:re)?|niente|nessun[oa]?|no)\b[^.!?\n]{0,140}\b(?:browser|chrome|browser subagent|browser agent|devtools|console del browser|network tab|network panel)\b[^.!?\n]*/gi,
    ' '
  );

  const explicitPatterns = [
    // Open/use/navigate a real browser or URL.
    /\b(?:apri|aprire|avvia|avviare|usa|usare|utilizza|utilizzare|naviga|navigare|visita|visitare|vai|andare|interagisci|interagire|controlla|controllare|testa|testare|verifica|verificare)\b[^.!?\n]{0,100}\b(?:browser|chrome|browser subagent|browser agent|pagina web|sito web|localhost|https?:\/\/|url|[a-z0-9-]+\.(?:com|it|net|org|dev|app|io))\b/i,
    // Browser target first, action second.
    /\b(?:browser|chrome|browser subagent|browser agent|pagina web|sito web|localhost|https?:\/\/|url|[a-z0-9-]+\.(?:com|it|net|org|dev|app|io))\b[^.!?\n]{0,100}\b(?:apri|avvia|usa|naviga|visita|clicca|compila|interagisci|testa|verifica)\b/i,
    // Concrete browser interaction verbs.
    /\b(?:clicca|compila|invia il form|fai login|accedi al sito|seleziona nel sito|scarica dalla pagina)\b/i,
    // Screenshot requested as an actual browser action, not discussed as code.
    /\b(?:fai|acquisisci|cattura|salva)\b[^.!?\n]{0,60}\b(?:uno |degli |lo )?screenshot\b/i,
    // DevTools inspection explicitly requested.
    /\b(?:apri|usa|controlla|ispeziona|verifica)\b[^.!?\n]{0,80}\b(?:devtools|console del browser|network tab|network panel)\b/i
  ];

  return explicitPatterns.some((pattern) => pattern.test(withoutNegatedBrowserClauses));
}
