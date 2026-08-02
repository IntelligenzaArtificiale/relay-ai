import assert from 'node:assert/strict';
import fs from 'node:fs';

const controller = fs.readFileSync('src/services/relay-controller.ts', 'utf8');
const chat = fs.readFileSync('src/ui/screens/chat.ts', 'utf8');
const markdown = fs.readFileSync('src/ui/markdown.ts', 'utf8');
const css = fs.readFileSync('src/ui/webview.css', 'utf8');
const remoteServer = fs.readFileSync('src/services/remote-access-server.ts', 'utf8');
const remoteApp = fs.readFileSync('src/services/remote-app.ts', 'utf8');
const remoteArtifacts = fs.readFileSync('src/services/remote-artifacts.ts', 'utf8');
const remoteScreen = fs.readFileSync('src/ui/screens/remote.ts', 'utf8');
const tunnelManager = fs.readFileSync('src/services/tunnel-manager.ts', 'utf8');
const systemReadiness = fs.readFileSync('src/services/system-readiness.ts', 'utf8');
const bootstrap = fs.readFileSync('src/ui/webview-bootstrap.ts', 'utf8');
const webview = fs.readFileSync('src/ui/webview.ts', 'utf8');
const atomicStore = fs.readFileSync('src/services/atomic-store.ts', 'utf8');
const conversationStore = fs.readFileSync('src/services/conversation-store.ts', 'utf8');
const commandRunner = fs.readFileSync('src/services/command-runner.ts', 'utf8');
const codexServer = fs.readFileSync('src/providers/codex-app-server.ts', 'utf8');
const codexProvider = fs.readFileSync('src/providers/codex-provider.ts', 'utf8');
const gdprVelo = fs.readFileSync('src/services/gdpr-velo.ts', 'utf8');
const claudeProvider = fs.readFileSync('src/providers/claude-provider.ts', 'utf8');
const antigravityProvider = fs.readFileSync('src/providers/antigravity-provider.ts', 'utf8');
const antigravityBridge = fs.readFileSync('src/services/antigravity-native-bridge.ts', 'utf8');
const antigravityRouting = fs.readFileSync('src/services/antigravity-routing.ts', 'utf8');
const agentsScreen = fs.readFileSync('src/ui/screens/agents.ts', 'utf8');
const settingsScreen = fs.readFileSync('src/ui/screens/settings.ts', 'utf8');
const diagnosticsScreen = fs.readFileSync('src/ui/screens/diagnostics.ts', 'utf8');
const build = fs.readFileSync('build.mjs', 'utf8');
const agentStore = fs.readFileSync('src/services/agent-store.ts', 'utf8');
const agentTemplates = fs.readFileSync('src/services/agent-templates.ts', 'utf8');
const delegationParser = fs.readFileSync('src/services/delegation-parser.ts', 'utf8');
const skillManager = fs.readFileSync('src/services/skill-manager.ts', 'utf8');
const rulesScreen = fs.readFileSync('src/ui/screens/rules.ts', 'utf8');
const mcpManager = fs.readFileSync('src/services/mcp-manager.ts', 'utf8');
const mcpScreen = fs.readFileSync('src/ui/screens/mcp.ts', 'utf8');
const automationStore = fs.readFileSync('src/services/automation-store.ts', 'utf8');
const automationScheduler = fs.readFileSync('src/services/automation-scheduler.ts', 'utf8');
const automationsScreen = fs.readFileSync('src/ui/screens/automations.ts', 'utf8');

console.log('Relay regressions');

const selectionCase = controller.match(/case 'setSelection':[\s\S]*?case 'setDelegationPolicy'/)?.[0] ?? '';
assert.match(selectionCase, /ensureActiveConversation\(provider\)/);
assert.ok(selectionCase.indexOf('ensureActiveConversation(provider)') < selectionCase.indexOf('updateSelection('));
console.log('  PASS selection creates an active conversation before persisting');

const disconnectBlock = controller.match(/private async disconnectProvider[\s\S]*?private async connectProvider/)?.[0] ?? '';
assert.doesNotMatch(disconnectBlock, /logout|sendText|createTerminal|showWarningMessage/);
assert.match(disconnectBlock, /disconnectedProviders/);
assert.match(disconnectBlock, /clearProviderSessions/);
console.log('  PASS provider disconnect is Relay-only and reversible');

