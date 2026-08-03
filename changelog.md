# Changelog

## 0.23.4

- Le chiamate Chrome DevTools MCP di Codex mostrano server e tool reali invece del generico `Mcp Tool Call`.
- Codex configura `startup_timeout_sec=60` e `tool_timeout_sec=90`; le configurazioni Chrome esistenti vengono migrate automaticamente.
- Un tool MCP che non termina viene interrotto dopo 150 secondi senza lasciare la chat bloccata indefinitamente.
- Verificato end-to-end con Codex reale: `list_pages`, `navigate_page`, `take_snapshot` e lettura di Example Domain completati.

## 0.23.3

- Antigravity `danger-full-access` usa il flag headless ufficiale `--dangerously-skip-permissions` soltanto per il singolo run esplicitamente autorizzato.
- `read-only` e `workspace-write` mantengono le rispettive restrizioni; nessun bypass globale viene scritto nelle impostazioni AGY.
- Verificati live comando shell e scrittura file con AGY: entrambi completati, risposta finale `SUCCESS`, exit code 0 e cleanup eseguito.

## 0.23.2

- Antigravity `workspace-write` sincronizza la regola ufficiale `write_file(<workspace>)`, risolvendo i soft-deny headless su modifica e creazione file.
- Le regole sono atomiche, deduplicate e limitate al progetto attivo; `read-only` non concede scrittura e nessun wildcard globale viene aggiunto.
- La configurazione `relay.antigravity.permissions.allow` viene ora applicata realmente alle regole granulari scelte dall’utente.
- Verificata live la scrittura AGY nel progetto che riproduceva il problema, con contenuto modificato, exit 0 e risposta finale.

## 0.23.1

- Antigravity headless registra esplicitamente il progetto corrente con `--add-dir`, evitando richieste `read_file` fuori workspace e falsi errori di permesso.
- Ricerca e lettura AGY restano vincolate al workspace selezionato; nessun `--dangerously-skip-permissions` o permesso shell globale.
- Motivo diagnostico generalizzato da comando negato a permesso headless negato.
- Verificati live chat AGY, lettura/ricerca in due workspace e Chrome DevTools MCP con apertura, snapshot e chiusura di `example.com`.

## 0.23.0

- Skills: conferma eliminazione chiusa di default, visibile soltanto sulla card richiesta e rimossa correttamente con Annulla.
- Skills, MCP e Agenti: ricerca sopra e azioni principali sotto, con larghezza stabile su pannello, sidebar e mobile.
- MCP Browser: template Configura nascosto quando il server è già attivo; inventario Claude/Codex/Antigravity unificato anche con simboli di stato CLI differenti.
- Onboarding Chrome DevTools MCP: verifica congiunta di Chrome/Chromium e runtime Node/npx esterno compatibile, con installazione guidata per Windows, macOS e Linux.
- Codex usage: mantenute separate finestra breve e settimanale; se Codex restituisce soltanto quella settimanale, Relay lo dichiara senza inventare dati.

## 0.22.12

- Corretto Antigravity headless: i prompt ordinari sono passati direttamente a `agy -p`, senza obbligare il modello a leggere un file tramite tool.
- Allineato il parser `stream-json` AGY agli stati reali dei tool e al risultato finale, mantenendo errori e permessi confinati al singolo run.
- Stabilizzato Chrome DevTools MCP sui tre provider con Node esterno compatibile, `npx-cli.js`, PATH coerente e profilo `--isolated` per istanze concorrenti.
- Aggiunte ad Antigravity soltanto le regole granulari `mcp(<server>/*)` e, per Chrome DevTools, `execute_url(*)`; nessun permesso shell globale.
- Claude autorizza i tool MCP soltanto quando il server è stato selezionato come menzione strutturata; il contesto MCP impedisce fallback verso browser nativo, shell o deleghe.
- Corretta la lettura dell'output umano `mcp list`, evitando che l'intera riga di stato venga interpretata come comando eseguibile.

## 0.22.11

- Antigravity usa esclusivamente AGY CLI: rimosso completamente il Browser Bridge e separati gli errori di permesso del singolo run dalla salute del provider.
- Corretto lo streaming AGY `stream-json` con testo progressivo, attività tool e risultati dallo schema eventi annidato; l’inventario modelli non blocca più una CLI operativa.
- Chrome DevTools MCP usa il runtime Node esterno compatibile, verifica il browser visibile e pulisce la pagina tramite `pageId`; corretto anche OAuth nella configurazione AGY.
- L’inventario MCP raggruppa server equivalenti in una sola card con badge Codex, Claude Code e Antigravity e mantiene azioni per ciascun binding.
- Ripristinati provider, agenti, file e directory nel menu `@`; skill e MCP restano nel menu `/`, con badge creati soltanto da metadata selezionati.
- Codex segnala esplicitamente quando la CLI non restituisce la finestra breve, senza presentare il settimanale come limite di sessione.
- Annullare l’eliminazione di una skill chiude immediatamente il banner di conferma.

## 0.22.8

- Ridisegnata la tab Agenti con toolbar compatta `+ Agente`, template chiusi di default, card più minimali e toggle ON/OFF al posto dell’azione chat.
- Semplificato il form agenti: istruzioni custom nel blocco principale e sezioni collassabili indipendenti per `Motore` e `Visibilità`.
- Aggiunta finalizzazione idempotente dei run: root e deleghe fallite o completate non restano più in stato `working`/`delegating`.
- La navigazione tra chat e progetti non dipende più da un lock globale `activeRuns`; le attività in background restano associate alla conversazione corretta.
- Antigravity headless distingue i permission denied sui comandi e mostra una guida esplicita senza abilitare automaticamente `--dangerously-skip-permissions`.
- Aggiunto `ResourceOpenService` con classificazione sicura di URL, comandi, file, directory e binari: i comandi shell non vengono più concatenati al workspace.
- I file `.vsix` e altri binari non vengono più aperti come testo; per i VSIX vengono offerte azioni dedicate come installazione, reveal e copia percorso.
- Le menzioni inviate vengono renderizzate come badge tipizzati e responsive per provider, agenti, file, directory e skill senza tagliare l’ultimo carattere.
- Gli upload in chat accettano anche file binari come `.vsix`, entro i limiti di dimensione, lasciando al provider eventuali limiti di lettura.

## 0.22.7

- Ridisegnata la tab Progetti con toolbar compatta, bottone `Apri` accanto alla ricerca e card chiuse più minimali.
- Il progetto corrente non mostra più la dicitura `Aperto`: viene evidenziato solo con bordo/accento arancione coerente con il resto dell’interfaccia.
- Rimosso il collegamento rapido alle regole dalla card progetto; i repository GitHub mostrano invece un’icona dedicata che apre la pagina remota.
- I progetti non correnti mostrano micro badge con numero chat e ultima apertura, e l’apertura chiede se sostituire il workspace corrente o aprire una nuova finestra IDE.
- Corretta la lettura Claude `/usage` quando label e percentuale sono su righe diverse, ad esempio `Current week` seguito da `14% used`.
- Migliorata la headline degli utilizzi non letti, evitando stati muti come `—` quando serve token, login o il provider non espone limiti.

## 0.22.6

