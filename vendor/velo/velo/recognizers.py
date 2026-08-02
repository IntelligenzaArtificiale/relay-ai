"""Layer 1 — riconoscitori deterministici.

Regola non negoziabile di questo modulo: un riconoscitore che dispone di un
algoritmo di verifica NON emette nulla se la verifica fallisce. Il regex
serve solo a *proporre* un candidato; ad accettarlo e' la matematica.

Cosi' la precisione di questo livello non e' misurata: e' dimostrata.
"""

import re

from .checksums import (
    valida_cap,
    valida_codice_fiscale,
    valida_iban,
    valida_luhn,
    valida_partita_iva,
)
from .lexicons import comuni, normalizza
from .spans import LIVELLO_FORMATO, LIVELLO_PROVA, Span

# --- Pattern candidati ------------------------------------------------------
# Volutamente larghi: e' il validatore a stringere. Meglio proporre troppo
# e scartare, che proporre poco e perdere.

_P_CF = re.compile(r"\b[A-Za-z]{6}[0-9A-Za-z]{2}[A-Za-z][0-9A-Za-z]{2}[A-Za-z][0-9A-Za-z]{3}[A-Za-z]\b")
_P_PIVA = re.compile(r"\b(?:IT)?[0-9]{11}\b", re.IGNORECASE)
_P_IBAN = re.compile(r"\b[A-Z]{2}[0-9]{2}(?:[ \-]?[A-Z0-9]){11,30}\b", re.IGNORECASE)
_P_CARTA = re.compile(r"\b(?:[0-9]{4}[ \-]?){3}[0-9]{1,7}\b")
_P_EMAIL = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
_P_TELEFONO = re.compile(
    r"(?<![0-9])(?:\+39[ .\-]?)?"
    r"(?:0\d{1,3}[ .\-/]?\d{5,8}|3\d{2}[ .\-]?\d{3}[ .\-]?\d{3,4})(?![0-9])"
)
_P_CAP = re.compile(r"\b[0-9]{5}\b")
_P_TARGA = re.compile(r"\b[A-Z]{2}[ ]?[0-9]{3}[ ]?[A-Z]{2}\b")
_P_DATA = re.compile(
    r"\b(?:[0-3]?\d[/\-.][0-1]?\d[/\-.](?:\d{4}|\d{2})"
    r"|[0-3]?\d\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|"
    r"agosto|settembre|ottobre|novembre|dicembre)\s+\d{4})\b",
    re.IGNORECASE,
)
_P_ORA = re.compile(r"\b(?:ore\s+)?[0-2]?\d[:.][0-5]\d\b", re.IGNORECASE)
_P_IMPORTO = re.compile(
    r"(?:€|EUR\b|euro\b)\s?[0-9][0-9.']*(?:,\d{2})?"
    r"|\b[0-9][0-9.']*,\d{2}\s?(?:€|EUR\b|euro\b)",
    re.IGNORECASE,
)
_P_CATASTO = re.compile(
    r"\b(?:foglio|fg\.?)\s*[nN]?\.?\s*\d+"
    r"(?:\s*[,;]?\s*(?:particella|part\.?|mappale|map\.?|p\.lla)\s*[nN]?\.?\s*\d+)?"
    r"(?:\s*[,;]?\s*(?:subalterno|sub\.?)\s*[nN]?\.?\s*\d+)?",
    re.IGNORECASE,
)
_P_DOCID = re.compile(
    r"\b(?:R\.?G\.?(?:\s*n\.?)?|rep\.?(?:\s*n\.?)?|repertorio\s*n\.?|"
    r"racc\.?(?:\s*n\.?)?|prot\.?(?:\s*n\.?)?|protocollo\s*n\.?)\s*[0-9]+(?:/[0-9]{2,4})?",
    re.IGNORECASE,
)
_P_DOC_IDENT = re.compile(r"\b[A-Z]{2}\s?[0-9]{5}\s?[A-Z]{2}\b")

# Parole che precedono un CAP e ne confermano la natura. Senza uno di questi
# indizi un numero di 5 cifre resta ambiguo e lo lasciamo al livello residuo.
_INDIZI_CAP = re.compile(r"(?:\bCAP\b|\bc\.a\.p\.?)\s*[:.]?\s*$", re.IGNORECASE)
_COMUNE_DOPO_CAP = re.compile(r"\s*[-,]?\s*([A-Z][\w\u00C0-\u017F']+(?:\s+[A-Z][\w\u00C0-\u017F']+)?)")


def _span(m: re.Match, etichetta: str, livello: int, motivo: str) -> Span:
    return Span(m.start(), m.end(), etichetta, livello, motivo)


def trova_con_checksum(testo: str) -> list[Span]:
    """Identificativi la cui validita' e' dimostrabile: livello PROVA."""
    spans: list[Span] = []

    for m in _P_CF.finditer(testo):
        if valida_codice_fiscale(m.group()):
            spans.append(_span(m, "CF", LIVELLO_PROVA, "carattere di controllo CF valido"))

    for m in _P_PIVA.finditer(testo):
        grezzo = m.group()
        cifre = grezzo[2:] if grezzo[:2].upper() == "IT" else grezzo
        if valida_partita_iva(cifre):
            spans.append(_span(m, "PIVA", LIVELLO_PROVA, "checksum mod-10 partita IVA"))

    for m in _P_IBAN.finditer(testo):
        if valida_iban(m.group()):
            spans.append(_span(m, "IBAN", LIVELLO_PROVA, "mod-97 ISO 13616"))

    for m in _P_CARTA.finditer(testo):
        if valida_luhn(m.group()):
            spans.append(_span(m, "CARTA", LIVELLO_PROVA, "algoritmo di Luhn"))

    return spans


def trova_per_formato(testo: str) -> list[Span]:
    """Dati il cui formato e' gia' di per se' inequivocabile: livello FORMATO."""
    spans: list[Span] = []

    semplici = (
        (_P_EMAIL, "EMAIL", "formato indirizzo di posta"),
        (_P_TELEFONO, "TELEFONO", "formato numerazione telefonica italiana"),
        (_P_TARGA, "TARGA", "formato targa italiana post-1994"),
        (_P_DATA, "DATA", "formato data"),
        (_P_ORA, "ORA", "formato orario"),
        (_P_IMPORTO, "IMPORTO", "importo con valuta"),
        (_P_CATASTO, "CATASTO", "riferimento catastale"),
        (_P_DOCID, "DOCID", "identificativo di atto"),
        (_P_DOC_IDENT, "DOC_IDENT", "formato documento di identita'"),
    )
    for pattern, etichetta, motivo in semplici:
        for m in pattern.finditer(testo):
            spans.append(_span(m, etichetta, LIVELLO_FORMATO, motivo))

    for m in _P_CAP.finditer(testo):
        if not valida_cap(m.group()):
            continue
        etichettato = _INDIZI_CAP.search(testo[: m.start()][-12:])
        # "24122 Bergamo": un CAP e' spesso identificato non da un'etichetta
        # ma dal comune che lo segue immediatamente.
        seguito = _COMUNE_DOPO_CAP.match(testo, m.end())
        segue_comune = bool(seguito) and normalizza(seguito.group(1)) in comuni()
        if etichettato or segue_comune:
            spans.append(
                _span(m, "CAP", LIVELLO_FORMATO,
                      "CAP etichettato" if etichettato else "CAP seguito da comune noto")
            )

    return spans


def trova_deterministici(testo: str) -> list[Span]:
    """Tutto il Layer 1."""
    return trova_con_checksum(testo) + trova_per_formato(testo)
