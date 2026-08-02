"""Layer 2 — frame linguistici del giuridico italiano.

Il testo legale italiano e' molto piu' regolare della prosa comune: i dati
personali compaiono quasi sempre dentro cornici fisse ("il Sig. X", "nato a
X il", "residente in X", "con sede in X", "X S.r.l."). Riconoscere la
cornice e' molto piu' affidabile che riconoscere il contenuto, e non costa
nulla.

Questo livello serve a ETICHETTARE bene. Il recall non dipende da lui: cio'
che sfugge qui viene comunque coperto dal Layer 3.

NOTA sul case, che e' stata la fonte di un bug reale. I trigger vanno resi
insensibili alle maiuscole, i nomi no. Per questo si usa `(?i:...)`
circoscritto al singolo gruppo e mai il flag globale re.IGNORECASE: quel
flag disattiverebbe anche il vincolo di maiuscola dentro _NOME, e frammenti
come "il" o "da" verrebbero inghiottiti come se fossero cognomi.
"""

import re

from .lexicons import forme_societarie, normalizza, parole_comuni
from .spans import LIVELLO_LESSICO, Span
from .tokens import Token, sequenze_maiuscole

# Titoli e qualifiche che introducono un nome di persona.
_TITOLI = (
    r"Sig\.?(?:ra|na)?|Signor[ae]?|Dott\.?(?:ssa)?|Dottor[ae]?|Avv\.?|"
    r"Avvocat[oa]|Prof\.?(?:ssa)?|Professor[ae]?|Ing\.?|Ingegner[ae]?|"
    r"Arch\.?|Geom\.?|Rag\.?|Notaio|Notaia|On\.?|Egr\.?|Spett\.?(?:le)?|"
    r"Cav\.?|Gen\.?|Col\.?|Magg\.?|Ten\.?|Isp\.?|Comm\.?"
)
_TITOLI_I = rf"(?i:{_TITOLI})"

# Un nome: iniziale maiuscola obbligatoria.
_NOME = r"[A-Z\u00C0-\u017F][\w\u00C0-\u017F'\u2019\-]+"
# Fino a quattro parole, con le particelle nobiliari/patronimiche in mezzo.
_NOME_COMPOSTO = (
    rf"{_NOME}(?:\s+(?:d[aei]|de[ilg]{{1,2}}|van|von|la|lo|le)\s+{_NOME}"
    rf"|\s+{_NOME}){{0,3}}"
)
_TITOLO_OPZ = rf"(?:{_TITOLI_I}\s+)?"
_ARTICOLO_OPZ = r"(?:(?i:il|lo|la|i|gli|le|un|uno|una)\s+)?"

# --- Persone ---------------------------------------------------------------

_F_TITOLO = re.compile(rf"{_TITOLI_I}\s+({_NOME_COMPOSTO})")

_F_SOTTOSCRITTO = re.compile(
    rf"\b(?i:sottoscritt[oa])\s+{_TITOLO_OPZ}({_NOME_COMPOSTO})"
)

_F_RUOLO = re.compile(
    rf"\b(?i:comparso|comparsa|comparsi|comparse|convenut[oa]|attor[ea]|"
    rf"ricorrente|resistente|imputat[oa]|testimone|erede|donante|donatari[oa]|"
    rf"venditor[ea]|acquirente|locator[ea]|conduttor[ea]|mutuatari[oa]|"
    rf"fideiussor[ea]|mandante|mandatari[oa])\s+{_ARTICOLO_OPZ}{_TITOLO_OPZ}"
    rf"({_NOME_COMPOSTO})"
)

_F_A_CARICO = re.compile(
    rf"\b(?i:nei confronti di|a favore di|in persona di|"
    rf"rappresentat[oa] da|assistit[oa] da|difes[oa] da)\s+"
    rf"{_TITOLO_OPZ}({_NOME_COMPOSTO})"
)

# --- Luoghi ----------------------------------------------------------------

_F_NATO_A = re.compile(rf"\b(?i:nat[oa])\s+(?i:a|in|presso)\s+({_NOME_COMPOSTO})")

_F_RESIDENTE = re.compile(
    rf"\b(?i:residente|domiciliat[oa]|dimorante|con residenza|con domicilio)\s+"
    rf"(?i:in|a|presso)\s+({_NOME_COMPOSTO})"
)

_F_SEDE = re.compile(
    rf"\b(?i:con sede|sede legale|sede operativa|sede)\s+"
    rf"(?i:in|a|presso)\s+({_NOME_COMPOSTO})"
)

# --- Indirizzi -------------------------------------------------------------

_VIE = (
    r"[Vv]ia|[Vv]iale|[Pp]iazza|[Pp]iazzale|[Cc]orso|[Ll]argo|[Vv]icolo|"
    r"[Ss]trada|[Cc]ontrada|[Ll]ocalit[a\u00e0]|[Ff]razione|[Bb]orgo|"
    r"[Ll]ungomare|[Ss]alita|[Tt]raversa"
)
_F_INDIRIZZO = re.compile(
    rf"\b(?:{_VIE})\s+{_NOME_COMPOSTO}"
    rf"(?:\s*,?\s*(?:n\.?|civico|snc)?\s*\d+[A-Za-z]?)?"
)

