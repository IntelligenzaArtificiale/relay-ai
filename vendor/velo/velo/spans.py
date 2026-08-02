"""Span rilevati e risoluzione delle sovrapposizioni.

Piu' livelli guardano lo stesso testo, quindi le loro rilevazioni si
sovrappongono di continuo: dentro un IBAN c'e' una sequenza che sembra un
importo, dentro "Via Giuseppe Garibaldi" c'e' un nome di persona. La
risoluzione deve essere deterministica e spiegabile, non "il primo che
arriva".
"""

from dataclasses import dataclass

# Ordine di fiducia decrescente. Una rilevazione provata matematicamente
# batte una lessicale, che batte una euristica residuale.
LIVELLO_PROVA = 3      # checksum / algoritmo ufficiale
LIVELLO_FORMATO = 2    # formato non ambiguo (email, IBAN sintattico, targa)
LIVELLO_LESSICO = 1    # gazetteer + frame linguistico
LIVELLO_RESIDUO = 0    # deny-by-default: non so cos'e', quindi lo copro


@dataclass(frozen=True)
class Span:
    """Una porzione di testo riconosciuta come dato personale.

    `inizio`/`fine` sono indici sul testo originale (fine esclusa).
    `etichetta` e' il tipo (CF, IBAN, FULLNAME...).
    `livello` e' la fiducia strutturale, non una probabilita'.
    `motivo` serve all'audit: perche' questo span e' stato coperto.
    """

    inizio: int
    fine: int
    etichetta: str
    livello: int
    motivo: str = ""

    @property
    def lunghezza(self) -> int:
        return self.fine - self.inizio

    def si_sovrappone(self, altro: "Span") -> bool:
        return self.inizio < altro.fine and altro.inizio < self.fine

    def contiene(self, altro: "Span") -> bool:
        return self.inizio <= altro.inizio and altro.fine <= self.fine


def risolvi_sovrapposizioni(spans: list[Span]) -> list[Span]:
    """Restituisce un insieme di span a due a due disgiunti, ordinati.

    Criteri, applicati in quest'ordine:
      1. livello di fiducia piu' alto (una prova batte un'euristica);
      2. span piu' lungo (copre piu' dato: in caso di dubbio si copre di piu');
      3. posizione piu' a sinistra (stabile e riproducibile).

    La regola 2 e' una scelta di sicurezza: fra due coperture in conflitto
    si preferisce sempre quella che lascia scoperto meno testo.
    """
    if not spans:
        return []

    ordinati = sorted(
        spans,
        key=lambda s: (-s.livello, -s.lunghezza, s.inizio, s.etichetta),
    )

    accettati: list[Span] = []
    for candidato in ordinati:
        if any(candidato.si_sovrappone(a) for a in accettati):
            continue
        accettati.append(candidato)

    accettati.sort(key=lambda s: s.inizio)
    return accettati


def unisci_adiacenti(spans: list[Span], testo: str, etichette: set[str]) -> list[Span]:
    """Fonde span consecutivi della stessa etichetta separati solo da spazi.

    Serve per i nomi: "Mario" e "Rossi" arrivano come due rilevazioni
    lessicali distinte ma sono una sola persona, e vanno sotto un solo
    segnaposto. Applicata solo alle `etichette` indicate.
    """
    if not spans:
        return []

    risultato: list[Span] = []
    for span in sorted(spans, key=lambda s: s.inizio):
        if not risultato:
            risultato.append(span)
            continue
        precedente = risultato[-1]
        separatore = testo[precedente.fine : span.inizio]
        fondibile = (
            span.etichetta == precedente.etichetta
            and span.etichetta in etichette
            and separatore != ""
            and separatore.strip() == ""
            and "\n" not in separatore
        )
        if fondibile:
            risultato[-1] = Span(
                inizio=precedente.inizio,
                fine=span.fine,
                etichetta=span.etichetta,
                livello=min(precedente.livello, span.livello),
                motivo=precedente.motivo,
            )
        else:
            risultato.append(span)
    return risultato
