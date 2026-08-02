export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className: string, label?: string): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  return node;
}

export function icon(name: IconName, size = 18): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const pathData of ICONS[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.append(path);
  }
  return svg;
}

export function iconButton(name: IconName, label: string, className = 'icon-button'): HTMLButtonElement {
  const node = button(className);
  node.setAttribute('aria-label', label);
  node.title = label;
  node.append(icon(name));
  return node;
}

export function select(
  value: string,
  options: Array<{ value: string; label: string; disabled?: boolean }>,
  className = 'select-control'
): HTMLSelectElement {
  const node = el('select', className);
  for (const option of options) {
    const item = el('option');
    item.value = option.value;
    item.textContent = option.label;
    item.disabled = Boolean(option.disabled);
    item.selected = option.value === value;
    node.append(item);
  }
  return node;
}

export function formatRelativeTime(value: string): string {
  const milliseconds = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) return '';
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return 'ora';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}g`;
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(new Date(value));
}

export function formatClock(value: string): string {
  return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function formatPercent(value: number | undefined): string {
  if (value === undefined) return '—';
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

export function formatReset(value: string | undefined): string {
  if (!value) return 'Reset non disponibile';
  const distance = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(distance)) return 'Reset non disponibile';
  if (distance <= 0) return 'Reset in corso';
  const minutes = Math.ceil(distance / 60_000);
  if (minutes < 60) return `Reset tra ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `Reset tra ${hours}h${rest ? ` ${rest}m` : ''}`;
}

