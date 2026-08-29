# Sviluppo

## Requisiti

- Node.js 20 o successivo.
- npm compatibile con il lockfile.
- Un editor VS Code-compatible per la prova del VSIX.

## Setup

```bash
npm ci
```

## Comandi

```bash
npm run typecheck       # Controllo TypeScript senza output
npm run build           # Genera dist/
npm run test:core       # Test core rapidi
npm run test:smoke      # Build e smoke test UI
npm test                # Suite completa
npm run package         # Crea artifacts/releases/Relay-X_Y_Z.vsix
```

Tutti i comandi si eseguono dalla root. Gli entrypoint vivono in `scripts/` e `tests/`; non devono essere riportati nella root.

## Flusso di modifica

1. Controllare `git status` e non sovrascrivere modifiche non proprie.
2. Modificare il modulo responsabile, evitando refactor estranei.
3. Aggiungere test proporzionati al rischio.
4. Eseguire almeno `npm run typecheck` e i test mirati.
5. Prima del commit eseguire `npm test`.
6. Per una release aggiornare versione e `changelog.md`, poi eseguire `npm run package`.

## Artefatti

- I bundle in `dist/` sono versionati per la distribuzione dell'estensione.
- I VSIX locali sono generati in `artifacts/releases/` e non sono versionati.
- Le vecchie copie sorgente locali possono stare in `archives/source-snapshots/` e non sono versionate.
- Cache, staging e dipendenze installate non devono entrare nei commit.

## Regola di packaging

Il VSIX include bundle, media, vendor runtime, metadati, changelog, licenza e la documentazione architetturale essenziale. Analisi, evidence e report di sviluppo restano fuori dal pacchetto.