- Rimosso Privacy Shield come feature runtime: niente switch globale, override per progetto, vault reversibili, trasformazione automatica dei prompt, workspace isolati o riparazioni delegate.
- Aggiunta la regola bundled `gdpr`, disattiva di default e pubblicabile come skill nativa, che si applica solo quando il prompt contiene `/gdpr`.
- La regola `/gdpr` richiede agli agenti di lavorare su copie anonimizzate in `gdpr_relay/`, mantenendo un lock testuale dei file originali e propagando lo stesso vincolo alle deleghe.
- L'attivazione della regola `/gdpr` verifica solo la disponibilità locale di Velo via Python; se Velo non è raggiungibile, la regola resta spenta.
- Corrette le quote non numeriche: Claude subscription-only viene mostrato come provider attivo senza percentuale e Copilot non mostra più `0 cr` quando GitHub non restituisce un limite.

## 0.22.3

- Corretto lo stato Codex degradato quando app-server, account e modelli sono operativi ma il probe informativo `--version` scade.
- Ridisegnata l'attivazione di Privacy Shield: prima configurazione guidata con verifica completa, riparazione delegata a un provider disponibile e switch mostrato solo dopo il collaudo.
- Incorporato anche il bootstrap della webview nel documento protetto da nonce, evitando falsi timeout e pannelli Relay vuoti su Antigravity IDE.
- Privacy Shield rimuove ora i riferimenti `@file` riapribili, anonimizza anche le regole passate separatamente al provider e usa un workspace isolato in modalità completa.
- Corretto il crash di attivazione su Antigravity IDE (DOMMatrix is not defined) causato dall'estrattore PDF.
- Packaging VSIX reso multipiattaforma senza dipendere dal comando esterno zip.
- Added Privacy Shield with local Velo anonymization before provider calls and response restoration before display/delegation parsing.
- Added PDF and DOCX text extraction for Shield-covered prompts using pure JavaScript dependencies.
- Added global and per-project Privacy Shield controls with complete/partial coverage labels.
- Enforced read-only execution when Privacy Shield is active in complete protection mode.
- Improved synchronized skill visualization with provider badges and managed/manual status.
- Bundled Velo sources in the packaged VSIX.

## 0.22.1

- Corretto il riconoscimento degli artefatti citati nelle risposte: i percorsi Markdown assoluti e URL-encoded vengono decodificati e associati ai file reali del workspace, mentre una directory citata diventa un archivio ZIP sicuro.
- Ridisegnati i risultati remoti con righe compatte, icone minimali, azioni icon-only e gruppi collassabili; download e copia percorso non occupano più card e pulsanti sovradimensionati.
- Corretto il sovrapporsi del composer alla card del task: l’altezza viene misurata dinamicamente e durante un run compare una barra operativa compatta, senza coprire attività o risposta in streaming.
- Introdotti ticket temporanei e circoscritti per le anteprime: HTML, CSS, JavaScript, immagini e asset relativi vengono caricati senza esporre il token della sessione Relay.
- Il proxy delle app locali inoltra ora form e richieste API POST/PUT/PATCH/DELETE, riscrive fetch/XHR/EventSource e conserva in modo server-side i cookie dell’app locale, risolvendo login e interazioni che prima restituivano “Sessione remota non valida”.
- La navigazione mobile è stata semplificata a cinque voci; Utilizzo, Regole, MCP e Impostazioni sono raccolti in “Altro”, evitando sette tab compresse.
- Aggiunta una vera pagina **Impostazioni** remota per provider predefinito, permessi, deleghe, politica quote, refresh utilizzo, esposizione quote agli agenti e aggiornamento VSIX, con allowlist stretta lato server.
- Rimossi i contenitori vuoti che potevano apparire come piccole pill ambra; il segnalatore di tocchi Android/Samsung resta invece una sovrapposizione del sistema operativo, non un elemento Relay.
- Aggiunti test end-to-end simulati per percorsi codificati, directory ZIP, ticket preview, asset statici, form PHP, cookie applicativi, impostazioni allowlistate e UI mobile compatta.

## 0.22.0

- Le Regole Relay possono essere pubblicate come skill native per Claude Code, Codex, Antigravity e, quando rilevato, Copilot: `SKILL.md` con frontmatter standard, descrizione obbligatoria e marcatore `x-relay-managed` che impedisce di toccare skill manuali.
- Aggiunto il browser delle skill rilevate e il comando di sincronizzazione globale; modifica, disattivazione ed eliminazione di una regola riallineano soltanto i file gestiti da Relay. Codex può abilitare `features.skills` con backup e consenso.
- Nuova sezione **MCP** con inventario unificato, stato per provider, trasporto e scope, toggle reversibili, aggiunta guidata, modifica, rimozione e copia cross-provider tra configurazioni Claude, Codex, Copilot e Antigravity.
- Le configurazioni MCP usano parser TOML/JSON reali, backup `.relay-bak`, store separato per definizioni disabilitate e mascheramento dei valori sensibili in UI e diagnostica; un file non parsabile non viene mai sovrascritto.
- Nuova sezione **Automazioni** con intervalli, pianificazioni giornaliere, settimanali e una tantum, periodo di validità, policy skip/catch-up, esecuzione manuale e storico delle ultime venti esecuzioni.
- Lo scheduler usa un solo timer riarmato, limita l’attesa a sei ore per recuperare da sleep, impedisce overlap e crea una nuova conversazione `⏱` passando dal normale flusso provider/agente/permessi/deleghe.
- MCP e Automazioni sono disponibili anche nella web app mobile con inventario, toggle ed esecuzione immediata allowlistata. Le automazioni mostrano chiaramente che funzionano quando l’editor con Relay è aperto.
- Aggiunti test per pubblicazione e protezione delle skill manuali, flag Codex, parser e toggle MCP dei quattro provider, backup e traduzione cross-formato, calcolo schedule/DST, catch-up, anti-overlap, storico e azioni remote.

## 0.21.5

- Corretto il falso esaurimento quota di Claude Code: gli eventi `rate_limit_event` interrompono il run soltanto quando Claude dichiara esplicitamente `status: "rejected"`; gli eventi `allowed`, anche se contengono `out_of_credits`, non vengono più trattati come errori terminali.
- Resa resiliente la lettura dei limiti su macOS: Claude ritenta le letture transitorie, rivalida il percorso della CLI e conserva l’ultimo dato valido come quota stale invece di mostrare improvvisamente il provider come privo di dati.
- Aggiunto un retry breve e selettivo per gli altri provider su macOS soltanto in presenza di errori temporanei; errori permanenti di login, token, installazione o configurazione non vengono ripetuti inutilmente.
- Il bottone di autorisoluzione negli errori desktop e mobile è ora compatto e si chiama **Risolvi**; apre una nuova chat con il provider sano alternativo e invia automaticamente il bundle diagnostico con accesso completo e conferme protette.
- Aggiunti test per eventi Claude `allowed/rejected`, fallback quota stale, retry macOS selettivo e presenza dell’azione compatta di recovery.

## 0.21.4

- Corretto il pairing remoto dopo reload/reinstallazioni: la web app sincronizza il ticket corrente dal server prima di inviare il codice, anche quando browser, PWA o scanner QR perdono la query `?t=`.
- Il codice a sei cifre corrente, non scaduto e monouso resta l’autorità del pairing; un ticket URL stale non blocca più un codice corretto, mentre codici errati e QR scaduti restano rifiutati e rate-limitati.
- Aggiunto un endpoint pubblico minimale `/api/pairing` che espone solo ticket, scadenza e identificativo processo, mai il codice o token di sessione.
- Relay verifica end-to-end che il Funnel punti al processo e al ticket correnti; se dopo un reload risponde una vecchia istanza, riallinea automaticamente la configurazione Tailscale prima di mostrare il nuovo QR.
- Il pannello desktop mostra un ID QR breve, così è immediato verificare che “Rigenera QR” abbia prodotto davvero un ticket nuovo.
- Aggiunti test per ticket perso/stale, metadata pairing, route Funnel verso istanza precedente e sincronizzazione automatica mobile.

