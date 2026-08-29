# Audit feedback Simone - sessione Relay del 10 agosto 2026

## Scopo

Questo documento analizza la chiamata con Simone De Ruggiero del 10 agosto 2026, dalle 18:45 alle 19:57 circa, e collega i problemi osservati alla codebase Relay `0.23.6` (`19f3d04`). Non contiene modifiche applicative.

La trascrizione automatica contiene diversi errori di riconoscimento. Le conclusioni sotto usano il contesto operativo, gli orari e il comportamento descritto; le frasi non affidabili non vengono trattate come requisiti letterali.

## Sintesi

| ID | Segnalazione | Priorita | Stato nell'attuale codebase |
|---|---|---:|---|
| SIM-01 | Antigravity fallisce per policy headless finche AGY non viene avviato/configurato manualmente | Alta | Parzialmente gestito, onboarding non conclusivo |
| SIM-02 | Una regola mostrata da `/` non era selezionabile o non risultava applicata | Alta | Corretto in `0.23.6`, da coprire con test UI comportamentale |
| SIM-03 | Indicatore arancione dei job sfarfalla quando piu run lavorano | Media | Causa plausibile ancora presente |
| SIM-04 | Il pulsante dei job in corso non apre direttamente la chat interessata | Media | Confermato dal codice |
| SIM-05 | L'attivita di delega scompare al completamento | Media | Comportamento intenzionale ma feedback UX valido |
| SIM-06 | L'editor delle regole perde il focus mentre si scrive | Alta | Causa strutturale confermata |
| SIM-07 | Selettore provider/modello intermittente o visivamente instabile | Media | Segnalazione reale, causa non dimostrabile dalla trascrizione |
| SIM-08 | Le deleghe oltre il limite globale restano in coda senza spiegazione sufficiente | Media | Confermato come gap di osservabilita/configurazione |
| SIM-09 | Accesso remoto a volte lento e con anomalie visive | Media | Da riprodurre; architettura coinvolta identificata |
| SIM-10 | Possibilita di modificare dal prompt il comportamento di una regola invocata | Bassa | Requisito prodotto, non bug osservato |

## SIM-01 - Antigravity bloccato dalla policy headless o dal primo avvio

**Evidenza chiamata:** tra le 18:57 e le 19:06 Simone riferisce che il problema avviene solo con Gemini/Antigravity e mostra l'errore relativo a un'operazione negata dalla policy headless. Il run torna a funzionare dopo l'avvio manuale di `agy` nel terminale. Il test viene ripetuto anche in un altro progetto.

**Impatto:** Antigravity puo risultare disponibile nell'interfaccia ma fallire al primo task reale. L'utente deve scoprire autonomamente che serve inizializzare o autorizzare la CLI dal terminale.

**Analisi codebase:**

- `AntigravityProvider.detect()` considera la CLI operativa quando `agy --version` funziona e l'output di `agy models` non segnala esplicitamente un login mancante. Non esegue un vero smoke test headless innocuo. Vedere `src/providers/antigravity-provider.ts:45-122`.
- La probe chiamata `smoke` riusa il booleano `available`; non prova una richiesta reale. Questo permette un falso positivo: binario rilevato, ma profilo non inizializzato o policy non pronta.
- `AntigravityProvider.run()` usa sempre il percorso non interattivo con `--output-format stream-json`; scrive preventivamente regole nel file `~/.gemini/antigravity-cli/settings.json`. Vedere `src/providers/antigravity-provider.ts:247-346`.
- L'errore headless viene riconosciuto solo dopo l'esecuzione e chiude il run con `PROVIDER_PERMISSION_DENIED`. Vedere `src/providers/antigravity-provider.ts:364-375` e `isAntigravityHeadlessPermission()` a `:444-445`.
- Per accesso completo viene passato `--dangerously-skip-permissions`; negli altri modi Relay aggiunge soltanto `write_file(<workspace>)`, non tutte le operazioni che il modello puo tentare. Vedere `antigravityPermissionArgs()` e `antigravityPermissionRules()` a `:454-488`.
- Il setup/onboarding mostra lo stato del provider derivato dalla detection, quindi eredita il falso `ready`. Superficie: `src/ui/screens/onboarding.ts`, `src/services/relay-controller.ts:2618-2630`, `src/services/relay-controller.ts:2914-2925`.

**Diagnosi:** il punto principale non e il singolo comando negato, ma la differenza tra "CLI trovata" e "CLI realmente pronta per una sessione headless". L'avvio manuale di AGY ha probabilmente completato uno stato iniziale o un consenso che la detection non verifica.

**Test necessari:** installazione/profilo AGY pulito su macOS, Linux e Windows; detection prima del primo avvio interattivo; smoke headless senza strumenti; task read-only, workspace e full access; cambio workspace senza nuova inizializzazione manuale.

