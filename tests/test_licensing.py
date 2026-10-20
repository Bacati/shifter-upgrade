import hashlib
import hmac
import io
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from ecu_licensing import cli
from ecu_licensing.board import BoardError
from ecu_licensing.keys import KEY_LEN, make_key, normalise_mac, parse_tier
from ecu_licensing.secret import SecretError, load_secret
from ecu_licensing.service import BadState, LicensingError, OutOfStock, Service, UnknownEcu
from ecu_licensing.store import Store

SECRET = b"unit-test-secret-0123456789abcdef-0123456789"
MACS = [f"24:6F:28:00:00:{i:02X}" for i in range(1, 61)]


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.dir.name, "t.sqlite3")
        self.svc = Service(Store(self.db), SECRET)

    def tearDown(self):
        self.dir.cleanup()

    def stock(self, n):
        for m in MACS[:n]:
            self.svc.add_stock(m)


class TestKeys(Base):
    def test_cle_identique_a_hmac_independant(self):
        for t, name in enumerate(["BASIC", "TRACK", "PRO"]):
            exp = hmac.new(SECRET, f"AA:BB:CC:DD:EE:FF:{t}".encode(), hashlib.sha256).hexdigest().upper()[:KEY_LEN]
            self.assertEqual(make_key(SECRET, "aa-bb-cc-dd-ee-ff", name), exp)

    def test_parite_avec_outil_du_firmware(self):
        tool = Path(__file__).resolve().parents[2] / "shifter" / "tools" / "make_key.py"
        if not tool.is_file():
            self.skipTest("depot shifter absent")
        r = subprocess.run([sys.executable, str(tool), "--all", "AA:BB:CC:DD:EE:FF"], capture_output=True, text=True,
                           env={**os.environ, "APTATIO_SECRET": SECRET.decode()})
        for t in range(3):
            self.assertIn(make_key(SECRET, "AA:BB:CC:DD:EE:FF", t), r.stdout)

    def test_mac_et_tier_invalides(self):
        for bad in ["", "AA:BB", "ZZ:BB:CC:DD:EE:FF", "AA:BB:CC:DD:EE:FF:00", None]:
            with self.assertRaises(ValueError):
                normalise_mac(bad)
        for bad in ["GOLD", 3, -1, True, "", None]:
            with self.assertRaises(ValueError):
                parse_tier(bad)

    def test_cles_distinctes_par_tier_et_par_carte(self):
        ks = {make_key(SECRET, m, t) for m in MACS for t in (0, 1, 2)}
        self.assertEqual(len(ks), len(MACS) * 3)
        self.assertNotEqual(make_key(SECRET, MACS[0], 2), make_key(b"x" * 40, MACS[0], 2))


class TestSecret(unittest.TestCase):
    def setUp(self):
        self.old = {k: os.environ.pop(k, None) for k in ("ECU_SECRET", "ECU_SECRET_FILE")}

    def tearDown(self):
        for k, v in self.old.items():
            os.environ.pop(k, None)
            if v is not None:
                os.environ[k] = v

    def test_absent_court_placeholder_refuses(self):
        with self.assertRaises(SecretError):
            load_secret()
        for bad in ["short", "CHANGE-ME-" + "x" * 40, "insecure-" + "y" * 40]:
            os.environ["ECU_SECRET"] = bad
            with self.assertRaises(SecretError):
                load_secret()

    def test_env_et_fichier(self):
        os.environ["ECU_SECRET"] = "k" * 40
        self.assertEqual(load_secret(), b"k" * 40)
        del os.environ["ECU_SECRET"]
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "s.txt"
            p.write_text("z" * 50 + "\n")
            os.environ["ECU_SECRET_FILE"] = str(p)
            self.assertEqual(load_secret(), b"z" * 50)
            os.environ["ECU_SECRET_FILE"] = str(Path(d) / "absent")
            with self.assertRaises(SecretError):
                load_secret()


