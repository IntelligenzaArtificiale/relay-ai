# Struttura del repository

Relay separa codice applicativo, strumenti di sviluppo, test, documentazione e artefatti generati.

```text
RELAY/
|-- src/                    Codice TypeScript dell'estensione
|   |-- core/               Tipi, contratti ed errori condivisi
|   |-- providers/          Adapter delle CLI AI
|   |-- services/           Orchestrazione, storage e integrazioni
|   `-- ui/                 Webview, schermate e stili
|-- tests/                  Runner e suite automatiche
|-- scripts/                Utility eseguibili di build e packaging
|-- packaging/              Manifest e metadati VSIX
|-- media/                  Icone e asset distribuiti
|-- vendor/                 Dipendenze incorporate nel pacchetto
|-- docs/                   Documentazione mantenuta nel repository
|   |-- analysis/           Analisi tecniche e feedback
|   |-- evidence/           Output e diff storici di validazione
|   `-- reports/            Report di build archiviati
|-- artifacts/releases/     VSIX generati localmente, non versionati
|-- archives/               Snapshot locali storici, non versionati
|-- dist/                   Bundle compilati distribuiti
|-- package.json            Metadati, comandi e configurazione estensione
`-- tsconfig.json           Configurazione TypeScript
```

## Confini

- `src/` contiene esclusivamente codice del prodotto.
- `scripts/` contiene utility invocate da `package.json`; non contiene logica runtime.
- `tests/` contiene tutto il codice di verifica, inclusi gli entrypoint TypeScript compilati al volo.
- `docs/evidence/` e `docs/reports/` sono materiale storico, non parte del VSIX.
- `artifacts/` e `archives/` sono locali e ignorati da Git. Le release ufficiali vivono su GitHub.
- La root conserva soltanto file di progetto, licenza, README e configurazioni standard.

## Moduli principali

- `src/extension.ts`: entrypoint VS Code e registrazione comandi.
- `src/services/relay-controller.ts`: coordinamento tra UI, provider e stato.
- `src/providers/`: integrazioni Codex, Claude Code, Antigravity e Copilot.
- `src/services/system-readiness.ts`: rilevamento e onboarding multipiattaforma.
- `src/services/remote-access-server.ts`: accesso remoto, pairing e sessioni.
- `src/ui/`: webview senza framework e relativo design system.

Per i comandi operativi vedere [DEVELOPMENT.md](DEVELOPMENT.md). Per i confini architetturali vedere [ARCHITECTURE.md](ARCHITECTURE.md).
