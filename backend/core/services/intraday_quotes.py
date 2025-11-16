import logging
from typing import Dict, Iterable, List

import pandas as pd
import yfinance as yf


logger = logging.getLogger(__name__)


def _chunked(iterable: Iterable[str], size: int) -> List[List[str]]:
    chunk: List[str] = []
    for item in iterable:
        chunk.append(item)
        if len(chunk) == size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


def _normalize_result(
    raw: pd.DataFrame | pd.Series, bases: List[str]
) -> Dict[str, float]:
    out: Dict[str, float] = {}
    if isinstance(raw, pd.Series):
        serie = raw.dropna()
        if serie.empty:
            return out
        price = float(serie.iloc[-1])
        out[bases[0]] = price
        return out

    if not isinstance(raw, pd.DataFrame) or raw.empty:
        return out

    close = raw.get("Close")
    if close is None:
        return out

    if isinstance(close, pd.Series):
        serie = close.dropna()
        if serie.empty:
            return out
        out[bases[0]] = float(serie.iloc[-1])
        return out

    if isinstance(close, pd.DataFrame):
        for base in bases:
            col = f"{base}.SA"
            if col not in close:
                continue
            serie = close[col].dropna()
            if serie.empty:
                continue
            out[base] = float(serie.iloc[-1])
    return out


def fetch_intraday_quotes(
    tickers: Iterable[str], *, interval: str = "1m", batch_size: int = 25
) -> Dict[str, float]:
    """
    Resolve intraday quotes via yfinance in batches to reduce latency.
    Returns a mapping base_ticker -> last price (float).
    """
    bases = sorted({(ticker or "").strip().upper() for ticker in tickers if ticker})
    if not bases:
        return {}

    resultados: Dict[str, float] = {}
    for chunk in _chunked(bases, batch_size):
        suffix = [f"{base}.SA" for base in chunk]
        try:
            data = yf.download(
                tickers=suffix,
                period="1d",
                interval=interval,
                progress=False,
                auto_adjust=False,
            )
            parsed = _normalize_result(data, chunk)
            resultados.update(parsed)
        except Exception:  # pragma: no cover - rede externa
            logger.exception("Falha ao buscar cotações intraday para %s", chunk)
            continue

    return resultados