## 0.21.3

- Le sessioni remote vengono persistite in `globalStorage` usando esclusivamente l’hash SHA-256 del token, così reload e riavvio dell’editor non richiedono un nuovo pairing entro il TTL previsto.
- Aggiunto l’aggiornamento guidato da VSIX direttamente dal remoto: validazione, marker pre-reload, installazione tramite comandi VS Code compatibili, reload controllato e conferma al riavvio.
- Introdotto un codice bootstrap monouso e a scadenza breve per migrazioni o recuperi da versioni precedenti prive di sessioni persistenti.
- Gli errori dei run possono essere affidati con un tap a un provider sano diverso da quello fallito, tramite recovery full-access con bundle diagnostico sanitizzato e conferme per operazioni di sistema.
- Il composer mobile non viene più ricreato a ogni stato SSE: focus, tastiera e posizione del cursore restano stabili, anche quando lo stato operativo cambia davvero.
- Il rientro nell’app forza una riconnessione immediata; oltre 800 ms appare un overlay Relay dedicato e una sessione scaduta torna al pairing con un messaggio comprensibile.
- Rifinite card file, immagini, siti e archivi: thumbnail, icone per tipo, gruppi collassabili, download ZIP, copia percorso, link arricchiti e anteprima isolata nella web app remota.
- Aggiunti test mirati per persistenza e scadenza sessioni, bootstrap, aggiornamento VSIX, autorisoluzione cross-provider, focus/caret mobile, riconnessione e presentazione degli artefatti.

## 0.21.2

- Aggiunta la consegna remota dei risultati: i file workspace citati o modificati nelle nuove risposte diventano azioni autenticate **Scarica** direttamente nella chat mobile.
- I risultati HTML possono essere aperti come anteprima statica attraverso lo stesso URL LAN/Tailscale di Relay, con risoluzione sicura degli asset relativi e fallback SPA.
- Le applicazioni Node, PHP o altri servizi web realmente avviati su `localhost`/`127.0.0.1` possono essere aperti dal telefono tramite un proxy Relay autenticato; non vengono inventate porte o avviati server impliciti.
- Per risultati composti da più file Relay genera su richiesta un archivio ZIP in memoria, senza copiare il progetto in aree pubbliche o persistenti.
- L'indicizzazione remota resta confinata al workspace reale, blocca traversal e symlink escape ed esclude automaticamente `.env`, chiavi private, credenziali, `.git`, `.ssh`, `node_modules` e dati interni Relay.
- Le anteprime usano una CSP sandbox isolata e non ricevono cookie, token o header di autenticazione Relay; i proxy locali accettano esclusivamente destinazioni loopback.
- Il protocollo dei provider, quando il remoto è attivo, richiede di citare i file prodotti e di riportare soltanto URL loopback realmente avviati, così la chat può offrire download e preview affidabili.
- Le card delle deleghe desktop rimangono visibili durante approvazione ed esecuzione, ma vengono rimosse quando il lavoro delegato è terminato e la risposta finale è stata integrata.
- Aggiunti test per download autenticato, anteprima HTML e asset, proxy di applicazioni locali, ZIP, protezione dei segreti, traversal, card mobile e ciclo di vita visuale delle deleghe.

## 0.21.1

- Corretto il composer remoto: il testo inviato viene rimosso immediatamente dall’input e non può essere ripristinato da un aggiornamento SSE concorrente.
- Aggiunto echo ottimistico del messaggio nella conversazione mentre Relay lo consegna al computer, con ripristino automatico della bozza solo in caso di errore.
- Eliminato il round-trip HTTP aggiuntivo dopo ogni evento live: lo stato remoto sanitizzato viene ora inviato direttamente tramite SSE e applicato senza chiudere e riaprire la connessione.
- Coalescati gli aggiornamenti SSE e riutilizzato il payload di stato già costruito dal controller, riducendo scansioni e ricostruzioni duplicate durante task e streaming.
- Le azioni remote usano uno snapshot di validazione leggero, evitando la costruzione dello stato completo e la scansione del workspace prima di avviare ogni messaggio.
- Aggiunti test per svuotamento immediato del composer, echo ottimistico, riconciliazione col messaggio persistito, assenza di fetch ridondanti e validazione remota leggera.

## 0.21.0

- Introdotto **Relay Ovunque** con tre modalità persistenti: rete locale, accesso pubblico tramite Tailscale Funnel e accesso privato tramite Tailscale Serve.
- Aggiunto `TunnelManager`, una macchina a stati multipiattaforma che rileva installazione, login, DNS Tailscale, configurazioni Serve/Funnel, approvazione, attivazione, propagazione DNS, probe, remediation e stato degradato.
- Il server remoto viene limitato a `127.0.0.1` nelle modalità Tailscale; l’esposizione avviene soltanto attraverso il proxy TLS, con validazione stretta dell’hostname `.ts.net` configurato e cookie `Secure`.
- Relay preserva le configurazioni Tailscale già esistenti scegliendo la prima porta libera fra 443, 8443 e 10000, senza sovrascrivere route Serve/Funnel dell’utente.
- Aggiunti installazione e login guidati per Windows, Linux e macOS, risoluzione della CLI inclusa nell’app macOS e configurazione dell’operatore locale Linux dopo l’autorizzazione iniziale.
- Il Funnel usa un URL stabile derivato da `tailscale status --json` (`Self.DNSName`), riparte dopo riavvio tramite `--bg` e aggiorna automaticamente QR e avviso quando cambia il nome DNS.
- Aggiunto probe HTTPS end-to-end su `/health`, monitoraggio periodico, stato di propagazione DNS e remediation del caso Windows in cui il Funnel risulta configurato ma non raggiungibile.
- Aggiunta recovery cross-provider con bundle diagnostico sanitizzato, conferma full-access e divieto di modificare account, tailnet, PATH o servizi senza consenso.
- Rifatta la sezione Remoto con selezione delle tre modalità, wizard a tre passaggi, stato live, URL copiabile, QR, sessioni, cronologia, transizioni e disclosure Certificate Transparency.
- Aggiunti test deterministici per parsing JSON, selezione porta, installazione multipiattaforma, macOS capability detection, stato degradato, remediation, disattivazione, bind loopback, Host validation, cookie Secure, privacy `/health`, riuso porta e irraggiungibilità dell’origine dopo lo stop.

## 0.20.4

- Rifatta la shell mobile remota con una sola app bar per schermata: eliminati titoli, sottotitoli, contatori, stato connessione e refresh duplicati.
- Trasformato il drawer in una cronologia conversation-first del progetto corrente, con ricerca, task in esecuzione, conversazioni recenti e sole azioni contestuali; la bottom navigation resta l’unica navigazione globale.
- Ridisegnata la conferma dispositivo in forma compatta: brand ridotto, OTP a sei slot, CTA e icone proporzionate, validazione progressiva e microcopy orientata alla soluzione.
- Compattata la Chat remota: provider e modello in un unico badge, agente mostrato come entità primaria, un solo comando Stop nel composer e dettagli del task collassati.
- Tradotti gli stati tecnici dei run in fasi comprensibili e impedita la visualizzazione di valori interni come `starting-session` e `waiting-first-output`.
- Rimossi dall’header mobile il refresh permanente e la grande pill Connesso; online è un indicatore discreto, mentre riconnessione e offline restano avvisi espliciti.
- Semplificate Progetti, Agenti, Utilizzo e Regole con intro compatte, card più basse, empty state ridotti e filtri senza controlli duplicati.
- Aggiunti test JSDOM per drawer conversation-first, scroll stabile, singolo Stop, fase umanizzata, badge provider/modello unificato e assenza di allegati non supportati nel composer remoto.

