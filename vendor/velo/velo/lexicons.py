"""Caricamento dei lessici.

I lessici stanno in file di testo, non nel codice: cambiarli e' un dato, non
una modifica al programma. Si caricano una volta sola e restano in memoria
(sono decine di KB, non gigabyte).
"""

import unicodedata
from functools import lru_cache
from pathlib import Path

_CARTELLA = Path(__file__).parent / "data"


def normalizza(parola: str) -> str:
    """Forma di confronto: minuscolo, senza accenti, senza punteggiatura ai bordi.

    Serve perche' 'Citta'', 'CITTA', 'citta' e 'città' sono la stessa voce di
    lessico, e nei documenti compaiono tutte e quattro.
    """
    parola = parola.strip().strip(".,;:!?()[]{}«»\"'\u2018\u2019\u201c\u201d")
    # I punti e gli apostrofi interni sono ortografia dell'abbreviazione, non
    # identita' della voce: 'C.F.', 'CF' e 'c.f.' devono collassare su 'cf',
    # 'S.r.l.' e 'srl' su 'srl'.
    parola = parola.replace(".", "").replace("'", "").replace("\u2019", "")
    decomposta = unicodedata.normalize("NFD", parola.lower())
    return "".join(c for c in decomposta if unicodedata.category(c) != "Mn")


def _leggi(nome_file: str) -> frozenset[str]:
    percorso = _CARTELLA / nome_file
    voci: set[str] = set()
    with percorso.open(encoding="utf-8") as f:
        for riga in f:
            riga = riga.strip()
            if not riga or riga.startswith("#"):
                continue
            for parola in riga.split():
                normalizzata = normalizza(parola)
                if normalizzata:
                    voci.add(normalizzata)
    return frozenset(voci)


@lru_cache(maxsize=None)
def parole_comuni() -> frozenset[str]:
    """Whitelist: parole che, anche se maiuscole, non sono dati personali."""
    return (
        _leggi("stopwords_it.txt")
        | _leggi("lessico_giuridico.txt")
        | _leggi("comuni_nomi.txt")
    )


@lru_cache(maxsize=None)
def nomi_propri() -> frozenset[str]:
    """Nomi di battesimo italiani diffusi (per etichettare, non per il recall)."""
    return _leggi("nomi_it.txt")


@lru_cache(maxsize=None)
def comuni() -> frozenset[str]:
    """Comuni italiani noti. Migliorano l'etichetta (LUOGO invece di IGNOTO),
    non il recall: quello e' garantito dal residual guard."""
    return _leggi("comuni_it.txt")


@lru_cache(maxsize=None)
def forme_societarie() -> frozenset[str]:
    """Suffissi di ragione sociale: S.r.l., S.p.A., ..."""
    return _leggi("forme_societarie.txt")


def e_parola_comune(parola: str) -> bool:
    return normalizza(parola) in parole_comuni()


def e_nome_proprio(parola: str) -> bool:
    return normalizza(parola) in nomi_propri()
