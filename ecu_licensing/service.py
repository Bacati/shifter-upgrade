"""Logique metier : stock, reservation atomique, emission des cles, mises a niveau.

C'est ce module que le futur site e-commerce appellera (directement ou via une API).
"""
from .keys import TIER_NAME, fingerprint, make_key, normalise_mac, parse_tier
from .store import Store, now


class LicensingError(Exception):
    pass


class OutOfStock(LicensingError):
    pass


class UnknownEcu(LicensingError):
    pass


class BadState(LicensingError):
    pass


class Service:
    def __init__(self, store: Store, secret: bytes):
        self.store = store
        self._secret = secret

    # ---- stock ---------------------------------------------------------------------------
    def add_stock(self, mac: str) -> str:
        mac = normalise_mac(mac)
        with self.store.tx() as c:
            if c.execute("SELECT 1 FROM ecu WHERE mac=?", (mac,)).fetchone():
                raise BadState(f"{mac} est deja enregistre")
            c.execute("INSERT INTO ecu(mac,status,tier,added_at) VALUES(?, 'stock', 0, ?)", (mac, now()))
        return mac

    def stock_count(self) -> int:
        return self.store.query("SELECT COUNT(*) n FROM ecu WHERE status='stock'")[0]["n"]

    def get_order(self, order_ref: str) -> dict:
        with self.store.tx() as c:
            return dict(self._by_order(c, order_ref))

    def list_ecus(self, status: str = None):
        if status:
            return self.store.query("SELECT * FROM ecu WHERE status=? ORDER BY added_at, mac", (status,))
        return self.store.query("SELECT * FROM ecu ORDER BY added_at, mac")

    # ---- commande ------------------------------------------------------------------------
    def reserve(self, order_ref: str, tier) -> dict:
        """Prend le plus ancien ECU en stock pour cette commande. Idempotent : meme commande -> meme ECU."""
        order_ref = (order_ref or "").strip()
        if not order_ref:
            raise LicensingError("reference de commande vide")
        t = parse_tier(tier)
        with self.store.tx() as c:
            row = c.execute("SELECT * FROM ecu WHERE order_ref=?", (order_ref,)).fetchone()
            if row:
                if row["tier"] != t:
                    raise BadState(f"la commande {order_ref} existe deja avec le niveau {TIER_NAME[row['tier']]}")
                return dict(row)
            row = c.execute("SELECT * FROM ecu WHERE status='stock' ORDER BY added_at, rowid LIMIT 1").fetchone()
            if not row:
                raise OutOfStock("plus aucun ECU en stock")
            c.execute("UPDATE ecu SET status='reserved', tier=?, order_ref=?, reserved_at=? WHERE mac=?",
                      (t, order_ref, now(), row["mac"]))
            return dict(c.execute("SELECT * FROM ecu WHERE mac=?", (row["mac"],)).fetchone())

    def release(self, order_ref: str) -> None:
        """Annule une commande NON programmee : l'ECU retourne en stock."""
        with self.store.tx() as c:
            row = self._by_order(c, order_ref)
            if row["status"] != "reserved":
                raise BadState(f"commande {order_ref} : statut {row['status']}, annulation impossible")
            c.execute("UPDATE ecu SET status='stock', tier=0, order_ref=NULL, reserved_at=NULL WHERE mac=?", (row["mac"],))

    def issue_key(self, order_ref: str):
        """Cle d'activation de la commande ; None si BASIC (aucune cle necessaire)."""
        with self.store.tx() as c:
            row = self._by_order(c, order_ref)
            if row["status"] == "stock":
                raise BadState("ECU non reserve")
            return self._key(c, row["mac"], row["tier"], row["order_ref"], "issue")

    def mark_programmed(self, order_ref: str, mac: str) -> None:
        mac = normalise_mac(mac)
        with self.store.tx() as c:
            row = self._by_order(c, order_ref)
            if row["mac"] != mac:
                raise BadState(f"commande {order_ref} : ECU attendu {row['mac']}, recu {mac}")
            if row["status"] != "reserved":
                raise BadState(f"commande {order_ref} : statut {row['status']}, attendu reserved")
            c.execute("UPDATE ecu SET status='programmed', programmed_at=? WHERE mac=?", (now(), mac))

    def mark_shipped(self, order_ref: str) -> None:
        with self.store.tx() as c:
            row = self._by_order(c, order_ref)
            ok = row["status"] == "programmed" or (row["status"] == "reserved" and row["tier"] == 0)
            if not ok:
                raise BadState(f"commande {order_ref} : statut {row['status']}, expedition impossible")
            c.execute("UPDATE ecu SET status='shipped', shipped_at=? WHERE mac=?", (now(), row["mac"]))

    # ---- apres-vente ---------------------------------------------------------------------
    def upgrade_key(self, mac: str, new_tier) -> str:
        """Mise a niveau d'un ECU DEJA VENDU, identifie par son HWID (lu sur la page web de la carte).
        Refuse toute MAC inconnue (sinon n'importe qui ferait generer des cles) et toute baisse de niveau."""
        mac = normalise_mac(mac)
        t = parse_tier(new_tier)
        with self.store.tx() as c:
            row = c.execute("SELECT * FROM ecu WHERE mac=?", (mac,)).fetchone()
            if not row:
                raise UnknownEcu(f"{mac} : ECU inconnu")
            if row["status"] not in ("programmed", "shipped"):
                raise BadState(f"{mac} : statut {row['status']}, mise a niveau impossible")
            if t <= row["tier"]:
                raise BadState(f"{mac} : niveau actuel {TIER_NAME[row['tier']]}, demande {TIER_NAME[t]} (pas une mise a niveau)")
            c.execute("UPDATE ecu SET tier=? WHERE mac=?", (t, mac))
            return self._key(c, mac, t, row["order_ref"], "upgrade")

    def reissue_key(self, mac: str):
        """SAV : recalcule la cle du niveau actuel (carte reinitialisee)."""
        mac = normalise_mac(mac)
        with self.store.tx() as c:
            row = c.execute("SELECT * FROM ecu WHERE mac=?", (mac,)).fetchone()
            if not row:
                raise UnknownEcu(f"{mac} : ECU inconnu")
            if row["status"] not in ("programmed", "shipped"):
                raise BadState(f"{mac} : statut {row['status']}")
            return self._key(c, mac, row["tier"], row["order_ref"], "reissue")

    # ---- interne -------------------------------------------------------------------------
    @staticmethod
    def _by_order(c, order_ref):
        row = c.execute("SELECT * FROM ecu WHERE order_ref=?", ((order_ref or "").strip(),)).fetchone()
        if not row:
            raise UnknownEcu(f"commande {order_ref!r} : aucun ECU reserve")
        return row

    def _key(self, c, mac, tier, order_ref, action):
        if tier == 0:
            return None
        key = make_key(self._secret, mac, tier)
        c.execute("INSERT INTO key_log(ts,mac,tier,order_ref,action,key_fp) VALUES(?,?,?,?,?,?)",
                  (now(), mac, tier, order_ref, action, fingerprint(key)))
        return key