## SIM-02 - Regola slash visibile ma non selezionabile/applicata

**Evidenza chiamata:** alle 18:57 Simone afferma che la voce compare dopo `/`, ma inizialmente "non me la fa prendere". Piu avanti viene creata e invocata una nuova regola per le deleghe multiturno.

**Stato attuale:** la causa storica risulta corretta nel commit `19f3d04` (`0.23.6`). Prima il ramo slash enumerava soltanto skill e MCP. Ora include `state.rules` e serializza una mention strutturata di tipo `rule`.

**Superficie attuale:**

- Costruzione opzioni: `src/ui/screens/chat.ts:1175-1203`.
- Selezione e serializzazione intervalli: `src/ui/screens/chat.ts:1234-1305`.
- Tipo persistito: `src/core/types.ts`, `ConversationMentionKind`.
- Normalizzazione payload e applicazione contenuto: `src/services/relay-controller.ts:1339-1398` e `:4280` circa.
- Composizione prompt: la regola selezionata precede `# Current user request`, in `src/services/relay-controller.ts:1228-1235`.

**Rischio residuo:** il test corrente in `test-relay-regressions.mjs` verifica soprattutto la presenza delle stringhe nel sorgente. Manca un test DOM che digiti `/`, selezioni con mouse e tastiera, invii, ricostruisca la mention dopo un rerender e verifichi il contenuto effettivo ricevuto dal provider.

## SIM-03 - Sfarfallio dell'indicatore arancione dei job

**Evidenza chiamata:** tra le 19:03 e le 19:04 Simone descrive un lampeggio molto rapido. Durante il test con piu chat attive viene formulata l'ipotesi che le animazioni si sovrappongano.

**Analisi codebase:** Relay visualizza contemporaneamente piu indicatori animati per lo stesso stato operativo:

- pill globale dei job: `src/ui/screens/workspace.ts:72-79`, classe `.topbar-jobs__pulse`;
- stato della conversazione nel drawer: `src/ui/screens/workspace.ts:247-262`, classe `.conversation-item__status-pulse`;
- stato live nel messaggio: `.live-state__dot` in `src/ui/webview.css:276-278`;
- barra run: `.run-pulse::after` in `src/ui/webview.css:280-283`;
- task di delega: `.task-status__pulse` in `src/ui/webview.css:774-780`.

Tutti riusano animazioni pulsanti ma con durate differenti. Inoltre gli state snapshot possono ricostruire l'intera UI tramite `root.replaceChildren()` in `src/ui/webview.ts:479-507`, facendo ripartire le animazioni da zero. Con due o piu run, le fasi si riallineano e si disallineano a ogni render, producendo l'effetto osservato.

**Stato:** causa plausibile e ancora presente. Non e disponibile una registrazione video per confermare quale indicatore specifico lampeggiasse.

**Test necessari:** screenshot/video Playwright con due e sei run simulati; conteggio dei nodi animati; verifica che gli aggiornamenti di stato non ricreino topbar e drawer; test `prefers-reduced-motion` gia parzialmente coperto dal CSS.

## SIM-04 - Il contatore dei job non porta alla chat attiva

**Evidenza chiamata:** alle 19:03 Simone riferisce che cliccando l'indicatore del lavoro in corso non sempre arrivava alla chat corrispondente.

**Causa confermata:** il click della pill globale esegue soltanto:

```ts
runtime.historyOpen = true;
runtime.render();
```

in `src/ui/screens/workspace.ts:72-79`. Non seleziona un `conversationId`. Se esistono piu chat, l'utente riceve un drawer generico e deve individuare manualmente quella attiva.

Le righe delle conversazioni invece possiedono il comportamento corretto e inviano `selectConversation` (`src/ui/screens/workspace.ts:247-270`). Il gap e quindi circoscritto al CTA globale.

**Nota di prodotto:** con un solo job il comportamento atteso puo essere apertura diretta; con piu job il drawer dovrebbe filtrare o mettere in cima le chat attive.

## SIM-05 - Dettagli della delega rimossi appena il run termina

**Evidenza chiamata:** alle 18:58 Simone nota che le informazioni operative scompaiono quando termina tutto. Il valore del lavoro parallelo e percepito come alto, quindi la perdita del dettaglio riduce comprensibilita e auditabilita.

**Causa confermata:** `delegationIsVisible()` restituisce `true` soltanto per deleghe pending/running o task ancora pendenti (`src/ui/screens/chat.ts:1455-1457`). Le deleghe completate o fallite scompaiono dalla timeline anche se i record restano nella conversazione o nella diagnostica.

**Classificazione:** non e perdita dati confermata, ma una scelta UX in conflitto con il feedback. La diagnostica tecnica non sostituisce un riepilogo leggibile nel contesto della risposta.

