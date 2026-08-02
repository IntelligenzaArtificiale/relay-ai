# Relay AI

Relay AI is a local multi-provider agent workspace for Antigravity IDE and VS Code-compatible editors. It keeps Codex, Claude Code, Antigravity and GitHub Copilot CLI in one operational console, using the accounts and CLI sessions already authenticated on your machine.

## Italiano

Relay non e un altro cloud agent. E il livello operativo locale che coordina provider, modelli, skill, regole, allegati, accesso remoto e deleghe senza spostare il controllo fuori dal workspace.

### Novita 0.22.3

- Privacy Shield: anonimizzazione locale con Velo prima che il testo composto da Relay lasci la macchina.
- Ripristino automatico della risposta prima di mostrarla e prima del parsing delle deleghe.
- Estrazione testuale per PDF e DOCX tramite librerie JavaScript pure, senza binari nativi.
- Modalita dichiarate in UI: protezione completa quando il progetto gira in sola lettura, copertura parziale quando resta abilitata la scrittura.
- Visualizzazione delle skill sincronizzate piu leggibile: una skill per nome, badge provider, stato gestito/manuale e azioni pulite.
- Release 0.22.3 con Velo vendorizzato nel VSIX.

### Funzionalita principali

- Chat persistenti per progetto, con cambio provider nella stessa conversazione.
- Provider supportati: Codex, Claude Code, Antigravity e GitHub Copilot CLI.
- Selezione modello, reasoning, permessi e policy di delega dal composer.
- Skill native `SKILL.md` sincronizzabili tra provider, deduplicate per nome nella UI.
- Trigger `/` per invocare skill dal composer e `@` per provider, file, directory, regole e conversazioni.
- Allegati desktop e remoti, con salvataggio locale e riferimenti sicuri ai file.
- Accesso remoto mobile con pairing, sessioni, anteprime e download autenticati.
- Routing delle deleghe con intent strutturato: risparmio, specialista, richiesta utente o parallelismo.
- System Doctor, diagnostica, quote provider, automazioni e MCP.

## English

Relay is not another cloud agent. It is a local operating layer for coordinating providers, models, skills, rules, attachments, remote access and delegation while keeping control inside the workspace.

### What is new in 0.22.3

- Privacy Shield: local Velo anonymization before Relay-composed text reaches a remote provider.
- Automatic unshielding before display and before delegation parsing.
- PDF and DOCX text extraction through pure JavaScript libraries, with no native binaries.
- Honest UI labels: complete protection when the project runs read-only, partial coverage when write access remains enabled.
- Cleaner synchronized skill browser: one row per skill name, provider badges, managed/manual status and focused actions.
- 0.22.3 VSIX release with bundled Velo runtime sources.

### Core capabilities

- Persistent project conversations with provider handoff.
- Supported providers: Codex, Claude Code, Antigravity and GitHub Copilot CLI.
- Composer-level model, reasoning, permission and delegation policy controls.
- Native `SKILL.md` synchronization across providers, deduplicated by skill name in the UI.
- `/` skill invocation and `@` mentions for providers, files, directories, rules and conversations.
- Desktop and remote attachments saved locally with safe file references.
- Mobile remote access with pairing, sessions, previews and authenticated downloads.
- Delegation routing with structured intent: cost saving, specialist work, user request or parallel speed.
- System Doctor, diagnostics, provider quota tracking, automations and MCP inventory.

## Installazione / Installation

1. Build the extension: `npm run package`.
2. Install the generated `Relay-0_22_3.vsix` in Antigravity IDE or a VS Code-compatible editor.
3. Make sure the provider CLIs you want to use are installed and authenticated locally.
4. Open Relay from the activity bar and run System Doctor if a provider is missing.

## Privacy Shield

Privacy Shield uses Velo locally. When enabled, Relay anonymizes text it composes before sending it to a provider and restores the answer before showing it. Text files, rules, mentions, chat history and attachments are covered. PDF and DOCX files are extracted to text first. Images are intentionally excluded because a text anonymizer cannot process pixels.

Two labels are used deliberately:

- Complete protection: Privacy Shield is active and the project runs read-only.
- Partial coverage: Privacy Shield is active, but write access is allowed, so files opened directly by an agent outside Relay cannot be intercepted.

## Repository Rules

- Keep commits small, intentional and buildable.
- Run `npx tsc --noEmit` before every commit.
- Do not commit `node_modules`, temporary staging folders or local caches.
- Do not change license terms without owner approval.
- Release commits use `release: vX.Y.Z`.

## License

This repository is source-available for authorized review only. It is proprietary software owned by Alessandro Ciciarelli / Intelligenza Artificiale Italia. No modification, redistribution, resale, sublicensing or commercial use is allowed without prior written authorization. See `LICENSE.txt`.
