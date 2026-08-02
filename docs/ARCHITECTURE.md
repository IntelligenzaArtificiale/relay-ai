# Relay architecture

## Extension host

`RelayController` coordinates providers, projects, conversations, rules, mentions, capacity, delegation plans and scheduling. Persistent state uses atomic local files inside the editor `globalStorage`.

## Platform abstraction

The command and executable layers isolate platform differences:

- PATH and shell discovery;
- Windows `.cmd`, `.bat`, PowerShell and `taskkill`;
- Linux process groups and signal escalation;
- platform-specific installer commands;
- local, WSL and remote extension-host paths.

The provider layer never concatenates user prompts into a shell command.

## Provider adapters

- **Codex**: App Server JSON-RPC, persistent threads, event streaming, model discovery, reasoning and rate limits.
- **Claude Code**: non-interactive `stream-json`, resumable sessions, models, effort and usage.
- **Antigravity**: `agy`, project binding through process cwd plus `--add-dir`, model override, browser instructions and status-line quota bridge.

## Context and rules

The composer can mention providers, files, directories, rules and conversations. Relay resolves those references locally and adds bounded context to the provider request.

Rules are canonical Relay documents with scope, provider targets, priority and mandatory status. The rules compiler includes only active rules that apply to the current project and provider.

## Delegation kernel

Agents request work through a structured Relay block. Each task can define:

- provider or automatic routing;
- model and reasoning;
- permissions;
- complexity;
- file scope;
- dependencies.

Relay validates the graph, adds dependencies for overlapping writer scopes and schedules dependency waves. The same provider may have several simultaneous instances with different models.

Independent writer tasks receive a Git worktree when safe. Diffs are checked and integrated in a serialized queue. Non-Git projects, dirty repositories and dependent writers are executed sequentially.

## Webview

The UI is TypeScript DOM without a runtime framework. It uses adaptive layouts, portalled menus, preserved scroll/activity state and structured messages to the extension host. File references are opened through VS Code URIs rather than browser navigation.

## Job model

Every conversation behaves as an independent job. The scheduler already executes runs concurrently; the webview surfaces that as explicit job states (running, unseen-completed, unseen-failed) computed from active runs plus a persisted per-conversation "unseen" map. Badges clear when a conversation becomes visible. A topbar pill aggregates active jobs and opens the history drawer.


## System readiness e setup

`system-readiness.ts` è l’unica sorgente di verità per componenti esterni e compatibilità. Distingue il runtime Node integrato nell’extension host da Node/npm installati nel sistema, che servono soltanto ad alcuni installer CLI. Lo snapshot rappresenta anche componenti obsoleti, come Node precedente alla 22 o PowerShell precedente alla 7 nei flussi Copilot Windows. Lo stesso snapshot alimenta Diagnostica, Remoto, System Doctor e preflight dei task, evitando logiche duplicate tra Windows, macOS e Linux.

I piani di installazione sono dichiarativi: terminale oppure pagina ufficiale. Relay non eleva privilegi in silenzio; mostra sempre comando e motivazione, lascia l’installer visibile e ricontrolla la presenza del componente.

## Remote mobile e Relay Ovunque

`RemoteAccessServer` usa `node:http` nell’extension host. In modalità LAN ascolta su `0.0.0.0`; nelle modalità Tailscale ascolta esclusivamente su `127.0.0.1`, lasciando a Serve/Funnel l’unica superficie di esposizione. La porta locale viene persistita per permettere alla configurazione `--bg` di continuare a puntare allo stesso origin dopo il riavvio.

`TunnelManager` centralizza la macchina a stati Tailscale: risoluzione CLI multipiattaforma, `status --json`, `BackendState`, `Self.DNSName`, inventario Serve/Funnel, scelta non distruttiva delle porte 443/8443/10000, login, approvazione, attivazione, probe end-to-end, propagazione DNS, remediation e bundle diagnostico sanitizzato. La modalità pubblica usa `tailscale funnel`; quella privata usa `tailscale serve`. I risultati vecchi delle rilevazioni sono ignorati e le operazioni sono single-flight.

Lo stato passato al telefono è una proiezione ridotta del `RelayViewState`; token, diagnostica sensibile e percorsi non registrati non sono esposti come azioni libere. Il pairing usa ticket monouso, codice, rate limit e una sessione cookie HttpOnly, con `Secure` quando l’URL è HTTPS. La validazione Host accetta soltanto indirizzi LAN nella modalità locale o l’hostname `.ts.net` esatto configurato nelle modalità tunnel. L’endpoint pubblico `/health` restituisce soltanto un esito minimo e non espone nome macchina o piattaforma.

Le azioni remote sono validate contro lo stato corrente: conversazioni, agenti, regole, run e progetti devono già esistere. Il filesystem non è navigabile dal browser mobile; il selettore cartelle e il cambio workspace avvengono sul desktop con conferma esplicita. Un cambio workspace è rifiutato finché Relay ha task attivi, perché il riavvio dell’extension host farebbe perdere il controllo dei processi.

La web app è server-rendered come asset locale senza CDN. SSE segnala cambiamenti, mentre `/api/state` restituisce lo snapshot aggiornato. La UI separa chat running e pronte, impedisce doppi invii e permette di annullare task attivi.
