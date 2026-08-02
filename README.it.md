# Relay

[Italiano](README.it.md) | [English](README.md)

**Codex, Claude Code, Antigravity e GitHub Copilot CLI. Un solo workspace locale, senza perdere il controllo del progetto.**

Relay riunisce gli agenti di sviluppo già installati sul tuo computer in un ambiente operativo unico. Puoi continuare la stessa conversazione con provider diversi, delegare attività mirate, sincronizzare skill, controllare quote e stato delle CLI, collegare server MCP e seguire il lavoro da mobile.

> Versione 0.22.3 · Windows, macOS e Linux · Codice visibile con licenza proprietaria

## Perché Relay

Il problema non è trovare un altro agente AI. Il problema è lavorare davvero con quelli che hai già: sessioni separate, controlli diversi, cartelle skill incompatibili, permessi poco chiari e quote che cambiano da provider a provider.

Relay mette ordine senza fingere che tutti gli agenti siano uguali.

- **Quattro provider, una conversazione.** Codex, Claude Code, Antigravity e GitHub Copilot CLI restano riconoscibili, ma smettono di essere strumenti isolati.
- **Deleghe verificabili.** Ogni task delegato mostra provider, modello, permesso, stato e risultato.
- **Operatività locale.** Relay usa gli account e le sessioni CLI già autenticati sulla macchina.
- **Controlli leggibili.** Salute provider, reasoning, quote, permessi, worktree e diagnostica sono visibili prima che diventino un problema.

## Funzionalità

| Area | Cosa offre Relay |
| --- | --- |
| Chat multi-provider | Conversazioni persistenti per progetto, cambio provider, modello e reasoning |
| Deleghe | Conferma manuale o automatica, esecuzione parallela, scope file e integrazione dei risultati |
| Agent Studio | Agenti riutilizzabili con provider, modello, prompt, permesso e policy |
| Skill | Scoperta e sincronizzazione di `SKILL.md`, una sola voce per nome anche su più provider |
| Contesto | Menzioni `@file`, `@dir`, `@rule`, `@chat`, provider e agenti; invocazione `/skill` |
| Accesso remoto | Pairing mobile, attività live, download autenticati, anteprime e supporto Tailscale |
| MCP e automazioni | Inventario MCP unificato e task Relay pianificati |
| Diagnostica | System Doctor, probe provider, quote, incident bundle e flussi di riparazione |
| Regola GDPR | Protocollo opzionale `/gdpr` e skill nativa per copie di lavoro anonimizzate con Velo |

## Regola GDPR

Relay include una regola bundled `gdpr`, disattiva di default. Quando la abiliti, Relay verifica che il modulo Velo incluso sia raggiungibile da Python e può pubblicarla come skill nativa dei provider.

La regola si applica solo quando il prompt contiene `/gdpr` e cita documenti. In quel caso istruisce gli agenti a creare `gdpr_relay/`, anonimizzare con Velo le copie di lavoro necessarie, mantenere un lock dei file originali e usare solo i file anonimizzati anche nelle deleghe.

È un protocollo via prompt, non un sandbox filesystem né una garanzia assoluta. Permessi del sistema operativo, CLI dei provider e modalità scelte dall’utente restano rilevanti.

## Provider supportati

| Provider | CLI locale | Modelli | Reasoning | Sessioni | Deleghe |
| --- | ---: | ---: | ---: | ---: | ---: |
| Codex | Sì | Sì | Sì | Sì | Sì |
| Claude Code | Sì | Sì | Sì | Sì | Sì |
| Antigravity | Sì | Sì | Dipende dal provider | Sì | Sì |
| GitHub Copilot CLI | Sì | Dipende dalla CLI | Dipende dalla CLI | Sì | Sì |

Relay valuta l’operatività con probe funzionali. Un timeout informativo di `--version` non degrada più un provider se avvio, account e modelli sono realmente disponibili.

## Installazione

1. Installa e autentica almeno una CLI supportata.
2. Scarica o genera `Relay-0_22_3.vsix`.
3. In Antigravity IDE o in un editor compatibile VS Code scegli **Extensions: Install from VSIX**.
4. Apri Relay dalla barra laterale ed esegui **System Doctor**.

Per compilare:

```bash
npm ci
npm run typecheck
npm run build
npm run package
```

Il packaging usa Node.js e non dipende dal comando Unix esterno `zip`.

## Primo utilizzo

1. Crea una chat e scegli un provider pronto.
2. Imposta modello, reasoning e permesso filesystem.
3. Aggiungi contesto con `@file[...]`, `@dir[...]` o `@rule[...]`.
4. Digita `/` per richiamare una skill installata.
5. Abilita le deleghe quando un altro provider offre un vantaggio concreto.

## Limiti dichiarati

- Le capacità dipendono dalla versione della CLI e dall’account autenticato.
- La regola `/gdpr` non può impedire tecnicamente a un agente di aprire file fuori da `gdpr_relay/`.
- L’accesso pubblico via Tailscale richiede una configurazione locale valida ed esplicita.
- La scoperta modelli di GitHub Copilot può cambiare tra versioni della CLI.

## Documentazione

- [Architettura](docs/ARCHITECTURE.md)
- [Sicurezza e segnalazione vulnerabilità](SECURITY.md)
- [README inglese](README.md)
- [Cronologia release](changelog.md)
- [Regole di contribuzione](CONTRIBUTING.md)

## Licenza

Relay è source available, non open source. Codice e binari sono proprietari. Copia, modifica, redistribuzione, rivendita, uso commerciale, hosting SaaS, rebranding e opere derivate richiedono un’autorizzazione scritta preventiva. Consulta [LICENSE.txt](LICENSE.txt).

Copyright © 2026 Alessandro Ciciarelli · Intelligenza Artificiale Italia. Tutti i diritti riservati.
