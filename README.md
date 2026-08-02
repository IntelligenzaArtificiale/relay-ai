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
| GDPR rule | Optional `/gdpr` rule and native skill prompt for Velo-anonymized working copies |

## GDPR Rule

Relay includes a disabled bundled `gdpr` rule. When you enable it, Relay checks that the bundled Velo module is reachable from Python and can publish the rule as native provider skills.

The rule only applies when a prompt contains `/gdpr` and cites documents. It instructs agents to create `gdpr_relay/`, anonymize the needed working copies with Velo, keep a lock listing the original files, and use only the anonymized files for the task and for delegated agents.

This is an agent protocol, not a filesystem sandbox or secrecy guarantee. Provider CLIs, operating-system permissions and user-selected modes still matter. See [Security](SECURITY.md).

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
- The `/gdpr` rule is prompt-based and cannot technically prevent an agent from opening files outside `gdpr_relay/`.
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
