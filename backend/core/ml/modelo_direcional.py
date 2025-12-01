from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd
from django.conf import settings

from core.models import Acao
from core.ml.labeling_direcional import gerar_labels_direcionais
from core.ml.features_direcionais import criar_features_direcionais
from core.ml.utils_direcionais import (
    carregar_cotacoes_acao,
    calcular_dias_equivalentes_selic,
    get_selic_anual_atual,
)

try:
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
    from sklearn.preprocessing import LabelEncoder
    import joblib
except ImportError as exc:  # pragma: no cover - ambiente sem dependências de ML
    raise ImportError(
        "Dependências de ML não estão instaladas. "
        "Certifique-se de ter scikit-learn, numpy, pandas e joblib disponíveis."
    ) from exc


DATA_INICIO_TREINO = date(2022, 1, 1)


@dataclass
class ArtefatoModeloDirecional:
    model: GradientBoostingClassifier
    feature_names: List[str]
    classes_: List[str]  # ordem das colunas de probabilidade


def montar_dataset_direcional(
    universo: Optional[Iterable[Acao]] = None,
    dias_equivalentes_selic: Optional[int] = None,
) -> Tuple[pd.DataFrame, Dict[int, float], int]:
    """
    Monta dataset unificado (todas as ações) com features + label_direcional.

    Retorna:
        df_merged: DataFrame com colunas ['acao_id', 'ticker', 'data', ..., 'label_direcional']
        retorno_medio_por_acao: dict {acao_id: retorno_medio_selic_ativo}
        dias_equivalentes_selic: valor inteiro efetivamente utilizado
    """
    if universo is None:
        universo = Acao.objects.all()

    if dias_equivalentes_selic is None:
        selic = get_selic_anual_atual()
        dias_equivalentes_selic = calcular_dias_equivalentes_selic(selic) or 0

    retorno_medio_por_acao: Dict[int, float] = {}
    frames: List[pd.DataFrame] = []

    for acao in universo:
        df_cot = carregar_cotacoes_acao(acao, data_inicio=DATA_INICIO_TREINO)
        if df_cot.empty:
            continue

        # Labels
        df_labels = gerar_labels_direcionais(
            df_cot,
            janela_pregoes=10,
            alvo_percentual=0.05,
            data_inicio=DATA_INICIO_TREINO,
        )
        if df_labels.empty:
            continue

        # Features
        df_feat, ret_medio = criar_features_direcionais(
            df_cot,
            dias_equivalentes_selic=dias_equivalentes_selic,
        )

        if ret_medio is not None:
            retorno_medio_por_acao[acao.id] = float(ret_medio)

        # Merge por data
        df_feat["data"] = pd.to_datetime(df_feat["data"])
        df_labels["data"] = pd.to_datetime(df_labels["data"])
        df_merged = pd.merge(
            df_feat,
            df_labels,
            on="data",
            how="inner",
            suffixes=("", "_label"),
        )

        if df_merged.empty:
            continue

        # Adiciona identificadores
        df_merged["acao_id"] = acao.id
        df_merged["ticker"] = acao.ticker
        frames.append(df_merged)

    if not frames:
        return pd.DataFrame(), retorno_medio_por_acao, dias_equivalentes_selic

    full = pd.concat(frames, ignore_index=True)
    # Garante ordenação temporal
    full["data"] = pd.to_datetime(full["data"])
    full.sort_values(["data", "ticker"], inplace=True)
    full.reset_index(drop=True, inplace=True)
    return full, retorno_medio_por_acao, dias_equivalentes_selic


