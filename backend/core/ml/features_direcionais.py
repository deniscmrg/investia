from __future__ import annotations

from typing import Optional, Tuple

import numpy as np
import pandas as pd


def _pct_change_safe(series: pd.Series, periods: int = 1) -> pd.Series:
    try:
        return series.pct_change(periods=periods)
    except Exception:
        return pd.Series(index=series.index, dtype="float64")


def criar_features_direcionais(
    df_cotacoes: pd.DataFrame,
    dias_equivalentes_selic: Optional[int] = None,
) -> Tuple[pd.DataFrame, Optional[float]]:
    """
    Cria features direcionais para uma série de cotações.

    Retorna (df_features, retorno_medio_selic_ativo),
    onde retorno_medio_selic_ativo é a média dos retornos em janelas
    de `dias_equivalentes_selic` dias corridos, quando informado.
    """
    if df_cotacoes is None or df_cotacoes.empty:
        return pd.DataFrame(), None

    df = df_cotacoes.copy()
    if "data" not in df.columns or "fechamento" not in df.columns:
        raise ValueError("df_cotacoes precisa ter colunas 'data' e 'fechamento'")

    df["data"] = pd.to_datetime(df["data"])
    df.sort_values("data", inplace=True)
    df.reset_index(drop=True, inplace=True)

    close = df["fechamento"].astype(float)

    # Retornos
    df["ret_1d"] = _pct_change_safe(close, periods=1)
    df["ret_3d"] = _pct_change_safe(close, periods=3)
    df["ret_5d"] = _pct_change_safe(close, periods=5)
    df["ret_10d"] = _pct_change_safe(close, periods=10)

    # Médias móveis simples
    df["sma_9"] = close.rolling(window=9, min_periods=3).mean()
    df["sma_21"] = close.rolling(window=21, min_periods=5).mean()
    df["sma_50"] = close.rolling(window=50, min_periods=10).mean()

    # Médias Welles Wilder já calculadas em tabela (se existirem)
    for col in ("wma17", "wma34", "wma72", "wma144", "wma602"):
        if col not in df.columns:
            df[col] = np.nan

    # Relação preço / média longa
    long_ma = df["sma_50"]
    with np.errstate(divide="ignore", invalid="ignore"):
        df["preco_sobre_sma50"] = np.where(long_ma != 0, close / long_ma, np.nan)

    # Volatilidade: desvio padrão dos retornos de 10 e 20 dias
    df["vol_10d"] = df["ret_1d"].rolling(window=10, min_periods=5).std()
    df["vol_20d"] = df["ret_1d"].rolling(window=20, min_periods=10).std()

    # ATR, se disponível
    if "atr" not in df.columns:
        df["atr"] = np.nan

    # Volume relativo
    if "volume" in df.columns and "media_volume_20d" in df.columns:
        vol = df["volume"].astype(float)
        vol_med = df["media_volume_20d"].replace(0, np.nan).astype(float)
        df["volume_rel_20d"] = np.where(vol_med.notna(), vol / vol_med, np.nan)
    else:
        df["volume_rel_20d"] = np.nan

    # Posição no range 20 dias
    if "maxima" in df.columns and "minima" in df.columns:
        max20 = df["maxima"].astype(float).rolling(window=20, min_periods=5).max()
        min20 = df["minima"].astype(float).rolling(window=20, min_periods=5).min()
        rng = max20 - min20
        with np.errstate(divide="ignore", invalid="ignore"):
            df["pos_range_20d"] = np.where(rng != 0, (close - min20) / rng, np.nan)
    else:
        df["pos_range_20d"] = np.nan

    # RSI
    if "rsi_14" not in df.columns:
        df["rsi_14"] = np.nan

    # Cálculo do retorno médio em janelas X (dias_equivalentes_selic)
    retorno_medio_selic_ativo = None
    if dias_equivalentes_selic and dias_equivalentes_selic > 0:
        retorno_medio_selic_ativo = _calcular_retorno_medio_janela_corridos(
            df, dias_equivalentes_selic
        )

    return df, retorno_medio_selic_ativo


def _calcular_retorno_medio_janela_corridos(
    df: pd.DataFrame,
    dias_corridos: int,
) -> Optional[float]:
    """
    Para cada data t, pega preço em t e preço em t+X dias corridos
    (pegando a primeira cotação com data >= t+X) e calcula retorno.
    Retorna a média desses retornos.
    """
    if df is None or df.empty or dias_corridos <= 0:
        return None

    datas = pd.to_datetime(df["data"]).values
    close = df["fechamento"].astype(float).values

    if len(datas) < 2:
        return None

    # Usa busca binária via searchsorted
    retornos = []
    for i in range(len(datas)):
        data_ref = datas[i]
        target = data_ref + np.timedelta64(dias_corridos, "D")
        j = datas.searchsorted(target, side="left")
        if j < len(datas):
            p0 = close[i]
            p1 = close[j]
            if p0 and p0 != 0:
                ret = (p1 / p0) - 1.0
                retornos.append(ret)

    if not retornos:
        return None

    return float(np.mean(retornos))

