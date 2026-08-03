export type LinkTargetKind =
  | 'external_url'
  | 'workspace_file'
  | 'workspace_directory'
  | 'absolute_file'
  | 'absolute_directory'
  | 'command'
  | 'binary_file'
  | 'nonexistent_path'
  | 'plain_text'
  | 'ambiguous';

export interface LinkClassification {
  kind: LinkTargetKind;
  raw: string;
  normalized: string;
  isBinary: boolean;
  extension?: string;
  line?: number;
  column?: number;
}

const BINARY_EXTENSIONS = new Set([
  '.vsix', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.exe',
  '.dll', '.dylib', '.so', '.tar', '.gz', '.tgz', '.7z', '.rar', '.mp4',
  '.mov', '.avi', '.mp3', '.wav', '.woff', '.woff2', '.ttf', '.otf'
]);

const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ts', '.tsx',
  '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.html', '.htm', '.py',
  '.rb', '.go', '.rs', '.java', '.kt', '.cs', '.sql', '.sh', '.bash',
  '.zsh', '.fish', '.ps1', '.xml', '.svg', '.csv', '.log', '.ini', '.env'
]);

export function classifyLinkTarget(rawText: string): LinkClassification {
  const raw = String(rawText ?? '');
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, '');
  const location = extractResourceLocation(trimmed);
  const normalized = location.path;
  const extension = fileExtension(normalized);
  const isBinary = extension ? BINARY_EXTENSIONS.has(extension) : false;
  const base = { raw, normalized, isBinary, ...(extension ? { extension } : {}), ...(location.line ? { line: location.line } : {}), ...(location.column ? { column: location.column } : {}) };

  if (!normalized || normalized.length > 2048 || /[\r\n]/.test(normalized)) return { ...base, kind: 'plain_text' };
  if (/^(?:https?|mailto):/i.test(normalized)) return { ...base, kind: 'external_url' };
  if (looksLikeShellCommand(normalized)) return { ...base, kind: 'command' };
  if (isBinary) return { ...base, kind: 'binary_file' };
  if (/^file:\/\//i.test(normalized) || /^~[\\/]/.test(normalized) || /^\/|^[A-Za-z]:[\\/]/.test(normalized)) {
    return { ...base, kind: extension && TEXT_EXTENSIONS.has(extension) ? 'absolute_file' : 'ambiguous' };
  }
  if (/^(?:\.{1,2}[\\/])/.test(normalized)) {
    return { ...base, kind: extension ? 'workspace_file' : 'ambiguous' };
  }
  if (isDelimitedWorkspacePath(normalized)) return { ...base, kind: extension ? 'workspace_file' : 'workspace_directory' };
  return { ...base, kind: 'plain_text' };
}

export function isBinaryExtension(path: string): boolean {
  const extension = fileExtension(path);
  return Boolean(extension && BINARY_EXTENSIONS.has(extension));
}

export function extractResourceLocation(value: string): { path: string; line?: number; column?: number } {
  const withoutFragment = value.replace(/#L(\d+)(?:C(\d+))?$/i, (_match, line, column) => `:${line}${column ? `:${column}` : ''}`);
  const match = withoutFragment.match(/^(.*?)(?::(\d+))(?::(\d+))?$/);
  if (!match) return { path: withoutFragment };
  const candidate = match[1] ?? withoutFragment;
  if (/^[A-Za-z]$/.test(candidate) || /^(?:https?|mailto)$/i.test(candidate)) return { path: withoutFragment };
  return {
    path: candidate,
    line: Number(match[2]),
    ...(match[3] ? { column: Number(match[3]) } : {})
  };
}

function fileExtension(value: string): string | undefined {
  const clean = value.split(/[?#]/, 1)[0] ?? value;
  const match = clean.match(/(\.[A-Za-z0-9]{1,12})(?::\d+(?::\d+)?)?$/);
  return match?.[1]?.toLowerCase();
}

function looksLikeShellCommand(value: string): boolean {
  if (!/\s/.test(value)) return false;
  if (/^(?:\.{0,2}[\\/]|~[\\/]|\/|file:\/\/|[A-Za-z]:[\\/])/.test(value)) return false;
  return /^(?:gh|git|npm|pnpm|yarn|node|npx|python3?|pip3?|ruby|go|cargo|make|cmake|docker|kubectl|code|codex|claude|agy|copilot)\b/.test(value)
    || /\s-{1,2}[\w-]+(?:[=\s]|$)/.test(value);
}

function isDelimitedWorkspacePath(value: string): boolean {
  if (/^[\w.-]+\s+/.test(value)) return false;
  return /(?:^|[\\/])[\w.@+\- ()À-ÖØ-öø-ÿ]+\.[A-Za-z0-9]{1,12}$/.test(value)
    || /^[\w.@+\- ()À-ÖØ-öø-ÿ]+[\\/][\w.@+\- ()À-ÖØ-öø-ÿ\\/]+$/.test(value);
}
