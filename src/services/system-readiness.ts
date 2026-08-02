import { homedir, platform as osPlatform } from 'node:os';
import { join } from 'node:path';
import type { ProviderId, ProviderStatus } from '../core/types.js';
import { runCommand } from './command-runner.js';
import { resolveExecutable } from './executable-resolver.js';

export type SystemComponentId = 'runtime' | 'tailscale' | 'node' | 'npm' | 'git' | 'curl' | 'browser' | 'powershell' | 'winget' | 'brew' | 'apt' | 'dnf' | 'pacman';
export type SystemComponentState = 'ready' | 'missing' | 'outdated' | 'not-needed';

export interface SystemComponentStatus {
  id: SystemComponentId;
  label: string;
  state: SystemComponentState;
  detail: string;
  version?: string;
  path?: string;
  requiredFor: string[];
  installable: boolean;
}

export interface FeatureReadiness {
  ready: boolean;
  title: string;
  detail: string;
  missing: SystemComponentId[];
}

export interface SystemReadinessSnapshot {
  checkedAt: string;
  platform: string;
  arch: string;
  remoteName?: string;
  components: SystemComponentStatus[];
  features: {
    remote: FeatureReadiness;
    parallelWrites: FeatureReadiness;
    browserAutomation: FeatureReadiness;
  };
}

export interface ComponentInstallPlan {
  id: SystemComponentId;
  label: string;
  mode: 'terminal' | 'external';
  command?: string;
  url?: string;
  detail: string;
}

interface ProbeResult {
  ready: boolean;
  path?: string;
  version?: string;
}

export async function detectSystemReadiness(providers: ProviderStatus[], remoteName?: string): Promise<SystemReadinessSnapshot> {
  const platform = osPlatform();
  const [tailscale, git, node, npm, curl, browser, powershell, winget, brew, apt, dnf, pacman] = await Promise.all([
    probeCommand('tailscale', ['version'], tailscaleCandidates(platform), { TAILSCALE_BE_CLI: '1' }),
    probeCommand('git', ['--version']),
    probeCommand('node', ['--version']),
    probeCommand('npm', ['--version']),
    probeCommand('curl', ['--version']),
    probeBrowser(platform),
    platform === 'win32' ? probeCommand('pwsh.exe', ['--version']) : Promise.resolve({ ready: false }),
    platform === 'win32' ? probeCommand('winget', ['--version']) : Promise.resolve({ ready: false }),
    platform === 'darwin' ? probeCommand('brew', ['--version']) : Promise.resolve({ ready: false }),
    platform === 'linux' ? probeCommand('apt-get', ['--version']) : Promise.resolve({ ready: false }),
    platform === 'linux' ? probeCommand('dnf', ['--version']) : Promise.resolve({ ready: false }),
    platform === 'linux' ? probeCommand('pacman', ['--version']) : Promise.resolve({ ready: false })
  ]);

  const components: SystemComponentStatus[] = [
    {
      id: 'runtime', label: 'Runtime Relay', state: 'ready', version: process.version,
      detail: `Node ${process.version} è incluso nell’extension host: Remoto non richiede un Node esterno.`,
      requiredFor: ['Remoto', 'Relay'], installable: false
    },
    component('tailscale', 'Tailscale', tailscale, ['Relay Ovunque', 'Relay Privato'], true),
    componentWithMinimumMajor('node', 'Node.js esterno', node, 20, ['Fallback npm per installare CLI', 'CLI npm recenti'], true),
    component('npm', 'npm', npm, ['Installazione CLI via npm'], true),
    component('git', 'Git', git, ['Worktree e scritture parallele isolate'], true),
    component('curl', 'curl', curl, ['Installer CLI su macOS/Linux'], true),
    component('browser', 'Chrome / Edge / Chromium', browser, ['Browser Agent Antigravity'], true),
    componentWithMinimumMajor('powershell', 'PowerShell 7', powershell, 7, ['Shell opzionale per installer Windows avanzati'], true, platform === 'win32'),
    component('winget', 'WinGet', winget, ['Installazioni automatiche Windows'], false, platform === 'win32'),
    component('brew', 'Homebrew', brew, ['Installazioni automatiche macOS'], false, platform === 'darwin'),
    component('apt', 'APT', apt, ['Installazioni automatiche Linux'], false, platform === 'linux'),
    component('dnf', 'DNF', dnf, ['Installazioni automatiche Linux'], false, platform === 'linux'),
    component('pacman', 'Pacman', pacman, ['Installazioni automatiche Linux'], false, platform === 'linux')
  ];

  const providerHasBrowser = providers.some((entry) => entry.id === 'antigravity' && entry.available);
  return {
    checkedAt: new Date().toISOString(),
    platform,
    arch: process.arch,
    ...(remoteName ? { remoteName } : {}),
    components,
    features: {
      remote: {
        ready: true,
        title: 'Accesso remoto',
        detail: remoteName
          ? `Il server usa il runtime integrato nell’extension host remoto “${remoteName}”. Il telefono deve raggiungere quella macchina/rete.`
          : 'Pronto: usa il runtime Node integrato nell’extension host e non richiede installazioni esterne.',
        missing: []
      },
      parallelWrites: {
        ready: git.ready,
        title: 'Scritture parallele isolate',
        detail: git.ready ? 'Git rilevato: Relay può usare worktree isolati.' : 'Git non rilevato: i writer verranno serializzati.',
        missing: git.ready ? [] : ['git']
      },
      browserAutomation: {
        ready: browser.ready,
        title: 'Browser Agent',
        detail: browser.ready
          ? 'Browser desktop rilevato.'
          : providerHasBrowser ? 'Antigravity è disponibile, ma non è stato rilevato un browser desktop compatibile.' : 'Installa Chrome, Edge o Chromium prima di usare automazioni browser.',
        missing: browser.ready ? [] : ['browser']
      }
    }
  };
}

