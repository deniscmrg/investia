# scripts/verifica_alvo_recomendacoes.py

import os
import sys
import django
from decimal import Decimal, ROUND_HALF_UP
from datetime import date

# Caminho absoluto da pasta raiz do projeto
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(BASE_DIR)

# Aponta para o settings.py correto
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from cotacoes.models import Cotacao, RecomendacaoDiaria

def verificar_alvos_recomendacoes():
    recomendacoes = RecomendacaoDiaria.objects.filter(preco_compra__isnull=False)

    for recomendacao in recomendacoes:
        print(f"→ Verificando {recomendacao.acao.ticker} em {recomendacao.data} (preço compra: {recomendacao.preco_compra})")

        preco_alvo = float(recomendacao.alvo_sugerido) if recomendacao.alvo_sugerido else float(recomendacao.preco_compra) * 1.05

        ultima_cotacao = Cotacao.objects.filter(
            acao_id=recomendacao.acao_id,
            data__gt=recomendacao.data
        ).order_by('-data').first()

        if not ultima_cotacao:
            print(f"[!] Sem cotação após {recomendacao.data} para {recomendacao.acao.ticker}")
            continue

        if recomendacao.data_alvo is None:
            cotacoes_pos = Cotacao.objects.filter(
                acao_id=recomendacao.acao_id,
                data__gt=recomendacao.data
            ).order_by('data')

            for cotacao in cotacoes_pos:
                if cotacao.maxima and float(cotacao.maxima) >= round(preco_alvo, 2):
                    recomendacao.data_alvo = cotacao.data
                    recomendacao.fechamento_alvo = cotacao.fechamento
                    recomendacao.perc_alvo_realizado = Decimal('100.00')
                    recomendacao.save()
                    print(f"[✔] Alvo atingido: {recomendacao.acao.ticker} em {cotacao.data}")
                    break
            else:
                fechamento_atual = float(ultima_cotacao.fechamento or 0)
                preco_entrada = float(recomendacao.preco_compra or 0)

                if preco_entrada > 0:
                    porcentagem = Decimal(((fechamento_atual / preco_entrada) - 1) * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                else:
                    porcentagem = Decimal('0.00')

                recomendacao.perc_alvo_realizado = porcentagem
                recomendacao.save()
                print(f"[...] {recomendacao.acao.ticker} está em {porcentagem}% do alvo.")
        else:
            if recomendacao.perc_alvo_realizado != Decimal('100.00'):
                recomendacao.perc_alvo_realizado = Decimal('100.00')
                recomendacao.save()
                print(f"[=] Corrigido para 100%: {recomendacao.acao.ticker}")

if __name__ == '__main__':
    verificar_alvos_recomendacoes()