assert.match(controller, /const requestedAgent = explicitlySelectedAgent/);
assert.match(controller, /current provider remains the primary agent/);
assert.match(controller, /resolveDelegationAgentReference/);
assert.match(controller, /\.filter\(\(agent\) => agent\.id !== activeAgent\?\.id\)/);
assert.doesNotMatch(chat, /option\.kind === 'agent'[\s\S]{0,180}selectAgent/);
assert.match(chat, /agentGlyph\(option\.label\)/);
assert.match(markdown, /mention-chip mention-chip--agent/);
assert.match(css, /\.mention-chip--agent|\.mention-chip/);
console.log('  PASS mentions remain delegation references while explicit selection runs the agent directly');

assert.match(chat, /if \(!selectedAgent\) \{/);
assert.match(chat, /Scrivi a \$\{selectedAgent\.name\}/);
assert.match(css, /\.agent-provider-warning/);
console.log('  PASS selected agents are first-class chat entities with provider health');

assert.match(remoteServer, /authorization/);
assert.match(remoteServer, /sessionId: session\.id, token/);
assert.match(remoteServer, /hashSessionToken/);
assert.match(remoteServer, /remote-sessions\.json/);
assert.match(remoteServer, /\/api\/pairing/);
assert.match(remoteServer, /verifyPublicPairingRoute/);
assert.match(remoteApp, /refreshPairingTicket/);
assert.match(remoteApp, /relay_session_token/);
assert.match(remoteApp, /credentials\s*:\s*['"]same-origin['"]/);
assert.match(remoteApp, /new EventSource\(\s*['"]\/events['"]\s*\+\s*\(sessionToken/);
console.log('  PASS remote pairing has cookie plus bearer fallback');
assert.match(remoteServer, /updateExtensionFromVsix/);
assert.match(controller, /pending-update\.json/);
assert.match(controller, /workbench\.action\.reloadWindow/);
assert.match(remoteApp, /Aggiorna Relay da file VSIX/);
console.log('  PASS remote VSIX update is allowlisted, confirmed and reload-aware');

assert.match(bootstrap, /ResizeObserver loop/);
assert.match(webview, /ResizeObserver loop/);
console.log('  PASS benign ResizeObserver diagnostics are filtered');


assert.match(atomicStore, /cacheReady/);
assert.match(atomicStore, /structuredClone/);
assert.match(controller, /STATE_EMIT_DEBOUNCE_MS = 30/);
assert.match(controller, /summariesByProject/);
assert.match(controller, /PROJECT_REFRESH_TTL_MS/);
assert.match(conversationStore, /summariesByProject/);
console.log('  PASS state emission uses cached stores, grouped summaries, project TTL and debounce');

assert.match(commandRunner, /maxBufferBytes/);
assert.match(commandRunner, /taskkill\.exe/);
assert.match(commandRunner, /process\.kill\(-child\.pid/);
assert.match(codexServer, /starting: Promise<void> \| undefined/);
assert.match(codexServer, /__RELAY_VERSION__/);
assert.match(build, /__RELAY_VERSION__/);
console.log('  PASS process transport has bounded output, cross-platform tree termination and memoized Codex startup');

assert.match(codexProvider, /const available = launchOk && modelsOk && authOk/);
assert.doesNotMatch(codexProvider, /const available = versionOk && launchOk/);
console.log('  PASS Codex version metadata cannot override a successful app-server smoke test');

assert.match(gdprVelo, /for \(const candidate of \['python3', 'python', 'py'\]\)/);
assert.match(gdprVelo, /resetVeloAvailabilityCache/);
assert.match(controller, /const GDPR_RULE_ID = 'relay:bundled:gdpr'/);
assert.match(controller, /enabled: false/);
assert.match(controller, /skillPublication:[\s\S]*enabled: true/);
assert.match(controller, /ensureGdprVeloReady/);
assert.match(controller, /gdpr_relay\//);
assert.doesNotMatch(controller, /privacyShieldWorkspacePath|privacyShieldPrompt|unshieldText|shieldText/);
assert.doesNotMatch(settingsScreen, /enablePrivacyShield|privacyShieldSetup|Privacy Shield/);
assert.doesNotMatch(settingsScreen, />Prova</);
console.log('  PASS /gdpr is a disabled bundled rule with a Velo readiness gate');

assert.match(webview, /delegationProtocolPrefixLength/);
assert.match(webview, /transientFocus/);
assert.match(chat, /STREAM_MARKDOWN_INTERVAL_MS = 250/);
assert.match(chat, /messageNodeCache/);
console.log('  PASS streaming hides delegation protocol, throttles markdown and restores caret');

assert.match(webview, /else if \(event\.type !== 'delta'\) scheduleRender\(\)/);
assert.match(webview, /scrollBySection/);
assert.match(chat, /saveAttachments/);
assert.match(chat, /## Allegati/);
assert.match(chat, /draft\.sending/);
assert.match(css, /\.composer-attachment/);
console.log('  PASS non-chat deltas avoid full renders and desktop drafts support guarded local attachments');

assert.match(remoteServer, /script-src 'nonce-\$\{nonce\}'/);
assert.match(remoteApp, /data-action/);
assert.doesNotMatch(remoteServer, /script-src 'unsafe-inline'/);
console.log('  PASS remote app uses delegated actions and nonce-only script CSP');

assert.match(claudeProvider, /10 \* 60_000/);
assert.match(agentsScreen, /Sola lettura/);
assert.match(agentsScreen, /Lettura e scrittura/);
assert.match(build, /entryPoints: \['src\/ui\/webview\.css'\]/);
assert.match(build, /minify: true/);
console.log('  PASS hygiene improvements cover Claude usage TTL, agent permissions and minified webview CSS');


assert.match(controller, /case 'updateAllProviderPermissions'/);
assert.match(settingsScreen, /Accesso iniziale globale/);
assert.match(settingsScreen, /provider-icon-action/);
assert.match(settingsScreen, /updateAllProviderPermissions/);
console.log('  PASS settings exposes compact provider actions and a global default permission');

assert.match(agentsScreen, /agent-card--compact/);
assert.match(agentsScreen, /agent-card-icon-action--danger/);
assert.match(agentsScreen, /type: 'deleteAgent'/);
console.log('  PASS agent cards are compact and support guarded quick deletion');

assert.match(diagnosticsScreen, /diagnostics-actions--icons/);
assert.match(diagnosticsScreen, /diagnosticsLimit/);
assert.match(diagnosticsScreen, /Carica altri/);
assert.match(diagnosticsScreen, /readiness-panel--compact/);
console.log('  PASS diagnostics uses icon actions, collapsible readiness and progressive logs');

assert.match(remoteApp, /conversationsSheet/);
assert.match(remoteApp, /patchChat/);
assert.match(remoteApp, /composer-wrap/);
assert.match(remoteApp, /100dvh/);
assert.match(remoteApp, /safe-area-inset-bottom/);
assert.match(remoteApp, /grid-template-rows\s*:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/);
assert.doesNotMatch(remoteApp, /Conversazioni del progetto/);
console.log('  PASS remote mobile is chat-first with isolated history and a dedicated scroll surface');

assert.match(remoteArtifacts, /discoverRemoteArtifacts/);
assert.match(remoteArtifacts, /local-service/);
assert.match(remoteArtifacts, /createArtifactZip/);
assert.match(remoteArtifacts, /isSensitiveArtifactPath/);
assert.match(remoteServer, /\/api\/artifacts\//);
assert.match(remoteServer, /\/preview\//);
assert.match(remoteServer, /sandbox allow-scripts/);
assert.match(remoteApp, /artifact-card/);
assert.match(remoteApp, /Scarica/);
assert.match(remoteApp, /Apri|Anteprima/);
assert.match(controller, /Relay remote delivery/);
console.log('  PASS remote results expose authenticated file downloads, static previews and loopback app proxying');
assert.match(remoteApp, /artifact-group/);
assert.match(remoteApp, /Scarica tutti i risultati/);
assert.match(remoteApp, /message-link-badge/);
assert.match(remoteApp, /preview-modal/);
assert.match(remoteApp, /copy-artifact-path/);
console.log('  PASS mobile result cards group files, expose ZIP, rich links and isolated previews');


assert.match(antigravityProvider, /request\.antigravityMode === 'browser'/);
assert.match(controller, /antigravityMode: requiresAntigravityBrowser\(task\.prompt\)/);
assert.match(controller, /antigravityMode: requiresAntigravityBrowser\(context\.originalPrompt\)/);
assert.match(controller, /requiresAntigravityBrowser\(rawPrompt\)/);
assert.match(antigravityRouting, /explicit browser action|explicitly asking Relay to operate a/);
console.log('  PASS Antigravity uses AGY by default and browser bridge only for explicit browser intent');

assert.match(antigravityBridge, /antigravitySubmitCommands/);
assert.match(antigravityBridge, /await delay\(650\)/);
assert.match(antigravityBridge, /await this\.focusPanel\(commands\)/);
assert.match(antigravityBridge, /best-effort retry/);
assert.match(antigravityBridge, /ANTIGRAVITY_NATIVE_SUBMIT_UNAVAILABLE/);
console.log('  PASS native Browser Agent refocuses, submits and retries generic chat commands');

assert.match(css, /\.message--user,.user-bubble,.user-bubble \.markdown-body \{ max-height: none !important; overflow-y: visible !important; \}/);
assert.match(css, /\.user-bubble pre,.user-bubble table \{ max-width: 100%; overflow-x: auto; \}/);
assert.doesNotMatch(css, /\.user-bubble[^}]*overflow-y:\s*auto/);
console.log('  PASS long user prompts use conversation scrolling without nested vertical scrollbars');

const registry = fs.readFileSync('src/services/provider-registry.ts', 'utf8');
const launcher = fs.readFileSync('src/services/process-launcher.ts', 'utf8');
const transport = fs.readFileSync('src/services/prompt-transport.ts', 'utf8');
const health = fs.readFileSync('src/services/provider-health.ts', 'utf8');
const failure = fs.readFileSync('src/services/provider-failure.ts', 'utf8');
const recovery = fs.readFileSync('src/services/provider-recovery.ts', 'utf8');
const runRecovery = fs.readFileSync('src/services/run-error-recovery.ts', 'utf8');
assert.match(launcher, /call \$\{command\}/);
assert.match(transport, /stdin-context/);
assert.match(transport, /secure-file/);
assert.match(registry, /Promise\.allSettled/);
assert.match(registry, /detectionFlight/);
assert.match(registry, /AbortController/);
assert.match(health, /healthState = 'degraded'/);
assert.match(failure, /payload-too-large/);
assert.match(recovery, /recoveryCandidates/);
console.log('  PASS provider process, health, progressive detection and recovery architecture remain centralized');

assert.match(controller, /case 'resolveRunError'/);
assert.match(controller, /permission: 'danger-full-access'/);
assert.match(remoteServer, /'resolveRunError'/);
assert.match(chat, /el\('span', '', 'Risolvi'\)/);
assert.match(chat, /Apre una nuova chat con/);
assert.match(remoteApp, /resolveRunError/);
assert.match(runRecovery, /selectRunRecoveryProvider/);
assert.match(runRecovery, /buildRunErrorRecoveryBundle/);
console.log('  PASS failed runs expose full-access cross-provider autorisoluzione on desktop and mobile');

assert.match(controller, /inferDelegationPermission/);
assert.match(controller, /permission: 'danger-full-access'/);
assert.match(controller, /Riavvia editor/);
assert.match(controller, /workbench\.action\.reloadWindow/);
assert.match(delegationParser, /save more tokens or time than the handoff costs/);
assert.match(delegationParser, /Do not mark an implementation task read-only/);
console.log('  PASS repair delegations get full access, recovery requests editor reload and delegation requires clear ROI');

assert.match(agentTemplates, /Specification Architect/);
assert.match(agentTemplates, /Codebase Mapper/);
assert.match(agentTemplates, /Bug Finder/);
assert.match(agentTemplates, /Security Auditor/);
assert.match(agentTemplates, /Surgical Fixer/);
assert.match(agentStore, /ensureTemplates/);
assert.match(controller, /AGENT_TEMPLATE_GLOBAL_KEY/);
assert.match(agentsScreen, /Accesso completo/);
assert.match(agentsScreen, /is-template/);
console.log('  PASS five disabled bundled agents are seeded on the first healthy provider and expose full access where needed');

assert.match(chat, /delegation-task__prompt-details/);
assert.match(chat, /delegation-task__badges/);
assert.match(chat, /delegation-file-badge/);
assert.match(css, /\.delegation-task__prompt-details/);
assert.match(css, /max-height: none/);
console.log('  PASS delegation prompts, scope files and routing details are compact and collapsed by default');

assert.match(chat, /function delegationIsVisible/);
assert.match(chat, /visibleDelegations/);
console.log('  PASS completed delegation cards leave the timeline after the final integrated answer');

assert.match(controller, /heartbeatDiagnosticAt/);
assert.match(controller, /Date\.now\(\) - lastHeartbeat >= 120_000/);
assert.match(controller, /run\.activities\.at\(-1\)\?\.title === 'Processo attivo'/);
console.log('  PASS long-running provider heartbeats stay visible without flooding diagnostics or activity history');

assert.match(agentsScreen, /agent-template-library/);
assert.match(css, /\.agent-template-library/);
console.log('  PASS bundled agents live in a compact collapsible template library');


assert.match(tunnelManager, /status', '--json/);
assert.match(tunnelManager, /Self\?\.DNSName/);
assert.match(tunnelManager, /\[443, 8443, 10000\]/);
assert.match(tunnelManager, /PROPAGATING_DNS/);
assert.match(tunnelManager, /probeTunnelHealth/);
assert.match(tunnelManager, /Restart-Service Tailscale/);
assert.match(systemReadiness, /C:\\\\Program Files/);
assert.doesNotMatch(systemReadiness, /'C:\\Program Files'/);
assert.match(remoteServer, /this\.bindAddress/);
assert.match(remoteServer, /Host remoto non autorizzato/);
assert.match(remoteServer, /; Secure/);
assert.match(controller, /restoreRemoteAccessIfNeeded/);
assert.match(controller, /remoteAccessAutoStart/);
console.log('  PASS Tailscale Funnel manager centralizes detection, safe ports, probe, remediation and persistent restore');

assert.match(remoteScreen, /Solo rete locale/);
assert.match(remoteScreen, /Ovunque/);
assert.match(remoteScreen, /Privata/);
assert.match(remoteScreen, /Installa Tailscale/);
assert.match(remoteScreen, /Collega l.account/);
assert.match(remoteScreen, /Attiva Relay/);
assert.match(remoteScreen, /registro pubblico dei certificati/);
assert.match(css, /\.remote-mode-grid/);
assert.match(css, /\.remote-wizard-step/);
console.log('  PASS Remote desktop UI exposes three access modes and a solution-oriented Tailscale wizard');


assert.match(skillManager, /x-relay-managed/);
assert.match(skillManager, /\.claude.*skills/);
assert.match(skillManager, /\.agents.*skills/);
assert.match(skillManager, /readCodexSkillsFlag/);
assert.match(rulesScreen, /Pubblicazione skill/);
assert.match(rulesScreen, /Sincronizza skill/);
assert.match(rulesScreen, /Skill trovate/);
console.log('  PASS Relay rules publish provider-native managed skills without touching manual files');

assert.match(mcpManager, /smol-toml/);
assert.match(mcpManager, /mcp-disabled\.json/);
assert.match(mcpManager, /\.relay-bak/);
assert.match(mcpManager, /_relayDisabled/);
assert.match(mcpScreen, /Copia su altro provider/);
assert.match(mcpScreen, /Aggiungi server/);
assert.match(remoteServer, /listMcp/);
assert.match(remoteServer, /toggleMcp/);
console.log('  PASS unified MCP inventory uses reversible provider-specific strategies and remote toggles');

assert.match(automationStore, /AtomicJsonStore/);
assert.match(automationStore, /slice\(-20\)/);
assert.match(automationScheduler, /computeNextRun/);
assert.match(automationScheduler, /MAX_TIMER_MS = 6 \* 60 \* 60 \* 1000/);
assert.match(automationScheduler, /catchUpOnce/);
assert.match(automationScheduler, /this\.running\.has/);
assert.match(automationsScreen, /Programma Relay/);
assert.match(automationsScreen, /Esegui ora/);
assert.match(automationsScreen, /updateSchedulePreview/);
assert.match(remoteServer, /listAutomations/);
assert.match(remoteServer, /toggleAutomation/);
assert.match(remoteServer, /runAutomationNow/);
console.log('  PASS automations use an isolated store and scheduler with live schedule preview and remote controls');