**Test necessari:** persistenza di un riepilogo collassato dopo successo, fallimento parziale e cancellazione; nessun duplicato con il messaggio finale integrato.

## SIM-06 - Perdita di focus nell'editor delle regole

**Evidenza chiamata:** alle 19:17-19:18 Simone descrive che, mentre scrive nei blocchi di testo, il campo si chiude o perde il focus e deve essere cliccato nuovamente.

**Causa strutturale confermata:**

- Il renderer globale salva il focus soltanto se l'elemento attivo ha un `id`: `src/ui/webview.ts:663-669`.
- Gli input e textarea creati da `textInput()` e `textArea()` non ricevono alcun `id`: `src/ui/screens/rules.ts:581-601`.
- Ogni state snapshot che porta a `scheduleRender()` ricostruisce tutta la root con `root.replaceChildren()`: `src/ui/webview.ts:479-507`.
- Dopo la ricostruzione `restoreTransientUi()` non puo ritrovare il campo privo di ID: `src/ui/webview.ts:686-723`.
- L'editor conserva il contenuto nel draft tramite listener `input`, quindi il testo puo sopravvivere mentre focus e selezione vengono persi: `src/ui/screens/rules.ts:330-339`.

**Trigger probabili:** refresh provider/usage, aggiornamenti run in background, sincronizzazione skill, stato remoto o qualsiasi `emitState()` durante l'editing.

**Test necessari:** digitazione continua nell'editor mentre arrivano snapshot e delta di un run in background; verifica di node identity, focus e posizione caret per nome, descrizione e istruzioni.

## SIM-07 - Selettore provider/modello intermittente

**Evidenza chiamata:** alle 19:00 Simone segnala "questo ogni tanto bug" mentre seleziona Antigravity/modello; durante la dimostrazione il problema non rimane stabile.

**Superficie impattata:**

- costruzione picker provider/agente: `src/ui/screens/chat.ts:735-777`;
- picker modello e reasoning: `src/ui/screens/chat.ts:779-815`;
- helper `composerPicker()` e menu portaled: `src/ui/screens/chat.ts:1336-1411`;
- rerender globale e rimozione menu portaled: `src/ui/webview.ts:494-507`.

**Ipotesi tecnica:** un aggiornamento di stato mentre il `<details>` e aperto elimina il menu portaled e ricrea il composer. Questo puo apparire come menu che si chiude, selezione che lampeggia o valore che torna indietro. La trascrizione non consente di stabilire quale variante sia avvenuta.

**Stato:** segnalazione valida ma non abbastanza deterministica per dichiarare una root cause definitiva.

**Dati mancanti:** video, provider/modello precedente e successivo, evento che arriva nello stesso istante, dump DOM prima/dopo.

## SIM-08 - Limite di concorrenza nascosto durante deleghe numerose

**Evidenza chiamata:** tra le 19:08 e le 19:13 viene richiesta una regola con sei agenti. La delega sembra non partire correttamente finche il limite nelle impostazioni dell'estensione viene alzato da 3 a 12.

**Analisi codebase:**

- Il default globale e `relay.parallelism.maxRuns = 3`: `package.json:116-121`.
- Il controller inizializza `RunScheduler` con quel valore: `src/services/relay-controller.ts:267-268`.
- Lo scheduler mette ogni run in coda e ne avvia al massimo `maxParallel`: `src/services/run-scheduler.ts:27-32` e `:76-107`.
- Lo snapshot espone `active`, `queued` e `maxParallel`, ma la chat non spiega che una delega richiesta e stata limitata dal cap globale: `src/services/run-scheduler.ts:68-73`.

**Classificazione:** il limite e corretto come protezione, ma l'UX e insufficiente. Una richiesta da sei agenti non deve sembrare bloccata; deve mostrare chiaramente `3 attivi, 3 in coda` e il motivo.

**Test necessari:** deleghe con numero task maggiore del cap; modifica cap a runtime; cancellazione di task in coda; assenza di starvation; indicazione del limite nella timeline.

## SIM-09 - Accesso remoto lento o con anomalie visive

**Evidenza chiamata:** alle 18:56 Simone dice di aver usato il remoto al mare; lo descrive come a volte lento e con qualche problema visivo, senza frequenza o scenario preciso. Non segnala una perdita dati specifica.

**Architettura coinvolta:**

- Stato live tramite SSE: `src/services/remote-access-server.ts:870-888`.
- Broadcast raggruppato a 25 ms: `src/services/remote-access-server.ts:937-964`.
- Client remoto con patch della chat, EventSource e polling di recupero ogni 30 secondi: `src/services/remote-app.ts:2996-3084`.
- In caso di snapshot incompleto il client esegue un nuovo fetch dopo 40 ms; in caso di errore usa backoff fino a 12 secondi: `src/services/remote-app.ts:3031-3072`.

