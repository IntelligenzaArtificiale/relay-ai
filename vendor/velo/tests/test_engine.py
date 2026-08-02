import unittest

from velo.engine import anonimizza, rileva, ripristina
from velo.vault import Vault


def etichette(testo, modo="standard"):
    return {s.etichetta for s in rileva(testo, modo=modo)}


def coperto(testo, frammento, modo="standard"):
    """True se `frammento` ricade dentro uno span coperto."""
    inizio = testo.index(frammento)
    fine = inizio + len(frammento)
    return any(
        s.inizio <= inizio and fine <= s.fine for s in rileva(testo, modo=modo)
    )


class TestIdentificativiPuliti(unittest.TestCase):
    def test_codice_fiscale(self):
        t = "Il C.F. e' RSSMRA85M01H501Q."
        self.assertTrue(coperto(t, "RSSMRA85M01H501Q"))

    def test_cf_non_valido_non_coperto_come_cf(self):
        """Un codice con carattere di controllo errato NON deve essere
        etichettato CF: sarebbe una falsa prova."""
        t = "Il codice RSSMRA85M01H501A non e' valido."
        cf = [s for s in rileva(t) if s.etichetta == "CF"]
        self.assertEqual(cf, [])

    def test_iban_e_piva(self):
        t = "IBAN IT60X0542811101000000123456, P.IVA 00743110157."
        self.assertIn("IBAN", etichette(t))
        self.assertIn("PIVA", etichette(t))

    def test_carta_di_credito(self):
        t = "Carta 4111 1111 1111 1111 scaduta."
        self.assertTrue(coperto(t, "4111 1111 1111 1111"))

    def test_catasto_intero(self):
        t = "Immobile al Foglio 12, particella 345, sub. 6."
        self.assertTrue(coperto(t, "Foglio 12, particella 345, sub. 6"))


class TestFormatiSporchi(unittest.TestCase):
    """I casi che arrivano davvero dall'estrazione di un PDF."""

    def test_telefono_con_spaziatura_irregolare(self):
        t = "Cell. 331 60052 21 per informazioni."
        self.assertTrue(coperto(t, "331 60052 21"))

    def test_email_con_spazio_prima_della_chiocciola(self):
        t = "Scrivere a Alex.ciciarelli @gmail.com subito."
        self.assertTrue(coperto(t, "Alex.ciciarelli @gmail.com"))

    def test_email_con_spazi_ovunque(self):
        t = "Contatto: mario . rossi @ studio-legale . it"
        self.assertTrue(coperto(t, "mario . rossi @ studio-legale . it"))

    def test_email_non_ingoia_la_frase_successiva(self):
        """Regressione: il TLD non deve estendersi oltre il punto fermo."""
        t = "PEC m.rossi@pec.studio.it. Riferimento pratica interna."
        trovate = [s for s in rileva(t) if s.etichetta == "EMAIL"]
        self.assertEqual(len(trovate), 1)
        self.assertEqual(t[trovate[0].inizio : trovate[0].fine],
                         "m.rossi@pec.studio.it")

    def test_cf_spezzato_da_spazi(self):
        t = "Cod. Fisc. RSS MRA 85M01 H501Q rilasciato in data odierna."
        self.assertTrue(coperto(t, "RSS MRA 85M01 H501Q"))

    def test_iban_con_gruppi_di_quattro(self):
        t = "IBAN: IT60 X054 2811 1010 0000 0123 456"
        self.assertTrue(coperto(t, "IT60 X054 2811 1010 0000 0123 456"))

    def test_iban_spezzato_a_capo(self):
        t = "IBAN IT60X05428-\n11101000000123456 accreditato."
        self.assertIn("IBAN", etichette(t))

    def test_piva_con_spazi(self):
        t = "P. IVA  00743 110 157 iscritta al registro."
        self.assertTrue(coperto(t, "00743 110 157"))


class TestFalsiPositivi(unittest.TestCase):
    """Un falso positivo e' peggio di un mancato: distrugge il testo senza
    aggiungere riservatezza."""

    def test_numero_lungo_non_diventa_telefono(self):
        t = "Il conto 12345678901 e il codice 00743 sono interni."
        self.assertNotIn("TELEFONO", etichette(t))

    def test_cifre_a_cinque_non_diventano_cap_senza_indizi(self):
        t = "Il codice 24122 non e' un CAP."
        self.assertNotIn("CAP", etichette(t))

    def test_cap_riconosciuto_se_seguito_da_comune(self):
        t = "Via Garibaldi 24, 24122 Bergamo"
        self.assertIn("CAP", etichette(t))

    def test_istituzione_non_e_dato_personale(self):
        t = "Il Tribunale di Milano, visto l'articolo 2043 del Codice Civile."
        self.assertFalse(coperto(t, "Tribunale"))

    def test_testo_senza_dati_resta_intatto(self):
        t = ("Premesso che il contratto ha durata quadriennale e che il canone "
             "e' corrisposto in rate mensili anticipate, si conviene quanto segue.")
        self.assertEqual(anonimizza(t).testo_anonimo, t)


