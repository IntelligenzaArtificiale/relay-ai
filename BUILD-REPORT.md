# Relay 0.22.1 — Build Report

## Obiettivo

Correggere i problemi osservati nella web app remota 0.22.0 senza modificare pairing, Tailscale Funnel, store delle conversazioni o flussi provider:

1. file citati in Markdown non riconosciuti come download;
2. composer sovrapposto al task live;
3. anteprime statiche senza asset e applicazioni PHP/Node non interattive;
4. card file e live preview troppo grandi;
5. navigazione mobile sovraffollata e assenza delle Impostazioni remote.

## Diagnosi

### Artefatti

Il parser estraeva il target Markdown ma non normalizzava in modo completo percorsi URL-encoded come `%20`. Inoltre una directory citata non era una risorsa scaricabile. Il renderer Markdown mostrava il testo del link indipendentemente dall’artefatto rilevato.

### Preview

L’iframe sandbox non poteva usare in modo affidabile il cookie della sessione Relay. Asset assoluti, `fetch`, XHR, form e cookie dell’app locale non attraversavano tutti lo stesso proxy. Il risultato era HTML senza CSS oppure risposte `Sessione remota non valida` sulle interazioni.

### Composer

La posizione del composer dipendeva da un’altezza CSS fissa. Quando il task aggiungeva testo e controlli, il pannello copriva la parte inferiore della card live.

### Pallino/ovale negli screenshot

Il piccolo indicatore ambra cambia posizione fra gli screenshot e coincide con l’indicatore Android/Samsung “Mostra tocchi” o con l’overlay del registratore schermo. Non è generato da Relay. Sono stati comunque eliminati i contenitori HTML vuoti che potevano produrre pill prive di contenuto.

## Implementazione

### Download e Markdown

- normalizzazione e decodifica URI dei percorsi citati;
- associazione dei link Markdown agli artefatti della risposta;
- directory del workspace convertite in bundle ZIP limitati e filtrati;
- file sensibili, traversal e symlink escape restano bloccati;
- download tramite richiesta autenticata e Blob, senza dipendenza dal cookie del browser.

### Preview sicure e interattive

- nuovo endpoint `POST /api/preview-ticket` autenticato;
- capability URL casuale, temporaneo e circoscritto a sessione/conversazione/messaggio/artefatto;
- caricamento di HTML, CSS, JS, immagini e risorse relative;
- riscrittura di link assoluti, form, `fetch`, XHR, EventSource e History API;
- proxy di GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS verso il solo loopback;
- cookie dell’app locale conservati nel grant server-side e mai esposti alla pagina;
- revoca implicita del grant quando la sessione Relay viene chiusa;
- CSP sandbox e limiti di dimensione invariati.

### UI mobile

- righe risultato compatte, icone 32 px e azioni icon-only;
- gruppi collassabili con ZIP compatto;
- preview con header minimale, spinner ed errore inline;
- barra task compatta durante l’esecuzione;
- altezza composer misurata con `ResizeObserver` e applicata al padding del thread;
- bottom navigation: Chat, Progetti, Agenti, Auto, Altro;
- Altro contiene Utilizzo, Regole, MCP e Impostazioni;
- nuova pagina Impostazioni con aggiornamenti allowlistati e validati lato server.

## Sicurezza

- nessun percorso arbitrario viene accettato dagli endpoint artefatti;
- i ticket preview sono casuali, temporanei, scoped e invalidati con la sessione;
- destinazioni proxy limitate a `localhost`, `127.0.0.1` e `::1`;
- token/cookie Relay non vengono inoltrati all’app locale;
- impostazioni remote limitate a chiavi, enum e intervalli esplicitamente consentiti;
- nessuna modifica a Tailscale, sessioni persistenti o pairing.

## Test aggiunti/aggiornati

- percorsi Markdown assoluti con spazi URL-encoded;
- directory citata → ZIP sicuro;
- ticket preview statico senza cookie Relay nell’iframe;
- caricamento CSS collegato;
- form POST verso app locale;
- persistenza cookie applicativo server-side;
- impostazioni remote consentite e preferenze arbitrarie rifiutate;
- rendering compatto, preview ticket e composer durante run;
- regressioni Relay complete.

## Limiti del collaudo

La suite simula server statici e applicazioni HTTP locali, incluse form e sessioni cookie. Non è stato possibile eseguire il collaudo visuale finale su un telefono fisico tramite il Funnel Tailscale dell’utente. Il piccolo indicatore di tocco del sistema va disattivato dalle Opzioni sviluppatore/registratore del telefono, non dal codice Relay.

## Esito finale

```text
npm run typecheck  PASS
npm test           PASS
npm run build      PASS (eseguito dalla suite)
npm run package    PASS

247 controlli PASS
0 fallimenti
1 SKIP: integrazione nativa Windows `.cmd` su host Linux
```

Il VSIX è stato estratto e verificato:

```text
version:   0.22.1
publisher: intelligenza-artificiale-italia
name:      relay-agent-workspace
main:      ./dist/extension.js
archive:   integro
```
