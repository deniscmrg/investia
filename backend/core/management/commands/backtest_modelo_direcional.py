from __future__ import annotations

from django.core.management.base import BaseCommand

from core.models import Acao
from core.ml.backtest_direcional import (
    executar_backtest_completo,
    persistir_trades,
    recalcular_estatisticas_estrategia,
)
from core.ml.modelo_direcional import carregar_modelo


class Command(BaseCommand):
    help = (
        "Roda o backtest completo da estratégia direcional (+5%/-5% em 10 pregões) "
        "e atualiza as tabelas de trades e estatísticas."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--threshold-up",
            type=float,
            default=0.0,
            help="Probabilidade mínima para operações de COMPRA (UP_FIRST). Use 0 para considerar todos os sinais.",
        )
        parser.add_argument(
            "--threshold-down",
            type=float,
            default=0.0,
            help="Probabilidade mínima para operações de VENDA (DOWN_FIRST). Use 0 para considerar todos os sinais.",
        )
        parser.add_argument(
            "--stop-percent",
            type=float,
            default=-0.20,
            help="Stop percentual (negativo, ex.: -0.20 para -20%).",
        )
        parser.add_argument(
            "--alvo-percentual",
            type=float,
            default=0.05,
            help="Alvo percentual (ex.: 0.05 para +5%).",
        )

    def handle(self, *args, **options):
        threshold_up = options["threshold_up"]
        threshold_down = options["threshold_down"]
        stop_percent = options["stop_percent"]
        alvo_percentual = options["alvo_percentual"]

        self.stdout.write("Carregando modelo direcional...")
        artefato = carregar_modelo()

        self.stdout.write("Carregando universo de ações...")
        universo = Acao.objects.all()

        self.stdout.write(
            f"Executando backtest completo (threshold_up={threshold_up}, "
            f"threshold_down={threshold_down}, stop={stop_percent}, alvo={alvo_percentual})..."
        )
        trades = executar_backtest_completo(
            artefato,
            universo=universo,
            threshold_up=threshold_up,
            threshold_down=threshold_down,
            stop_percent=stop_percent,
            alvo_percentual=alvo_percentual,
        )

        self.stdout.write(f"{len(trades)} trades simulados. Persistindo no banco...")
        persistir_trades(trades)

        self.stdout.write("Recalculando estatísticas agregadas da estratégia...")
        recalcular_estatisticas_estrategia()

        self.stdout.write(
            self.style.SUCCESS("Backtest concluído e estatísticas atualizadas.")
        )
