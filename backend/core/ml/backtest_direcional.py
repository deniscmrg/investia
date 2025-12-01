from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd

from core.models import Acao, TradeHistorico, EstatisticaEstrategia
from core.ml.features_direcionais import criar_features_direcionais
from core.ml.modelo_direcional import ArtefatoModeloDirecional, DATA_INICIO_TREINO
from core.ml.utils_direcionais import (
    carregar_cotacoes_acao,
    calcular_dias_equivalentes_selic,
    get_selic_anual_atual,
)


@dataclass
class TradeSimulado:
    acao: Acao
    data_entrada: date
    data_saida: date
    lado: str  # "COMPRA" | "VENDA"
    prob_no_momento: float
    preco_entrada: float
    preco_saida: float
    retorno_percentual: float
    resultado: str  # "ALVO" | "STOP" | "TEMPO"


def _simular_trade_dia(
    lado: str,
    p0: float,
    janela_df: pd.DataFrame,
    alvo_percentual: float,
    stop_percent: float,
    dias_equivalentes_selic: Optional[int],
) -> Tuple[Optional[date], Optional[float], Optional[float], str]:
    """
    Simula evolução do trade a partir de p0, usando janela de cotações futuras.
    Retorna (data_saida, preco_saida, retorno_pct, resultado).
    """
    if janela_df is None or janela_df.empty:
        return None, None, None, "TEMPO"

    janela_df = janela_df.copy()
    janela_df["data"] = pd.to_datetime(janela_df["data"])

    alvo = p0 * (1.0 + alvo_percentual)
    if stop_percent >= 0:
        raise ValueError("stop_percent deve ser negativo (ex.: -0.20 para -20%).")
    stop = p0 * (1.0 + stop_percent)

    data_limite_selic = None
    if dias_equivalentes_selic and dias_equivalentes_selic > 0:
        data_limite_selic = janela_df["data"].iloc[0].date() + timedelta(days=dias_equivalentes_selic)

    preg_uteis = 0
    data_saida = None
    preco_saida = None
    resultado = "TEMPO"

    for _, row in janela_df.iterrows():
        preg_uteis += 1
        data_atual = row["data"].date()
        high = float(row.get("maxima", row["fechamento"]))
        low = float(row.get("minima", row["fechamento"]))
        close = float(row["fechamento"])

        if lado == "COMPRA":
            # alvo: alta de +alvo_percentual
            if high >= alvo:
                data_saida = data_atual
                preco_saida = alvo
                resultado = "ALVO"
                break
            # stop: queda de |stop_percent|
            if low <= stop:
                data_saida = data_atual
                preco_saida = stop
                resultado = "STOP"
                break
        else:  # VENDA
            # para venda, alvo é queda de alvo_percentual em relação ao p0 (ganho na venda)
            alvo_baixa = p0 * (1.0 - alvo_percentual)
            stop_alta = p0 * (1.0 - stop_percent)  # ex.: -20% vira 1.20
            if low <= alvo_baixa:
                data_saida = data_atual
                preco_saida = alvo_baixa
                resultado = "ALVO"
                break
            if high >= stop_alta:
                data_saida = data_atual
                preco_saida = stop_alta
                resultado = "STOP"
                break

        # horizonte máximo: 10 pregões ou X dias corridos
        if preg_uteis >= 10:
            data_saida = data_atual
            preco_saida = close
            resultado = "TEMPO"
            break

        if data_limite_selic and data_atual >= data_limite_selic:
            data_saida = data_atual
            preco_saida = close
            resultado = "TEMPO"
            break

    if data_saida is None or preco_saida is None:
        # usa último dia disponível
        last = janela_df.iloc[-1]
        data_saida = pd.to_datetime(last["data"]).date()
        preco_saida = float(last["fechamento"])
        resultado = "TEMPO"

    if lado == "COMPRA":
        retorno = (preco_saida / p0) - 1.0
    else:
        # para venda, retorno é invertido
        retorno = (p0 / preco_saida) - 1.0

    return data_saida, preco_saida, retorno, resultado


