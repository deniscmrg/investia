import django
import os
import sys
import pandas as pd
from decimal import Decimal, InvalidOperation

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from cotacoes.models import Cotacao, Acao

# ... cabeçalho permanece igual ...

from cotacoes.models import Cotacao, Acao

def wilder_moving_average(series, period):
    return series.ewm(alpha=1/period, adjust=False).mean()

def calcular_rsi(series, period=14):
    delta = series.diff()
    ganho = delta.where(delta > 0, 0)
    perda = -delta.where(delta < 0, 0)
    media_ganho = ganho.ewm(alpha=1/period, adjust=False).mean()
    media_perda = perda.ewm(alpha=1/period, adjust=False).mean()
    rs = media_ganho / media_perda
    return 100 - (100 / (1 + rs))

def to_decimal_safe(value):
    try:
        if pd.isna(value):
            return None
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None

def calcular_medias_para_acao(acao_id):
    cotacoes = Cotacao.objects.filter(acao_id=acao_id).order_by('data')

    if cotacoes.count() < 602:
        print(f"⚠ {acao_id} não possui dados suficientes para calcular WMA602")
        return

    df = pd.DataFrame.from_records(
        cotacoes.values('id', 'data', 'fechamento', 'volume', 'rsi_14', 'maxima', 'minima'),
        index='data'
    ).sort_index()


    # ✅ Conversão segura para float (evita erros do tipo Decimal + float)
    # for col in ['fechamento', 'volume', 'rsi_14']:
    #     df[col] = pd.to_numeric(df[col], errors='coerce')

    for col in ['fechamento', 'volume', 'rsi_14', 'maxima', 'minima']:
        df[col] = pd.to_numeric(df[col], errors='coerce')

    # calcular após a conversão de fechamento
    df['fechamento_anterior'] = df['fechamento'].shift(1)


    # Médias Welles Wilder
    for periodo in [17, 34, 72, 144, 602]:
        df[f'wma{periodo}'] = wilder_moving_average(df['fechamento'], periodo)

    # OBV
    obv = [0]
    for i in range(1, len(df)):
        if df['fechamento'].iloc[i] > df['fechamento'].iloc[i - 1]:
            obv.append(obv[-1] + df['volume'].iloc[i])
        elif df['fechamento'].iloc[i] < df['fechamento'].iloc[i - 1]:
            obv.append(obv[-1] - df['volume'].iloc[i])
        else:
            obv.append(obv[-1])
    df['obv'] = obv

    # ATR - Average True Range (14 períodos)
    df['fechamento_anterior'] = df['fechamento'].shift(1)
    tr1 = df['maxima'] - df['minima']
    tr2 = (df['maxima'] - df['fechamento_anterior']).abs()
    tr3 = (df['minima'] - df['fechamento_anterior']).abs()
    df['tr'] = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    df['atr'] = wilder_moving_average(df['tr'], period=14)


    # RSI 14
    df['rsi_14'] = calcular_rsi(df['fechamento'], 14)

    # Média de volume 20 dias
    df['media_volume_20d'] = df['volume'].rolling(window=20).mean()

    # 🔁 Novos campos para IA
    df['fechamento_anterior'] = df['fechamento'].shift(1)
    df['rsi_14_anterior'] = df['rsi_14'].shift(1)
    df['volume_m3'] = df['volume'].shift(1).rolling(window=3).mean()
    df['max_5dias'] = df['fechamento'].shift(-1).rolling(window=5).max()

    # 🎯 Regras da estratégia para definir entrada
    df['target_compra'] = (
        (df['wma17'] > df['wma34']) &
        (df['wma17'].shift(1) <= df['wma34'].shift(1)) &
        (df['max_5dias'] > df['fechamento'])
    )

    # Atualização no banco
    for idx, row in df.iterrows():
        try:
            cotacao = Cotacao.objects.get(id=row['id'])
        except Cotacao.DoesNotExist:
            continue

        cotacao.wma17 = to_decimal_safe(row.get('wma17'))
        cotacao.wma34 = to_decimal_safe(row.get('wma34'))
        cotacao.wma72 = to_decimal_safe(row.get('wma72'))
        cotacao.wma144 = to_decimal_safe(row.get('wma144'))
        cotacao.wma602 = to_decimal_safe(row.get('wma602'))

        cotacao.obv = to_decimal_safe(row.get('obv'))
        cotacao.rsi_14 = to_decimal_safe(row.get('rsi_14'))
        cotacao.media_volume_20d = to_decimal_safe(row.get('media_volume_20d'))

        cotacao.fechamento_anterior = to_decimal_safe(row.get('fechamento_anterior'))
        cotacao.rsi_14_anterior = to_decimal_safe(row.get('rsi_14_anterior'))
        cotacao.volume_m3 = to_decimal_safe(row.get('volume_m3'))
        cotacao.max_5dias = to_decimal_safe(row.get('max_5dias'))
        cotacao.target_compra = bool(row.get('target_compra'))

        cotacao.atr = to_decimal_safe(row.get('atr'))

        cotacao.save()

    print(f"✅ Indicadores atualizados para {cotacoes[0].acao.ticker}")


def calcular_todas():
    for acao in Acao.objects.all():
        calcular_medias_para_acao(acao.id)

if __name__ == '__main__':
    calcular_todas()
