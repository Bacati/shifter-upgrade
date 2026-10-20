"""Outil en ligne de commande de l'atelier.   python -m ecu_licensing --help"""
import argparse
import os
import sys

from .board import BoardError, SerialBoard
from .keys import TIER_NAME, normalise_mac
from .secret import SecretError, load_secret
from .service import LicensingError, Service
from .store import Store

NEEDS_SECRET = {"key", "prepare", "upgrade", "reissue"}


def build_parser():
    p = argparse.ArgumentParser(prog="ecu_licensing", description="Stock d'ECU + cles de licence ECU.")
    p.add_argument("--db", default=os.environ.get("ECU_DB", "licensing.sqlite3"), help="fichier SQLite (defaut : $ECU_DB ou ./licensing.sqlite3)")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("add", help="ajoute des MAC au stock (BASIC)"); s.add_argument("mac", nargs="+")
    s = sub.add_parser("add-file", help="ajoute les MAC d'un fichier (une par ligne)"); s.add_argument("path")
    s = sub.add_parser("register", help="lit la MAC de la carte branchee et l'ajoute au stock"); s.add_argument("--port", required=True)
    sub.add_parser("stock", help="etat du stock")
    sub.add_parser("pending", help="commandes reservees / programmees, a traiter")
    sub.add_parser("log", help="journal des cles emises")

    s = sub.add_parser("reserve", help="reserve un ECU pour une commande (ce que fera le site)")
    s.add_argument("--order", required=True); s.add_argument("--tier", required=True)
    s = sub.add_parser("key", help="affiche la cle d'une commande (copier-coller)"); s.add_argument("--order", required=True)
    s = sub.add_parser("prepare", help="BRANCHER la carte puis : verifie la MAC, programme le niveau, marque 'programme'")
    s.add_argument("--order", required=True); s.add_argument("--port", required=True)
    s.add_argument("--tier", help="reserve d'abord si la commande n'existe pas encore")
    s = sub.add_parser("ship", help="marque la commande expediee"); s.add_argument("--order", required=True)
    s = sub.add_parser("cancel", help="annule une commande non programmee"); s.add_argument("--order", required=True)
    s = sub.add_parser("upgrade", help="cle de mise a niveau d'un ECU vendu (HWID)")
    s.add_argument("--mac", required=True); s.add_argument("--tier", required=True)
    s = sub.add_parser("reissue", help="SAV : meme cle que le niveau actuel"); s.add_argument("--mac", required=True)
    return p


def _table(rows, cols):
    if not rows:
        print("(vide)")
        return
    w = {c: max(len(c), *(len(str(r.get(c) or "")) for r in rows)) for c in cols}
    print("  ".join(c.ljust(w[c]) for c in cols))
    for r in rows:
        print("  ".join(str(r.get(c) if r.get(c) is not None else "").ljust(w[c]) for c in cols))


def _show(row):
    return {**row, "tier": TIER_NAME[row["tier"]]}


def run(args, board_factory):
    store = Store(args.db)
    svc = Service(store, load_secret() if args.cmd in NEEDS_SECRET else b"")
    c = args.cmd
    if c == "add":
        for m in args.mac:
            print("ajoute :", svc.add_stock(m))
    elif c == "add-file":
        n = 0
        for line in open(args.path, encoding="utf-8"):
            line = line.split("#")[0].strip()
            if line:
                svc.add_stock(line); n += 1
        print(f"{n} ECU ajoutes, stock = {svc.stock_count()}")
    elif c == "register":
        with board_factory(args.port) as b:
            print("ajoute :", svc.add_stock(b.read_mac()))
    elif c == "stock":
        print(f"en stock : {svc.stock_count()}")
        _table([_show(r) for r in svc.list_ecus()], ["mac", "status", "tier", "order_ref"])
    elif c == "pending":
        rows = [_show(r) for r in svc.list_ecus() if r["status"] in ("reserved", "programmed")]
        _table(rows, ["order_ref", "mac", "tier", "status"])
    elif c == "log":
        _table(store.query("SELECT ts,mac,tier,order_ref,action,key_fp FROM key_log ORDER BY id"), ["ts", "mac", "tier", "order_ref", "action", "key_fp"])
    elif c == "reserve":
        r = svc.reserve(args.order, args.tier)
        print(f"commande {r['order_ref']} -> ECU {r['mac']} ({TIER_NAME[r['tier']]})")
    elif c == "key":
        k = svc.issue_key(args.order)
        print(k if k else "BASIC : aucune cle necessaire")
    elif c == "prepare":
        row = svc.reserve(args.order, args.tier) if args.tier else svc.get_order(args.order)
        if row["tier"] == 0:
            print(f"BASIC : rien a programmer. ECU a expedier : {row['mac']}"); return 0
        with board_factory(args.port) as b:
            mac = b.read_mac()
            if mac != row["mac"]:
                raise LicensingError(f"mauvaise carte : branchee {mac}, attendue {row['mac']} (commande {args.order})")
            applied = b.send_key(svc.issue_key(args.order))
            if applied != row["tier"]:
                raise BoardError(f"niveau applique {TIER_NAME.get(applied, applied)} != attendu {TIER_NAME[row['tier']]}")
        svc.mark_programmed(args.order, mac)
        print(f"OK : {mac} programmee en {TIER_NAME[applied]} (commande {args.order}). Flasher la prod SANS effacer la NVS, puis : ship --order {args.order}")
    elif c == "ship":
        svc.mark_shipped(args.order); print("expediee :", args.order)
    elif c == "cancel":
        svc.release(args.order); print("annulee :", args.order)
    elif c == "upgrade":
        print(svc.upgrade_key(args.mac, args.tier))
    elif c == "reissue":
        k = svc.reissue_key(args.mac)
        print(k if k else "BASIC : aucune cle necessaire")
    return 0


def main(argv=None, board_factory=SerialBoard):
    args = build_parser().parse_args(argv)
    try:
        return run(args, board_factory)
    except (LicensingError, BoardError, SecretError, ValueError) as e:
        print("ERREUR :", e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