class TestStock(Base):
    def test_doublon_refuse_et_mac_normalisee(self):
        self.svc.add_stock("aa-bb-cc-dd-ee-ff")
        with self.assertRaises(BadState):
            self.svc.add_stock("AA:BB:CC:DD:EE:FF")
        self.assertEqual(self.svc.stock_count(), 1)

    def test_reservation_plus_ancien_d_abord_et_rupture(self):
        self.stock(2)
        a = self.svc.reserve("C1", "TRACK")
        b = self.svc.reserve("C2", "PRO")
        self.assertEqual((a["mac"], b["mac"]), (MACS[0], MACS[1]))
        self.assertEqual((a["tier"], b["tier"]), (1, 2))
        with self.assertRaises(OutOfStock):
            self.svc.reserve("C3", "TRACK")

    def test_reservation_idempotente_par_commande(self):
        self.stock(3)
        a = self.svc.reserve("C1", "TRACK")
        self.assertEqual(self.svc.reserve("C1", "TRACK")["mac"], a["mac"])
        self.assertEqual(self.svc.stock_count(), 2)
        with self.assertRaises(BadState):
            self.svc.reserve("C1", "PRO")           # meme commande, autre niveau
        for bad in ["", "   ", None]:
            with self.assertRaises(LicensingError):
                self.svc.reserve(bad, "TRACK")
        with self.assertRaises(ValueError):
            self.svc.reserve("C9", "GOLD")
        self.assertEqual(self.svc.stock_count(), 2)  # les refus n'ont rien consomme

    def test_reservations_concurrentes_jamais_le_meme_ecu(self):
        self.stock(40)
        got, errs = [], []

        def work(i):
            try:
                got.append(Service(Store(self.db), SECRET).reserve(f"O{i}", "TRACK")["mac"])
            except Exception as e:  # noqa
                errs.append(e)

        ths = [threading.Thread(target=work, args=(i,)) for i in range(60)]
        [t.start() for t in ths]
        [t.join() for t in ths]
        self.assertEqual(len(got), 40, errs[:3])
        self.assertEqual(len(set(got)), 40, "un meme ECU attribue a deux commandes")
        self.assertEqual(sum(isinstance(e, OutOfStock) for e in errs), 20)

    def test_annulation_remet_en_stock(self):
        self.stock(1)
        self.svc.reserve("C1", "PRO")
        self.svc.release("C1")
        self.assertEqual(self.svc.stock_count(), 1)
        self.assertEqual(self.svc.reserve("C2", "TRACK")["mac"], MACS[0])
        self.svc.issue_key("C2")
        self.svc.mark_programmed("C2", MACS[0])
        with self.assertRaises(BadState):
            self.svc.release("C2")                   # deja programmee : plus annulable


class TestCles(Base):
    def setUp(self):
        super().setUp()
        self.stock(3)

    def test_cle_de_commande_correspond_a_la_mac_reservee(self):
        r = self.svc.reserve("C1", "TRACK")
        self.assertEqual(self.svc.issue_key("C1"), make_key(SECRET, r["mac"], 1))
        self.assertEqual(self.svc.issue_key("C1"), self.svc.issue_key("C1"))

    def test_basic_sans_cle_et_ecu_non_reserve_refuse(self):
        self.svc.reserve("B1", "BASIC")
        self.assertIsNone(self.svc.issue_key("B1"))
        with self.assertRaises(UnknownEcu):
            self.svc.issue_key("INCONNUE")

    def test_cycle_complet_et_transitions_interdites(self):
        r = self.svc.reserve("C1", "PRO")
        with self.assertRaises(BadState):
            self.svc.mark_shipped("C1")              # pas encore programmee
        with self.assertRaises(BadState):
            self.svc.mark_programmed("C1", MACS[2])  # mauvaise carte
        self.svc.mark_programmed("C1", r["mac"])
        with self.assertRaises(BadState):
            self.svc.mark_programmed("C1", r["mac"])
        self.svc.mark_shipped("C1")
        with self.assertRaises(BadState):
            self.svc.mark_shipped("C1")

    def test_mise_a_niveau_regles(self):
        r = self.svc.reserve("C1", "TRACK")
        with self.assertRaises(BadState):
            self.svc.upgrade_key(r["mac"], "PRO")    # pas encore livree
        self.svc.issue_key("C1"); self.svc.mark_programmed("C1", r["mac"]); self.svc.mark_shipped("C1")
        with self.assertRaises(UnknownEcu):
            self.svc.upgrade_key("11:22:33:44:55:66", "PRO")   # MAC qui n'est pas a nous
        for same_or_lower in ("TRACK", "BASIC"):
            with self.assertRaises(BadState):
                self.svc.upgrade_key(r["mac"], same_or_lower)
        k = self.svc.upgrade_key(r["mac"], "PRO")
        self.assertEqual(k, make_key(SECRET, r["mac"], 2))
        with self.assertRaises(BadState):
            self.svc.upgrade_key(r["mac"], "PRO")    # une seule fois
        self.assertEqual(self.svc.reissue_key(r["mac"]), k)
        with self.assertRaises(UnknownEcu):
            self.svc.reissue_key("11:22:33:44:55:66")

    def test_journal_sans_cle_en_clair_et_base_sans_secret(self):
        r = self.svc.reserve("C1", "PRO")
        key = self.svc.issue_key("C1")
        log = self.svc.store.query("SELECT * FROM key_log")
        self.assertEqual(len(log), 1)
        self.assertNotIn(key, str(log))
        raw = Path(self.db).read_bytes()
        self.assertNotIn(SECRET, raw)
        self.assertNotIn(key.encode(), raw)
        self.assertEqual(r["status"], "reserved")