def executar_backtest_completo(
    artefato: ArtefatoModeloDirecional,
    universo: Optional[Iterable[Acao]] = None,
    threshold_up: float = 0.5,
    threshold_down: float = 0.5,
    stop_percent: float = -0.20,
    alvo_percentual: float = 0.05,
    dias_equivalentes_selic: Optional[int] = None,
) -> List[TradeSimulado]:
    """
    Executa backtest completo da estratégia, retornando lista de trades simulados.
    """
    if universo is None:
        universo = Acao.objects.all()

    if dias_equivalentes_selic is None:
        selic = get_selic_anual_atual()
        dias_equivalentes_selic = calcular_dias_equivalentes_selic(selic)

    trades: List[TradeSimulado] = []

    for acao in universo:
        # Carrega histórico completo da ação a partir do início do treino
        df_cot = carregar_cotacoes_acao(acao, data_inicio=DATA_INICIO_TREINO)
        if df_cot.empty:
            continue

        # Cria features usando a mesma função do treino
        df_feat, _ = criar_features_direcionais(
            df_cot, dias_equivalentes_selic=dias_equivalentes_selic or 0
        )
        if df_feat.empty:
            continue

        df_feat["data"] = pd.to_datetime(df_feat["data"])
        df_feat.sort_values("data", inplace=True)
        df_feat.reset_index(drop=True, inplace=True)

        # Garante que todas as features esperadas existem
        missing_cols = [c for c in artefato.feature_names if c not in df_feat.columns]
        if missing_cols:
            # se faltar qualquer coluna usada no treino, não conseguimos
            # replicar o modelo corretamente para este ativo
            continue

        # Matriz de features limpa (sem NaN/inf) na mesma ordem do treino
        feat_mat = (
            df_feat[artefato.feature_names]
            .astype(float)
            .replace([np.inf, -np.inf], np.nan)
        )
        mask_valid = feat_mat.notna().all(axis=1)
        if not mask_valid.any():
            continue

        df = df_feat.loc[mask_valid].reset_index(drop=True)
        feat_mat = feat_mat.loc[mask_valid].reset_index(drop=True)

        if df.empty:
            continue

        # posição simples (no máximo 1 trade aberto por lado por vez)
        aberto_compra = False
        aberto_venda = False

        for idx in range(len(df)):
            row = df.iloc[idx]
            data_ref = row["data"].date()
            if data_ref < DATA_INICIO_TREINO:
                continue

            X_row = feat_mat.iloc[idx].values.reshape(1, -1)
            probas = artefato.model.predict_proba(X_row)[0]

            prob_up = 0.0
            prob_down = 0.0
            for cls, p in zip(artefato.classes_, probas):
                if cls == "UP_FIRST":
                    prob_up = float(p)
                elif cls == "DOWN_FIRST":
                    prob_down = float(p)

            p0 = float(row["fechamento"])

            # janela futura para simulação (a partir do próximo pregão)
            janela_fut = df.iloc[idx + 1 : idx + 1 + 25].copy()
            if janela_fut.empty:
                continue

            # COMPRA
            if (not aberto_compra) and prob_up >= threshold_up:
                data_saida, preco_saida, ret, resultado = _simular_trade_dia(
                    "COMPRA",
                    p0,
                    janela_fut,
                    alvo_percentual=alvo_percentual,
                    stop_percent=stop_percent,
                    dias_equivalentes_selic=dias_equivalentes_selic,
                )
                if data_saida and preco_saida is not None and ret is not None:
                    trades.append(
                        TradeSimulado(
                            acao=acao,
                            data_entrada=data_ref,
                            data_saida=data_saida,
                            lado="COMPRA",
                            prob_no_momento=prob_up,
                            preco_entrada=p0,
                            preco_saida=preco_saida,
                            retorno_percentual=ret,
                            resultado=resultado,
                        )
                    )
                    aberto_compra = False  # trade é totalmente fechado na simulação

            # VENDA
            if (not aberto_venda) and prob_down >= threshold_down:
                data_saida, preco_saida, ret, resultado = _simular_trade_dia(
                    "VENDA",
                    p0,
                    janela_fut,
                    alvo_percentual=alvo_percentual,
                    stop_percent=stop_percent,
                    dias_equivalentes_selic=dias_equivalentes_selic,
                )
                if data_saida and preco_saida is not None and ret is not None:
                    trades.append(
                        TradeSimulado(
                            acao=acao,
                            data_entrada=data_ref,
                            data_saida=data_saida,
                            lado="VENDA",
                            prob_no_momento=prob_down,
                            preco_entrada=p0,
                            preco_saida=preco_saida,
                            retorno_percentual=ret,
                            resultado=resultado,
                        )
                    )
                    aberto_venda = False

    return trades


