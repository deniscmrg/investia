from decimal import Decimal
import yfinance as yf
import pandas as pd
from datetime import timedelta
import os
import sys


# Caminho absoluto da pasta raiz do projeto
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(BASE_DIR)

# Aponta para o settings.py correto
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

import django
django.setup()

from core.models import Acao, Cotacao

def get_dia_util(offset=0):
    hoje = pd.Timestamp.today(tz='America/Sao_Paulo').normalize()
    dias_uteis = pd.date_range(end=hoje, periods=700, freq='B').to_list()

    index = -1 + offset  # offset 0 -> ontem (último dia útil), -1 -> anteontem
    if abs(index) >= len(dias_uteis):
        raise ValueError("Offset fora do intervalo de dias úteis")

    return dias_uteis[index].date()

def safe_decimal(value):
    try:
        if pd.isna(value) or value in [None, '', '-', 'nan', 'NaN', float('inf'), float('-inf')]:
            return None
        return Decimal(str(value))
    except:
        return None

def atualizar_cotacoes(dia_offset):
    data = get_dia_util(dia_offset)
    acoes = Acao.objects.all()

    for acao in acoes:
        print(f"\n📈 Buscando {acao.ticker} para o dia {data}...")

        if Cotacao.objects.filter(acao=acao, data=data).exists():
            print(f"✔️ Cotação de {acao.ticker} em {data} já está salva")
            continue

        try:
            df = yf.download(f"{acao.ticker}.SA", start=data, end=data + timedelta(days=1), progress=False)

            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.droplevel(1)

            if df.empty or data.strftime('%Y-%m-%d') not in df.index.strftime('%Y-%m-%d'):
                print(f"⚠ Nenhum dado disponível para {acao.ticker} no dia {data}")
                continue

            row = df.iloc[0]

            abertura = safe_decimal(row['Open'])
            fechamento = safe_decimal(row['Close'])
            minima = safe_decimal(row['Low'])
            maxima = safe_decimal(row['High'])
            volume = int(row['Volume']) if pd.notna(row['Volume']) else 0

            if None in [abertura, fechamento, minima, maxima]:
                print(f"⚠ Dados incompletos para {acao.ticker} em {data}")
                continue

            Cotacao.objects.update_or_create(
                acao=acao,
                data=data,
                defaults={
                    'abertura': abertura,
                    'fechamento': fechamento,
                    'minima': minima,
                    'maxima': maxima,
                    'volume': volume
                }
            )
            print(f"✅ Cotação de {acao.ticker} salva com sucesso")

        except Exception as e:
            print(f"❌ Erro ao processar {acao.ticker}: {e}")
            continue

if __name__ == '__main__':
    DIA_OFFSET = 0 # Altere para -1, -2, etc. conforme necessário
    atualizar_cotacoes(DIA_OFFSET)