class FakeBoard:
    """Carte factory simulee : applique une cle seulement si elle est valide pour SA mac."""
    instances = []

    def __init__(self, port, mac="24:6F:28:00:00:01", secret=SECRET, mode="ok"):
        self.mac, self.secret, self.mode, self.tier, self.closed = mac, secret, mode, 0, False
        FakeBoard.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.closed = True

    def read_mac(self):
        if self.mode == "mute":
            raise BoardError("pas de reponse")
        return self.mac

    def send_key(self, key):
        if self.mode == "lock":
            raise BoardError("LOCKED retry_ms=300000")
        for t in (2, 1, 0):
            if key == make_key(self.secret, self.mac, t):
                self.tier = max(self.tier, t)   # comme le firmware : jamais de baisse
                return self.tier
        raise BoardError("FAIL bad_key")


class TestCli(Base):
    def run_cli(self, *argv, board=None):
        FakeBoard.instances.clear()
        os.environ["ECU_SECRET"] = SECRET.decode()
        out, err = io.StringIO(), io.StringIO()
        factory = board or (lambda port: FakeBoard(port))
        with redirect_stdout(out), redirect_stderr(err):
            rc = cli.main(["--db", self.db, *argv], board_factory=factory)
        return rc, out.getvalue(), err.getvalue()

    def tearDown(self):
        os.environ.pop("ECU_SECRET", None)
        super().tearDown()

    def test_parcours_atelier_de_bout_en_bout(self):
        mf = Path(self.dir.name) / "macs.txt"
        mf.write_text("# lot 1\n24:6F:28:00:00:01\n24:6F:28:00:00:02  # commentaire\n\n")
        self.assertEqual(self.run_cli("add-file", str(mf))[0], 0)
        rc, out, _ = self.run_cli("reserve", "--order", "1234", "--tier", "TRACK")
        self.assertEqual(rc, 0)
        self.assertIn("24:6F:28:00:00:01", out)
        rc, out, err = self.run_cli("prepare", "--order", "1234", "--port", "COM9")
        self.assertEqual(rc, 0, err)
        self.assertEqual(FakeBoard.instances[0].tier, 1)
        self.assertTrue(FakeBoard.instances[0].closed)
        self.assertIn("programmee en TRACK", out)
        self.assertEqual(self.run_cli("ship", "--order", "1234")[0], 0)
        self.assertEqual(self.run_cli("prepare", "--order", "1234", "--port", "COM9")[0], 1)   # deja expediee

    def test_mauvaise_carte_refusee_et_rien_programme(self):
        self.run_cli("add", "24:6F:28:00:00:01", "24:6F:28:00:00:02")
        self.run_cli("reserve", "--order", "A", "--tier", "PRO")
        rc, _, err = self.run_cli("prepare", "--order", "A", "--port", "X",
                                  board=lambda p: FakeBoard(p, mac="24:6F:28:00:00:02"))
        self.assertEqual(rc, 1)
        self.assertIn("mauvaise carte", err)
        self.assertEqual(FakeBoard.instances[0].tier, 0)
        self.assertEqual(self.svc.get_order("A")["status"], "reserved")

    def test_pannes_carte_ne_marquent_pas_programme(self):
        self.run_cli("add", "24:6F:28:00:00:01")
        self.run_cli("reserve", "--order", "A", "--tier", "PRO")
        for mode in ("mute", "lock"):
            rc, _, err = self.run_cli("prepare", "--order", "A", "--port", "X", board=lambda p, m=mode: FakeBoard(p, mode=m))
            self.assertEqual(rc, 1, mode)
            self.assertEqual(self.svc.get_order("A")["status"], "reserved", mode)
        # carte avec un autre secret : la carte refuse la cle
        rc, _, _ = self.run_cli("prepare", "--order", "A", "--port", "X", board=lambda p: FakeBoard(p, secret=b"o" * 40))
        self.assertEqual(rc, 1)
        self.assertEqual(self.svc.get_order("A")["status"], "reserved")
        self.assertEqual(self.run_cli("prepare", "--order", "A", "--port", "X")[0], 0)   # reprise OK

    def test_prepare_reserve_si_tier_donne_et_basic_sans_programmation(self):
        self.run_cli("add", "24:6F:28:00:00:01", "24:6F:28:00:00:02")
        self.assertEqual(self.run_cli("prepare", "--order", "N1", "--tier", "TRACK", "--port", "X")[0], 0)
        rc, out, _ = self.run_cli("prepare", "--order", "N2", "--tier", "BASIC", "--port", "X")
        self.assertEqual(rc, 0)
        self.assertIn("BASIC", out)
        self.assertEqual(len(FakeBoard.instances), 0)   # aucun acces serie pour BASIC

    def test_register_stock_key_upgrade_reissue_log_cancel(self):
        self.assertEqual(self.run_cli("register", "--port", "X")[0], 0)
        self.assertEqual(self.run_cli("register", "--port", "X")[0], 1)         # deja enregistree
        self.assertEqual(self.run_cli("reserve", "--order", "Z", "--tier", "TRACK")[0], 0)
        rc, out, _ = self.run_cli("key", "--order", "Z")
        self.assertEqual(out.strip(), make_key(SECRET, "24:6F:28:00:00:01", 1))
        self.assertEqual(self.run_cli("cancel", "--order", "Z")[0], 0)
        self.assertEqual(self.run_cli("reserve", "--order", "Y", "--tier", "TRACK")[0], 0)
        self.assertEqual(self.run_cli("prepare", "--order", "Y", "--port", "X")[0], 0)
        rc, out, _ = self.run_cli("upgrade", "--mac", "24:6F:28:00:00:01", "--tier", "PRO")
        self.assertEqual((rc, out.strip()), (0, make_key(SECRET, "24:6F:28:00:00:01", 2)))
        self.assertEqual(self.run_cli("upgrade", "--mac", "24:6F:28:00:00:01", "--tier", "PRO")[0], 1)
        for c in (("stock",), ("pending",), ("log",)):
            self.assertEqual(self.run_cli(*c)[0], 0)
        self.assertEqual(self.run_cli("reissue", "--mac", "24:6F:28:00:00:01")[1].strip(), make_key(SECRET, "24:6F:28:00:00:01", 2))

    def test_sans_secret_les_commandes_de_cle_echouent_proprement(self):
        self.run_cli("add", "24:6F:28:00:00:01"); self.run_cli("reserve", "--order", "A", "--tier", "TRACK")
        os.environ.pop("ECU_SECRET", None)
        os.environ.pop("ECU_SECRET_FILE", None)
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            rc = cli.main(["--db", self.db, "key", "--order", "A"])
        self.assertEqual(rc, 1)
        self.assertIn("secret", err.getvalue())

    def test_erreurs_de_saisie(self):
        self.assertEqual(self.run_cli("add", "pas-une-mac")[0], 1)
        self.assertEqual(self.run_cli("reserve", "--order", "A", "--tier", "GOLD")[0], 1)
        self.assertEqual(self.run_cli("reserve", "--order", "A", "--tier", "PRO")[0], 1)   # stock vide


if __name__ == "__main__":
    unittest.main()