def persistir_trades(trades: List[TradeSimulado], origem: str = "modelo_direcional_v1") -> None:
    """
    Limpa e recria cotacoes_trades_historicos para a origem informada.
    """
    TradeHistorico.objects.filter(origem=origem).delete()

    objetos: List[TradeHistorico] = []
    for t in trades:
        objetos.append(
            TradeHistorico(
                acao=t.acao,
                data_entrada=t.data_entrada,
                data_saida=t.data_saida,
                lado=t.lado,
                prob_no_momento=t.prob_no_momento,
                preco_entrada=t.preco_entrada,
                preco_saida=t.preco_saida,
                retorno_percentual=t.retorno_percentual,
                resultado=t.resultado,
                origem=origem,
            )
        )

    if objetos:
        TradeHistorico.objects.bulk_create(objetos, batch_size=1000)


def recalcular_estatisticas_estrategia(
    origem: str = "modelo_direcional_v1",
    bins_probabilidade: Optional[List[float]] = None,
) -> None:
    """
    Recalcula estatísticas agregadas a partir de TradeHistorico.
    """
    if bins_probabilidade is None:
        bins_probabilidade = [0.0, 0.4, 0.5, 0.6, 0.7, 1.0]

    EstatisticaEstrategia.objects.filter(origem=origem).delete()

    trades = TradeHistorico.objects.filter(origem=origem)
    if not trades.exists():
        return

    # Agrupa por ação, lado e faixa de probabilidade
    grupos: Dict[Tuple[Optional[int], str, float, float], List[TradeHistorico]] = {}

    for t in trades:
        prob = float(t.prob_no_momento or 0.0)
        # determina faixa
        faixa_min = None
        faixa_max = None
        for i in range(len(bins_probabilidade) - 1):
            lo = bins_probabilidade[i]
            hi = bins_probabilidade[i + 1]
            if prob >= lo and prob < hi:
                faixa_min = lo
                faixa_max = hi
                break
        if faixa_min is None:
            continue

        key = (t.acao_id, t.lado, faixa_min, faixa_max)
        grupos.setdefault(key, []).append(t)

    objetos: List[EstatisticaEstrategia] = []
    for (acao_id, lado, faixa_min, faixa_max), lista in grupos.items():
        if not lista:
            continue
        rets = [float(x.retorno_percentual or 0.0) for x in lista]
        ganhos = [r for r in rets if r > 0]
        perdas = [r for r in rets if r <= 0]

        numero_trades = len(rets)
        hit_rate = 100.0 * len(ganhos) / numero_trades if numero_trades else 0.0
        ganho_medio = float(np.mean(ganhos)) if ganhos else 0.0
        perda_media = float(np.mean(perdas)) if perdas else 0.0
        ganho_maximo = max(ganhos) if ganhos else 0.0
        ganho_minimo = min(ganhos) if ganhos else 0.0
        perda_maxima = min(perdas) if perdas else 0.0
        perda_minima = max(perdas) if perdas else 0.0

        objetos.append(
            EstatisticaEstrategia(
                acao_id=acao_id,
                lado=lado,
                faixa_prob_min=faixa_min,
                faixa_prob_max=faixa_max,
                numero_trades=numero_trades,
                hit_rate=hit_rate,
                ganho_medio=ganho_medio,
                perda_media=perda_media,
                ganho_maximo=ganho_maximo,
                ganho_minimo=ganho_minimo,
                perda_maxima=perda_maxima,
                perda_minima=perda_minima,
                origem=origem,
            )
        )

    if objetos:
        EstatisticaEstrategia.objects.bulk_create(objetos, batch_size=1000)
