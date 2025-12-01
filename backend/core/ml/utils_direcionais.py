from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

import pandas as pd
import yfinance as yf
from django.db.models import QuerySet

from core.models import Acao, Cotacao, Cliente
from core.mt5_client import MT5Client
from core.views import BCB_SERIES, _fetch_bcb_series_latest


SELIG_KEY = "selic"


def get_selic_anual_atual() -> Optional[float]:
    """
    Retorna a taxa Selic anual atual como float em formato decimal (ex.: 0.13 para 13%).
    Usa a mesma fonte/implementação do endpoint indices_economicos.
    """
    meta = BCB_SERIES.get(SELIG_KEY)
    if not meta:
        return None

    valor, _ = _fetch_bcb_series_latest(meta["series"])
    if valor is None:
        return None
    try:
        return float(valor) / 100.0
    except (TypeError, ValueError):
        return None


def calcular_dias_equivalentes_selic(selic_anual: float, alvo_percentual: float = 0.05) -> Optional[int]:
    """
    Resolve aproximadamente:

        alvo_percentual ~= (selic_anual / 360) * X

    onde selic_anual é taxa ao ano em decimal (ex.: 0.13 para 13%).
    Retorna X arredondado para cima (número inteiro de dias corridos).
    """
    if selic_anual is None or selic_anual <= 0:
        return None
    try:
        dias = alvo_percentual * 360.0 / selic_anual
        if dias <= 0 or math.isnan(dias) or math.isinf(dias):
            return None
        return int(math.ceil(dias))
    except Exception:
        return None


def _get_referencia_mt5_ip() -> Optional[str]:
    """
    Retorna um IP de referência para consulta ao MT5.

    Estratégia simples: primeiro cliente com vm_private_ip ou vm_ip definido.
    """
    qs: QuerySet[Cliente] = Cliente.objects.all()
    for cliente in qs:
        ip_privado = (cliente.vm_private_ip or "").strip()
        ip_publico = (cliente.vm_ip or "").strip()
        if ip_privado:
            return ip_privado
        if ip_publico:
            return ip_publico
    return None


@dataclass
class PrecoAtual:
    preco: Optional[float]
    maxima: Optional[float]
    minima: Optional[float]
    origem: str  # "mt5" | "yfinance" | "indefinido"


def get_preco_atual_base_b3(ticker_base: str) -> PrecoAtual:
    """
    Retorna preço atual para um ticker da B3 no formato base (ex: PETR4),
    tentando primeiro via MT5 (API interna) e, em caso de falha, usando
    yfinance como fallback.
    """
    ticker_base = (ticker_base or "").strip().upper()
    if not ticker_base:
        return PrecoAtual(None, None, None, origem="indefinido")

    # 1) Tenta via MT5 em um IP de referência
    ip = _get_referencia_mt5_ip()
    if ip:
        try:
            client = MT5Client(ip)
            resp = client.cotacao(ticker_base)
            if resp.ok and isinstance(resp.data, dict):
                data = resp.data
                preco = data.get("last") or data.get("ask") or data.get("bid")
                maxima = data.get("high")
                minima = data.get("low")
                def _to_float(x):
                    try:
                        return float(x)
                    except (TypeError, ValueError):
                        return None
                preco_f = _to_float(preco)
                max_f = _to_float(maxima)
                min_f = _to_float(minima)
                if preco_f is not None:
                    return PrecoAtual(preco_f, max_f, min_f, origem="mt5")
        except Exception:
            # falha silenciosa → tenta fallback
            pass

    # 2) Fallback yfinance
    ticker_yp = f"{ticker_base}.SA"
    try:
        data = yf.download(
            tickers=[ticker_yp],
            period="1d",
            interval="1d",
            progress=False,
            auto_adjust=False,
        )
        if isinstance(data, pd.DataFrame) and not data.empty:
            last = data.iloc[-1]

            def _get_value(row: pd.Series, column: str) -> Optional[float]:
                try:
                    if isinstance(row.index, pd.MultiIndex):
                        raw = row[(column, ticker_yp)]
                    else:
                        raw = row[column]
                    return float(raw)
                except Exception:
                    return None

            preco = _get_value(last, "Close")
            maxima = _get_value(last, "High")
            minima = _get_value(last, "Low")
            return PrecoAtual(preco, maxima, minima, origem="yfinance")
    except Exception:
        pass

    return PrecoAtual(None, None, None, origem="indefinido")


def carregar_cotacoes_acao(acao: Acao, data_inicio: Optional[date] = None) -> pd.DataFrame:
    """
    Carrega histórico de cotações de uma ação como DataFrame,
    ordenado por data.
    """
    qs = Cotacao.objects.filter(acao=acao)
    if data_inicio:
        qs = qs.filter(data__gte=data_inicio)
    qs = qs.order_by("data")
    registros = list(
        qs.values(
            "data",
            "abertura",
            "fechamento",
            "minima",
            "maxima",
            "volume",
            "wma17",
            "wma34",
            "wma72",
            "wma144",
            "wma602",
            "rsi_14",
            "media_volume_20d",
            "atr",
        )
    )
    if not registros:
        return pd.DataFrame()
    df = pd.DataFrame(registros)
    df["data"] = pd.to_datetime(df["data"])
    df.sort_values("data", inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df