## 0.20.3

- Rifinito il composer desktop degli allegati con pulsante aggiunta minimale, card sopra la textarea e anteprime clipboard abilitate tramite CSP `blob:` con fallback sicuro.

## 0.20.2

- Durante lo streaming, i delta ricevuti mentre è aperta una sezione diversa dalla Chat vengono accumulati senza ricostruire la pagina corrente; Impostazioni, Agenti, Diagnostica e Utilizzo mantengono identità DOM e posizione di scorrimento.
- Aggiunto il supporto Allegati V1 nel composer desktop: file picker, drag & drop, incolla immagini, anteprime, validazione e bozze per conversazione.
- Gli allegati vengono salvati in modo restrittivo nella globalStorage di Relay e passati ai provider come percorsi locali assoluti nel blocco `## Allegati`, senza Base64 nei messaggi e senza cambiare il formato dello store conversazioni.
- Aggiunti limiti di 10 file per messaggio e 20 MB per file, sanificazione multipiattaforma dei nomi, protezione dal doppio invio, revoca degli object URL e pulizia automatica dopo sette giorni.
- Rifatta integralmente la web app remota secondo il design system Relay dark + amber: shell a `100dvh`, thread come unica area scrollabile, composer fisso con safe-area, drawer e bottom sheet in overlay.
- Ridisegnati pairing OTP, chat, conversazioni, selezione provider/modello, progetti, agenti, utilizzo e regole senza introdurre dati o API server inesistenti.
- I picker mobili non alterano lo scroll della conversazione; streaming, riconnessione, bozza e focus aggiornano soltanto thread, attività live e controlli necessari.
- Aggiunti test per 20 delta fuori chat, persistenza scroll, allegati desktop, cleanup file, parsing dello script remoto e stabilità dello scroll all’apertura dei bottom sheet.

## 0.20.1

- Le deleghe esplicitamente richieste per risolvere, correggere, implementare, applicare fix o rifare la build vengono avviate con `Accesso completo`; le analisi esplicitamente read-only restano protette.
- La recovery cross-provider usa accesso completo al task, ma continua a richiedere conferma prima di cambiare PATH, account, installazioni globali o configurazioni esterne.
- Al termine di una recovery Relay comunica sempre che launcher, ambiente e moduli possono richiedere il riavvio dell’editor e offre l’azione `Riavvia editor`.
- Aggiunti cinque agenti template disattivati e assegnati al primo provider realmente disponibile: Specification Architect, Codebase Mapper, Bug Finder, Security Auditor e Surgical Fixer.
- I template usano un modello economico disponibile, sono protetti da versionamento/migrazione e non vengono ricreati dopo una cancellazione intenzionale.
- Esteso il permesso degli agenti con `Accesso completo`, mantenendo compatibilità con gli agenti esistenti.
- Rafforzata la politica di delega: handoff soltanto su richiesta esplicita o con un vantaggio concreto di specializzazione, parallelismo o risparmio di token/contesto.
- Ridisegnata la UI delle deleghe: prompt collassato, scope file in badge, motivazione di routing espandibile e permessi immediatamente leggibili.
- Raccolti i template in una libreria collassabile nell’Agent Studio, con badge dedicato e card compatte.
- Ridotto il rumore dei task lunghi: gli heartbeat restano aggiornati nella UI ma non saturano diagnostica e cronologia attività ogni 15 secondi.
- Corretto il ripristino sincrono di focus e selezione del composer durante un render completo dello stato.

## 0.20.0

- Introdotto un launcher processi multipiattaforma condiviso per eseguibili nativi, wrapper npm `.cmd`/`.bat`, script PowerShell e CLI Unix, usato anche da Codex app-server.
- Corretta la quotatura dei wrapper Windows e normalizzato l’output UTF-8; terminazione affidabile dell’intero albero processi su Windows, Linux e macOS.
- Aggiunto il trasporto centralizzato dei prompt: stdin per Claude Code e GitHub Copilot CLI, file temporaneo restrittivo per AGY, JSON-RPC stdin per Codex; payload da 1 MB non transitano più in argv.
- Sostituita la disponibilità booleana con health state e probe distinti per risoluzione, versione, avvio, autenticazione, modelli e smoke check.
- Rilevamento provider progressivo, indipendente, single-flight e cancellabile: la webview si apre subito e riceve aggiornamenti incrementali senza attendere il provider più lento.
- Aggiunta classificazione strutturata di rate limit, crediti esauriti, autenticazione, permission denial, timeout, E2BIG, modello non valido, protocollo e launch failure.
- Introdotti recovery cross-provider e failover controllato con bundle sanitizzato, preservazione dell’output parziale e conferma obbligatoria per task potenzialmente non idempotenti.
- Aggiornamento chat incrementale per delta: identità DOM dei messaggi preservata, batching `requestAnimationFrame`, Markdown throttled, scroll/focus/caret/draft stabili.
- Migliorata la timeline delle deleghe con provider primario e delegato, modello, fase, attività, heartbeat, permission denial, rate limit e stato di integrazione.
- Rimossa la scrollbar verticale annidata dai prompt lunghi; codice e tabelle mantengono soltanto lo scroll orizzontale necessario.
- Ampliata la suite con test per launcher Windows, prompt 64 KB/500 KB/1 MB, detection progressiva, false readiness, failure classification, recovery e 100 delta streaming consecutivi.

## 0.19.4

- Antigravity usa AGY CLI per impostazione predefinita; il bridge Browser Agent viene scelto solo per richieste browser esplicite.
- La classificazione browser ignora riferimenti tecnici, analisi statiche e frasi negate come “non serve aprire un browser”.
- Il routing root e quello delle deleghe fissano esplicitamente la modalità Antigravity in base al task originale, evitando falsi positivi introdotti da protocollo e contesto.
- Invio Browser Agent reso affidabile: focus del composer, preferenza per comandi Antigravity specifici, fallback VS Code e retry controllato.
- Diagnostica chiara quando il prompt viene inserito ma la build IDE non espone un comando pubblico di submit.

## 0.19.3

- Ridisegnate Impostazioni provider, card agenti e Diagnostica con controlli compatti e coerenti.
- Aggiunto default globale per i permessi delle nuove chat su tutti i provider.
- Aggiunte eliminazione rapida e conferma inline nelle card agenti.
- Diagnostica con componenti collassabili, toolbar a sole icone e log caricati progressivamente.
- Web app remota riprogettata mobile-first: thread chat separato dalla cronologia, navigazione e scroll corretti, schermate più compatte.

## 0.19.2

- Corretto il JavaScript della web app mobile che produceva `Invalid regular expression flags` dopo la scansione del QR.
- Aggiunto un test che compila l’HTML remoto ed esegue il parsing reale dello script generato.
- Le menzioni agente non sostituiscono più il provider principale: indicano un target di delega.
- Un agente viene eseguito direttamente soltanto quando è selezionato esplicitamente nel composer.
- Tutti gli agenti visibili sono esposti ai provider come target; `canDelegate` controlla solo se l’agente primario può delegare ulteriormente.
- Il protocollo accetta riferimenti agente per ID o nome esatto e include specializzazione e permessi.

## 0.19.1

