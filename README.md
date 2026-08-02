# Relay

[English](README.md) | [Italiano](README.it.md)

**One local workspace for Codex, Claude Code, Antigravity and GitHub Copilot CLI.**

Relay turns the coding agents already installed on your machine into one operational environment. Keep a conversation alive while changing provider, delegate focused work, synchronize skills, inspect provider health, connect MCP servers and continue from mobile without moving the project into another cloud product.

> Version 0.22.3 · Windows, macOS and Linux · Source available under a proprietary license

## Why Relay

Each coding agent is useful on its own. The friction starts when real work crosses their boundaries: different sessions, model controls, permissions, skill folders, quota windows and command-line behavior. Relay gives those differences one consistent interface without hiding which provider is doing the work.

- **Four providers, one conversation.** Codex, Claude Code, Antigravity and GitHub Copilot CLI remain distinct, but no longer fragmented.
- **Delegation with an audit trail.** Relay routes focused tasks by complexity, capability, quota and explicit user intent.
- **Local-first operation.** It uses the CLI accounts already authenticated on the machine.
- **Operational controls.** Provider health, permissions, reasoning, usage, worktrees and diagnostics are visible instead of implicit.

## Highlights

| Area | What Relay provides |
| --- | --- |
| Multi-provider chat | Persistent project conversations, provider switching, model and reasoning controls |
| Delegation | Confirmed or automatic child tasks, parallel execution, scoped files and result integration |
| Agent Studio | Reusable custom agents with provider, model, prompt, permission and delegation policy |
| Skills | Native `SKILL.md` discovery and synchronization, deduplicated by skill name |
| Context | `@file`, `@dir`, `@rule`, `@chat`, provider and agent mentions; `/skill` invocation |
| Remote access | Mobile pairing, live runs, authenticated downloads, previews and Tailscale Serve/Funnel support |
| MCP and automation | Unified MCP inventory plus scheduled Relay tasks |
| Diagnostics | System Doctor, provider probes, quota windows, failure bundles and repair workflows |
| Privacy Shield | Local Velo anonymization, reversible placeholders and isolated complete-protection sessions |

## Privacy Shield

Privacy Shield anonymizes Relay-composed text locally before it reaches a provider. The same conversation vault restores placeholders in the response before Relay displays or parses it.

- **Complete protection:** Relay runs the provider in an isolated empty workspace with read-only permission. Mentioned text is supplied only after local anonymization. The agent cannot browse the original project through its normal working directory.
- **Partial coverage:** Relay anonymizes prompts, mention content, rules and supported attachments, but the provider still works inside the project and may independently read files with its own tools.

For `@file[...]`, Relay removes the reusable file reference from the outgoing prompt and sends the anonymized content instead. PDF and DOCX documents are extracted locally before anonymization. Images remain outside the text Shield because their pixels are not text; do not attach images containing sensitive data when that data must be anonymized.

Privacy Shield is not a claim of absolute secrecy. Provider CLIs, operating-system permissions and user-selected modes still matter. See [Security](SECURITY.md).

## Provider Support

| Provider | Local CLI | Models | Reasoning | Sessions | Delegation |
| --- | ---: | ---: | ---: | ---: | ---: |
| Codex | Yes | Yes | Yes | Yes | Yes |
| Claude Code | Yes | Yes | Yes | Yes | Yes |
| Antigravity | Yes | Yes | Provider-dependent | Yes | Yes |
| GitHub Copilot CLI | Yes | Discovery-dependent | Provider-dependent | Yes | Yes |

Relay reports a provider as ready from functional probes. Informational metadata such as a slow `--version` call does not override a successful operational smoke test.

## Install

1. Install and authenticate at least one supported provider CLI.
2. Download or build `Relay-0_22_3.vsix`.
3. In Antigravity IDE or a VS Code-compatible editor, choose **Extensions: Install from VSIX**.
4. Open Relay from the activity bar and run **System Doctor**.

Build locally:

```bash
npm ci
npm run typecheck
npm run build
npm run package
```

The package command is implemented in Node.js and does not require the external Unix `zip` utility.

## Quick Start

1. Create a conversation and select a ready provider.
2. Choose the model, reasoning level and filesystem permission.
3. Add project context with `@file[...]`, `@dir[...]` or `@rule[...]`.
4. Type `/` to invoke an installed skill.
5. Enable delegation when the task benefits from another provider or parallel work.

## Architecture

Relay is a TypeScript extension with a local controller, provider adapters, a bounded run scheduler, persistent JSON stores and a webview UI. Remote access is served by Relay itself and protected through pairing and session tokens. See [Architecture](docs/ARCHITECTURE.md).

## Known Limits

- Provider capabilities depend on the installed CLI version and authenticated account.
- Privacy Shield partial coverage cannot intercept files an agent opens independently.
- Image content is not anonymized by the text-based Shield.
- Tailscale public access requires a valid local Tailscale setup and explicit user configuration.
- GitHub Copilot model discovery can vary across CLI releases.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security and responsible disclosure](SECURITY.md)
- [Italian documentation](README.it.md)
- [Release history](changelog.md)
- [Contributing](CONTRIBUTING.md)

## License

Relay is source available, not open source. The source and binaries are proprietary. Copying, modification, redistribution, resale, commercial use, SaaS hosting, rebranding and derivative works require prior written authorization. See [LICENSE.txt](LICENSE.txt).

Copyright © 2026 Alessandro Ciciarelli · Intelligenza Artificiale Italia. All Rights Reserved.