# --- Organizzazioni --------------------------------------------------------

_SUFFISSI_ORG = (
    r"S\.?r\.?l\.?s?\.?|S\.?p\.?A\.?|S\.?a\.?p\.?a\.?|S\.?n\.?c\.?|S\.?a\.?s\.?|"
    r"Soc\.?\s*Coop\.?|Coop\.?|O\.?N\.?L\.?U\.?S\.?|A\.?P\.?S\.?|E\.?T\.?S\.?|"
    r"O\.?D\.?V\.?|GmbH|Ltd\.?|Inc\.?|PLC|AG|B\.?V\.?|N\.?V\.?"
)
_F_ORG = re.compile(rf"\b{_NOME_COMPOSTO}\s+(?:{_SUFFISSI_ORG})(?=\W|$)")

_F_ORG_PREFISSO = re.compile(
    rf"\b(?i:societ[a\u00e0]|ditta|impresa|studio|banca|azienda|cooperativa|"
    rf"associazione|fondazione|consorzio)\s+({_NOME_COMPOSTO})"
)


def _aggiungi(spans: list[Span], m: re.Match, etichetta: str, motivo: str) -> None:
    """Aggiunge lo span del gruppo 1 se il pattern ne ha uno, altrimenti
    dell'intero match."""
    inizio, fine = m.span(1) if m.lastindex else m.span()
    if inizio < 0:
        return
    spans.append(Span(inizio, fine, etichetta, LIVELLO_LESSICO, motivo))


def trova_per_frame(testo: str) -> list[Span]:
    """Applica tutti i frame. Le sovrapposizioni sono attese: le risolve a
    valle `risolvi_sovrapposizioni`."""
    spans: list[Span] = []

    persone = (
        (_F_TITOLO, "titolo o qualifica che introduce un nome"),
        (_F_SOTTOSCRITTO, "formula 'il sottoscritto X'"),
        (_F_RUOLO, "ruolo processuale o contrattuale seguito da nome"),
        (_F_A_CARICO, "formula di rappresentanza o di controparte"),
    )
    for pattern, motivo in persone:
        for m in pattern.finditer(testo):
            _aggiungi(spans, m, "FULLNAME", motivo)

    luoghi = (
        (_F_NATO_A, "formula 'nato a X'"),
        (_F_RESIDENTE, "formula di residenza o domicilio"),
        (_F_SEDE, "formula di sede legale"),
    )
    for pattern, motivo in luoghi:
        for m in pattern.finditer(testo):
            _aggiungi(spans, m, "LUOGO", motivo)

    for m in _F_INDIRIZZO.finditer(testo):
        _aggiungi(spans, m, "INDIRIZZO", "odonimo seguito da denominazione")

    for m in _F_ORG.finditer(testo):
        _aggiungi(spans, m, "ORG", "denominazione con forma societaria")
    for m in _F_ORG_PREFISSO.finditer(testo):
        _aggiungi(spans, m, "ORG", "sostantivo d'impresa seguito da denominazione")

    return spans


def trova_nomi_da_gazetteer(testo: str, tokens: list[Token]) -> list[Span]:
    """Sequenze maiuscole che iniziano con un nome di battesimo noto.

    'Mario Rossi' senza alcun titolo davanti resta comunque riconoscibile
    come persona perche' 'Mario' e' nel gazetteer.
    """
    from .lexicons import nomi_propri

    nomi = nomi_propri()
    comuni = parole_comuni()
    spans: list[Span] = []

    for primo, ultimo in sequenze_maiuscole(tokens, testo):
        if normalizza(tokens[primo].testo) not in nomi:
            continue
        if all(normalizza(tokens[i].testo) in comuni for i in range(primo, ultimo)):
            continue
        spans.append(
            Span(
                tokens[primo].inizio,
                tokens[ultimo - 1].fine_pulita,
                "FULLNAME",
                LIVELLO_LESSICO,
                "nome di battesimo in gazetteer",
            )
        )
    return spans


def trova_org_da_suffisso(testo: str, tokens: list[Token]) -> list[Span]:
    """Sequenza maiuscola immediatamente seguita da una forma societaria."""
    suffissi = forme_societarie()
    spans: list[Span] = []
    for primo, ultimo in sequenze_maiuscole(tokens, testo):
        if ultimo >= len(tokens):
            continue
        if normalizza(tokens[ultimo].testo) in suffissi:
            spans.append(
                Span(
                    tokens[primo].inizio,
                    tokens[ultimo].fine,
                    "ORG",
                    LIVELLO_LESSICO,
                    "denominazione seguita da forma societaria",
                )
            )
    return spans
