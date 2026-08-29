# Relay 0.21.2 — Build report

## Obiettivo

Rendere i risultati prodotti sul computer utilizzabili dalla web app remota senza pubblicare il filesystem e senza introdurre un secondo server pubblico:

- download dei file creati o citati nelle nuove risposte;
- anteprima di siti HTML statici;
- accesso da telefono a applicazioni Node/PHP o altri servizi realmente in ascolto su loopback;
- archivio ZIP per risultati composti da più file;
- rimozione dalla timeline desktop delle deleghe già concluse e integrate nella risposta finale.

## Cause osservate

La chat remota riceveva soltanto il testo dei messaggi. I percorsi Markdown prodotti dai provider puntavano al filesystem del computer e quindi non erano apribili dal telefono. Allo stesso modo, un URL `localhost` avviato sul PC indicava il telefono stesso, non il computer collegato. Le deleghe, invece, erano persistite e renderizzate anche dopo il completamento, perciò restavano sopra alla risposta finale pur non rappresentando più attività live.

## Architettura introdotta

### Indice artefatti conversazione

Il modulo `src/services/remote-artifacts.ts` indicizza in modo deterministico:

- `changedFiles` restituiti dal provider;
- file modificati dalle deleghe;
- file emersi dai diff del run;
- percorsi realmente citati nella risposta finale;
- URL HTTP/HTTPS su `localhost`, `127.0.0.1` o `::1` realmente osservati.

Gli artefatti vengono salvati come metadati del messaggio assistente. Non vengono salvati contenuti binari nello store delle conversazioni.

Tipi supportati:

- `file`;
- `static-site`;
- `local-service`;
- `bundle`.

### Endpoint autenticati

Il server remoto esistente espone due famiglie di route, protette dalla normale sessione Relay:

- `/api/artifacts/<conversation>/<message>/<artifact>` per download e ZIP;
- `/preview/<conversation>/<message>/<artifact>/...` per anteprima statica o proxy loopback.

Non esiste un endpoint che accetta percorsi arbitrari. Il client invia soltanto ID di artefatti già persistiti nella conversazione.

### Sicurezza

- risoluzione con `realpath` e verifica che ogni file resti nel workspace;
- blocco di traversal e symlink escape;
- esclusione di `.env*`, chiavi/certificati privati, credenziali, `.git`, `.ssh`, `.relay`, `node_modules`, `.npmrc`, `.pypirc` e `.netrc`;
- proxy consentito soltanto verso host loopback;
- cookie e header Relay non inoltrati all’app locale;
- `Set-Cookie` del servizio locale non propagato al dominio Relay;
- anteprime isolate tramite CSP `sandbox` senza `allow-same-origin`;
- ZIP generato in memoria, con limite di 80 file e 64 MB.

### Delivery provider

Quando il remoto è attivo, Relay aggiunge al protocollo una breve istruzione per:

- citare i file realmente creati o aggiornati;
- indicare l’esatto URL loopback soltanto se un server web è stato realmente avviato o testato;
- non inventare porte;
- non usare `0.0.0.0` come URL da consegnare;
- non esporre segreti.

### Deleghe desktop

Le card delle deleghe sono ora renderizzate soltanto negli stati di approvazione/esecuzione (`pending`, `queued`, `running`). Quando il child run è terminale e la risposta finale è disponibile, la card viene rimossa invece di restare sopra al risultato integrato.

## File sorgente modificati

- `src/core/types.ts`
- `src/services/relay-controller.ts`
- `src/services/remote-access-server.ts`
- `src/services/remote-app.ts`
- `src/services/remote-artifacts.ts` — nuovo
- `src/ui/screens/chat.ts`
- `test-core-entry.ts`
- `test-remote-app-syntax.mjs`
- `test-smoke.js`
- `test-relay-regressions.mjs`
- `package.json`
- `package-lock.json`
- `readme.md`
- `changelog.md`

## Verifiche eseguite

```text
npm run typecheck  PASS
npm test           PASS
npm run build      PASS
npm run package    PASS

204 controlli PASS
0 fallimenti
1 SKIP
```

Lo skip riguarda il test d’integrazione nativo dei wrapper Windows `.cmd`, non eseguibile sull’host Linux usato per la build. Tutti i test specifici di questa release sono stati eseguiti.

Copertura aggiunta:

- scoperta di file, siti statici, servizi loopback e bundle;
- esclusione dei segreti e blocco del traversal;
- download autenticato;
- preview HTML con asset root-relative e CSP sandbox;
- proxy di un’app HTTP in ascolto su loopback;
- ZIP scaricabile;
- rifiuto di artefatti sconosciuti;
- rendering delle card mobile;
- scomparsa delle deleghe completate dopo la risposta finale.

## Ispezione pacchetto

- versione interna VSIX: `0.21.2`;
- bundle `dist/extension.js` e `dist/webview.js` ricostruiti;
- archivio VSIX estratto e verificato;
- SHA-256 VSIX: `b40511d23b9a4fc492f3debc15794ffbc9bbe9f569a24c26dc0866067a3f4668`.

## Limitazioni residue

- Le card vengono create per le nuove risposte completate con Relay 0.21.2; i vecchi messaggi non vengono retro-indicizzati automaticamente.
- Un file HTML può essere aperto immediatamente come sito statico. Un’app Node/PHP richiede invece che il relativo processo locale sia realmente in esecuzione e che il provider comunichi o emetta il suo URL loopback.
- Il proxy copre HTTP/HTTPS e gli asset standard. WebSocket, HMR e protocolli di sviluppo speciali non sono garantiti in questa versione.
- Se un provider non restituisce file modificati, non produce diff e non cita alcun percorso, Relay non inventa artefatti.
- Il collaudo automatico non sostituisce una verifica finale su telefono fisico attraverso Tailscale Funnel; non è stato effettuato un test end-to-end con account e rete mobile reali in questo ambiente.

## Verifica manuale consigliata

1. Installare il VSIX e usare `Developer: Reload Window`.
2. Aprire una sessione remota LAN o Funnel e creare una nuova chat.
3. Chiedere la creazione di un file `.md`: verificare la card **Scarica** sul telefono.
4. Chiedere un piccolo sito HTML: verificare **Apri** e **Scarica**.
5. Chiedere l’avvio di una vera app locale: verificare che il processo resti attivo e che **Apri** funzioni attraverso l’URL Relay/Tailscale.
6. Avviare una delega: verificare la card durante il lavoro e la sua scomparsa dopo l’integrazione della risposta finale.
