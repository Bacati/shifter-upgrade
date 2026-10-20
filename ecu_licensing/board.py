"""Dialogue serie avec une carte flashee en firmware 'factory' (pio run -e factory).

Protocole (src/factory/Factory.cpp) :  MAC?  ->  "MAC AA:BB:..."   KEY <cle>  ->  "OK tier=n" | "FAIL bad_key" | "LOCKED retry_ms=n"
"""
import time

from .keys import normalise_mac


class BoardError(RuntimeError):
    pass


class SerialBoard:
    """Carte reelle sur un port serie (pyserial). Le meme objet sert de modele aux faux des tests."""

    def __init__(self, port: str, baud: int = 115200, boot_wait_s: float = 1.5):
        try:
            import serial
        except ImportError:
            raise BoardError("pyserial manquant :  pip install pyserial")
        self._ser = serial.Serial(port, baud, timeout=0.2)
        time.sleep(boot_wait_s)   # la carte redemarre a l'ouverture du port

    def close(self):
        self._ser.close()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    def _lines(self, timeout_s):
        end, buf, out = time.time() + timeout_s, b"", []
        while time.time() < end:
            chunk = self._ser.read(256)
            if chunk:
                buf += chunk
                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    out.append(line.decode(errors="replace").strip())
        return out

    def _ask(self, cmd, prefix, timeout_s):
        self._ser.reset_input_buffer()
        self._ser.write((cmd + "\n").encode())
        self._ser.flush()
        lines = self._lines(timeout_s)
        for ln in lines:
            if ln.upper().startswith(prefix.upper()):
                return ln
        return lines

    def read_mac(self) -> str:
        seen = []
        for _ in range(8):   # la carte peut encore demarrer (WiFi ~2 s)
            r = self._ask("MAC?", "MAC ", 1.5)
            if isinstance(r, str):
                return normalise_mac(r.split(None, 1)[1])
            seen += r
        raise BoardError("pas de reponse 'MAC ...' (carte flashee avec  pio run -e factory ?). Recu : " + " | ".join(seen[-10:]))

    def send_key(self, key: str) -> int:
        """Envoie la cle ; retourne le tier applique par la carte."""
        r = self._ask(f"KEY {key}", "OK tier=", 4.0)
        if isinstance(r, str):
            return int(r.split("tier=")[1].split()[0])
        raise BoardError("la carte a refuse la cle. Recu : " + " | ".join(r[-10:]))