- Ridotto il costo degli aggiornamenti di stato: cache clone-safe negli store JSON, riepilogo conversazioni raggruppato in una sola lettura, TTL del progetto/Git e debounce trailing di `emitState()`.
- Resa affidabile la terminazione dei processi su Windows, Linux e macOS con chiusura dell’intero albero; output CLI limitato a 2 MB con conservazione della coda utile.
- Memoizzato l’avvio concorrente di Codex app-server e allineata `clientInfo.version` alla versione reale del pacchetto.
- Ridotta la frequenza del probe `/usage` di Claude con cache differenziata per successi ed errori.
- Ottimizzato lo streaming chat: messaggi completati riutilizzati dal DOM, Markdown dello stream ricalcolato al massimo ogni 250 ms e tail incrementale in testo semplice.
- Conservati focus, selezione e posizione del cursore durante gli aggiornamenti di stato della webview; fermato il ticker di boot dopo il primo stato.
- Il protocollo `<relay-delegate>` viene nascosto appena viene riconosciuto il tag di apertura, anche quando arriva diviso tra più delta, senza attendere il tag di chiusura.
- Aggiunta agli agenti l’impostazione persistente `Sola lettura` / `Lettura e scrittura`, applicata anche alle esecuzioni e alle deleghe.
- Rafforzata la web app remota: eliminati handler `onclick` inline, listener delegato con allowlist e CSP script nonce-only.
- Minificato `webview.css` durante la build e ampliati i test HTTP remoti: 401 senza sessione, rate limit, allowlist, ticket scaduto, revoca e CSP.

## 0.19.0

- Eliminato l’errore `No active conversation`: selezione provider, permessi, deleghe e agenti creano in sicurezza una conversazione persistita quando il progetto non ne possiede ancora una attiva.
- Le menzioni degli agenti non mostrano più UUID tecnici: autocomplete e messaggi usano `@Nome` o `@"Nome agente"`, renderizzati come chip grafici dedicati.
- Una singola menzione esplicita di agente diventa un target deterministico: Relay esegue direttamente con provider, modello e istruzioni dell’agente invece di affidarsi all’interpretazione del provider principale.
- Gli agenti sono entità autonome nella chat: icona dedicata, nome agente, modello/provider/thinking sottostanti nascosti e permessi modificabili senza deselezionare il profilo.
- Gli agenti il cui provider è scollegato mostrano un indicatore visibile e non possono essere avviati finché il provider non viene ricollegato.
- `Scollega` è ora immediato, reversibile e limitato a Relay: non esegue logout, non apre terminali e non modifica account, CLI o chat native del provider.
- Rifatta la presentazione dei provider nelle Impostazioni con card compatte, stato di connessione evidente e azioni Ricollega/Aggiorna/Scollega più chiare.
- Rafforzato il pairing remoto su browser mobili con fallback bearer in `sessionStorage` quando il cookie locale non viene conservato; la revoca di una sessione invalida immediatamente cookie, bearer e stream SSE.
- La web app remota tratta anche l’agente come unica entità, nascondendo provider/modello/reasoning sottostanti e mostrando nome agente nelle risposte e nei task live.
- Filtrato il warning benigno `ResizeObserver loop completed with undelivered notifications` senza nascondere gli errori JavaScript reali.
- Aggiunti test mirati per boot senza conversazione, entità agente, menzioni leggibili, scollegamento provider Relay-only, pairing mobile senza cookie e revoca immediata delle sessioni.

## 0.18.9

- Corretto il crash reale del boot webview: `VALID_SECTIONS` veniva letto da `normalizeSection()` prima della propria inizializzazione durante il ripristino dello stato persistito.
- Aggiunto test mirato sull'ordine di inizializzazione del bundle.

## 0.18.8

- Corretto il boot reale della webview su Antigravity IDE: `dist/webview.js` non viene più richiesto come secondo script locale esterno, ma viene letto dall’Extension Host e inserito come script inline autorizzato dallo stesso nonce CSP.
- Mantenuto il bootstrap esterno minimale, così eventuali errori di parsing/runtime del bundle principale vengono intercettati prima del suo avvio e inviati a Relay Diagnostics con messaggio e stack.
- Eliminata la dipendenza del bundle principale da `asWebviewUri`, cache e caricamento della seconda risorsa webview, lasciando invariati provider, remoto, usage, agenti e controller applicativo.
- Aggiunta sanitizzazione sicura del bundle inline per `</script>` e separatori Unicode, compatibile con Linux, Windows, macOS, VS Code e Antigravity IDE.
- Aggiornati i test mirati del boot per verificare listener-first, bootstrap, bundle principale inline, CSP nonce-only e diagnostica anticipata.

## 0.18.6

- Corretto il race condition del boot webview: il listener host viene registrato prima di assegnare `webview.html`.
- Aggiunto bootstrap webview indipendente con diagnostica distinta per risorsa/CSP e bundle principale.
- Handshake `webviewReady` con acknowledgement e retry, evitando messaggi persi su Antigravity IDE.
- Asset webview versionati per invalidare la cache tra aggiornamenti.
- CSP riportata al modello nonce-only già funzionante e documentato da VS Code.
- Bundle browser compilato a ES2020 e bootstrap a ES2018 per maggiore compatibilità.

## 0.18.5

- Corretto il caricamento del bundle webview su Antigravity IDE: la CSP ora consente esplicitamente script locali da `webview.cspSource` oltre al nonce.
- Aggiunto fallback visibile quando `dist/webview.js` non viene caricato.

## 0.18.4

- Corretto il bootstrap della webview: Relay ora aspetta il ping `webviewReady` prima di inviare lo stato iniziale, evitando che il primo payload venga perso e la UI resti bloccata sulla schermata di avvio.
- Aggiunta diagnostica se la webview non carica/esegue lo script entro 5 secondi.
- Aggiunto fallback visibile nella schermata di avvio quando lo stato non arriva alla webview.

## 0.18.3

- Aggiunto `tsconfig` e dev dependency TypeScript/VS Code/Node per eliminare gli errori IDE sui moduli Node e `vscode` in `relay-controller.ts`.
- Migliorata la readiness Windows: Node 20+ è valido, Node/npm vengono rilevati anche in `C:\Program Files\nodejs`, e Copilot non richiede più PowerShell 7 quando WinGet o npm bastano.
- Aggiunto il pulsante `Scollega` già in onboarding per provider pronti.
- Migliorata la diagnostica Codex app-server: in caso di stop con code 1 viene riportato anche l’ultimo stderr.

## 0.18.1

- Fixed Linux startup deadlock: optional system-readiness and usage probes no longer block the first UI state.
- Added bounded startup phases and a best-effort emergency state so Relay always opens even when a local CLI, shell probe, workspace scan or storage file is slow.
- Added recovery for malformed Relay JSON storage: corrupt payloads are quarantined instead of leaving the extension on the loading screen.
- Hardened preferences, projects, conversations and rules against legacy or invalid persisted shapes.
- Added actionable initialization-error UI and retry/reset controls.
- Added startup diagnostics for storage, project, providers, readiness and state construction.
- Removed obsolete explicit activation events and added the missing view icon metadata.

# 0.18.0

