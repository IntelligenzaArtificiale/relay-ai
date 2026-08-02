import unittest

from velo.checksums import (
    _CF_DISPARI,
    valida_cap,
    valida_codice_fiscale,
    valida_iban,
    valida_luhn,
    valida_partita_iva,
)

# CF di comodo, generati dall'algoritmo e verificati dagli invarianti sotto.
CF_UOMO = "RSSMRA85M01H501Q"
CF_DONNA = "BNCLCU90A41F205Z"
CF_OMOCODICO = "RSSMRA85M01HRLMO"


class TestTabellaUfficiale(unittest.TestCase):
    """La tabella dei valori dispari ha due invarianti pubblicati: se
    entrambi valgono, la tabella e' quella ufficiale e non contiene refusi."""

    def test_cifra_e_lettera_corrispondente_hanno_stesso_valore(self):
        for i in range(10):
            self.assertEqual(_CF_DISPARI[str(i)], _CF_DISPARI["ABCDEFGHIJ"[i]])

    def test_lettere_permutano_zero_venticinque(self):
        valori = sorted(_CF_DISPARI[c] for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        self.assertEqual(valori, list(range(26)))


class TestCodiceFiscale(unittest.TestCase):
    def test_validi(self):
        for cf in (CF_UOMO, CF_DONNA):
            self.assertTrue(valida_codice_fiscale(cf), cf)

    def test_minuscolo_e_spazi(self):
        self.assertTrue(valida_codice_fiscale(f" {CF_UOMO.lower()} "))

    def test_carattere_controllo_errato(self):
        self.assertFalse(valida_codice_fiscale("RSSMRA85M01H501A"))

    def test_lunghezza_errata(self):
        self.assertFalse(valida_codice_fiscale("RSSMRA85M01H501"))

    def test_mese_inesistente(self):
        # 'G' non e' una lettera di mese valida.
        self.assertFalse(valida_codice_fiscale("RSSMRA85G01H501Z"))

    def test_giorno_impossibile(self):
        self.assertFalse(valida_codice_fiscale("RSSMRA85M99H501Z"))

    def test_non_alfanumerico(self):
        self.assertFalse(valida_codice_fiscale("RSSMRA85M01H501!"))

    def test_omocodia_accettata(self):
        """Un CF omocodico ha lettere dove il formato base vuole cifre: e'
        valido, e un regex `[A-Z]{6}\\d{2}[A-Z]\\d{2}` lo perde."""
        self.assertTrue(valida_codice_fiscale(CF_OMOCODICO))

    def test_omocodia_con_controllo_errato(self):
        self.assertFalse(valida_codice_fiscale("RSSMRA85M01HRLMA"))


class TestPartitaIva(unittest.TestCase):
    def test_valida(self):
        self.assertTrue(valida_partita_iva("00743110157"))

    def test_checksum_errato(self):
        self.assertFalse(valida_partita_iva("00743110158"))

    def test_ufficio_inesistente(self):
        # Codice ufficio 700 non e' fra quelli ammessi.
        self.assertFalse(valida_partita_iva("12345677001"))

    def test_lunghezza(self):
        self.assertFalse(valida_partita_iva("1234567890"))


class TestIban(unittest.TestCase):
    def test_valido_it(self):
        self.assertTrue(valida_iban("IT60X0542811101000000123456"))

    def test_con_spazi(self):
        self.assertTrue(valida_iban("IT60 X054 2811 1010 0000 0123 456"))

    def test_mod97_errato(self):
        self.assertFalse(valida_iban("IT61X0542811101000000123456"))

    def test_lunghezza_paese_errata(self):
        self.assertFalse(valida_iban("IT60X05428111010000001234"))


class TestLuhn(unittest.TestCase):
    def test_valida(self):
        self.assertTrue(valida_luhn("4111111111111111"))

    def test_con_separatori(self):
        self.assertTrue(valida_luhn("4111 1111 1111 1111"))

    def test_errata(self):
        self.assertFalse(valida_luhn("4111111111111112"))

    def test_troppo_corta(self):
        self.assertFalse(valida_luhn("41111"))


class TestCap(unittest.TestCase):
    def test_validi(self):
        self.assertTrue(valida_cap("00185"))
        self.assertTrue(valida_cap("20121"))

    def test_fuori_range(self):
        self.assertFalse(valida_cap("99999"))

    def test_non_numerico(self):
        self.assertFalse(valida_cap("0018A"))


if __name__ == "__main__":
    unittest.main()