**Possibili fattori:** rete mobile, riconnessioni SSE, payload di stato completo molto grande, patch chat frequenti durante streaming e sovrapposizione tra SSE e polling. Nessuno di questi e dimostrato dalla sola chiamata.

**Stato:** feedback di qualita da trasformare in una sessione diagnostica dedicata, non bug con root cause gia nota.

**Metriche necessarie:** dimensione payload, frequenza broadcast, tempo `state -> paint`, numero riconnessioni, memoria DOM, test con rete lenta/intermittente e conversazioni lunghe.

## SIM-10 - Override esplicito di una regola dal prompt

**Evidenza chiamata:** tra le 19:09 e le 19:10 viene discusso il caso in cui una regola prescrive piu provider ma l'utente vuole saltarne uno per quota esaurita.

**Stato attuale:** il contenuto della mention strutturata viene aggiunto prima di `# Current user request` (`src/services/relay-controller.ts:1228-1235`). Questo rende tecnicamente possibile che la richiesta corrente specifichi un'eccezione, ma non esiste una policy formale di precedenza tra regola, regola mandatory e istruzione utente.

**Classificazione:** requisito prodotto da formalizzare. Non e stato osservato un fallimento nella chiamata.

**Rischio:** comportamento diverso tra provider, soprattutto se una regola e anche pubblicata come skill nativa o marcata `mandatory`.

## Osservazioni escluse dai bug Relay

### Consumo anomalo Claude/Fable/Opus

Simone segnala un consumo insolitamente rapido della finestra Claude. Nella chiamata non viene mostrato raw usage del provider ne una discrepanza tra valore upstream e valore Relay. Va registrato come possibile problema upstream/account o come uso costoso del modello, non come bug Relay.

Superficie Relay da usare in una futura diagnosi: provider usage parser, cache e UI usage; senza raw input non e possibile attribuire la causa.

### Qualita e lentezza dei modelli grandi

La discussione su Fable/Opus, qualita grafica, over-delivery e codice eccessivo riguarda comportamento e costo dei modelli. Sono feedback utili per routing e default, ma non bug tecnici dell'estensione.

### Chrome indicato come controllato da software automatizzato

Il banner del browser compare per l'uso di Chrome DevTools MCP. E comportamento atteso del browser automatizzato, non evidenza di compromissione o bug Relay.

## Priorita consigliata per un task successivo

1. **SIM-06:** stabilita degli editor e conservazione focus/caret.
2. **SIM-01:** detection/onboarding AGY basati su reale prontezza headless.
3. **SIM-04 e SIM-03:** navigazione job e rimozione dello sfarfallio.
4. **SIM-08 e SIM-05:** osservabilita di coda e deleghe completate.
5. **SIM-07 e SIM-09:** riproduzione strumentata prima di correggere.

## Matrice file impattati

| File | Aree coinvolte |
|---|---|
| `src/providers/antigravity-provider.ts` | Detection, autenticazione implicita, permessi headless, stream e classificazione errori |
| `src/ui/screens/onboarding.ts` | Stato pronto/non pronto dei provider e azioni setup |
| `src/services/relay-controller.ts` | Stato provider, regole invocate, run/deleghe, emissione snapshot |
| `src/ui/screens/chat.ts` | Autocomplete slash, picker provider/modello, timeline deleghe, composer |
| `src/ui/screens/rules.ts` | Editor regole, draft, input privi di ID, perdita focus |
| `src/ui/screens/workspace.ts` | Pill job, drawer cronologia, navigazione conversazioni, badge run |
| `src/ui/webview.ts` | Rerender globale, focus/caret, patch degli eventi run |
| `src/ui/webview.css` | Animazioni concorrenti e indicatori live |
| `src/services/run-scheduler.ts` | Coda e cap globale dei run |
| `package.json` | Default `relay.parallelism.maxRuns` |
| `src/services/remote-access-server.ts` | SSE e broadcast stato remoto |
| `src/services/remote-app.ts` | Patch chat mobile, polling e riconnessione |
| `test-relay-regressions.mjs` | Copertura statica delle regole slash; insufficiente per interazioni reali |

## Conclusione

I problemi piu solidi emersi dalla chiamata sono: falso stato di prontezza AGY rispetto al suo uso headless, perdita di focus negli editor ricreati, CTA dei job che apre una cronologia generica, animazioni multiple che possono ripartire a ogni render e scarsa visibilita della coda quando le deleghe superano il limite globale.

La regressione slash/regole risulta gia corretta nella `0.23.6`, ma necessita ancora di un test end-to-end del composer. I problemi remoto e picker richiedono prima una riproduzione con traccia temporale: la trascrizione dimostra il feedback, non la causa.
