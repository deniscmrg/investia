from __future__ import annotations

from datetime import date
from typing import Optional

import pandas as pd


def gerar_labels_direcionais(
    df_cotacoes: pd.DataFrame,
    janela_pregoes: int = 10,
    alvo_percentual: float = 0.05,
    data_inicio: Optional[date] = None,
) -> pd.DataFrame:
    """
    Gera labels UP_FIRST / DOWN_FIRST / NONE para uma série de cotações.

    df_cotacoes deve conter, no mínimo, as colunas:
        - data
        - fechamento
        - maxima (opcional, usa fechamento se ausente)
        - minima (opcional, usa fechamento se ausente)
    """
    if df_cotacoes is None or df_cotacoes.empty:
        return pd.DataFrame(columns=["data", "label_direcional"])

    df = df_cotacoes.copy()
    if "data" not in df.columns:
        raise ValueError("df_cotacoes precisa ter coluna 'data'")

    df["data"] = pd.to_datetime(df["data"])
    df.sort_values("data", inplace=True)
    df.reset_index(drop=True, inplace=True)

    if data_inicio:
        df_ref = df[df["data"].dt.date >= data_inicio].copy()
    else:
        df_ref = df.copy()

    labels = []
    n = len(df)

    for idx_ref in df_ref.index:
        # índice no df completo (mesmo que df_ref seja filtro)
        i = idx_ref
        if i >= n:
            continue

        # janela de lookahead
        start = i + 1
        end = min(i + 1 + janela_pregoes, n)
        if start >= end:
            # não há janelas futuras suficientes
            continue

        row = df.iloc[i]
        p0 = float(row["fechamento"])
        alvo_up = p0 * (1.0 + alvo_percentual)
        alvo_down = p0 * (1.0 - alvo_percentual)

        label = "NONE"
        for j in range(start, end):
            r = df.iloc[j]
            high = float(r.get("maxima", r["fechamento"]))
            low = float(r.get("minima", r["fechamento"]))

            up_hit = high >= alvo_up
            down_hit = low <= alvo_down

            if up_hit and not down_hit:
                label = "UP_FIRST"
                break
            if down_hit and not up_hit:
                label = "DOWN_FIRST"
                break
            # quando atinge ambos no mesmo pregão, não sabemos a ordem → mantém NONE

        labels.append(
            {
                "data": row["data"],
                "label_direcional": label,
            }
        )

    if not labels:
        return pd.DataFrame(columns=["data", "label_direcional"])

    out = pd.DataFrame(labels)
    out["data"] = pd.to_datetime(out["data"])
    out.sort_values("data", inplace=True)
    out.reset_index(drop=True, inplace=True)
    return out

