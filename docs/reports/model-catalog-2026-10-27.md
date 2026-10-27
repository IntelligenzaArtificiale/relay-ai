# Model catalog verification — Relay 0.24.5

Date: 27 October 2026. Base release: `v0.24.4`, commit `f206ac7`.

## Sources

- [OpenAI current model guide](https://developers.openai.com/api/docs/guides/latest-model)
- [Claude Code supported models](https://support.claude.com/en/articles/11940350-claude-code-model-configuration)
- [Claude Code model configuration](https://code.claude.com/docs/en/model-config)
- [Claude effort compatibility](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Gemini 4 Argon in Antigravity](https://www.antigravity.google/blog/gemini-4-argon-in-google-antigravity)
- [Antigravity CLI releases](https://github.com/google-antigravity/antigravity-cli/releases/tag/1.4.8)

The CLI catalog is authoritative for account availability and CLI reasoning levels. API documentation alone does not establish which models a CLI account can run.

## Implementation

- Codex reads every `model/list` page, uses the canonical `model` slug when supplied, filters hidden entries and preserves native efforts/defaults. No static GPT-6 effort assumptions.
- Claude retains the existing `sonnet`, `opus`, `haiku` and `fable` aliases and adds explicit `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-5-5`, `claude-fable-5-1` choices. Native `initialize` metadata enriches aliases without sending a user turn or performing inference. Unsupported/offline discovery leaves documented fallback choices available.
- Claude output uses assistant/init metadata and canonical `modelUsage` entries to report the actual model. Explicit model substitutions produce an activity notice. Terminal error results reject the run even with exit code zero. Streaming deltas and final snapshots remain deduplicated.
- AGY preserves provider slugs for new models. A successful inventory replaces stale fallback entries; failed inventory retains the last usable catalog. Fallbacks include Gemini 3.8 Flash Low/Medium/High. Old label-only catalogs resolve only to known slugs.
- Routing recognizes Astra/Fable/Argon as powerful and Luna as efficient. Token matching prevents `mini` from matching inside `Gemini`. Native Codex `ultra` is ordered above other efforts when choosing a supported reasoning level.

## Live checks

Tests ran through the actual Relay provider adapters in a temporary workspace, with no project edits requested. Claude tests disabled tools and MCP servers to isolate model selection and output handling.

| CLI | Requested model | Observed result |
| --- | --- | --- |
| Codex 0.160.0 | `gpt-6.1-sol` | `RELAY_OK`, same model, streaming and one completion |
| Codex 0.160.0 | `gpt-6-astra` | `RELAY_OK`, same model, streaming and one completion |
| Codex 0.160.0 | `gpt-6.1-terra` | `RELAY_OK`, same model, streaming and one completion |
| Codex 0.160.0 | `gpt-6-sol` | `RELAY_OK`, same model, streaming and one completion |
| Codex 0.160.0 | `gpt-6-luna` | `RELAY_OK`, same model, streaming and one completion |
| Claude Code 2.1.311 | `claude-sonnet-5-5` | `RELAY_OK`, same canonical model |
| Claude Code 2.1.311 | `claude-opus-5-5` | `RELAY_OK`, same canonical model, full permission mode with tools disabled |
| Claude Code 2.1.311 | `claude-haiku-5-5` | `RELAY_OK`, same canonical model |
| Claude Code 2.1.311 | `claude-fable-5-1` | `RELAY_OK`, same canonical model |
| AGY 1.1.25 | `gemini-3.8-flash-low` | `RELAY_OK`, correct delta/replace output and one completion |

Codex tests used `low` effort; Claude tests used `low` effort. Other native effort values and selection normalization are covered by deterministic regression tests, not by a paid inference for every combination.

AGY 1.1.25 and the current 1.4.8 binary returned the same six-model account inventory: Gemini 3.8 Flash Low/Medium/High, Claude Sonnet 4.6 Thinking, Claude Opus 4.6 Thinking and GPT-OSS 120B Medium. The account did not expose Argon or Claude 5.5 through AGY, so those models were not tested live on that surface. Relay supports their provider-supplied slugs when the CLI exposes them; it does not invent account access or CLI IDs from API names.

## Observed environment limits

The local Claude configuration uses a third-party Anthropic-compatible gateway. With the old 2.1.226 CLI, requests for Sonnet 5.5 and Fable 5.1 reported older canonical model IDs. Repeating with the official 2.1.311 binary produced the requested 5.5/5.1 canonical IDs. Use an updated CLI; alias resolution and gateway substitutions cannot be guaranteed by Relay.

In plan permission mode, the configured gateway returned raw DSML text from Opus 5.5 instead of the requested literal reply. With full permission mode and tools still disabled, the same adapter/model returned `RELAY_OK`. Relay must not remove or reinterpret arbitrary model-generated text to conceal this behavior. Native Anthropic account behavior was not independently tested.

The temporary Claude 2.1.311 binary was downloaded from Anthropic's official release storage and checked against its manifest SHA-256: `86dc1fcc69498159eaf15f446613e847010f9036bfbbdffd4c49350be8489ada`. The local Claude installation was then updated through `claude install 2.1.311`; all four new Claude models passed again through that installed CLI with tools disabled and full permission mode. AGY 1.4.8 was downloaded from the official GitHub release solely to compare inventories.

## Automated coverage

`tests/test-provider-models.ts`, included in `npm test`, covers paginated and malformed catalogs, loop protection, canonical slugs, hidden models, native efforts, versioned Claude choices, actual model identification, terminal errors, fallback replacement, label-only compatibility and current model routing. Existing suites cover Windows launchers, extension load, webview boot/rendering, remote application syntax and prior regressions.

Real provider inference was performed on Linux. Windows/macOS provider binaries were not run; platform launcher regressions remain part of the automated suite.

Final `npm test` and `npm run package` passed. The VSIX manifest and bundled model choices were inspected, and the VSIX was installed successfully in an isolated VS Code extensions/user-data directory. Existing webview smoke tests cover chat, skills and remote controls; this is not a claim of manual testing every screen against live provider accounts.