export function compactProviderVersion(value: string | undefined): string {
  if (!value) return 'Disponibile';
  const clean = value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, ' ').replace(/\s+/g, ' ').trim();
  const semantic = clean.match(/\bv?(\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?)\b/i)?.[1];
  return semantic ?? clean.replace(/\.\s*Run ['"]?copilot update['"]?[^.]*\.?/i, '').trim();
}

export function providerLabel(id: string): string {
  if (id === 'claude') return 'Claude Code';
  if (id === 'antigravity') return 'Antigravity';
  if (id === 'copilot') return 'GitHub Copilot';
  return 'Codex';
}

export function providerGlyph(id: string): HTMLElement {
  const node = el('span', `provider-glyph provider-glyph--${id}`);
  const name: IconName = id === 'claude'
    ? 'providerClaude'
    : id === 'antigravity'
      ? 'providerAntigravity'
      : id === 'copilot'
        ? 'providerCopilot'
        : 'providerCodex';
  node.append(icon(name, 17));
  node.setAttribute('aria-hidden', 'true');
  return node;
}

export function agentGlyph(name?: string): HTMLElement {
  const node = el('span', 'agent-glyph');
  node.append(icon('agentEntity', 17));
  if (name) node.title = name;
  node.setAttribute('aria-hidden', 'true');
  return node;
}

export function empty(node: HTMLElement): void {
  node.replaceChildren();
}

export type IconName = keyof typeof ICONS;

const ICONS = {
  chat: ['M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z'],
  history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v6h6', 'M12 7v5l3 2'],
  remote: ['M5 12.5a10 10 0 0 1 14 0', 'M8 15.5a6 6 0 0 1 8 0', 'M11 18.5a2 2 0 0 1 2 0', 'M7 3h10a2 2 0 0 1 2 2v3', 'M5 21h14'],
  devices: ['M7 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M9 20h6', 'M10 7h4'],
  folder: ['M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2'],
  gauge: ['M4 14a8 8 0 1 1 16 0', 'M12 14l4-4', 'M5 19h14'],
  rules: ['M9 4h11', 'M9 12h11', 'M9 20h11', 'M4 4h.01', 'M4 12h.01', 'M4 20h.01'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V20H9.74v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 5.08 15a1.7 1.7 0 0 0-1.55-1H3.4v-3h.13a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1-1.55V4h3v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 18.92 10a1.7 1.7 0 0 0 1.55 1h.13v3h-.13a1.7 1.7 0 0 0-1.07 1z'],
  plus: ['M12 5v14', 'M5 12h14'],
  search: ['m21 21-4.35-4.35', 'M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z'],
  arrowUp: ['M12 19V5', 'm6 11 6-6 6 6'],
  chevronDown: ['m6 9 6 6 6-6'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  stop: ['M8 8h8v8H8z'],
  refresh: ['M20 11a8 8 0 1 0-2.34 5.66', 'M20 4v7h-7'],
  diagnostics: ['M4 4h16v16H4z', 'M8 8h8', 'M8 12h5', 'M8 16h3'],
  pin: ['M12 17v5', 'm5 3 14 14', 'M8 4h8l-1 5 3 3H9l3-3z'],
  archive: ['M3 6h18', 'M5 6v14h14V6', 'M9 10h6'],
  edit: ['M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3z', 'm14 8 3 3'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  check: ['m5 12 4 4L19 6'],
  warning: ['M12 3 2 21h20z', 'M12 9v4', 'M12 17h.01'],
  external: ['M14 3h7v7', 'M10 14 21 3', 'M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5'],
  code: ['m8 9-4 3 4 3', 'm16 9 4 3-4 3', 'm14 5-4 14'],
  shield: ['M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z', 'M9 12l2 2 4-4'],
  lock: ['M7 11h10v9H7z', 'M9 11V8a3 3 0 0 1 6 0v3'],
  workflow: ['M6 4v5', 'M18 15v5', 'M6 9h8a4 4 0 0 1 4 4v2', 'M3 4h6', 'M15 20h6'],
  clock: ['M12 8v5l3 2', 'M12 3a9 9 0 1 0 9 9', 'M9 3h6'],
  branch: ['M6 3v12', 'M18 9v4a4 4 0 0 1-4 4H6', 'M3 6h6', 'M15 6h6', 'M3 18h6'],
  sparkle: ['M12 3l1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8z', 'M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z'],
  project: ['M4 5h16v14H4z', 'M8 9h8', 'M8 13h5'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'm7 7 1 13h8l1-13'],
  import: ['M12 3v12', 'm8 11 4 4 4-4', 'M5 21h14'],
  copy: ['M9 9h11v11H9z', 'M4 15H3V4h11v1'],
  minus: ['M5 12h14'],
  providerCodex: ['M7 3h4a3 3 0 0 1 3 3v1', 'M17 7v4a3 3 0 0 1-3 3h-1', 'M17 17h-4a3 3 0 0 1-3-3v-1', 'M7 17v-4a3 3 0 0 1 3-3h1', 'M7 7h10v10H7z'],
  providerClaude: ['M12 2v20', 'M2 12h20', 'm4.93-7.07 14.14 14.14', 'm19.07 4.93-14.14 14.14'],
  providerAntigravity: ['M12 2l1.45 6.55L20 10l-6.55 1.45L12 18l-1.45-6.55L4 10l6.55-1.45z', 'M19 16l.65 2.35L22 19l-2.35.65L19 22l-.65-2.35L16 19l2.35-.65z'],
  providerCopilot: ['M8 7a4 4 0 0 0-4 4v5a4 4 0 0 0 4 4h2v-5H7v-4h3V7z', 'M16 7a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-2v-5h3v-4h-3V7z', 'M9 11h6v4H9z'],
  agentEntity: ['M12 3l1.8 4.7L19 9.5l-4 3.1.7 5.4-3.7-2.4L8.3 18l.7-5.4-4-3.1 5.2-1.8z', 'M9.5 21h5'],
  logo: ['M5 5h5v5H5z', 'M14 5h5v5h-5z', 'M5 14h5v5H5z', 'M14 14h5v5h-5z', 'M10 7.5h4', 'M7.5 10v4', 'M16.5 10v4', 'M10 16.5h4']
} as const;
