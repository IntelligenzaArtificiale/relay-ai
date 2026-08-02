"""Interfaccia a riga di comando.

Tre verbi, che corrispondono ai tre momenti del flusso reale:

    velo anonimizza  atto.txt -o anonimo.txt -v vault.json
    (incolli anonimo.txt nel modello remoto, ne copi la risposta)
    velo ripristina  risposta.txt -v vault.json
    velo audit       atto.txt      # cosa verrebbe coperto, e perche'

`audit` esiste perche' un presidio di riservatezza va ispezionato prima di
essere creduto: mostra ogni span, la sua etichetta e il motivo per cui e'
stato coperto.
"""

import argparse
import sys
from pathlib import Path

from .engine import anonimizza, rileva, ripristina
from .vault import Vault


def _leggi(percorso: str | None) -> str:
    if percorso in (None, "-"):
        return sys.stdin.read()
    return Path(percorso).read_text(encoding="utf-8")


def _scrivi(contenuto: str, percorso: str | None) -> None:
    if percorso is None:
        sys.stdout.write(contenuto)
    else:
        Path(percorso).write_text(contenuto, encoding="utf-8")


def _cmd_anonimizza(args: argparse.Namespace) -> int:
    testo = _leggi(args.sorgente)
    referto = anonimizza(testo, modo=args.modo)
    _scrivi(referto.testo_anonimo, args.output)

    if args.vault:
        Path(args.vault).write_text(referto.vault.to_json(), encoding="utf-8")
    elif args.output:
        # Senza vault il ripristino e' impossibile: meglio dirlo subito.
        print("attenzione: nessun vault salvato, il testo non sara' "
              "ripristinabile (usa -v)", file=sys.stderr)

    riepilogo = ", ".join(
        f"{k}={v}" for k, v in referto.conteggio_per_etichetta().items()
    )
    print(
        f"coperti {len(referto.spans)} elementi "
        f"({referto.copertura * 100:.1f}% del testo) — {riepilogo}",
        file=sys.stderr,
    )
    return 0


def _cmd_ripristina(args: argparse.Namespace) -> int:
    if not args.vault:
        print("errore: serve il vault (-v)", file=sys.stderr)
        return 2
    vault = Vault.from_json(Path(args.vault).read_text(encoding="utf-8"))
    testo = _leggi(args.sorgente)

    mancanti = vault.segnaposto_non_risolti(testo)
    if mancanti:
        print(
            f"attenzione: {len(mancanti)} segnaposto non presenti nel vault "
            f"({', '.join(mancanti[:5])}): il modello remoto li ha inventati "
            f"e restano invariati",
            file=sys.stderr,
        )

    _scrivi(ripristina(testo, vault), args.output)
    return 0


def _cmd_audit(args: argparse.Namespace) -> int:
    testo = _leggi(args.sorgente)
    spans = rileva(testo, modo=args.modo)
    nomi_livello = {3: "PROVA", 2: "FORMATO", 1: "LESSICO", 0: "RESIDUO"}
    for span in spans:
        valore = " ".join(testo[span.inizio : span.fine].split())
        print(
            f"{span.inizio:>7}  {nomi_livello[span.livello]:<8} "
            f"{span.etichetta:<12} {valore[:40]:<42} {span.motivo}"
        )
    print(f"\n{len(spans)} elementi coperti su {len(testo)} caratteri",
          file=sys.stderr)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="velo",
        description="Anonimizzazione locale e reversibile di testi italiani.",
    )
    sotto = parser.add_subparsers(dest="comando", required=True)

    def comune(p: argparse.ArgumentParser) -> None:
        p.add_argument("sorgente", nargs="?", default="-",
                       help="file di ingresso, oppure - per stdin")
        p.add_argument("-o", "--output", help="file di uscita (default: stdout)")
        p.add_argument("-v", "--vault", help="file JSON della mappa dei segnaposto")

    p_anon = sotto.add_parser("anonimizza", help="sostituisce i dati con segnaposto")
    comune(p_anon)
    p_anon.add_argument("--modo", choices=("standard", "massimo"), default="standard",
                        help="massimo copre anche le sequenze numeriche non spiegate")
    p_anon.set_defaults(funzione=_cmd_anonimizza)

    p_rip = sotto.add_parser("ripristina", help="rimette i valori reali")
    comune(p_rip)
    p_rip.set_defaults(funzione=_cmd_ripristina)

    p_aud = sotto.add_parser("audit", help="mostra cosa verrebbe coperto e perche'")
    comune(p_aud)
    p_aud.add_argument("--modo", choices=("standard", "massimo"), default="standard")
    p_aud.set_defaults(funzione=_cmd_audit)

    args = parser.parse_args(argv)
    return args.funzione(args)


if __name__ == "__main__":
    raise SystemExit(main())
