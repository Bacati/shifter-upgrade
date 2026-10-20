"""Calcul des cles de licence. DOIT rester identique a src/persistence/License.cpp du firmware :

    cle = HEX_MAJ( HMAC-SHA256( SECRET, "<MAC>:<tier>" ) )[0 .. KEY_LEN-1]
"""
import hashlib
import hmac
import re

KEY_LEN = 16  # = LICENSE_KEY_HEX_LEN du firmware
TIERS = {"BASIC": 0, "TRACK": 1, "PRO": 2}
TIER_NAME = {v: k for k, v in TIERS.items()}


def normalise_mac(mac: str) -> str:
    """Format de WiFi.macAddress() : 6 octets hex MAJ separes par ':'."""
    raw = re.sub(r"[^0-9A-Fa-f]", "", mac or "")
    if len(raw) != 12:
        raise ValueError(f"MAC invalide : {mac!r} (6 octets hex attendus)")
    return ":".join(raw[i:i + 2] for i in range(0, 12, 2)).upper()


def parse_tier(value) -> int:
    if isinstance(value, int) and not isinstance(value, bool) and value in TIER_NAME:
        return value
    u = str(value).strip().upper()
    if u in TIERS:
        return TIERS[u]
    if u.isdigit() and int(u) in TIER_NAME:
        return int(u)
    raise ValueError(f"tier invalide : {value!r} (BASIC / TRACK / PRO)")


def make_key(secret: bytes, mac: str, tier) -> str:
    payload = f"{normalise_mac(mac)}:{parse_tier(tier)}".encode()
    return hmac.new(secret, payload, hashlib.sha256).hexdigest().upper()[:KEY_LEN]


def fingerprint(key: str) -> str:
    """Empreinte non reversible pour le journal (la cle elle-meme n'est jamais stockee)."""
    return hashlib.sha256(key.encode()).hexdigest()[:8]
