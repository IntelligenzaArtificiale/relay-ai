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
| Privacy Shield | Anonimizzazione locale con Velo, placeholder reversibili e workspace isolato |

## Privacy Shield, senza promesse vaghe

Privacy Shield passa il testo composto da Relay attraverso Velo prima dell’invio. Velo lavora in locale, sostituisce i dati riconosciuti con placeholder deterministici e usa un vault per ripristinare la risposta prima che venga mostrata.

- **Protezione completa:** il provider lavora in una directory isolata e vuota, con permesso di sola lettura. Il contenuto menzionato viene fornito soltanto dopo l’anonimizzazione locale.
- **Copertura parziale:** prompt, regole, menzioni e allegati supportati vengono anonimizzati, ma il provider resta nel progetto e può aprire autonomamente altri file con i propri strumenti.

Quando usi `@file[...]`, Relay rimuove dal prompt in uscita il riferimento riutilizzabile al file e invia il contenuto anonimizzato. PDF e DOCX vengono prima convertiti in testo localmente. Le immagini non sono coperte: Velo anonimizza testo, non pixel. Se un’immagine contiene dati sensibili, non va inviata confidando nello Shield.

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
- La copertura parziale non può intercettare file aperti autonomamente dall’agente.
- Le immagini non vengono anonimizzate dallo Shield testuale.
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
