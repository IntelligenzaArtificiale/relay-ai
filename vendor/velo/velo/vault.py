"""Vault: la mappa segnaposto -> valore reale.

Due proprieta' non negoziabili:

1. **Stabilita'.** Lo stesso valore riceve sempre lo stesso segnaposto
   nell'intero documento. Se "Mario Rossi" comparisse come [FULLNAME_1] e
   poi come [FULLNAME_7], il modello remoto perderebbe la coreferenza e
   ragionerebbe su due persone diverse. La riservatezza non deve costare
   l'utilita'.

2. **Reversibilita' tollerante.** La risposta del modello remoto non
   restituisce i segnaposto intatti: li mette in grassetto, ci aggiunge
   spazi, cambia le maiuscole, li spezza a fine riga. Il ripristino deve
   riconoscerli lo stesso, altrimenti il giro completo si rompe proprio
   nell'ultimo passaggio.
"""

import json
import re
from dataclasses import dataclass, field

# Riconosce [ETICHETTA_n] anche sporcato da markdown, spazi e maiuscole miste.
_SEGNAPOSTO = re.compile(
    r"[\[\(\{]\s*[*_`~]*\s*([A-Za-z_]+?)\s*[_\-\s]\s*(\d+)\s*[*_`~]*\s*[\]\)\}]"
)


@dataclass
class Vault:
    """Contiene la corrispondenza fra segnaposto e valori reali."""

    per_segnaposto: dict[str, str] = field(default_factory=dict)
    _per_valore: dict[tuple[str, str], str] = field(default_factory=dict)
    _contatori: dict[str, int] = field(default_factory=dict)

    def segnaposto_per(self, etichetta: str, valore: str) -> str:
        """Restituisce il segnaposto del valore, creandolo se e' la prima volta.

        La chiave e' (etichetta, valore normalizzato): "Mario Rossi" e
        "MARIO ROSSI" sono la stessa persona e devono condividere il
        segnaposto, altrimenti la coreferenza si perde.

        SCELTA DI PROGETTO, con un compromesso reale. Il valore memorizzato
        e' quello *canonico*, con gli spazi interni normalizzati. Motivo: un
        PDF spezza "Via Giuseppe Garibaldi 24" a meta' riga, quindi la stessa
        entita' compare nel documento con due forme diverse. Se le trattassimo
        come valori distinti avremmo due segnaposto per un solo indirizzo e il
        modello remoto crederebbe che siano due luoghi.

        Il prezzo e' che il ripristino non e' identico byte per byte
        all'originale: restituisce l'indirizzo su una riga sola. Per l'uso
        vero — ripristinare i segnaposto nella RISPOSTA del modello, che e'
        testo nuovo — questa e' la forma desiderata, non una perdita.
        """
        canonico = " ".join(valore.split())
        chiave = (etichetta, canonico.casefold())
        esistente = self._per_valore.get(chiave)
        if esistente is not None:
            return esistente

        progressivo = self._contatori.get(etichetta, 0) + 1
        self._contatori[etichetta] = progressivo
        segnaposto = f"[{etichetta}_{progressivo}]"

        self._per_valore[chiave] = segnaposto
        self.per_segnaposto[segnaposto] = canonico
        return segnaposto

    def ripristina(self, testo: str) -> str:
        """Rimette i valori reali al posto dei segnaposto.

        Tollerante: normalizza la forma del segnaposto prima di cercarlo,
        cosi' `**[ FULLNAME - 1 ]**` e `[fullname_1]` risolvono entrambi.
        """
        def sostituisci(m: re.Match) -> str:
            canonico = f"[{m.group(1).upper()}_{int(m.group(2))}]"
            return self.per_segnaposto.get(canonico, m.group())

        return _SEGNAPOSTO.sub(sostituisci, testo)

    def segnaposto_non_risolti(self, testo: str) -> list[str]:
        """Segnaposto presenti nel testo ma assenti dal vault.

        Se questa lista non e' vuota il modello remoto si e' inventato un
        segnaposto: va segnalato, non ignorato in silenzio.
        """
        mancanti = []
        for m in _SEGNAPOSTO.finditer(testo):
            canonico = f"[{m.group(1).upper()}_{int(m.group(2))}]"
            if canonico not in self.per_segnaposto:
                mancanti.append(m.group())
        return mancanti

    # --- persistenza --------------------------------------------------------

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(
            {"versione": 1, "mappa": self.per_segnaposto},
            ensure_ascii=False,
            indent=indent,
        )

    @classmethod
    def from_json(cls, testo: str) -> "Vault":
        dati = json.loads(testo)
        mappa = dati.get("mappa", dati)
        vault = cls()
        for segnaposto, valore in mappa.items():
            vault.per_segnaposto[segnaposto] = valore
            m = re.fullmatch(r"\[([A-Z_]+)_(\d+)\]", segnaposto)
            if m:
                etichetta, numero = m.group(1), int(m.group(2))
                vault._contatori[etichetta] = max(
                    vault._contatori.get(etichetta, 0), numero
                )
                chiave = (etichetta, " ".join(valore.split()).casefold())
                vault._per_valore[chiave] = segnaposto
        return vault

    def __len__(self) -> int:
        return len(self.per_segnaposto)
