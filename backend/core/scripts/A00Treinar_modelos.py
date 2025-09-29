import os
import sys
import django
import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

# 🛠️ Inicializa Django corretamente
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from cotacoes.models import Cotacao


def treinar_modelo():
    # 📥 Extrai dados do banco
    qs = Cotacao.objects.filter(
        wma602__isnull=False,
        wma17__isnull=False,
        wma34__isnull=False,
        obv__isnull=False,
        rsi_14__isnull=False,
        media_volume_20d__isnull=False,
        fechamento_anterior__isnull=False,
        atr__isnull=False,
        target_compra__isnull=False
    ).values(
        'acao__ticker', 'fechamento', 'atr', 'wma602', 'wma17', 'wma34',
        'obv', 'rsi_14', 'volume', 'media_volume_20d',
        'fechamento_anterior', 'target_compra'
    )

    df = pd.DataFrame.from_records(qs)

    if df.empty:
        print("❌ Nenhum dado encontrado para treinamento.")
        return

    # 🧼 Tratamento seguro para divisões
    df['obv_5d'] = df.groupby('acao__ticker')['obv'].shift(5)
    for col in ['wma34', 'wma602', 'media_volume_20d', 'fechamento_anterior', 'obv_5d', 'atr']:
        df[col] = df[col].replace(0, np.nan)

    # 🎯 Geração de features
    df['fechamento_div_wma602'] = df['fechamento'] / df['wma602']
    df['wma17_div_wma34'] = df['wma17'] / df['wma34']
    df['obv_ratio'] = df['obv'] / df['obv_5d']
    df['volume_ratio'] = df['volume'] / df['media_volume_20d']
    df['candlestick'] = df['fechamento'] / df['fechamento_anterior']
    df['potencial_alta'] = 1 * df['atr'] / df['fechamento']  # ✅ Alvo baseado em 2xATR

    # 🔍 Remove valores ausentes
    df.dropna(subset=[
        'fechamento_div_wma602', 'wma17_div_wma34', 'obv_ratio',
        'rsi_14', 'volume_ratio', 'candlestick', 'potencial_alta', 'target_compra'
    ], inplace=True)

    # 📊 Define X e y
    X = df[[
        'fechamento_div_wma602',
        'wma17_div_wma34',
        'obv_ratio',
        'rsi_14',
        'volume_ratio',
        'candlestick',
        'potencial_alta',
    ]]
    y = df['target_compra'].astype(int)

    # 🎓 Treino/teste
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    # 🤖 Modelo
    modelo = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        class_weight='balanced',
        random_state=42
    )
    modelo.fit(X_train, y_train)

    # 📈 Avaliação
    y_pred = modelo.predict(X_test)
    print("\n📊 Relatório de Classificação:")
    print(classification_report(y_test, y_pred))

    # 🔍 Importância das variáveis
    print("\n⭐ Importância das Features:")
    for nome, valor in zip(X.columns, modelo.feature_importances_):
        print(f"{nome}: {valor:.4f}")

    # 💾 Salva o modelo
    os.makedirs("modelos", exist_ok=True)
    caminho = "modelos/modelo_random_forest.pkl"
    joblib.dump(modelo, caminho)
    print(f"\n✅ Modelo salvo com sucesso em: {caminho}")


if __name__ == "__main__":
    treinar_modelo()
