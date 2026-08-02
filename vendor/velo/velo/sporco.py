"""Riconoscitori tolleranti al testo sporco.

Il testo che arriva da un PDF non e' il testo che c'era nel PDF. L'estrazione
spezza i codici a meta' riga, infila spazi dentro i numeri, separa la parte
locale di un indirizzo dalla chiocciola. Un riconoscitore che pretende il
formato pulito su un documento reale semplicemente non trova nulla — ed e'
il caso peggiore, perche' non trovare significa lasciare passare in chiaro.

Qui l'architettura paga un dividendo. Per tutto cio' che ha un checksum
possiamo permetterci candidati molto larghi, con spazi e interruzioni di
riga dovunque: a decidere non e' il pattern, e' l'algoritmo. Un candidato
sbagliato non passa il mod-97, quindi allargare il pattern non costa
precisione. E' l'esatto contrario di un modello statistico, dove allargare
il recall costa sempre precisione.

Per cio' che non ha checksum (telefono, email) si usa l'ancoraggio al
contesto: nei documenti reali questi dati sono quasi sempre preceduti da
un'etichetta ("tel.", "e-mail", "PEC").
"""

import re

from .checksums import valida_codice_fiscale, valida_iban, valida_partita_iva
from .spans import LIVELLO_FORMATO, LIVELLO_PROVA, Span

# Separatori che l'estrazione puo' infilare dentro un codice: spazi, a capo,
# trattini di sillabazione, punti di riempimento.
# I caratteri che l'estrazione puo' infilare dentro un codice, come classe
# esplicita. NON derivarla per slicing da _SEP: era un errore reale, lo
# slicing lasciava dentro la parentesi quadra di chiusura e troncava la
# classe. Chiarezza prima di concisione.
_SEP_CARATTERI = r"\s\.\-\u00ad\u2010\u2011"
_SEP = rf"[{_SEP_CARATTERI}]*"


def _compatta(grezzo: str) -> str:
    """Toglie tutti i separatori, lasciando i soli caratteri del codice.

    Da usare solo sui codici (CF, IBAN, P.IVA), dove punti e trattini sono
    rumore di formattazione.
    """
    return re.sub(rf"[{_SEP_CARATTERI}]", "", grezzo)


def _compatta_spazi(grezzo: str) -> str:
    """Toglie solo gli spazi e le interruzioni di riga.

    Per gli indirizzi di posta: li' il punto NON e' rumore, e' parte
    dell'indirizzo, e toglierlo trasformerebbe 'gmail.com' in 'gmailcom'.
    """
    return re.sub(r"[\s\u00ad]", "", grezzo)


def _rifila(m: re.Match, gruppo: int) -> tuple[int, int]:
    """Restringe lo span ai soli caratteri utili, senza spazi ai bordi."""
    testo = m.group(gruppo)
    inizio, fine = m.span(gruppo)
    sinistra = len(testo) - len(testo.lstrip(" \t\r\n.-"))
    destra = len(testo) - len(testo.rstrip(" \t\r\n.-"))
    return inizio + sinistra, fine - destra


# --- Codici con checksum: pattern larghi, decide la matematica -------------

_ANCORA_CF = r"(?:c\.?\s*f\.?|cod(?:ice)?\.?\s*fisc(?:ale)?\.?|codfisc)"
_S_CF = re.compile(
    rf"(?i:{_ANCORA_CF})\s*[:=.]?\s*([A-Za-z0-9{_SEP_CARATTERI}]{{16,30}})"
)
# Anche senza ancora: 16 caratteri alfanumerici con separatori interni.
_S_CF_LIBERO = re.compile(
    rf"\b([A-Za-z]{{2,6}}{_SEP}[A-Za-z0-9]{{1,6}}{_SEP}[A-Za-z0-9]{{1,6}}"
    rf"{_SEP}[A-Za-z0-9]{{1,8}})\b"
)

_ANCORA_IBAN = r"(?:iban|coord(?:inate)?\.?\s*bancarie|c\.?\s*c\.?\s*bancario)"
_S_IBAN = re.compile(
    rf"(?i:{_ANCORA_IBAN})\s*[:=.]?\s*([A-Za-z]{{2}}[0-9A-Za-z{_SEP_CARATTERI}]{{13,45}})"
)
_S_IBAN_LIBERO = re.compile(
    rf"\b([A-Z]{{2}}[0-9]{{2}}{_SEP}(?:[A-Z0-9]{_SEP}){{11,32}})"
)

_ANCORA_PIVA = r"(?:p\.?\s*(?:iva|i\.?v\.?a\.?)|partita\s*iva|vat|part\.?\s*iva)"
_S_PIVA = re.compile(
    rf"(?i:{_ANCORA_PIVA})\s*[:=.]?\s*((?:IT)?[0-9{_SEP_CARATTERI}]{{11,20}})"
)


