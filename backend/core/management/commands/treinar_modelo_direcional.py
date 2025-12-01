from __future__ import annotations

from datetime import datetime

from django.core.management.base import BaseCommand

from core.models import Acao
from core.ml.modelo_direcional import (
    avaliar_modelo,
    carregar_modelo,
    montar_dataset_direcional,
    salvar_modelo,
    split_temporal,
    treinar_modelo,
)


class Command(BaseCommand):
    help = "Treina o modelo direcional (+5%/-5% em 10 pregões) e salva o artefato em core/modelos."

    def add_arguments(self, parser):
        parser.add_argument(
            "--data-treino-fim",
            type=str,
            default="2023-12-31",
            help="Data final do período de treino (YYYY-MM-DD).",
        )
        parser.add_argument(
            "--data-teste-inicio",
            type=str,
            default="2024-01-01",
            help="Data inicial do período de teste (YYYY-MM-DD).",
        )

    def handle(self, *args, **options):
        data_treino_fim = datetime.strptime(options["data_treino_fim"], "%Y-%m-%d").date()
        data_teste_inicio = datetime.strptime(options["data_teste_inicio"], "%Y-%m-%d").date()

        self.stdout.write("Carregando universo de ações...")
        universo = Acao.objects.all()

        self.stdout.write("Montando dataset direcional (features + labels)...")
        df_full, retorno_medio_por_acao, dias_equivalentes_selic = montar_dataset_direcional(
            universo=universo
        )

        if df_full.empty:
            self.stdout.write(self.style.ERROR("Nenhum dado disponível para treinamento."))
            return

        self.stdout.write(
            f"Dataset total: {len(df_full)} linhas, dias_equivalentes_selic={dias_equivalentes_selic}"
        )

        df_treino, df_teste = split_temporal(
            df_full,
            data_treino_fim=data_treino_fim,
            data_teste_inicio=data_teste_inicio,
        )

        self.stdout.write(
            f"Tamanho treino={len(df_treino)}, teste={len(df_teste)}"
        )

        artefato, metrics_treino = treinar_modelo(df_treino)
        self.stdout.write(
            f"Acurácia (treino): {metrics_treino.get('acuracia_treino', 0):.4f}"
        )

        if df_teste is not None and not df_teste.empty:
            metrics_teste = avaliar_modelo(artefato, df_teste)
            self.stdout.write(
                f"Acurácia (teste): {metrics_teste.get('acuracia_teste', 0):.4f} "
                f"com {metrics_teste.get('n_amostras', 0)} amostras."
            )
        else:
            self.stdout.write("Nenhum dado de teste para avaliar o modelo.")

        path = salvar_modelo(artefato)
        self.stdout.write(
            self.style.SUCCESS(f"Modelo salvo em: {path}")
        )