export function componentById(snapshot: SystemReadinessSnapshot, id: SystemComponentId): SystemComponentStatus | undefined {
  return snapshot.components.find((entry) => entry.id === id);
}

export function missingProviderInstallerComponent(provider: ProviderId, snapshot: SystemReadinessSnapshot): SystemComponentId | undefined {
  const ready = (id: SystemComponentId) => componentById(snapshot, id)?.state === 'ready';
  if (snapshot.platform === 'win32') {
    if (provider === 'codex' && (!ready('node') || !ready('npm'))) return !ready('node') ? 'node' : 'npm';
    if (provider === 'copilot' && !ready('winget') && (!ready('node') || !ready('npm'))) return !ready('node') ? 'node' : 'npm';
    return undefined;
  }
  if (provider === 'copilot' && snapshot.platform === 'darwin' && ready('brew')) return undefined;
  return ready('curl') ? undefined : 'curl';
}

export function componentInstallPlan(id: SystemComponentId, snapshot: SystemReadinessSnapshot): ComponentInstallPlan | undefined {
  const ready = (componentId: SystemComponentId) => componentById(snapshot, componentId)?.state === 'ready';
  const platform = snapshot.platform;
  if (id === 'tailscale') {
    if (platform === 'win32') return terminalPlan('tailscale', 'Tailscale', 'winget install --id tailscale.tailscale --exact --accept-package-agreements --accept-source-agreements', 'Installa il client ufficiale Tailscale tramite WinGet.');
    if (platform === 'darwin') return externalPlan('tailscale', 'Tailscale per macOS', 'https://tailscale.com/download/mac', 'Apri il download ufficiale. Relay usa la CLI inclusa nell’app e verifica a runtime la disponibilità di Serve/Funnel.');
    return terminalPlan('tailscale', 'Tailscale', 'curl -fsSL https://tailscale.com/install.sh | sh', 'Installa Tailscale con lo script ufficiale.');
  }
  if (id === 'node' || id === 'npm') {
    if (platform === 'win32' && ready('winget')) return terminalPlan('node', 'Node.js 20+', "winget upgrade --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements; if ($LASTEXITCODE -ne 0) { winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements }", 'Installa o aggiorna Node.js LTS e npm tramite WinGet.');
    if (platform === 'darwin' && ready('brew')) return terminalPlan('node', 'Node.js 20+', 'brew upgrade node || brew install node', 'Installa o aggiorna Node.js e npm tramite Homebrew.');
    if (platform === 'linux') return externalPlan('node', 'Node.js 20+', 'https://nodejs.org/en/download', 'Apri il download ufficiale di Node.js 20 o successivo, completa l’installazione e torna in Relay per ricontrollare.');
    return externalPlan('node', 'Node.js 20+', 'https://nodejs.org/en/download', 'Apri il download ufficiale, installa Node.js 20 o successivo e torna in Relay per ricontrollare.');
  }
  if (id === 'git') {
    if (platform === 'win32' && ready('winget')) return terminalPlan('git', 'Git', 'winget install --id Git.Git --exact --accept-package-agreements --accept-source-agreements', 'Installa Git tramite WinGet.');
    if (platform === 'darwin' && ready('brew')) return terminalPlan('git', 'Git', 'brew install git', 'Installa Git tramite Homebrew.');
    if (platform === 'darwin') return terminalPlan('git', 'Command Line Tools', 'xcode-select --install', 'Avvia l’installer Apple che include Git.');
    if (platform === 'linux' && ready('apt')) return terminalPlan('git', 'Git', 'sudo apt-get update && sudo apt-get install -y git', 'Installa Git tramite APT.');
    if (platform === 'linux' && ready('dnf')) return terminalPlan('git', 'Git', 'sudo dnf install -y git', 'Installa Git tramite DNF.');
    if (platform === 'linux' && ready('pacman')) return terminalPlan('git', 'Git', 'sudo pacman -S --needed git', 'Installa Git tramite Pacman.');
    return externalPlan('git', 'Git', 'https://git-scm.com/downloads', 'Apri il download ufficiale di Git.');
  }
  if (id === 'curl') {
    if (platform === 'win32' && ready('winget')) return terminalPlan('curl', 'curl', 'winget install --id cURL.cURL --exact --accept-package-agreements --accept-source-agreements', 'Installa curl tramite WinGet.');
    if (platform === 'darwin' && ready('brew')) return terminalPlan('curl', 'curl', 'brew install curl', 'Installa curl tramite Homebrew.');
    if (platform === 'linux' && ready('apt')) return terminalPlan('curl', 'curl', 'sudo apt-get update && sudo apt-get install -y curl', 'Installa curl tramite APT.');
    if (platform === 'linux' && ready('dnf')) return terminalPlan('curl', 'curl', 'sudo dnf install -y curl', 'Installa curl tramite DNF.');
    if (platform === 'linux' && ready('pacman')) return terminalPlan('curl', 'curl', 'sudo pacman -S --needed curl', 'Installa curl tramite Pacman.');
    return externalPlan('curl', 'curl', 'https://curl.se/download.html', 'Apri il download ufficiale di curl.');
  }

  if (id === 'powershell') {
    if (platform === 'win32' && ready('winget')) return terminalPlan('powershell', 'PowerShell 7+', "winget upgrade --id Microsoft.PowerShell --exact --accept-package-agreements --accept-source-agreements; if ($LASTEXITCODE -ne 0) { winget install --id Microsoft.PowerShell --exact --accept-package-agreements --accept-source-agreements }", 'Installa o aggiorna PowerShell 7 tramite WinGet.');
    return externalPlan('powershell', 'PowerShell 7+', 'https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows', 'Apri la guida ufficiale Microsoft, installa PowerShell 7 o successivo e torna in Relay per ricontrollare.');
  }
  if (id === 'browser') {
    const url = platform === 'darwin' || platform === 'win32'
      ? 'https://www.google.com/chrome/'
      : 'https://www.google.com/chrome/?platform=linux';
    return externalPlan('browser', 'Google Chrome', url, 'Installa Chrome/Chromium oppure usa Edge su Windows, poi torna in Relay e ricontrolla.');
  }
  return undefined;
}