class TestResidualGuard(unittest.TestCase):
    """Il livello che rende il recall una garanzia invece di una misura."""

    def test_nome_straniero_sconosciuto_viene_coperto(self):
        t = "Pagamento a Wojciech Brzeczyszczykiewicz entro il 30/09/2026."
        self.assertTrue(coperto(t, "Wojciech Brzeczyszczykiewicz"))

    def test_cognome_non_in_nessun_gazetteer(self):
        t = "Consulenza resa a Ndiaye Oumoulkhairy per la consulenza."
        self.assertTrue(coperto(t, "Ndiaye Oumoulkhairy"))

    def test_matricola_solo_in_modo_massimo(self):
        t = "Il dipendente con matricola 4471928 ha maturato ferie."
        self.assertNotIn("IGNOTO_NUM", etichette(t, modo="standard"))
        self.assertIn("IGNOTO_NUM", etichette(t, modo="massimo"))

    def test_parola_vista_minuscola_non_viene_coperta(self):
        """Se la parola compare minuscola altrove, e' un nome comune."""
        t = "Fornitura urgente. La fornitura sara' consegnata domani."
        self.assertFalse(coperto(t, "Fornitura"))


class TestVault(unittest.TestCase):
    def test_stesso_valore_stesso_segnaposto(self):
        t = "Il Sig. Mario Rossi e poi ancora il Sig. Mario Rossi."
        anonimo = anonimizza(t).testo_anonimo
        self.assertEqual(anonimo.count("[FULLNAME_1]"), 2)
        self.assertNotIn("[FULLNAME_2]", anonimo)

    def test_ripristino_semplice(self):
        t = "Il Sig. Mario Rossi, C.F. RSSMRA85M01H501Q."
        r = anonimizza(t)
        self.assertEqual(ripristina(r.testo_anonimo, r.vault), t)

    def test_ripristino_tollerante_a_markdown_e_spazi(self):
        """Il modello remoto restituisce i segnaposto sporchi: vanno risolti
        lo stesso, altrimenti il giro si rompe nell'ultimo passaggio."""
        r = anonimizza("Il Sig. Mario Rossi paga.")
        for forma in ("[ FULLNAME_1 ]", "[fullname_1]", "[FULLNAME - 1]",
                      "(FULLNAME_1)", "[*FULLNAME_1*]"):
            with self.subTest(forma=forma):
                self.assertEqual(ripristina(f"Ecco {forma}.", r.vault),
                                 "Ecco Mario Rossi.")

    def test_formattazione_esterna_al_segnaposto_resta(self):
        """Il grassetto attorno al segnaposto e' formattazione della risposta,
        non parte del segnaposto: va conservato."""
        r = anonimizza("Il Sig. Mario Rossi paga.")
        self.assertEqual(ripristina("Ecco **[FULLNAME_1]**.", r.vault),
                         "Ecco **Mario Rossi**.")

    def test_segnaposto_inventato_viene_segnalato(self):
        r = anonimizza("Il Sig. Mario Rossi paga.")
        self.assertEqual(r.vault.segnaposto_non_risolti("Ecco [FULLNAME_9]."),
                         ["[FULLNAME_9]"])

    def test_persistenza_json(self):
        r = anonimizza("Il Sig. Mario Rossi, C.F. RSSMRA85M01H501Q.")
        ricaricato = Vault.from_json(r.vault.to_json())
        self.assertEqual(ripristina(r.testo_anonimo, ricaricato),
                         "Il Sig. Mario Rossi, C.F. RSSMRA85M01H501Q.")

    def test_nessun_valore_reale_nel_testo_anonimo(self):
        """Invariante centrale: nessun valore del vault deve sopravvivere
        nel testo che esce dalla macchina."""
        t = ("Il Sig. Mario Rossi, C.F. RSSMRA85M01H501Q, IBAN "
             "IT60X0542811101000000123456, tel. 331 60052 21, "
             "email alex.ciciarelli @gmail.com, P.IVA 00743110157.")
        r = anonimizza(t, modo="massimo")
        for segnaposto, valore in r.vault.per_segnaposto.items():
            with self.subTest(segnaposto=segnaposto):
                self.assertNotIn(valore, r.testo_anonimo)


class TestRoundTrip(unittest.TestCase):
    ATTO = """ATTO DI COMPRAVENDITA - Rep. n. 45231/2024

Il giorno 12 marzo 2024, innanzi a me dott. Alessandro Ferraris, Notaio in Bergamo,
sono comparsi il Sig. Mario Rossi, nato a Crema il 01/01/1985, C.F. RSSMRA85M01H501Q,
residente in Via Giuseppe Garibaldi 24, CAP 24122 Bergamo, e la Sig.ra Zdravka Milenkovic,
titolare della ditta Vetrerie Zanardelli S.r.l., P.IVA 00743110157, con sede in Treviglio.
Il prezzo di 185.000,00 euro sara' versato sull'IBAN IT60X0542811101000000123456.
Immobile al Foglio 12, particella 345, sub. 6.
Contatti: m.rossi@studio.it, tel. 331 60052 21."""

    def test_round_trip_identico(self):
        r = anonimizza(self.ATTO)
        self.assertEqual(ripristina(r.testo_anonimo, r.vault), self.ATTO)

    def test_tutti_gli_identificativi_coperti(self):
        attese = {"CF", "PIVA", "IBAN", "EMAIL", "TELEFONO", "CATASTO",
                  "DOCID", "FULLNAME", "ORG", "CAP", "INDIRIZZO"}
        self.assertTrue(attese.issubset(etichette(self.ATTO)),
                        attese - etichette(self.ATTO))

    def test_nessun_ignoto_su_atto_ben_formato(self):
        """Se il residual guard scatta su un atto standard, la whitelist e'
        troppo povera: e' il termometro del sovra-mascheramento."""
        ignoti = [s for s in rileva(self.ATTO) if s.etichetta == "IGNOTO"]
        self.assertEqual(ignoti, [], [self.ATTO[s.inizio:s.fine] for s in ignoti])


if __name__ == "__main__":
    unittest.main()
