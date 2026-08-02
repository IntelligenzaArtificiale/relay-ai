# velo — progress

## Criteri di accettazione (contratto dev-goal)

| # | Criterio | Stato | Come verificato |
|---|----------|-------|-----------------|
| 1 | Validatori matematici: CF (omocodia), P.IVA, IBAN, Luhn | FATTO | 26 test + invarianti ufficiali della tabella CF |
| 2 | Layer 1 deterministico (14 tipi) | FATTO | test_engine.TestIdentificativiPuliti |
| 3 | Layer 2 lessicale: nomi, ORG, luoghi, indirizzi | FATTO | round-trip su atto notarile |
| 4 | Layer 3 residual guard deny-by-default | FATTO | TestResidualGuard (nomi stranieri ignoti) |
| 5 | Risoluzione overlap, nessuna sovrapposizione | FATTO | invariante in risolvi_sovrapposizioni |
| 6 | Vault: segnaposto stabili, coreferenza | FATTO | test_stesso_valore_stesso_segnaposto |
| 7 | Restore tollerante a drift | FATTO | 5 forme sporche + formattazione esterna |
| 8 | CLI anonimizza/ripristina/audit | FATTO | eseguita end-to-end |
| 9 | Zero dipendenze, zero pesi | FATTO | 68 KB, solo stdlib |
| 10 | Test verdi + round-trip su atto | FATTO | 58/58 |
| 11 | Nessun file > 400 righe | FATTO | massimo 219 (sporco.py) |
| 12 | Benchmark documentato | FATTO | 233k caratteri/s, 46k caratteri in 200 ms |
| 13 | Formati sporchi da PDF | FATTO | 8 test dedicati |
| 14 | Prova su PDF vero estratto | FATTO | PDF giustificato -> pypdf -> motore |

## Bug reali trovati e corretti (non aggirati)

1. Fixture CF inventate a memoria: la tabella era giusta, lo erano i test.
   Verificata con i due invarianti ufficiali, ora test permanenti.
2. `re.IGNORECASE` sui frame annullava il vincolo di maiuscola in `_NOME`:
   "il" veniva inghiottito come cognome. Sostituito con `(?i:...)` locale.
3. `sequenze_maiuscole` scavalcava la punteggiatura: "Alessandro Ferraris,
   Notaio" diventava un unico nome. Ora il separatore dev'essere spazio.
4. Residual guard copriva l'intero gruppo maiuscolo invece della sola
   parola ignota ("Il Tribunale di Milano" invece di "Milano").
5. `_SEP[1:-1]` lasciava dentro la parentesi quadra di chiusura e troncava
   la classe di caratteri: CF e P.IVA sporchi non venivano mai trovati.
   Sostituito con una costante esplicita.
6. `_compatta` toglieva i punti anche dalle email ("gmail.com" ->
   "gmailcom"): separata `_compatta_spazi`.
7. TLD email `[A-Za-z]{2,}` scavalcava il punto fermo e inghiottiva la
   parola successiva. Ora `{2,6}\b`.
8. Falso positivo CAP: qualunque numero di 5 cifre dopo uno spazio.
   Ora serve l'etichetta o un comune subito dopo.
9. Falso positivo telefono: mancava il confine sinistro, il pattern pescava
   "345678901" dentro "12345678901".
10. Vault: due forme della stessa entita' (una spezzata a capo dal PDF)
    rompevano il round-trip. Risolto memorizzando il valore canonico,
    scelta documentata invece che nascosta.

## Stato: completo.