function componentWithMinimumMajor(
  id: SystemComponentId,
  label: string,
  probe: ProbeResult,
  minimumMajor: number,
  requiredFor: string[],
  installable: boolean,
  relevant = true
): SystemComponentStatus {
  if (!relevant) return { id, label, state: 'not-needed', detail: 'Non necessario su questa piattaforma.', requiredFor, installable: false };
  if (!probe.ready) return { id, label, state: 'missing', detail: `${label} non rilevato nei percorsi conosciuti.`, requiredFor, installable };
  const major = parseMajorVersion(probe.version);
  const outdated = major !== undefined && major < minimumMajor;
  return {
    id, label, state: outdated ? 'outdated' : 'ready',
    detail: outdated ? `${label} ${major} rilevato: serve la versione ${minimumMajor} o successiva.` : `${label} rilevato.`,
    ...(probe.version ? { version: probe.version } : {}),
    ...(probe.path ? { path: probe.path } : {}),
    requiredFor, installable
  };
}

function parseMajorVersion(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/(?:^|\s|v)(\d+)(?:\.|\s|$)/i);
  const major = Number(match?.[1]);
  return Number.isFinite(major) ? major : undefined;
}

function component(id: SystemComponentId, label: string, probe: ProbeResult, requiredFor: string[], installable: boolean, relevant = true): SystemComponentStatus {
  if (!relevant) return { id, label, state: 'not-needed', detail: 'Non necessario su questa piattaforma.', requiredFor, installable: false };
  return {
    id, label, state: probe.ready ? 'ready' : 'missing',
    detail: probe.ready ? `${label} rilevato.` : `${label} non rilevato nei percorsi conosciuti.`,
    ...(probe.version ? { version: probe.version } : {}),
    ...(probe.path ? { path: probe.path } : {}),
    requiredFor, installable
  };
}

