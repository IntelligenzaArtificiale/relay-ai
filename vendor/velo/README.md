# velo

**Anonimizzazione locale e reversibile di testi italiani, senza modello.**

Zero dipendenze. 68 KB su disco. 233.000 caratteri al secondo su una CPU
qualsiasi. Il recall sul canale di fuga non e' misurato: e' garantito per
costruzione.

```bash
velo anonimizza atto.pdf.txt -o anonimo.txt -v vault.json
# incolli anonimo.txt nel modello remoto, ne copi la risposta
velo ripristina risposta.txt -v vault.json
velo audit atto.pdf.txt        # cosa verrebbe coperto, e perche'
```

---

## La tesi

Il lavoro parte da una critica precisa a `rizzo-pii`, il progetto italiano
piu' avanzato su questo problema, e ne eredita l'obiettivo: usare i modelli
di frontiera senza cedere i dati.

**1. L'F1 e' la metrica sbagliata per un presidio di riservatezza.**
Un micro-F1 di 0.989 e' un ottimo risultato per un classificatore. Per un
firewall significa che circa un identificativo su cento esce in chiaro: su
un atto con trecento entita' sono tre fughe per documento, non "il 99% di
successo". E gli errori non sono distribuiti a caso: cadono su cio' che il
modello ha visto poco in addestramento, cioe' il caso raro, cioe' proprio
il caso pericoloso.

**2. Il modello e' gia' ridondante dove conta.** Il README di rizzo-pii lo
dichiara: in produzione la rete neurale non lavora mai da sola, e *il
checksum ha la precedenza sulla previsione del modello*. Per codice
fiscale, partita IVA, IBAN, carte, email, telefono, importi e targhe il
verdetto lo da' gia' l'aritmetica. Quei 1,2 GB di pesi si pagano per le
classi in cui il modello e' anche piu' debole: CITY 0.962, ZIPCODE 0.952,
CREDITCARD 0.945, STREET 0.960.

**3. Il default va invertito.** Un rilevatore chiede "questo e' un dato
personale?" e quando non lo sa lascia passare. `velo` chiede "posso
dimostrare che questo NON e' un dato personale?" e quando non lo sa copre.
Il costo si sposta dal mancato rilevamento al sovra-mascheramento: il primo
e' irreversibile, il secondo si annulla col vault.

---

## Architettura: tre livelli, fiducia decrescente

| Livello | Cosa fa | Precisione |
|---|---|---|
| **1 — Prova** | CF (con omocodia), P.IVA, IBAN, Luhn | dimostrata dall'algoritmo |
| **1 — Formato** | email, telefono, CAP, targa, catasto, repertorio, importi, date | formato non ambiguo |
| **2 — Lessico** | frame giuridici ("il Sig. X", "nato a X", "con sede in X", "X S.r.l."), gazetteer nomi e comuni | alta, serve a etichettare |
| **3 — Residuo** | ogni parola maiuscola non riconducibile al lessico noto | copre per default |

Il livello 3 e' il punto. Non migliora una misura: cambia il tipo di
garanzia. Un nome che nessun gazetteer contiene — `Wojciech
Brzeczyszczykiewicz`, `Ndiaye Oumoulkhairy` — non ha bisogno di essere
riconosciuto per essere coperto, gli basta non essere lessico comune.

Due accorgimenti tengono basso il sovra-mascheramento:

- **Granularita' di parola.** In "Il Tribunale di Milano" si copre solo
  `Milano`, non l'intera locuzione: coprire piu' del necessario danneggia il
  ragionamento del modello remoto senza aggiungere riservatezza.
- **Evidenza interna al documento.** Se una parola compare anche minuscola
  altrove nello stesso testo, e' un nome comune, non un nome proprio. E' il
  documento a dirlo, senza bisogno di lessici.

---

## Il dividendo dell'architettura: i formati sporchi

Il testo che esce da un PDF non e' il testo che c'era nel PDF. L'estrazione
spezza i codici a fine riga, infila spazi nei numeri, separa la parte locale
dalla chiocciola.

Qui la scelta deterministica paga un dividendo che un modello statistico non
puo' avere: **per tutto cio' che ha un checksum si possono accettare
candidati larghissimi, con spazi e a-capo dovunque, senza perdere un grammo
di precisione** — perche' a decidere non e' il pattern, e' il mod-97. In un
modello statistico allargare il recall costa sempre precisione; qui no.

