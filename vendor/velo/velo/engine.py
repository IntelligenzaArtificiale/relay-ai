"""Motore: mette in fila i tre livelli e produce il testo anonimizzato.

L'ordine non e' casuale. Ogni livello vede cio' che i precedenti hanno gia'
spiegato, cosi' il residual guard copre solo il residuo vero e non ricopre
un IBAN gia' riconosciuto.
"""

from dataclasses import dataclass, field

from .frames import trova_nomi_da_gazetteer, trova_org_da_suffisso, trova_per_frame
from .recognizers import trova_deterministici
from .sporco import trova_sporchi
from .residual import trova_residui
from .spans import Span, risolvi_sovrapposizioni, unisci_adiacenti
from .tokens import tokenizza
from .vault import Vault

# Etichette i cui span adiacenti vanno fusi: "Mario" + "Rossi" = una persona.
_FONDIBILI = {"FULLNAME", "IGNOTO", "ORG"}


@dataclass
class Referto:
    """Esito di un'anonimizzazione, ispezionabile prima di inviare nulla."""

    testo_anonimo: str
    vault: Vault
    spans: list[Span] = field(default_factory=list)

    def conteggio_per_etichetta(self) -> dict[str, int]:
        conteggio: dict[str, int] = {}
        for span in self.spans:
            conteggio[span.etichetta] = conteggio.get(span.etichetta, 0) + 1
        return dict(sorted(conteggio.items(), key=lambda kv: (-kv[1], kv[0])))

    @property
    def copertura(self) -> float:
        """Frazione di caratteri del testo originale coperti da segnaposto."""
        if not self._lunghezza_originale:
            return 0.0
        coperti = sum(s.lunghezza for s in self.spans)
        return coperti / self._lunghezza_originale

    _lunghezza_originale: int = 0


def rileva(testo: str, modo: str = "standard") -> list[Span]:
    """Esegue i tre livelli e restituisce gli span finali, disgiunti."""
    tokens = tokenizza(testo)

    # Livello 1: prova matematica e formati inequivocabili.
    deterministici = trova_deterministici(testo) + trova_sporchi(testo)

    # Livello 2: frame giuridici e gazetteer.
    lessicali = (
        trova_per_frame(testo)
        + trova_nomi_da_gazetteer(testo, tokens)
        + trova_org_da_suffisso(testo, tokens)
    )

    # I primi due livelli si risolvono fra loro prima di interrogare il terzo,
    # altrimenti il residual guard ricoprirebbe cose gia' spiegate.
    noti = risolvi_sovrapposizioni(deterministici + lessicali)

    # Livello 3: tutto il resto.
    residui = trova_residui(testo, tokens, noti, modo=modo)

    finali = risolvi_sovrapposizioni(noti + residui)
    return unisci_adiacenti(finali, testo, _FONDIBILI)


def anonimizza(testo: str, modo: str = "standard", vault: Vault | None = None) -> Referto:
    """Sostituisce ogni dato rilevato con un segnaposto stabile e reversibile."""
    spans = rileva(testo, modo=modo)
    vault = vault or Vault()

    pezzi: list[str] = []
    cursore = 0
    for span in spans:
        pezzi.append(testo[cursore : span.inizio])
        valore = testo[span.inizio : span.fine]
        pezzi.append(vault.segnaposto_per(span.etichetta, valore))
        cursore = span.fine
    pezzi.append(testo[cursore:])

    referto = Referto(
        testo_anonimo="".join(pezzi),
        vault=vault,
        spans=spans,
    )
    referto._lunghezza_originale = len(testo)
    return referto


def ripristina(testo: str, vault: Vault) -> str:
    """Rimette i valori reali nella risposta del modello remoto."""
    return vault.ripristina(testo)