async function probeCommand(command: string, args: string[], extraCandidates: string[] = [], extraEnv: NodeJS.ProcessEnv = {}): Promise<ProbeResult> {
  const resolution = await resolveExecutable(command, { force: true, extraCandidates }).catch(() => undefined);
  if (!resolution) return { ready: false };
  const result = await runCommand(resolution.path, args, { env: { ...resolution.env, ...extraEnv }, timeoutMs: 6_000 }).catch(() => undefined);
  const text = result?.stdout?.trim() || result?.stderr?.trim();
  return { ready: Boolean(result && result.exitCode === 0), path: resolution.path, ...(text ? { version: text.split(/\r?\n/)[0]?.slice(0, 160) } : {}) };
}

async function probeBrowser(platform: string): Promise<ProbeResult> {
  const candidates = platform === 'win32'
    ? [
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      ]
    : platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Chromium.app/Contents/MacOS/Chromium'
        ]
      : ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  const commands = platform === 'win32' ? ['chrome.exe', 'msedge.exe'] : platform === 'darwin' ? ['google-chrome', 'chromium'] : ['google-chrome', 'chromium'];
  for (const command of commands) {
    const result = await resolveExecutable(command, { force: true, extraCandidates: candidates }).catch(() => undefined);
    if (result) return { ready: true, path: result.path };
  }
  const result = await resolveExecutable(commands[0]!, { force: true, extraCandidates: candidates }).catch(() => undefined);
  return result ? { ready: true, path: result.path } : { ready: false };
}

function tailscaleCandidates(platform: string): string[] {
  if (platform === 'win32') return [
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Tailscale', 'tailscale.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Tailscale', 'tailscale.exe')
  ];
  if (platform === 'darwin') return [
    '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
    '/Applications/Tailscale.app/Contents/MacOS/tailscale',
    '/opt/homebrew/bin/tailscale',
    '/usr/local/bin/tailscale'
  ];
  return ['/usr/bin/tailscale', '/usr/local/bin/tailscale', '/snap/bin/tailscale'];
}

function terminalPlan(id: SystemComponentId, label: string, command: string, detail: string): ComponentInstallPlan {
  return { id, label, mode: 'terminal', command, detail };
}

function externalPlan(id: SystemComponentId, label: string, url: string, detail: string): ComponentInstallPlan {
  return { id, label, mode: 'external', url, detail };
}
