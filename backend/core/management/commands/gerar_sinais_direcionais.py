from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import numpy as np
import pandas as pd
from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Acao, RecomendacaoIA
from core.ml.features_direcionais import criar_features_direcionais
from core.ml.modelo_direcional import carregar_modelo
from core.ml.utils_direcionais import (
    calcular_dias_equivalentes_selic,
    carregar_cotacoes_acao,
    get_preco_atual_base_b3,
    get_selic_anual_atual,
)


class Command(BaseCommand):
    help = "Gera sinais direcionais diários/intraday usando o modelo treinado."

    def add_arguments(self, parser):
        parser.add_argument(
            "--modo",
            type=str,
            choices=["daily", "intraday"],
            default="daily",
            help="Modo de execução: daily (pós-fechamento) ou intraday.",
        )

    def handle(self, *args, **options):
        modo = options["modo"]
        hoje = date.today()

        self.stdout.write(f"Carregando modelo direcional (modo={modo})...")
        artefato = carregar_modelo()

        self.stdout.write("Obtendo SELIC anual atual...")
        selic = get_selic_anual_atual()
        dias_equiv = calcular_dias_equivalentes_selic(selic, alvo_percentual=0.05)
        self.stdout.write(
            f"SELIC anual={selic}, dias_equivalentes_selic={dias_equiv}"
        )

        universo = Acao.objects.all()

        total = 0
        skipped_nan = 0
        with transaction.atomic():
            for acao in universo:
                df_cot = carregar_cotacoes_acao(acao)
                if df_cot.empty:
                    continue

                if modo == "daily":
                    # Usa última data de cotação (assumindo fechamento já atualizado)
                    ref_date = df_cot["data"].max().date()
                    df_feat, ret_medio = criar_features_direcionais(
                        df_cot,
                        dias_equivalentes_selic=dias_equiv or 0,
                    )
                    df_feat["data"] = df_feat["data"].dt.date
                    linha_feat = df_feat[df_feat["data"] == ref_date].tail(1)

                    if linha_feat.empty:
                        continue

                    preco_entrada = float(
                        df_cot[df_cot["data"].dt.date == ref_date]["fechamento"].iloc[-1]
                    )
                    data_sinal = ref_date

                else:  # intraday
                    preco_info = get_preco_atual_base_b3(acao.ticker)
                    preco_entrada = (
                        preco_info.preco
                        if preco_info.preco is not None
                        else float(df_cot["fechamento"].iloc[-1])
                    )

                    df_intraday = df_cot.copy()
                    df_intraday["data"] = df_intraday["data"].dt.date
                    ultima_data = df_intraday["data"].max()

                    # Cria ou atualiza linha para hoje com preço atual
                    if ultima_data == hoje:
                        mask = df_intraday["data"] == hoje
                        df_intraday.loc[mask, "fechamento"] = preco_entrada
                        if preco_info.maxima is not None:
                            df_intraday.loc[mask, "maxima"] = preco_info.maxima
                        if preco_info.minima is not None:
                            df_intraday.loc[mask, "minima"] = preco_info.minima
                    else:
                        base_row = df_intraday.iloc[-1].copy()
                        base_row["data"] = hoje
                        base_row["fechamento"] = preco_entrada
                        if preco_info.maxima is not None:
                            base_row["maxima"] = preco_info.maxima
                        if preco_info.minima is not None:
                            base_row["minima"] = preco_info.minima
                        df_intraday = df_intraday.append(base_row, ignore_index=True)

                    # Recria datetime para features
                    df_intraday["data"] = pd.to_datetime(df_intraday["data"])
                    data_sinal = hoje

                    df_feat, ret_medio = criar_features_direcionais(
                        df_intraday,
                        dias_equivalentes_selic=dias_equiv or 0,
                    )
                    df_feat["data"] = df_feat["data"].dt.date
                    linha_feat = df_feat[df_feat["data"] == data_sinal].tail(1)

                    if linha_feat.empty:
                        continue

                # Prepara vetor de features na ordem esperada pelo modelo
                linha_feat = linha_feat.iloc[0]
                df_row = (
                    pd.DataFrame([linha_feat])[artefato.feature_names]
                    .astype(float)
                    .replace([np.inf, -np.inf], np.nan)
                )

                # Se ainda houver NaN em qualquer feature, pula este ativo
                if df_row.isna().any(axis=1).iloc[0]:
                    skipped_nan += 1
                    continue

                X = df_row.values

                probas = artefato.model.predict_proba(X)[0]
                prob_up = 0.0
                prob_down = 0.0
                prob_none = 0.0
                for cls, p in zip(artefato.classes_, probas):
                    if cls == "UP_FIRST":
                        prob_up = float(p)
                    elif cls == "DOWN_FIRST":
                        prob_down = float(p)
                    elif cls == "NONE":
                        prob_none = float(p)

                # Classe final pelo argmax
                classe = "NONE"
                max_prob = prob_none
                if prob_up >= max_prob and prob_up >= prob_down:
                    classe = "UP_FIRST"
                    max_prob = prob_up
                elif prob_down >= max_prob and prob_down >= prob_up:
                    classe = "DOWN_FIRST"
                    max_prob = prob_down

                dias_eq_val = dias_equiv if dias_equiv is not None else 0
                data_limite_selic = (
                    data_sinal + timedelta(days=dias_eq_val) if dias_eq_val > 0 else None
                )

                defaults = {
                    "preco_entrada": Decimal(str(preco_entrada)),
                    "alvo_percentual": Decimal("5.00"),
                    "janela_dias": 10,
                    "prob_up": Decimal(str(prob_up)),
                    "prob_down": Decimal(str(prob_down)),
                    "classe": classe,
                    "dias_equivalentes_selic": dias_eq_val or None,
                    "data_limite_selic": data_limite_selic,
                    "retorno_medio_selic_ativo": (
                        Decimal(str(ret_medio))
                        if ret_medio is not None
                        else None
                    ),
                    "origem": "modelo_direcional_v1",
                }

                obj, created = RecomendacaoIA.objects.update_or_create(
                    acao=acao,
                    data=data_sinal,
                    origem="modelo_direcional_v1",
                    defaults=defaults,
                )
                total += 1

        msg = f"Sinais direcionais gerados/atualizados para {total} ações (modo={modo})."
        if skipped_nan:
            msg += f" {skipped_nan} ativos foram ignorados por features incompletas (NaN)."

        self.stdout.write(self.style.SUCCESS(msg))