- Rifatta integralmente la web app Remoto con layout mobile-first da 320 px, header e bottom navigation compatti, safe-area, tastiera mobile, card senza overflow, paginazione e stati loading/offline/running coerenti.
- Rimossi hero e illustrazioni sovradimensionati dalle pagine Chat, Progetti, Agenti, Utilizzo e Regole; introdotta una gerarchia tipografica fluida e contenuti troncati in modo sicuro.
- Aggiunto rendering Markdown sicuro nelle chat remote per grassetto, codice inline, blocchi codice e liste, evitando la visualizzazione grezza dei marker `**`.
- Aggiunto Session Manager remoto con tab Pairing, Sessioni, Cronologia e Rete: sessioni attive, dispositivo/browser, ultima attività, revoca singola o totale, cronologia persistente, paginazione e pulizia.
- Il pairing notifica immediatamente la webview desktop e consente di passare dal QR alla lista sessioni senza restare bloccati nella schermata di generazione.
- Aggiunta cronologia versionata delle connessioni remote con motivazione di chiusura (`revoked`, `expired`, `server-stopped`) e limite massimo per evitare crescita infinita.
- Introdotto un nuovo bootstrap animato dell’estensione con fasi reali, timeout, retry e rispetto di `prefers-reduced-motion`.
- Aggiunto error boundary globale della webview: errori JavaScript e promise rejection vengono inviati a Relay Diagnostics e mostrano una schermata di recupero invece di lasciare il pannello nero.
- Aggiunto il comando `Relay: Ripristina interfaccia`, validazione dello stato persistito e reset selettivo della UI per recuperare da storage o sezione corrotti senza cancellare progetti e chat native dei provider.
- Rafforzata la protezione mobile: solo progetti registrati da Relay, cambio workspace confermato dal PC, blocco durante task running, composer disabilitato sulle chat occupate e annullamento esplicito dei run.
- Aggiunti test per storico sessioni, pairing reattivo, reset history, layout mobile senza overflow/hero giganti, Markdown, breakpoint 360 px, boot recovery e navigazione Remoto.

# 0.17.0

- Aggiunto il nuovo layer centrale **System Readiness** per rilevare runtime dell’extension host, Node/npm esterni, Git, curl, browser, PowerShell e package manager su Windows, macOS e Linux.
- Aggiunto wizard di installazione contestuale con comando visibile/copiabile, installer ufficiale, ricontrollo manuale e rilevamento automatico per due minuti; componenti presenti ma troppo vecchi vengono indicati come **Da aggiornare**.
- Chiarito che Remoto usa il runtime Node integrato nell’extension host e non richiede Node esterno; aggiunto avviso per SSH, WSL, container e altri extension host remoti.
- Centralizzato System Doctor sulla stessa sorgente di verità del wizard, eliminando rilevamenti duplicati e correggendo il controllo browser su macOS.
- Aggiunti preflight contestuali prima di automazioni browser e task paralleli con worktree.
- Rafforzato il server remoto con cookie HttpOnly, QR monouso, rate limit pairing, intestazione applicativa, heartbeat SSE e validazione state-aware delle azioni.
- Bloccati da remoto percorsi progetto arbitrari, azioni distruttive, doppi invii nella stessa chat e cambi workspace durante task running.
- Migliorata la web app mobile con stato task nella topbar e bottom-nav, anteprime chat nei progetti, badge RUNNING/PRONTA e messaggi di readiness del PC.
- I progetti non aperti restano visibili ma possono essere attivati solo con conferma sul PC; nuovi progetti usano il selettore cartelle nativo del desktop.
- Reso il reset future-proof: rimuove storage, token, pairing, sessioni e riferimenti Relay senza eliminare file workspace, CLI o chat native dei provider.
- Aggiunti test per pairing cookie-based, anti-CSRF applicativo, blocco path arbitrari, doppio invio/cambio progetto durante task running, Node obsoleto, PowerShell mancante, UI mobile sicura e piani installazione cross-platform.

# 0.16.0

- Rifinita la web app mobile remota con layout bottom-nav, status connessione, safe-area per iPhone/Android, PWA manifest locale, reconnect SSE e stati offline/riconnessione.
- Aggiunti URL LAN alternativi e diagnostica cross-platform nella sezione Remoto: Windows firewall, permessi rete locale macOS, firewall Linux, VPN, reti guest e standby.
- Rafforzate le intestazioni HTTP del server remoto con CSP locale, Permissions-Policy e manifest/icon serviti senza servizi esterni.
- Reso Agent Studio ancora più minimale: in creazione restano visibili solo nome e specializzazione; bio, modello, thinking, istruzioni, deleghe e visibilità sono avanzate.
- Migliorato il comportamento mobile remoto per Chat, Progetti, Agenti, Utilizzo e Regole con card più leggibili, composer sticky e selezione rapida agente/progetto.
- Confermato che il reset elimina riferimenti Relay, sessioni remote e token usage senza toccare CLI esterne, file dei workspace o cronologie native dei provider.

# 0.15.0

- Added Remote LAN cockpit with QR pairing, one-time code, multiple sessions and session revoke.
- Added mobile web UI for Chat, Projects, Agents, Usage and Rules over the local network.
- Collapsed advanced Agent Studio options behind a progressive disclosure panel.
- Collapsed advanced Rule options such as scope, priority, mandatory and provider targets.
- Improved reset-all-data to stop remote sessions and clear Relay-owned Secret Storage references.
- Added remote access diagnostics and cross-platform LAN detection.
- Upgraded build tooling and added runtime QR generation dependency.

# 0.14.0

- Semplificata la topbar della sidebar: rimosso il menu a tre puntini e il pulsante testuale Agenti; Chat, Progetti, Agenti, Utilizzo, Regole e Diagnostica sono ora accessibili tramite icone dirette, con stato attivo e tooltip. La cronologia usa un’icona dedicata per non confondersi con la sezione Chat.
- Rimossi temporaneamente MCP dall’esperienza Agenti: nessun campo, contatore, warning o istruzione MCP viene mostrato o iniettato nei prompt. I dati storici restano preservati nello storage per una futura reintroduzione senza migrazioni distruttive.
- Aggiunto per ogni provider il **modello predefinito delle deleghe**, separato dal modello delle nuove chat. È possibile fissare un modello, usare l’automatico del provider oppure lasciare a Relay la scelta intelligente per ogni task.
- Centralizzata la precedenza del modello nelle deleghe: richiesta esplicita → agente custom → default deleghe del provider → routing intelligente → fallback chat. In questo modo la configurazione è prevedibile e non duplica logica nel controller.
- Migliorata la UI delle impostazioni provider con quattro controlli etichettati — Chat, Thinking, Accesso e Deleghe — layout responsive, descrizioni brevi e nota esplicativa sul routing intelligente.
- Alleggerite le card Agenti, ora focalizzate su task, deleghe e visibilità, e ottimizzata la densità della topbar nelle sidebar strette.
- Estesi i test core e smoke per navigazione diretta, assenza MCP, configurazione modello deleghe, persistenza accordion e priorità del routing.

# 0.13.0

- Uniformata la lettura capacità: per Antigravity il valore principale usa sempre la finestra di cinque ore e segue la famiglia del modello realmente selezionato, inclusi gli agenti custom; le quote settimanali restano dettaglio e non influenzano routing o headline.
- Codex usa ora lo stesso schema visuale a finestre di Claude Code e Antigravity, con gruppo, durata, reset e barra coerenti.
- Separati chiaramente in Copilot il totale mensile, il consumo AI Credits per modello e le eventuali richieste premium legacy; eliminate le tre voci indistinguibili con etichetta generica.
- Rafforzata la scoperta modelli Copilot: Relay legge il blocco `--model` oppure la sezione `Supported models` della CLI senza contaminare l’inventario con esempi o agenti integrati. I modelli con reasoning configurabile sono marcati esplicitamente.
- La pagina Utilizzo mostra i modelli Copilot utilizzabili esposti dalla CLI locale per account/policy; se è disponibile solo `auto`, Relay lo segnala come accesso automatico-only invece di proporre modelli non selezionabili.
- Agent Studio è ora sempre raggiungibile anche nella sidebar compatta tramite pulsante dedicato, menu completo delle sezioni e comandi `Relay: Open Agent Studio` / `Relay: Open Provider Usage` dalla Command Palette.
- Aggiunto il file sorgente `src/ui/types.ts`, rimosso un buco nel pacchetto sorgente e ampliati i test core/smoke per selezione pool Gemini/Claude-GPT, UI Codex, breakdown Copilot e accesso Agent Studio.

