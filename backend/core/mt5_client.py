from __future__ import annotations

import requests
from dataclasses import dataclass
from typing import Any, Optional
from django.conf import settings


def _build_base(ip: str) -> str:
    scheme = getattr(settings, "MT5_CLIENT_API_SCHEME", "http").rstrip(":/")
    port = getattr(settings, "MT5_CLIENT_API_PORT", "")
    base = f"{scheme}://{ip}"
    if port:
        base = f"{base}:{port}"
    return base


@dataclass
class MT5Response:
    ok: bool
    status: int
    data: Any | None
    error: str | None


class MT5Client:
    def __init__(self, ip: str, timeout: Optional[int] = None):
        self.base = _build_base(ip)
        self.timeout = timeout or getattr(settings, "MT5_CLIENT_API_TIMEOUT", 5)

    def _get(self, path: str, params: Optional[dict] = None) -> MT5Response:
        url = f"{self.base}{path if path.startswith('/') else '/' + path}"
        try:
            r = requests.get(url, params=params or {}, timeout=self.timeout)
            if r.ok:
                try:
                    return MT5Response(True, r.status_code, r.json(), None)
                except ValueError:
                    return MT5Response(False, r.status_code, None, "Resposta inválida (JSON)")
            return MT5Response(False, r.status_code, None, f"HTTP {r.status_code}")
        except requests.Timeout:
            return MT5Response(False, 599, None, "timeout")
        except requests.RequestException as exc:
            return MT5Response(False, 598, None, str(exc))

    def _post(self, path: str, json: dict) -> MT5Response:
        url = f"{self.base}{path if path.startswith('/') else '/' + path}"
        try:
            r = requests.post(url, json=json, timeout=self.timeout)
            if r.ok:
                try:
                    return MT5Response(True, r.status_code, r.json(), None)
                except ValueError:
                    return MT5Response(False, r.status_code, None, "Resposta inválida (JSON)")
            # corpo de erro pode vir com msg
            try:
                err = r.json()
            except ValueError:
                err = r.text
            return MT5Response(False, r.status_code, err, None)
        except requests.Timeout:
            return MT5Response(False, 599, None, "timeout")
        except requests.RequestException as exc:
            return MT5Response(False, 598, None, str(exc))

    # --------- endpoints helpers ---------
    def status(self) -> MT5Response:
        return self._get("/status")

    def simbolo(self, ticker: str) -> MT5Response:
        return self._get(f"/simbolo/{ticker}")

    def cotacao(self, ticker: str) -> MT5Response:
        return self._get(f"/cotacao/{ticker}")

    def validar_ordem(self, **params) -> MT5Response:
        return self._get("/validar-ordem", params=params)

    def enviar_ordem(self, body: dict) -> MT5Response:
        return self._post("/ordem", json=body)

    def ajustar_stop(self, body: dict) -> MT5Response:
        return self._post("/ajustar-stop", json=body)

    def posicoes(self) -> MT5Response:
        return self._get("/posicoes")

    def historico_deals(self, inicio: Optional[int] = None, fim: Optional[int] = None) -> MT5Response:
        params = {}
        if inicio is not None:
            params["inicio"] = int(inicio)
        if fim is not None:
            params["fim"] = int(fim)
        return self._get("/historico", params=params)

    def ordens_abertas(self, symbol: Optional[str] = None) -> MT5Response:
        params = {"symbol": symbol} if symbol else None
        return self._get("/ordens", params=params)

