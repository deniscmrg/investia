from django.core.management.base import BaseCommand

from core.scripts.A03Recomendcoes_intraday import gerar_recomendacoes


class Command(BaseCommand):
    help = "Atualiza as recomendações utilizando cotações intraday."

    def add_arguments(self, parser):
        parser.add_argument(
            "--top",
            type=int,
            default=30,
            help="Quantidade máxima de recomendações a manter (default: 30)",
        )

    def handle(self, *args, **options):
        top_n = options["top"]
        resultado = gerar_recomendacoes(top_n=top_n)
        total = len(resultado or [])
        self.stdout.write(
            self.style.SUCCESS(
                f"Recomendações intraday atualizadas ({total} registros)."
            )
        )