# 0.12.0

- Spostati gli **Agenti** fuori dalle Impostazioni in uno studio dedicato, affiancato a Chat e Progetti. Creazione, modifica, visibilità, provider, modello, thinking, istruzioni, deleghe e MCP sono ora gestiti con form inline nella webview, senza prompt nativi dell’editor.
- Rimossa la vecchia UI/CSS degli agenti nelle Impostazioni; aggiunti ricerca, card operative, contatori, agente predefinito, associazione globale/progetto e conferma di eliminazione inline.
- Ripulita la versione GitHub Copilot in tutte le selezioni: stringhe come `Run 'copilot update'...` non compaiono più; viene mostrata solo la versione semantica.
- Copilot usage ora usa gli endpoint ufficiali GitHub per AI Credits e Premium Requests, aggrega il mese per modello e supporta account personali o organizzazioni quando il token dispone dei permessi richiesti. Il token opzionale viene conservato nel Secret Storage e non nei backup.
- Rafforzata la lettura quote Antigravity: normalizzazione degli ID `FIVE_HOUR`, parsing ricorsivo dei model config, alias di gruppo aggiuntivi, probe di summary/model/legacy endpoint, riconoscimento processi AGY e gestione separata dei token CSRF HTTPS/HTTP.
- Le sorgenti Antigravity parziali vengono fuse senza sovrascrivere il dato locale più affidabile. La UI mostra separatamente Gemini 5h/settimanale e Claude-GPT 5h/settimanale, indicando chiaramente quando sono state rilevate meno di quattro finestre.
- Il popover Utilizzo non comprime più Antigravity in una singola percentuale: mostra le singole fasce e offre azioni immediate per riprovare la lettura o collegare il billing GitHub.
- Aggiunti test core per versione Copilot, aggregazione billing, quattro finestre Antigravity, fallback legacy multi-pool e merge delle sorgenti; aggiornati gli smoke test per Agent Studio e usage popover.

# 0.11.0

- Aggiunto layer **Agenti custom**: profili globali/progetto sopra provider reali, con nome, bio, specializzazione, modello, thinking, istruzioni sicure, visibilità, deleghe, MCP dichiarativi e contatori task.
- Aggiunta selezione agente nella chat e menzioni `@agent[...]`; un agente viene tradotto internamente in provider/modello senza cambiare il core provider.
- Aggiunto gate unico di compatibilità modello/thinking prima delle esecuzioni root e delegate: Relay normalizza combinazioni non supportate invece di lanciare flag errati.
- Le deleghe possono indicare un custom agent tramite campo `agent`; Relay applica specializzazione e controlli senza permettere alle istruzioni dell’agente di rompere parser/protocolli.
- Backup, import e reset includono ora anche gli agenti custom.
- Aggiunto pulsante upgrade provider: usa l’installer ufficiale/idempotente, traccia terminale, verifica post-upgrade e conserva il flusso di login esistente.
- Aggiunti sorgenti `core/types.ts` e `core/provider.ts` per rendere lo zip sorgente più apribile e navigabile in VS Code.

# Changelog

## 0.10.0

- Relay ora si comporta come un ambiente multitasking esplicito: ogni chat è un job indipendente con stato visibile (In esecuzione, Completata · da leggere, Errore · da rivedere) nella libreria conversazioni e nel drawer cronologia.
- Micro-notifiche non invasive: pallino pulsante sulle chat in esecuzione, badge "da leggere" quando un task termina mentre si lavora altrove, badge errore dedicato; i badge spariscono aprendo la conversazione e sopravvivono al riavvio del webview.
- Nuova pill "N in corso" nella topbar con accesso diretto alla cronologia: colpo d'occhio immediato su quanti agenti stanno lavorando in background.
- Il footer del composer, durante un'esecuzione, offre "Nuova chat in parallelo" con un click: il flusso multi-task diventa la strada ovvia invece di una scoperta.
- Il timer di esecuzione ora avanza in tempo reale (aggiornamento chirurgico del solo label, nessun re-render che disturbi scroll o focus).
- Corretto: la conferma di "Accesso completo" usava window.confirm, inerte nella sandbox dei webview VS Code, rendendo l'opzione di fatto non selezionabile dal composer. Sostituita con una conferma inline esplicita a due passi.
- Impostazioni riorganizzate in sezioni espandibili (accordion) con solo "Generali" aperta al primo avvio; lo stato di apertura è persistente e rispetta le scelte dell'utente.
- Rifiniture di qualità percepita: animazioni di ingresso dei badge, numeri tabulari nei timer, focus visibile sugli accordion, pieno rispetto di prefers-reduced-motion.

## 0.9.2

- Rebuilt provider installation around tracked terminal executions: Relay now follows shell output when VS Code shell integration is available, captures the real exit code, surfaces progress, and shows actionable failures instead of silently polling for 90 seconds.
- Added a cross-platform exit-marker fallback when terminal shell integration is unavailable, while keeping the setup terminal visible and focused.
- Added automatic login handoff after a successful fresh install, plus explicit login progress, browser/device-code guidance, timeout handling, retry, and post-login provider verification.
- Antigravity CLI detection now distinguishes an installed-but-unauthenticated CLI and exposes the login action.
- Copilot authentication detection now recognizes environment credentials and an authenticated GitHub CLI; when authentication cannot be proven, Settings still exposes a safe “Gestisci accesso” action instead of hiding login controls.
- Usage refreshes now use a dedicated incremental `usageState` message and no longer rebuild the entire webview every cycle. Rule drafts and form focus are preserved.
- Added portable Relay backup and restore for conversations, rules, preferences, recent projects, CLI paths, local configuration, onboarding state, and the optional Antigravity usage bridge.
- Added a protected two-step “Cancella dati Relay” flow. It restores the previous Antigravity status-line configuration, resets Relay settings, and removes local Relay state without deleting project files, installed CLIs, or worktrees.
- Added tests for data-management actions and unknown Copilot authentication UI. Suite increased to 59 tests.

## 0.9.1

- Fixed GitHub Copilot `auto` runs: Relay no longer sends a reasoning effort to an automatically routed model.
- Added a compatibility retry for named Copilot models that reject `--effort`; Relay retries once without changing the task or session.
- Removed the invalid non-interactive Copilot `/usage` prompt, which could create plans/todos instead of returning account usage.
- Copilot account usage now uses the authenticated GitHub CLI billing endpoint and displays absolute AI credits or premium requests without inventing a percentage limit.
- Added direct Antigravity IDE language-server quota discovery, preferring the grouped Gemini and Claude/GPT weekly and five-hour pools shown in Settings > Models.
- Preserved status-line and AGY `/usage` fallbacks when the private Antigravity local API changes or is unavailable.
- Added dynamic browser/domain approval command discovery for the Antigravity native bridge. With Accesso completo, Relay attempts persistent `Always Allow` approval when the IDE exposes a callable command.
- Improved full-access UI copy and native bridge activity feedback around browser permissions.
- Added absolute-usage UI rows and coverage for Copilot credits.
- Suite increased to 57 tests.

## 0.9.0

