"""Base de stock des ECU (SQLite). Aucun secret, aucune cle en clair : seulement MAC, statut, commande.

Cycle de vie d'un ECU :   stock -> reserved -> programmed -> shipped
Le niveau (tier) est celui VENDU ; un ECU en stock est BASIC (aucune cle).
"""
import datetime as dt
import sqlite3
from contextlib import contextmanager

SCHEMA = """
CREATE TABLE IF NOT EXISTS ecu (
  mac           TEXT PRIMARY KEY,
  status        TEXT NOT NULL CHECK (status IN ('stock','reserved','programmed','shipped')),
  tier          INTEGER NOT NULL DEFAULT 0 CHECK (tier BETWEEN 0 AND 2),
  order_ref     TEXT,
  added_at      TEXT NOT NULL,
  reserved_at   TEXT,
  programmed_at TEXT,
  shipped_at    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ecu_order ON ecu(order_ref) WHERE order_ref IS NOT NULL;
CREATE TABLE IF NOT EXISTS key_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL,
  mac       TEXT NOT NULL,
  tier      INTEGER NOT NULL,
  order_ref TEXT,
  action    TEXT NOT NULL,
  key_fp    TEXT NOT NULL
);
"""


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str):
        self.path = str(path)
        with self._conn() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def _conn(self):
        c = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        c.row_factory = sqlite3.Row
        try:
            yield c
        finally:
            c.close()

    @contextmanager
    def tx(self):
        """Transaction ecriture exclusive (BEGIN IMMEDIATE) : la reservation est atomique entre processus."""
        with self._conn() as c:
            c.execute("BEGIN IMMEDIATE")
            try:
                yield c
            except BaseException:
                c.execute("ROLLBACK")
                raise
            else:
                c.execute("COMMIT")

    def query(self, sql: str, args=()):
        with self._conn() as c:
            return [dict(r) for r in c.execute(sql, args).fetchall()]
