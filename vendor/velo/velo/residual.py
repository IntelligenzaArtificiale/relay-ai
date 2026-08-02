"""Layer 3 — residual guard (deny-by-default).

Qui sta la differenza architetturale. Un rilevatore di PII, per quanto buono,
risponde alla domanda "questo e' un dato personale?" e quando non lo sa
lascia passare. Per un presidio di riservatezza il default sbagliato e'
esattamente quello: cio' che non riconosce e' proprio cio' che non ha mai
visto in addestramento, cioe' il caso raro, cioe' il caso pericoloso.

Il residual guard inverte il default: dopo i primi due livelli, ogni parola
con l'iniziale maiuscola che non sia dimostrabilmente lessico comune viene
coperta lo stesso.

Conseguenza: il recall sul canale di fuga non e' misurato su un benchmark,
e' garantito per costruzione. Il costo si sposta sul sovra-mascheramento,
che e' recuperabile (il vault ripristina tutto) mentre una fuga non lo e'.

Due accorgimenti tengono basso quel costo:

1. **Granularita' di parola.** Si copre solo la sotto-sequenza ignota, non
   l'intero gruppo maiuscolo: in "Il Tribunale di Milano" si copre "Milano",
   non tutta la locuzione. Coprire di piu' del necessario danneggia il
   ragionamento del modello remoto senza aggiungere riservatezza.

2. **Evidenza interna al documento.** Se una parola compare anche in
   minuscolo altrove nello stesso testo, e' un nome comune e non un nome
   proprio: e' il documento stesso a dircelo, senza bisogno di lessici.
"""

from .lexicons import comuni, normalizza, parole_comuni
from .spans import LIVELLO_RESIDUO, Span
from .tokens import Token, sequenze_maiuscole


def _gia_coperto(inizio: int, fine: int, coperti: list[Span]) -> bool:
    return any(s.inizio < fine and inizio < s.fine for s in coperti)


def _parole_viste_minuscole(tokens: list[Token]) -> set[str]:
    """Parole che nel documento compaiono almeno una volta tutte minuscole.

    Se 'consulenza' appare in minuscolo da qualche parte, allora la
    'Consulenza' a inizio frase e' la stessa parola comune, non un nome.
    """
    viste: set[str] = set()
    for token in tokens:
        if token.testo and token.testo[0].islower():
            normalizzata = normalizza(token.testo)
            if normalizzata:
                viste.add(normalizzata)
    return viste


def trova_residui(
    testo: str,
    tokens: list[Token],
    coperti: list[Span],
    modo: str = "standard",
) -> list[Span]:
    """Copre tutto cio' che i livelli precedenti non hanno spiegato.

    `modo`:
      - "standard": copre le parole maiuscole non riconducibili al lessico.
      - "massimo": in piu' copre ogni sequenza di 4+ cifre rimasta scoperta
        (matricole, numeri di pratica, conti interni: canali di fuga reali
        che nessun formato pubblico intercetta).
    """
    whitelist = parole_comuni()
    noti_comuni = comuni()
    minuscole = _parole_viste_minuscole(tokens)
    spans: list[Span] = []

    def e_spiegata(parola: str) -> bool:
        normalizzata = normalizza(parola)
        return normalizzata in whitelist or normalizzata in minuscole

    for primo, ultimo in sequenze_maiuscole(tokens, testo):
        # Si scorre il gruppo isolando le corse di token NON spiegati.
        corsa_inizio: int | None = None
        for i in range(primo, ultimo + 1):
            token = tokens[i] if i < ultimo else None
            ignoto = token is not None and not e_spiegata(token.testo)

            if ignoto and corsa_inizio is None:
                corsa_inizio = i
            elif not ignoto and corsa_inizio is not None:
                spans.extend(
                    _copri(tokens, corsa_inizio, i, coperti, noti_comuni)
                )
                corsa_inizio = None

    if modo == "massimo":
        spans.extend(_residui_numerici(tokens, coperti + spans))

    return spans


def _copri(
    tokens: list[Token],
    primo: int,
    ultimo: int,
    coperti: list[Span],
    noti_comuni: frozenset[str],
) -> list[Span]:
    """Costruisce lo span per una corsa di token non spiegati."""
    inizio = tokens[primo].inizio
    fine = tokens[ultimo - 1].fine_pulita
    if fine <= inizio or _gia_coperto(inizio, fine, coperti):
        return []

    parole = [tokens[i].testo for i in range(primo, ultimo)]
    intera = normalizza(" ".join(parole))
    # Un comune di residenza E' un dato personale e va coperto: ma con
    # l'etichetta giusta, perche' il modello remoto ragiona meglio su
    # [LUOGO_3] che su [IGNOTO_3].
    e_comune = intera in noti_comuni or (
        len(parole) == 1 and normalizza(parole[0]) in noti_comuni
    )
    return [
        Span(
            inizio,
            fine,
            "LUOGO" if e_comune else "IGNOTO",
            LIVELLO_RESIDUO,
            "comune noto non spiegato dal contesto"
            if e_comune
            else "parola maiuscola non riconducibile al lessico noto",
        )
    ]


def _residui_numerici(tokens: list[Token], coperti: list[Span]) -> list[Span]:
    """Sequenze di 4+ cifre non spiegate da nessun formato noto.

    Una matricola, un numero di pratica interno o un conto non IBAN non
    hanno un formato pubblico: nessun riconoscitore li vede, ma identificano
    una persona quanto un codice fiscale.
    """
    spans: list[Span] = []
    for token in tokens:
        cifre = [c for c in token.testo if c.isdigit()]
        if len(cifre) < 4:
            continue
        if _gia_coperto(token.inizio, token.fine, coperti):
            continue
        spans.append(
            Span(
                token.inizio,
                token.fine,
                "IGNOTO_NUM",
                LIVELLO_RESIDUO,
                "sequenza numerica lunga non spiegata (modo massimo)",
            )
        )
    return spans