- Added GitHub Copilot CLI as a fourth native provider.
- Added one-click Copilot installation for Windows, Linux, and macOS, with OAuth login handoff.
- Added dynamic Copilot model discovery, `auto` model routing, reasoning effort, sessions, permissions, usage parsing, and Relay delegation support.
- Relay can route light, standard, and complex delegated tasks to Copilot while considering provider capacity.
- Rules and `@mentions` now support Copilot alongside Codex, Claude Code, and Antigravity.
- Refined provider grids, composer focus, popovers, hover states, responsive layouts, and visual density without changing existing workflows.

## 0.8.1

- Rebuilt Rules Studio around a compact rule library and a closable editor; rules are no longer forced open on entry.
- Fixed rule deletion by moving confirmation to the native editor dialog and removing unreliable webview confirmation.
- Removed bundled/import-template actions from onboarding and Rules; old bundled starter rules are cleaned during migration while user/imported rules are preserved.
- Fixed Windows npm CLI resolution by preferring `.exe`/`.cmd`/`.bat` launchers over extensionless POSIX shims.
- Codex App Server now launches Windows `.cmd` shims through `cmd.exe`, fixing model, reasoning and usage discovery on native Windows.
- Added macOS resolver coverage for zsh, Homebrew, standalone installers, pnpm and common user paths.
- Added cross-platform launcher tests for Windows, macOS and Linux.
- Suite increased to 50 tests.

## 0.8.0

- Added the Antigravity IDE native bridge with runtime capability discovery.
- Relay can open/focus the Agent panel, inject `/browser` tasks without clipboard handoff, monitor completion through a structured workspace result, and return browser artifacts to the delegating agent.
- Added permission-aware Antigravity approvals: workspace-write may approve edit steps; terminal and destructive actions remain manual unless full access is selected.
- Added explicit native-bridge diagnostics for prompt injection, panel, submit and approval commands.
- Antigravity IDE and AGY CLI are now represented separately: the IDE bridge can be ready while onboarding still offers one-click CLI installation.
- Windows AGY detection now includes the official `%LOCALAPPDATA%\agy\bin\agy.exe` location even when the current process PATH is stale.
- After provider installation Relay updates its own PATH, saves the absolute executable path, and patches the visible setup terminal so the CLI is usable without reopening it.
- Suite increased to 45 tests.

## 0.7.2

- Antigravity `/usage` now uses a tall virtual TUI viewport and parses the real semantic `N% remaining` rows instead of progress-bar percentages.
- Gemini and Claude/GPT quota groups are preserved independently, including weekly and five-hour reset windows.
- Browser requests no longer pretend that AGY CLI controls a visible browser. Relay hands them to the Antigravity IDE Agent surface and copies a `/browser` prompt for the native Browser Subagent.
- Chat placeholder is now always `Scrivi qui, usa @ per menzionare`.
- Markdown tables render as responsive native tables with horizontal scrolling, headers, borders and file links.
- Antigravity provider capability metadata now correctly reports that the CLI adapter itself does not expose browser automation.
- Suite increased to 42 tests.

## 0.7.1

- Fixed invisible access and delegation controls in the composer.
- Fixed conversation deletion from history and project cards.
- Added archived-chat restore/delete management.
- Preserved Antigravity quota buckets across model families.
- Added an immediate visible browser waiting window for browser tasks.
- Redesigned the System Doctor card and added Chrome/Chromium detection.

## 0.7.0

### Browser visibility hotfix

- Browser tasks now use the explicit `/browser` instruction.
- Relay opens the detected localhost URL through the desktop shell so the test browser is visible to the user.
- AGY is instructed to emit the URL before browser interaction; Relay also detects localhost URLs as a fallback.
- Browser openings are recorded in Relay Diagnostics.

- kernel multipiattaforma per Windows, Linux, Ubuntu, WSL e workspace remoti;
- risoluzione CLI tramite PATH, login shell, PowerShell, `where.exe`, NVM/FNM/Volta e percorsi standard;
- installazione guidata e login dei provider mancanti, più System Doctor;
- pagina Progetti collassata di default, ricerca, massimo cinque elementi iniziali e caricamento progressivo;
- Rules Studio completo con scope globale/progetto, priorità, obbligatorietà e target provider multipli;
- mention composer per provider, file, directory, regole e conversazioni;
- link a file e percorsi inline apribili direttamente nell’editor;
- composer adattivo con controlli icon-first nelle sidebar strette e menu portali non tagliati;
- chiusura dei picker al click esterno e pulizia dei portali durante i re-render;
- routing dinamico di provider, modello e reasoning in base a complessità e quota;
- deleghe allo stesso provider, task multipli paralleli, dipendenze e scope file;
- worktree concorrenti per writer indipendenti e serializzazione automatica nei casi non sicuri;
- ID task globalmente univoci e ordine del piano preservato dopo l’esecuzione;
- parsing quote Antigravity ampliato per payload status-line annidati, gruppi modello e reset con secondi;
- suite portata a 38 test.

## 0.6.0

- onboarding ridisegnato in forma compatta e persistito anche nello stato globale dell’estensione;
- setup dei default responsive, con riepilogo quota coerente con la famiglia del modello Antigravity selezionato;
- composer icon-first per provider, permessi, deleghe e utilizzo, senza rimuovere i controlli nelle sidebar strette;
- rimosso il pulsante cronologia dalla testata; cronologia e cancellazione restano nella libreria conversazioni;
- cancellazione delle chat disponibile anche direttamente nelle schede progetto;
- pagina Progetti ulteriormente semplificata e resa chat-first;
- pagina Utilizzo uniformata tra provider, con finestre compatte, stato stale e feedback di refresh animato;
- refresh quota protetto da lock, conservazione dell’ultimo dato valido e aggiornamento automatico dopo ogni run;
- Antigravity quota separata per gruppi Gemini e Claude/GPT, con finestre 5 ore e settimanali;
- Antigravity 1.1.x corretto: rimosso il flag non supportato `--cwd`, sostituito con working directory del processo e `--add-dir`;
- probe Antigravity ridotto a un solo `/usage` per aggiornamento;
- classificazione uniforme delle finestre quota Codex e Claude;
- suite portata a 31 test.

## 0.5.0

- eliminato il salto visibile della chat durante streaming e aggiornamenti: lo scroll viene ripristinato prima del paint e il rendering dei delta è limitato;
- stato aperto di attività e task delegati persistente durante tutta l’esecuzione;
- nuova pagina Diagnostica con log strutturati, copia, esportazione e Output live;
- log correlati per provider, run e conversazione con oscuramento dei segreti comuni;
- pagina Progetti ridisegnata in forma minimale con conversazioni salvate visibili per ogni workspace;
- correzioni responsive per titoli lunghi di progetto e conversazione;
- Antigravity eseguito con `--cwd` esplicito e modalità `plan`, `accept-edits` o full access coerente con i permessi Relay;
- istruzioni browser native per usare `/browser` e Chrome DevTools, con richiesta di prove verificabili invece della sola apertura URL;
- heartbeat Antigravity prima del primo output e retry singolo per timeout transitori del backend;
- discovery ufficiale `agy models` con timeout breve e fallback non bloccante;
- focus composer rifinito senza outline azzurro nativo;
- errori chat collegati direttamente alla diagnostica;
- suite portata a 26 test.

## 0.4.0

- controlli chat/progetti/cronologia realmente collegati all’extension host;
- stato visibile prima del primo output e Stop reale dei processi Linux;
- protocollo Relay-native per deleghe agente-agente;
- worktree concorrenti con integrazione serializzata;
- cronologia completa e utilizzo provider dal composer.

## 0.3.0

- redesign dell’interfaccia e dell’onboarding;
- provider, modelli, thinking, quote, progetti e regole;
- compatibilità Codex legacy e moderna.