Casi verificati dai test:

```
Cell. 331 60052 21                        -> TELEFONO
Alex.ciciarelli @gmail.com                -> EMAIL
mario . rossi @ studio-legale . it        -> EMAIL
Cod. Fisc. RSS MRA 85M01 H501Q            -> CF
IBAN: IT60 X054 2811 1010 0000 0123 456   -> IBAN
IBAN IT60X05428-\n11101000000123456       -> IBAN (spezzato a capo)
P. IVA  00743 110 157                     -> PIVA
```

E, altrettanto importante, i **falsi positivi** che NON scattano:

```
Il conto 12345678901 e il codice 00743    -> nulla (checksum non superato)
Il codice 24122 non e' un CAP             -> nulla (manca l'etichetta)
Il Tribunale di Milano                    -> solo "Milano"
PEC m.rossi@pec.studio.it. Riferimento    -> email, senza "Riferimento"
```

---

## Verifica su PDF reale

Il test non usa PDF di persone vere: trattare PII reali per collaudare un
anonimizzatore sarebbe esattamente il problema che lo strumento esiste per
evitare. Si genera invece un PDF con impaginazione giustificata e
identificativi sintetici ma con **checksum realmente validi**, poi lo si
riestrae con `pypdf` — cosi' il testo attraversa davvero la pipeline di
estrazione e ne subisce gli artefatti (nomi spezzati a capo, spaziatura
irregolare).

Risultato: 15 tipi di entita' coperti, zero `IGNOTO` spuri, coreferenza
mantenuta anche quando la stessa entita' compare una volta intera e una
volta spezzata su due righe, round-trip verde.

---

## Numeri, e cosa significano

| | velo | rizzo-pii 0.3B |
|---|---|---|
| Peso su disco | 68 KB | ~1,2 GB (fp32) |
| RAM | trascurabile | 0,5–1,2 GB |
| Dipendenze | nessuna (solo stdlib) | PyTorch, transformers |
| Avvio | immediato | caricamento del modello |
| Velocita' | 233k caratteri/s (CPU) | forward pass su CPU |
| Garanzia di recall | per costruzione | misurata, micro-F1 0.989 |

**Onesta' sui confronti.** Peso, dipendenze e velocita' sono strutturali e
verificabili subito. Il confronto di *accuratezza* non e' un testa a testa:
non ho eseguito rizzo-pii sugli stessi documenti, e non lo pretendo. La
differenza che rivendico e' di **tipo di garanzia**, non di punteggio: un
F1 di 0.989 misurato su frasi brevi non dice cosa succede al nome raro nel
documento lungo, mentre il residual guard non ha bisogno di dirlo perche'
quel nome lo copre comunque.

---

## Limiti, dichiarati

- **Il sovra-mascheramento e' reale** e dipende dalla qualita' della
  whitelist (oggi 952 voci). Su prosa non giuridica scatta piu' spesso. E'
  il prezzo consapevole della garanzia; si riduce ampliando i lessici, che
  sono file di testo, non codice.
- **Solo italiano.** I frame sono quelli del giuridico italiano.
- **Non estrae dai PDF**: prende testo. L'estrazione la fa `pypdf` o simili.
- **La reversibilita' e' canonica, non byte-esatta**: valori identici a meno
  degli spazi condividono il segnaposto, per non spezzare la coreferenza.
  Scelta documentata in `vault.py`, coperta dai test.
- **I gazetteer sono di partenza**, non esaustivi. Non incidono sul recall
  (garantito dal livello 3) ma sulla qualita' delle etichette.

---

## Struttura

```
velo/
├─ checksums.py    validatori matematici (CF con omocodia, P.IVA, IBAN, Luhn)
├─ recognizers.py  livello 1: riconoscitori deterministici
├─ sporco.py       livello 1 tollerante: testo spezzato da PDF/OCR
├─ frames.py       livello 2: frame giuridici e gazetteer
├─ residual.py     livello 3: residual guard deny-by-default
├─ tokens.py       tokenizzazione posizionale
├─ spans.py        modello degli span e risoluzione sovrapposizioni
├─ vault.py        mappa reversibile, ripristino tollerante
├─ engine.py       orchestrazione dei tre livelli
├─ cli.py          anonimizza / ripristina / audit
└─ data/           lessici (file di testo: dati, non codice)
```

Nessun file supera le 220 righe. 58 test, tutti verdi.

## Licenza

MIT.
