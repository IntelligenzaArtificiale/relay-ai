"""Tokenizzazione posizionale.

Serve una tokenizzazione che conservi gli offset sul testo originale: tutto
il sistema ragiona per intervalli di caratteri, mai per indici di parola,
cosi' il testo anonimizzato si ricostruisce senza perdere spaziatura o
punteggiatura.
"""

import re
from dataclasses import dataclass

# Una parola: lettere (accentate incluse), cifre, apostrofi e punti interni.
# I punti interni servono per 'S.r.l.' e 'C.F.'.
_PAROLA = re.compile(r"[0-9A-Za-z\u00C0-\u024F]+(?:[.'\u2019][0-9A-Za-z\u00C0-\u024F]+)*\.?")

# Particelle che stanno DENTRO un nome proprio composto e restano minuscole:
# "Ludovico di Savoia", "Vincenzo De Luca", "Vincent van Gogh".
PARTICELLE_NOME = frozenset(
    {"de", "del", "della", "dello", "dei", "degli", "delle", "di", "da",
     "dal", "dalla", "van", "von", "der", "den", "la", "le", "lo", "d"}
)


@dataclass(frozen=True)
class Token:
    testo: str
    inizio: int
    fine: int

    @property
    def e_maiuscolo(self) -> bool:
        """True se inizia con lettera maiuscola (non basta isupper: 'IBAN' e
        'Rossi' devono valere entrambi)."""
        primo = self.testo[0]
        return primo.isalpha() and primo.isupper()

    @property
    def e_tutto_maiuscolo(self) -> bool:
        lettere = [c for c in self.testo if c.isalpha()]
        return bool(lettere) and all(c.isupper() for c in lettere)

    @property
    def e_numerico(self) -> bool:
        return any(c.isdigit() for c in self.testo)

    @property
    def fine_pulita(self) -> int:
        """Fine dello span escludendo il punto di chiusura di frase.

        'Bergamo.' a fine periodo deve produrre lo span 'Bergamo', mentre
        'S.r.l.' deve restare intero: la discriminante e' se il token
        contiene altri punti oltre a quello finale.
        """
        if self.testo.endswith(".") and self.testo.count(".") == 1:
            return self.fine - 1
        return self.fine


def tokenizza(testo: str) -> list[Token]:
    return [Token(m.group(), m.start(), m.end()) for m in _PAROLA.finditer(testo)]


def indici_inizio_frase(testo: str, tokens: list[Token]) -> set[int]:
    """Indici dei token che aprono una frase.

    Un token maiuscolo a inizio frase e' molto meno sospetto di uno in mezzo:
    la maiuscola li' e' ortografia, non nome proprio. Il residual guard usa
    questa informazione per decidere quanto essere severo.
    """
    inizi: set[int] = set()
    for i, token in enumerate(tokens):
        if i == 0:
            inizi.add(i)
            continue
        precedente = testo[tokens[i - 1].fine : token.inizio]
        if any(c in precedente for c in ".!?\n;:") or "\u2022" in precedente:
            inizi.add(i)
    return inizi


def sequenze_maiuscole(tokens: list[Token], testo: str) -> list[tuple[int, int]]:
    """Raggruppa i token in sequenze di parole maiuscole consecutive.

    Restituisce coppie (primo_indice, ultimo_indice_escluso). Le particelle
    minuscole vengono assorbite solo se seguite da un'altra maiuscola, cosi'
    'Mario Rossi di Milano' non ingloba 'di' se dopo non c'e' un nome.

    Serve `testo` perche' due maiuscole separate da punteggiatura NON sono
    una sequenza: in "Alessandro Ferraris, Notaio" la virgola separa il nome
    dalla qualifica, e senza questo controllo il nome inghiottirebbe
    "Notaio" (bug osservato sul primo atto di prova).
    """
    def solo_spazi(i: int, j: int) -> bool:
        separatore = testo[tokens[i].fine : tokens[j].inizio]
        return separatore.strip() == "" and "\n" not in separatore

    gruppi: list[tuple[int, int]] = []
    i = 0
    n = len(tokens)
    while i < n:
        if not tokens[i].e_maiuscolo or tokens[i].e_numerico:
            i += 1
            continue
        fine = i + 1
        while fine < n:
            corrente = tokens[fine]
            if (
                corrente.e_maiuscolo
                and not corrente.e_numerico
                and solo_spazi(fine - 1, fine)
            ):
                fine += 1
            elif (
                corrente.testo.lower().rstrip(".") in PARTICELLE_NOME
                and fine + 1 < n
                and tokens[fine + 1].e_maiuscolo
                and not tokens[fine + 1].e_numerico
                and solo_spazi(fine - 1, fine)
                and solo_spazi(fine, fine + 1)
            ):
                fine += 2
            else:
                break
        gruppi.append((i, fine))
        i = fine
    return gruppi
