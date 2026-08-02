"""Validatori matematici per gli identificativi strutturati.

Ogni funzione qui dentro risponde a una sola domanda: questa stringa e' un
identificativo *matematicamente valido*, non "somiglia a". E' la differenza
fra un riconoscitore probabilistico e una prova.
"""

# --- Codice fiscale ---------------------------------------------------------

# Tabella ufficiale dei valori per i caratteri in posizione dispari (1-based).
_CF_DISPARI = {
    "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17,
    "8": 19, "9": 21, "A": 1, "B": 0, "C": 5, "D": 7, "E": 9, "F": 13,
    "G": 15, "H": 17, "I": 19, "J": 21, "K": 2, "L": 4, "M": 18, "N": 20,
    "O": 11, "P": 3, "Q": 6, "R": 8, "S": 12, "T": 14, "U": 16, "V": 10,
    "W": 22, "X": 25, "Y": 24, "Z": 23,
}

# In posizione pari il valore e' semplicemente l'indice alfanumerico.
_CF_PARI = {c: i for i, c in enumerate("0123456789")}
_CF_PARI.update({c: i for i, c in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ")})

_CF_RESTO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# Omocodia: quando due persone collidono, l'Agenzia delle Entrate sostituisce
# le cifre (da destra) con queste lettere. Un CF omocodico e' valido ma non
# passa un regex ingenuo che pretende cifre nelle posizioni numeriche.
_OMOCODIA = {
    "L": "0", "M": "1", "N": "2", "P": "3", "Q": "4",
    "R": "5", "S": "6", "T": "7", "U": "8", "V": "9",
}

# Posizioni (0-based) che nel CF canonico contengono cifre.
_CF_POS_NUMERICHE = (6, 7, 9, 10, 12, 13, 14)

_CF_MESI = set("ABCDEHLMPRST")


def _cf_denormalizza(cf: str) -> str:
    """Riporta un CF eventualmente omocodico alla sua forma numerica."""
    caratteri = list(cf)
    for pos in _CF_POS_NUMERICHE:
        if caratteri[pos] in _OMOCODIA:
            caratteri[pos] = _OMOCODIA[caratteri[pos]]
    return "".join(caratteri)


def valida_codice_fiscale(cf: str) -> bool:
    """True se `cf` e' un codice fiscale persona fisica formalmente valido.

    Verifica: lunghezza, alfabeto, struttura (anche omocodica), coerenza del
    mese, plausibilita' del giorno (1-31 nato uomo, 41-71 nata donna) e
    carattere di controllo.
    """
    cf = cf.strip().upper().replace(" ", "")
    if len(cf) != 16 or not cf.isalnum() or not cf.isascii():
        return False
    if not cf[:6].isalpha():
        return False

    canonico = _cf_denormalizza(cf)

    # Le posizioni numeriche devono esserlo dopo la denormalizzazione.
    if any(not canonico[p].isdigit() for p in _CF_POS_NUMERICHE):
        return False
    # Posizione 8 e' la lettera del mese, posizione 11 la lettera del comune.
    if canonico[8] not in _CF_MESI or not canonico[11].isalpha():
        return False

    giorno = int(canonico[9:11])
    if not (1 <= giorno <= 31 or 41 <= giorno <= 71):
        return False

    return cf[15] == _cf_carattere_controllo(cf[:15])


def _cf_carattere_controllo(primi15: str) -> str:
    totale = 0
    for indice, carattere in enumerate(primi15):
        # indice 0 -> posizione 1 -> dispari
        if indice % 2 == 0:
            totale += _CF_DISPARI[carattere]
        else:
            totale += _CF_PARI[carattere]
    return _CF_RESTO[totale % 26]


# --- Partita IVA ------------------------------------------------------------


def valida_partita_iva(piva: str) -> bool:
    """True se `piva` e' una partita IVA italiana valida (checksum mod-10).

    Le prime 7 cifre identificano il contribuente, le tre successive
    l'ufficio provinciale (001-100, 120, 121, 888, 999), l'ultima e' il
    controllo.
    """
    piva = piva.strip().replace(" ", "").replace(".", "")
    if len(piva) != 11 or not piva.isdigit():
        return False

    ufficio = int(piva[7:10])
    if not (1 <= ufficio <= 100 or ufficio in (120, 121, 888, 999)):
        return False

    totale = 0
    for indice, cifra_txt in enumerate(piva[:10]):
        cifra = int(cifra_txt)
        if indice % 2 == 0:
            totale += cifra
        else:
            doppio = cifra * 2
            totale += doppio - 9 if doppio > 9 else doppio
    controllo = (10 - totale % 10) % 10
    return controllo == int(piva[10])


# --- IBAN -------------------------------------------------------------------

_IBAN_LUNGHEZZE = {
    "IT": 27, "SM": 27, "VA": 22, "DE": 22, "FR": 27, "ES": 24, "GB": 22,
    "CH": 21, "AT": 20, "BE": 16, "NL": 18, "PT": 25, "IE": 22, "LU": 20,
    "MC": 27, "GR": 27, "FI": 18, "DK": 18, "SE": 24, "NO": 15, "PL": 28,
    "CZ": 24, "HU": 28, "RO": 24, "HR": 21, "SI": 19, "SK": 24, "BG": 22,
    "LT": 20, "LV": 21, "EE": 20, "MT": 31, "CY": 28,
}


def valida_iban(iban: str) -> bool:
    """True se `iban` supera il controllo mod-97 (ISO 13616) e ha la
    lunghezza attesa per il suo paese, quando la conosciamo."""
    iban = iban.strip().upper().replace(" ", "").replace("-", "")
    if len(iban) < 15 or len(iban) > 34 or not iban.isalnum() or not iban.isascii():
        return False
    if not iban[:2].isalpha() or not iban[2:4].isdigit():
        return False

    attesa = _IBAN_LUNGHEZZE.get(iban[:2])
    if attesa is not None and len(iban) != attesa:
        return False

    riordinato = iban[4:] + iban[:4]
    numerico = "".join(
        str(ord(c) - 55) if c.isalpha() else c for c in riordinato
    )
    return int(numerico) % 97 == 1


# --- Carte di credito -------------------------------------------------------


def valida_luhn(numero: str) -> bool:
    """True se `numero` supera l'algoritmo di Luhn (carte di pagamento)."""
    cifre_txt = numero.replace(" ", "").replace("-", "")
    if not cifre_txt.isdigit() or not (12 <= len(cifre_txt) <= 19):
        return False
    totale = 0
    # Si scorre da destra: le posizioni pari (0-based da destra) restano,
    # le dispari si raddoppiano.
    for posizione, carattere in enumerate(reversed(cifre_txt)):
        cifra = int(carattere)
        if posizione % 2 == 1:
            cifra *= 2
            if cifra > 9:
                cifra -= 9
        totale += cifra
    return totale % 10 == 0


# --- CAP --------------------------------------------------------------------


def valida_cap(cap: str) -> bool:
    """True se `cap` e' un CAP italiano plausibile (00010-98168)."""
    cap = cap.strip()
    if len(cap) != 5 or not cap.isdigit():
        return False
    return 10 <= int(cap) <= 98168