def _cf_dopo_ancora(testo: str) -> list[Span]:
    """Cerca un CF nei caratteri che seguono un'etichetta 'C.F.'/'Cod. Fisc.'.

    Non si usa una classe di caratteri golosa: inghiottirebbe le parole
    successive ('... H501Q rilasciato in data'). Si prende invece una
    finestra e si verifica se i primi 16 caratteri utili formano un codice
    fiscale valido; in caso affermativo si riporta lo span sul testo
    originale, spazi interni compresi.
    """
    spans: list[Span] = []
    for ancora in re.finditer(rf"(?i:{_ANCORA_CF})\s*[:=.]?\s*", testo):
        inizio_finestra = ancora.end()
        utili: list[int] = []  # indici dei caratteri alfanumerici presi
        for i in range(inizio_finestra, min(len(testo), inizio_finestra + 40)):
            c = testo[i]
            if c.isalnum():
                utili.append(i)
                if len(utili) == 16:
                    break
            elif c in " \t\r\n.-\u00ad\u2010\u2011":
                continue
            else:
                break  # carattere estraneo: il codice finisce qui
        if len(utili) < 16:
            continue
        candidato = "".join(testo[i] for i in utili)
        if not valida_codice_fiscale(candidato):
            continue
        spans.append(
            Span(utili[0], utili[-1] + 1, "CF", LIVELLO_PROVA,
                 "CF valido, ricomposto dopo etichetta")
        )
    return spans


def trova_codici_sporchi(testo: str) -> list[Span]:
    """Codici con checksum, tolleranti a spazi e interruzioni di riga."""
    spans: list[Span] = _cf_dopo_ancora(testo)

    for m in _S_CF_LIBERO.finditer(testo):
        compatto = _compatta(m.group(1))
        if len(compatto) != 16 or not valida_codice_fiscale(compatto):
            continue
        inizio, fine = _rifila(m, 1)
        spans.append(
            Span(inizio, fine, "CF", LIVELLO_PROVA,
                 "CF valido (carattere di controllo)")
        )

    for pattern in (_S_IBAN, _S_IBAN_LIBERO):
        for m in pattern.finditer(testo):
            compatto = _compatta(m.group(1))
            if not valida_iban(compatto):
                continue
            inizio, fine = _rifila(m, 1)
            spans.append(
                Span(inizio, fine, "IBAN", LIVELLO_PROVA,
                     "IBAN valido mod-97, ricomposto da testo spezzato")
            )

    for m in _S_PIVA.finditer(testo):
        compatto = _compatta(m.group(1))
        cifre = compatto[2:] if compatto[:2].upper() == "IT" else compatto
        if not valida_partita_iva(cifre):
            continue
        inizio, fine = _rifila(m, 1)
        spans.append(
            Span(inizio, fine, "PIVA", LIVELLO_PROVA,
                 "partita IVA valida, ricomposta da testo spezzato")
        )

    return spans


# --- Senza checksum: si ancora al contesto ---------------------------------

_ANCORA_TEL = (
    r"(?:tel(?:efono)?\.?|cell(?:ulare)?\.?|mobile|cel\.?|fax|"
    r"recapito(?:\s+telefonico)?|n(?:um)?\.?\s*tel\.?)"
)
_S_TELEFONO = re.compile(
    rf"(?i:{_ANCORA_TEL})\s*[:=.]?\s*((?:\+?\s*39\s*)?(?:[0-9][\s.\-/]*){{6,15}})"
)
# Cellulare italiano anche senza ancora: prefisso 3XX + 7 cifre, spaziatura libera.
_S_CELLULARE = re.compile(r"(?<![0-9])(3[0-9]{2}(?:[\s.\-/]*[0-9]){7})(?![0-9])")

# Indirizzo di posta con spazi attorno alla chiocciola o ai punti.
_S_EMAIL = re.compile(
    r"([A-Za-z0-9._%+\-]+(?:\s*[.\-_]\s*[A-Za-z0-9._%+\-]+)*"
    r"\s*@\s*"
    # Il dominio di primo livello e' lungo 2-6 lettere e finisce su un
    # confine di parola: senza questo vincolo il pattern scavalcava il punto
    # di fine frase e inghiottiva la parola successiva
    # ("...@pec.studio.it. Riferimento" -> TLD "Riferimento").
    r"[A-Za-z0-9\-]+(?:\s*\.\s*[A-Za-z0-9\-]+)*\s*\.\s*[A-Za-z]{2,6})\b"
)


def trova_contatti_sporchi(testo: str) -> list[Span]:
    """Telefoni e indirizzi di posta con spaziatura irregolare."""
    spans: list[Span] = []

    for pattern, motivo in (
        (_S_TELEFONO, "numero telefonico preceduto da etichetta"),
        (_S_CELLULARE, "cellulare italiano (prefisso 3XX + 7 cifre)"),
    ):
        for m in pattern.finditer(testo):
            cifre = [c for c in m.group(1) if c.isdigit()]
            # Un numero italiano plausibile ha da 6 a 13 cifre significative.
            if not (6 <= len(cifre) <= 13):
                continue
            inizio, fine = _rifila(m, 1)
            spans.append(Span(inizio, fine, "TELEFONO", LIVELLO_FORMATO, motivo))

    for m in _S_EMAIL.finditer(testo):
        compatto = _compatta_spazi(m.group(1))
        # Dopo la compattazione deve restare un indirizzo ben formato.
        if not re.fullmatch(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", compatto):
            continue
        inizio, fine = _rifila(m, 1)
        spans.append(
            Span(inizio, fine, "EMAIL", LIVELLO_FORMATO,
                 "indirizzo di posta, spaziatura irregolare tollerata")
        )

    return spans


def trova_sporchi(testo: str) -> list[Span]:
    """Tutti i riconoscitori tolleranti."""
    return trova_codici_sporchi(testo) + trova_contatti_sporchi(testo)
