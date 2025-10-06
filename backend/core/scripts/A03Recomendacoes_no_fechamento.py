import os
import sys
import django
import pandas as pd
import numpy as np
import joblib
from django.db.models import Max
from django.db import models

# Caminho absoluto da pasta raiz do projeto
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(BASE_DIR)

# Aponta para o settings.py correto
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from cotacoes.models import Cotacao

def gerar_recomendacoes(top_n=20):
    ultima_data = Cotacao.objects.aggregate(ultima=Max('data'))['ultima']
    if not ultima_data:
        print("❌ Nenhuma data disponível.")
        return

    print(f"📅 Usando dados até: {ultima_data}")

    qs = Cotacao.objects.filter(
        data__lte=ultima_data,
        fechamento__lt=models.F('wma602'),
        wma17__isnull=False,
        wma34__isnull=False,
        obv__isnull=False,
        rsi_14__isnull=False,
        media_volume_20d__isnull=False,
        fechamento_anterior__isnull=False,
        atr__isnull=False,
        volume__gt=0
    ).values(
        'data', 'acao__ticker', 'fechamento', 'atr', 'wma602', 'wma17', 'wma34',
        'obv', 'rsi_14', 'volume', 'media_volume_20d', 'fechamento_anterior'
    )

    df = pd.DataFrame.from_records(qs)
    if df.empty:
        print("❌ Nenhuma ação elegível.")
        return

    df.sort_values(by=['acao__ticker', 'data'], inplace=True)
    df['obv_5d'] = df.groupby('acao__ticker')['obv'].shift(5)
    df = df[df['data'] == ultima_data].copy()

    for col in ['wma34', 'wma602', 'media_volume_20d', 'fechamento_anterior', 'obv_5d', 'atr']:
        df[col] = df[col].replace(0, np.nan)

    df['fechamento_div_wma602'] = df['fechamento'] / df['wma602']
    df['wma17_div_wma34'] = df['wma17'] / df['wma34']
    df['obv_ratio'] = df['obv'] / df['obv_5d']
    df['volume_ratio'] = df['volume'] / df['media_volume_20d']
    df['candlestick'] = df['fechamento'] / df['fechamento_anterior']
    df['potencial_alta'] = df['atr'] / df['fechamento']

    df.dropna(subset=[
        'fechamento_div_wma602', 'wma17_div_wma34', 'obv_ratio',
        'rsi_14', 'volume_ratio', 'candlestick', 'potencial_alta', 'atr'
    ], inplace=True)

    if df.empty:
        print("⚠️ Nenhuma ação válida após limpeza dos dados.")
        return

    modelo = joblib.load(r"C:\b3analise\modelos\modelo_random_forest.pkl")
    X_pred = df[[
        'fechamento_div_wma602',
        'wma17_div_wma34',
        'obv_ratio',
        'rsi_14',
        'volume_ratio',
        'candlestick',
        'potencial_alta',
    ]]

    df['probabilidade'] = modelo.predict_proba(X_pred)[:, 1]
    df['valor_alvo'] = df['fechamento'] + df['atr']
    df['lucro_perc'] = ((df['valor_alvo'] / df['fechamento']) - 1) * 100
    df['probabilidade_pct'] = (df['probabilidade'] * 100).round(2)

    # Classificação em faixas
    def faixa(p):
        if p >= 15:
            return 'forte'
        elif p >= 5:
            return 'média'
        else:
            return 'fraca'
    df['classificacao'] = df['probabilidade_pct'].apply(faixa)

    # Resultado
    resultado = df[['acao__ticker', 'fechamento', 'probabilidade_pct', 'classificacao', 'lucro_perc', 'valor_alvo']]
    resultado = resultado.rename(columns={
        'acao__ticker': 'ticker',
        'fechamento': 'valor_compra',
        'probabilidade_pct': 'probabilidade (%)'
    }).sort_values(by='probabilidade (%)', ascending=False).head(top_n)

    # Impressão formatada
    print("\n📈 Recomendações com base no modelo (alvo = 1×ATR):\n")
    print(f"{'Ticker':<8} {'Compra':>8} {'Prob. (%)':>11} {'Faixa':>8} {'Lucro (%)':>11} {'Alvo':>10}")
    print("-" * 60)
    for _, row in resultado.iterrows():
        print(f"{row['ticker']:<8} "
              f"{row['valor_compra']:>8.2f} "
              f"{row['probabilidade (%)']:>11.2f} "
              f"{row['classificacao']:>8} "
              f"{row['lucro_perc']:>11.2f} "
              f"{row['valor_alvo']:>10.4f}")

    return resultado.to_dict(orient='records')

if __name__ == "__main__":
    gerar_recomendacoes()