def split_temporal(
    df: pd.DataFrame,
    data_treino_fim: date = date(2023, 12, 31),
    data_teste_inicio: date = date(2024, 1, 1),
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    if df is None or df.empty:
        return df.copy(), df.copy()

    df = df.copy()
    df["data"] = pd.to_datetime(df["data"])

    treino = df[df["data"].dt.date <= data_treino_fim].copy()
    teste = df[df["data"].dt.date >= data_teste_inicio].copy()

    return treino, teste


def treinar_modelo(df_treino: pd.DataFrame) -> Tuple[ArtefatoModeloDirecional, dict]:
    """
    Treina GradientBoostingClassifier com features numéricas e target label_direcional.
    Retorna artefato serializável + métricas simples em treino.
    """
    if df_treino is None or df_treino.empty:
        raise ValueError("Dataset de treino está vazio.")

    df = df_treino.copy()

    # Remove colunas não numéricas/auxiliares
    drop_cols = {"ticker", "data"}
    drop_cols |= {c for c in df.columns if c.endswith("_label")}
    drop_cols |= {"acao_id"}
    target_col = "label_direcional"

    if target_col not in df.columns:
        raise ValueError("Coluna 'label_direcional' não encontrada no dataset.")

    feature_cols = [
        c
        for c in df.columns
        if c not in drop_cols and c != target_col and df[c].dtype != "O"
    ]

    # Remove linhas com NaN ou infinitos nas features
    df_features = df[feature_cols].astype(float).replace([np.inf, -np.inf], np.nan)
    mask_valid = df_features.notna().all(axis=1)
    df_features = df_features[mask_valid]
    df_target = df.loc[mask_valid, target_col].astype(str)

    if df_features.empty:
        raise ValueError("Todas as linhas de treino possuem NaN nas features.")

    X = df_features.values
    y = df_target.values

    le = LabelEncoder()
    y_enc = le.fit_transform(y)

    model = GradientBoostingClassifier(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=3,
        subsample=0.8,
        random_state=42,
    )
    model.fit(X, y_enc)

    y_pred_enc = model.predict(X)
    y_pred = le.inverse_transform(y_pred_enc)

    metrics = {
        "acuracia_treino": float(accuracy_score(y, y_pred)),
        "classes": list(le.classes_),
        "relatorio_classificacao": classification_report(
            y, y_pred, output_dict=True, zero_division=0
        ),
        "matriz_confusao": confusion_matrix(y, y_pred).tolist(),
        "n_amostras": int(len(y)),
        "n_features": int(len(feature_cols)),
    }

    artefato = ArtefatoModeloDirecional(
        model=model,
        feature_names=feature_cols,
        classes_=list(le.classes_),
    )
    return artefato, metrics


def avaliar_modelo(artefato: ArtefatoModeloDirecional, df_teste: pd.DataFrame) -> dict:
    if df_teste is None or df_teste.empty:
        return {"n_amostras": 0}

    df = df_teste.copy()
    target_col = "label_direcional"
    if target_col not in df.columns:
        raise ValueError("Coluna 'label_direcional' não encontrada no dataset de teste.")

    df["data"] = pd.to_datetime(df["data"])

    # Limpa NaNs/infinitos nas features antes de avaliar
    df_features = df[artefato.feature_names].astype(float).replace(
        [np.inf, -np.inf], np.nan
    )
    mask_valid = df_features.notna().all(axis=1)
    df_features = df_features[mask_valid]
    df_target = df.loc[mask_valid, target_col].astype(str)

    if df_features.empty:
        return {"n_amostras": 0}

    X = df_features.values
    y_true = df_target.values

    # Reconstroi LabelEncoder apenas para avaliação
    le = LabelEncoder()
    le.classes_ = np.array(artefato.classes_)

    y_pred_enc = artefato.model.predict(X)
    y_pred = le.inverse_transform(y_pred_enc)

    return {
        "n_amostras": int(len(y_true)),
        "acuracia_teste": float(accuracy_score(y_true, y_pred)),
        "relatorio_classificacao": classification_report(
            y_true, y_pred, output_dict=True, zero_division=0
        ),
        "matriz_confusao": confusion_matrix(y_true, y_pred).tolist(),
    }


def _default_model_path() -> Path:
    """
    Determina o caminho padrão para salvar o modelo direcional.

    Preferência:
        1) <BASE_DIR>/core/modelos/modelo_direcional.pkl
        2) <BASE_DIR>/modelos/modelo_direcional.pkl
        3) diretório de trabalho atual (como fallback extremo)
    """
    base_dir = Path(getattr(settings, "BASE_DIR", Path(__file__).resolve().parents[2]))

    candidates = [
        base_dir / "core" / "modelos",
        base_dir / "modelos",
    ]

    for modelos_dir in candidates:
        try:
            modelos_dir.mkdir(parents=True, exist_ok=True)
            return modelos_dir / "modelo_direcional.pkl"
        except PermissionError:
            continue

    # Fallback final: diretório atual
    modelos_dir = Path.cwd()
    return modelos_dir / "modelo_direcional.pkl"


def salvar_modelo(artefato: ArtefatoModeloDirecional, path: Optional[str | Path] = None) -> Path:
    if path is None:
        path = _default_model_path()
    path = Path(path)

    payload = {
        "model": artefato.model,
        "feature_names": artefato.feature_names,
        "classes_": artefato.classes_,
    }
    joblib.dump(payload, path)
    return path


def carregar_modelo(path: Optional[str | Path] = None) -> ArtefatoModeloDirecional:
    if path is None:
        path = _default_model_path()
    path = Path(path)
    payload = joblib.load(path)
    return ArtefatoModeloDirecional(
        model=payload["model"],
        feature_names=list(payload["feature_names"]),
        classes_=list(payload["classes_"]),
    )
