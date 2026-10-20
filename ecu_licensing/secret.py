"""Chargement du secret HMAC. Jamais de valeur par defaut, jamais affiche, jamais stocke en base.

Ordre : $ECU_SECRET, puis le fichier indique par $ECU_SECRET_FILE.
Generer un secret :  python -c "import secrets;print(secrets.token_hex(32))"
"""
import os
from pathlib import Path

MIN_LEN = 32


class SecretError(RuntimeError):
    pass


def load_secret() -> bytes:
    val = os.environ.get("ECU_SECRET")
    if not val:
        path = os.environ.get("ECU_SECRET_FILE")
        if path:
            p = Path(path)
            if not p.is_file():
                raise SecretError(f"ECU_SECRET_FILE introuvable : {p}")
            val = p.read_text(encoding="utf-8").strip()
    if not val:
        raise SecretError("secret absent : definir ECU_SECRET ou ECU_SECRET_FILE")
    if len(val) < MIN_LEN:
        raise SecretError(f"secret trop court ({len(val)} car., minimum {MIN_LEN})")
    if "change" in val.lower() or "insecure" in val.lower() or "example" in val.lower():
        raise SecretError("le secret ressemble a un placeholder")
    return val.encode()
