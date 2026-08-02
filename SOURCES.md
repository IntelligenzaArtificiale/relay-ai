# Relay 0.17.0 — sorgente

## Layout

- `src/extension.ts` — entrypoint e comandi.
- `src/core/` — tipi condivisi, contratti provider ed errori.
- `src/providers/` — adapter Codex, Claude Code, Antigravity e GitHub Copilot CLI.
- `src/services/system-readiness.ts` — rilevamento componenti e piani installazione cross-platform.
- `src/services/remote-access-server.ts` — server LAN, pairing, sessioni e validazione azioni.
- `src/services/remote-app.ts` — web app mobile responsive.
- `src/services/relay-controller.ts` — orchestrazione, wizard, reset e integrazione UI/provider.
- `src/ui/` — webview senza framework e design system.
- `test-core-entry.ts` — parser, capability, readiness e sicurezza remoto.
- `test-smoke.js` — smoke UI compilata con jsdom.

## Comandi

```bash
npm ci
npm test
npm run package
npm audit --omit=dev --audit-level=moderate
```

`npm run package` produce `Relay-0_17_0.vsix`.

## Decisioni anti-complessità

- Remoto usa il Node dell’extension host: niente runtime o daemon separato.
- Un solo snapshot `SystemReadinessSnapshot` guida wizard, Doctor e preflight, inclusi componenti obsoleti e requisiti Windows di Copilot.
- Il telefono non esplora il filesystem: usa progetti registrati e conferme desktop; i cambi workspace sono bloccati durante task attivi.
- Le azioni remote sono allowlistate e validate contro lo stato corrente.
- Nessuna dipendenza cloud, CDN o database esterno.

## Limiti di validazione

I test automatizzati coprono build, parser, webview, server LAN e logiche cross-platform pure. Non sostituiscono prove fisiche con firewall Windows, permesso rete locale macOS, router con client isolation, WSL/SSH o account provider reali.
