# core/views.py
from datetime import date
import io
import json
import re
from decimal import Decimal, InvalidOperation

from django.db.models import Sum, F, ExpressionWrapper, DecimalField
from django.http import JsonResponse

import yfinance as yf
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db import transaction
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from datetime import date

import subprocess
import sys
import os
import requests

from django.conf import settings

from .models import (
    Cliente,
    OperacaoCarteira,
    Acao,
    ImportacaoJob,   # log das importações (mantido)
    Patrimonio,      # <<< tipado
    Custodia,
    Cotacao,
    RecomendacaoDiariaAtual, RecomendacaoDiariaAtualNova,
    MT5Order, MT5Deal, OperacaoMT5Leg,
)
from .serializers import (
    UserSerializer,
    ClienteSerializer,
    OperacaoCarteiraSerializer,
    AcaoSerializer,
)
from .mt5_client import MT5Client
from uuid import uuid4
from datetime import datetime, timedelta
from django.utils.dateparse import parse_datetime



# -------------------
# Autenticação / Perfil
# -------------------

class MyTokenObtainPairView(TokenObtainPairView):
    """Retorna access/refresh e inclui username na resposta."""
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            data = dict(response.data)
            try:
                user = User.objects.get(username=request.data.get("username"))
                data["username"] = user.username
            except User.DoesNotExist:
                pass
            return Response(data)
        return Response(response.data, status=response.status_code)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def perfil_usuario(request):
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    try:
        refresh_token = request.data["refresh"]
        token = RefreshToken(refresh_token)
        token.blacklist()
        return Response({"detail": "Logout realizado com sucesso."})
    except Exception as e:
        return Response({"error": str(e)}, status=400)


@api_view(["POST"])
def login_view(request):
    username = request.data.get("username")
    password = request.data.get("password")
    user = authenticate(username=username, password=password)
    if user:
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "username": user.username,
            }
        )
    return Response({"detail": "Invalid credentials"}, status=401)


# -------------------
# Core
# -------------------

class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.all().order_by("-criado_em")
    serializer_class = ClienteSerializer
    permission_classes = [permissions.IsAuthenticated]


class OperacaoCarteiraViewSet(viewsets.ModelViewSet):
    """
    ViewSet das operações da carteira.
    Filtra por ?cliente=<id> quando o parâmetro é enviado.
    """
    serializer_class = OperacaoCarteiraSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["cliente"]

    def get_queryset(self):
        qs = OperacaoCarteira.objects.all()
        cliente_id = self.request.query_params.get("cliente")
        if cliente_id:
            try:
                cliente_id_int = int(cliente_id)
            except ValueError:
                return OperacaoCarteira.objects.none()
            qs = qs.filter(cliente=cliente_id_int)
        return qs


class AcaoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Acao.objects.all()
    serializer_class = AcaoSerializer
    permission_classes = [IsAuthenticated]


# -------------------
# Cotações (yfinance)
# -------------------

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cotacoes_atuais(request):
    """
    Body:
    { "tickers": ["ABEV3.SA", "PETR4.SA"] }
    """
    tickers = request.data.get("tickers", [])
    if not tickers:
        return Response({"error": "Nenhum ticker enviado"}, status=400)

    resultado = {}
    for ticker in tickers:
        try:
            acao = yf.Ticker(ticker)
            info = acao.info
            resultado[ticker] = {
                "preco_atual": info.get("regularMarketPrice"),
                "preco_abertura": info.get("regularMarketOpen"),
                "moeda": info.get("currency"),
            }
        except Exception as e:
            resultado[ticker] = {"erro": str(e)}

    return Response(resultado)


# -------------------
# Dashboard RV
# -------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_rv(request):
    hoje = date.today()

    # Todas as operações em aberto
    posicoes = OperacaoCarteira.objects.filter(data_venda__isnull=True)

    tickers = list(set([op.acao.ticker + ".SA" for op in posicoes]))
    cotacoes = {}
    if tickers:
        data = yf.download(tickers=tickers, period="1d", interval="1d", progress=False)["Close"].iloc[-1]
        cotacoes = data.to_dict() if hasattr(data, "to_dict") else {tickers[0]: float(data)}

    posicionadas = []
    for op in posicoes:
        ticker = op.acao.ticker + ".SA"
        preco_atual = cotacoes.get(ticker)
        dias_pos = (hoje - op.data_compra).days

        lucro = (
            ((preco_atual - float(op.preco_unitario)) / float(op.preco_unitario)) * 100
            if preco_atual else None
        )

        posicionadas.append({
            "id": op.id,
            "cliente": op.cliente.nome,
            "acao": op.acao.ticker,
            "data_compra": str(op.data_compra),
            "preco_compra": float(op.preco_unitario),
            "quantidade": op.quantidade,
            "valor_total_compra": float(op.valor_total_compra),
            "preco_atual": float(preco_atual) if preco_atual else None,
            "lucro_percentual": lucro,
            "valor_alvo": float(op.valor_alvo) if op.valor_alvo else None,
            "dias_posicionado": dias_pos,
        })

    return Response({"posicionadas": posicionadas})

# -------------------
# Importação: Patrimônio / Custódia (tipado)
# -------------------

# normalização de números "pt-BR" -> float
NUM_BR = re.compile(r'^\s*-?\d{1,3}(\.\d{3})*(,\d+)?\s*$')

def _to_number(val):
    if val in (None, ''):
        return None
    if isinstance(val, (int, float, Decimal)):
        return float(val)
    s = str(val).strip()
    if s == '':
        return None
    if NUM_BR.match(s):
        s = s.replace('.', '').replace(',', '.')
    try:
        return float(Decimal(s))
    except (InvalidOperation, ValueError):
        return None

def _xlsx_to_rows(file_bytes: bytes):
    """Converte Excel em lista de dicts (cabeçalho = primeira linha não vazia)."""
    try:
        import pandas as pd
        df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
        df = df.dropna(how='all').dropna(axis=1, how='all')
        df.columns = [str(c).strip() for c in df.columns]
        return df.fillna('').to_dict(orient='records')
    except Exception:
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(file_bytes), data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return []
        # acha a primeira linha com algum header
        header_idx = next((i for i, r in enumerate(rows) if any(c not in (None, '') for c in r)), 0)
        headers = [str(h).strip() if h is not None else '' for h in rows[header_idx]]
        out = []
        for r in rows[header_idx+1:]:
            if r is None or all(v in (None, '') for v in r):
                continue
            item = {}
            for i, h in enumerate(headers):
                key = h or f'col_{i+1}'
                val = '' if i >= len(r) or r[i] in (None, '') else r[i]
                item[key] = val
            out.append(item)
        return out

def _norm_key(k: str) -> str:
    return str(k or '').strip().lower()

# mapa de cabeçalhos -> campos dos models
HEADER_MAP_PATRIMONIO = {
    'cod. cliente': 'cod_cliente',
    'cód. cliente': 'cod_cliente',
    'codigo assessor': 'codigo_assessor',
    'código assessor': 'codigo_assessor',
    'nome': 'nome',
    'patrimônio total': 'patrimonio_total',
    'patrimonio total': 'patrimonio_total',
    'saldo total': 'saldo_total',
    'garantia utilizada': 'garantia_utilizada',
    'garantias disponíveis': 'garantias_disponiveis',
    'garantias disponiveis': 'garantias_disponiveis',
    'd0': 'd0',
    'd1': 'd1',
    'd2': 'd2',
}

HEADER_MAP_CUSTODIA = {
    'cod. cliente': 'cod_cliente',
    'cód. cliente': 'cod_cliente',
    'codigo assessor': 'codigo_assessor',
    'código assessor': 'codigo_assessor',
    'nome': 'nome',
    'ativo': 'ativo',
    'ticker': 'ativo',
    'isin': 'isin',
    'tipo ativo': 'tipo_ativo',
    'quantidade': 'quantidade',
    'preço médio': 'preco_medio',
    'preco medio': 'preco_medio',
    'valor total': 'valor_total',
}

def _map_row(row: dict, tipo: str) -> dict:
    out = {}
    mapa = HEADER_MAP_PATRIMONIO if tipo == 'patrimonio' else HEADER_MAP_CUSTODIA
    for k, v in row.items():
        nk = _norm_key(k)
        if nk not in mapa:
            continue
        field = mapa[nk]
        if field in ('nome', 'ativo', 'isin', 'tipo_ativo'):
            out[field] = (None if v == '' else str(v).strip())
        else:
            out[field] = _to_number(v)
    # elimina linhas totalmente vazias
    if not any(v is not None and v != '' for v in out.values()):
        return {}
    return out


class ImportacaoUploadView(APIView):
    """
    POST multipart/form-data:
        tipo: 'patrimonio' | 'custodia'
        data_referencia: 'YYYY-MM-DD'
        arquivo: <xlsx>
        force: 'true' (opcional) → apaga a data e recarrega
    Regras:
      - Se já existir dados na data e não vier force, retorna 409 (confirmação).
      - Se force=true, apaga aquela data e insere os novos.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        tipo = request.data.get('tipo')
        data_ref = request.data.get('data_referencia')
        force = str(request.data.get('force', 'false')).lower() == 'true'
        arq = request.FILES.get('arquivo')

        if tipo not in ('patrimonio', 'custodia'):
            return Response({'detail': "Parâmetro 'tipo' inválido."}, status=400)
        if not data_ref:
            return Response({'detail': "Parâmetro 'data_referencia' é obrigatório (YYYY-MM-DD)."}, status=400)
        if not arq:
            return Response({'detail': "Arquivo não enviado (campo 'arquivo')."}, status=400)

        Modelo = Patrimonio if tipo == 'patrimonio' else Custodia
        ja_existe = Modelo.objects.filter(data_referencia=data_ref).exists()

        if ja_existe and not force:
            return Response(
                {'detail': 'Já há dados para esta data. Confirma sobrescrita?', 'need_confirm': True},
                status=409
            )

        linhas = _xlsx_to_rows(arq.read())
        registros = []
        for r in linhas:
            m = _map_row(r, tipo)
            if m:
                m['data_referencia'] = data_ref
                registros.append(m)

        if not registros:
            return Response({'detail': 'Nenhum registro válido encontrado no arquivo.'}, status=400)

        with transaction.atomic():
            status_job = 'ok'
            if ja_existe and force:
                Modelo.objects.filter(data_referencia=data_ref).delete()
                status_job = 'sobrescrito'

            # bulk_create
            if tipo == 'patrimonio':
                objs = [Patrimonio(**m) for m in registros]
                Patrimonio.objects.bulk_create(objs, batch_size=1000)
            else:
                objs = [Custodia(**m) for m in registros]
                Custodia.objects.bulk_create(objs, batch_size=1000)

            ImportacaoJob.objects.create(
                tipo=tipo,
                data_referencia=data_ref,
                total_linhas=len(objs),
                status=status_job
            )

        return Response({'ok': True, 'tipo': tipo, 'data': data_ref, 'linhas': len(registros), 'status': status_job})


#---------------------------------------
#  CALCULOS PARA TELA DE RESUMO
#---------------------------------------
from datetime import date
from decimal import Decimal
from rest_framework.decorators import api_view
from rest_framework.response import Response
import yfinance as yf

from .models import Cliente, OperacaoCarteira, Patrimonio

def _to_decimal(v):
    if v is None: 
        return Decimal("0")
    if isinstance(v, Decimal): 
        return v
    try:
        return Decimal(str(v))
    except Exception:
        return Decimal("0")

@api_view(["GET"])
def carteira_resumo(request, cliente_id):
    # -------- Cliente ----------
    try:
        cliente = Cliente.objects.get(pk=cliente_id)
    except Cliente.DoesNotExist:
        return Response({"detail": "Cliente não encontrado"}, status=404)

    operacoes = OperacaoCarteira.objects.filter(cliente=cliente)

    # -------- Patrimônio (tabela 'patrimonio') ----------
    cod_cliente = None
    if getattr(cliente, "codigo_xp", None):
        try:
            cod_cliente = int(str(cliente.codigo_xp).strip())
        except Exception:
            cod_cliente = None

    patrimonio_total = Decimal("0")
    saldo_total = Decimal("0")

    if cod_cliente is not None:
        ultimo = (
            Patrimonio.objects
            .filter(cod_cliente=cod_cliente)
            .order_by("-data_referencia", "-criado_em", "-id")
            .first()
        )
        if ultimo:
            patrimonio_total = _to_decimal(ultimo.patrimonio_total)
            saldo_total = _to_decimal(ultimo.saldo_total)

    percentual = _to_decimal(getattr(cliente, "percentual_patrimonio", 0))

    # -------- Posicionadas (yfinance) + POSICIONADO (CUSTO - VALOR_ATUAL) ----------
    posicionadas_valor_atual = Decimal("0")
    posicionadas_custo = Decimal("0")
    abertos = operacoes.filter(data_venda__isnull=True)

    tickers = list({f"{op.acao.ticker}.SA" for op in abertos if getattr(op.acao, "ticker", None)})
    cotacoes = {}
    if tickers:
        try:
            data = yf.download(tickers=tickers, period="1d", interval="1m", progress=False)
            if len(tickers) == 1:
                ultimo_close = data["Close"].dropna().iloc[-1]
                cotacoes[tickers[0]] = float(ultimo_close)
            else:
                for t in tickers:
                    ultimo_close = data["Close"][t].dropna().iloc[-1]
                    cotacoes[t] = float(ultimo_close)
        except Exception as e:
            print("Erro yfinance:", e)

    for op in abertos:
        t = f"{op.acao.ticker}.SA"
        # fallback: se faltar cotação, usa preço de compra (rentab=0 nessa linha)
        preco_atual = _to_decimal(cotacoes.get(t, float(op.preco_unitario or 0)))
        qtd = _to_decimal(op.quantidade)
        pu  = _to_decimal(op.preco_unitario)

        posicionadas_valor_atual += (preco_atual * qtd)
        posicionadas_custo       += (pu * qtd)

    posicionadas_valor_atual = posicionadas_valor_atual.quantize(Decimal("0.01"))
    posicionadas_custo       = posicionadas_custo.quantize(Decimal("0.01"))
    posicionado              = (- posicionadas_custo + posicionadas_valor_atual).quantize(Decimal("0.01"))

    # -------- Valor disponível --------
    # regra atual: (patrimônio × %) − valor a mercado das abertas
    valor_disponivel = (
        (patrimonio_total * (percentual / Decimal("100"))).quantize(Decimal("0.01"))
        - posicionadas_valor_atual
    ).quantize(Decimal("0.01"))

    # -------- Realizadas (lucro/prejuízo acumulado) ----------
    realizadas = Decimal("0")
    for op in operacoes.filter(data_venda__isnull=False):
        total_compra = _to_decimal(op.preco_unitario) * _to_decimal(op.quantidade)
        total_venda  = _to_decimal(op.preco_venda_unitario) * _to_decimal(op.quantidade)
        realizadas += (total_venda - total_compra)
    realizadas = realizadas.quantize(Decimal("0.01"))

    # -------- Dias desde a primeira compra ----------
    primeira = operacoes.order_by("data_compra").first()
    dias_total = (date.today() - primeira.data_compra).days if (primeira and primeira.data_compra) else 0

    # -------- Rentabilidade média mensal (meses fechados) ----------
    fechadas = operacoes.filter(data_venda__isnull=False)
    rentab_mensal = None
    if fechadas.exists():
        partes = []
        for op in fechadas:
            if not (op.data_compra and op.data_venda and op.preco_unitario):
                continue
            meses = (op.data_venda.year - op.data_compra.year) * 12 + (op.data_venda.month - op.data_compra.month)
            meses = max(meses, 1)
            pu = _to_decimal(op.preco_unitario)
            pv = _to_decimal(op.preco_venda_unitario)
            if pu == 0:
                continue
            pct = ((pv - pu) / pu) * Decimal("100")
            partes.append(pct / Decimal(meses))
        if partes:
            rentab_mensal = float((sum(partes) / len(partes)).quantize(Decimal("0.01")))

    resumo = {
        "patrimonio": float(patrimonio_total.quantize(Decimal("0.01"))),
        "percentual_patrimonio": float(percentual),
        "valor_disponivel": float(valor_disponivel),
        # total a mercado das abertas
        "posicionadas": float(posicionadas_valor_atual),
        # PnL aberto pela sua fórmula (custo - valor atual)
        "posicionado": float(posicionado),
        "realizadas": float(realizadas),
        "dias_total": int(dias_total),
        "rentabilidade_mensal": rentab_mensal,
        # opcional
        "saldo_total": float(saldo_total.quantize(Decimal("0.01"))) if saldo_total is not None else None,
    }
    return Response(resumo)

@api_view(["GET"])
def carteira_detalhe(request, cliente_id):
    try:
        cliente = Cliente.objects.get(pk=cliente_id)
    except Cliente.DoesNotExist:
        return Response({"detail": "Cliente não encontrado"}, status=404)

    operacoes = OperacaoCarteira.objects.filter(cliente=cliente)

    # ======================
    # 1. Buscar últimas cotações no yfinance
    # ======================
    abertos = operacoes.filter(data_venda__isnull=True)
    tickers = list({f"{op.acao.ticker}.SA" for op in abertos if op.acao and op.acao.ticker})

    cotacoes = {}
    if tickers:
        try:
            data = yf.download(tickers=tickers, period="1d", interval="1m", progress=False)
            if len(tickers) == 1:
                ultimo = data["Close"].iloc[-1]
                cotacoes[tickers[0]] = float(ultimo)
            else:
                for t in tickers:
                    ultimo = data["Close"][t].dropna().iloc[-1]
                    cotacoes[t] = float(ultimo)
        except Exception as e:
            print("Erro ao buscar yfinance:", e)

    # Enriquecer operações com preço atual
    operacoes_data = []
    for op in operacoes:
        op_dict = OperacaoCarteiraSerializer(op).data
        if not op.data_venda:  # só abertas
            ticker = f"{op.acao.ticker}.SA"
            op_dict["preco_atual"] = cotacoes.get(ticker)
        else:
            op_dict["preco_atual"] = None
        operacoes_data.append(op_dict)

    # ======================
    # 2. Calcular Resumo
    # ======================
    patrimonio = sum((op.preco_unitario or 0) * (op.quantidade or 0) for op in operacoes)
    percentual = cliente.percentual_patrimonio or 0
    valor_disponivel = patrimonio * (percentual / 100)

    posicionadas = sum(
        (cotacoes.get(f"{op.acao.ticker}.SA", op.preco_unitario or 0)) * (op.quantidade or 0)
        for op in abertos
    )

    realizadas = sum(
        ((op.preco_venda_unitario or 0) * (op.quantidade or 0)) - ((op.preco_unitario or 0) * (op.quantidade or 0))
        for op in operacoes.filter(data_venda__isnull=False)
    )

    primeira = operacoes.order_by("data_compra").first()
    dias_total = (date.today() - primeira.data_compra).days if primeira and primeira.data_compra else 0

    realizadas_ops = operacoes.filter(data_venda__isnull=False)
    pct_mensal = None
    if realizadas_ops.exists():
        acumulado = []
        for op in realizadas_ops:
            if not op.data_compra or not op.data_venda or not op.preco_unitario:
                continue
            meses = (op.data_venda.year - op.data_compra.year) * 12 + (op.data_venda.month - op.data_compra.month)
            meses = meses if meses > 0 else 1
            pct = ((op.preco_venda_unitario - op.preco_unitario) / op.preco_unitario) * 100
            acumulado.append(pct / meses)
        if acumulado:
            pct_mensal = round(sum(acumulado) / len(acumulado), 2)

    resumo = {
        "patrimonio": float(patrimonio_total.quantize(Decimal("0.01"))),
        "percentual_patrimonio": float(percentual),
        "valor_disponivel": float(valor_disponivel),
        # total a mercado das abertas (como já vinha antes)
        "posicionadas": float(posicionadas_valor_atual),
        # NOVO: rentabilidade das abertas pela sua fórmula (CUSTO - VALOR_ATUAL)
        "posicionado": float(posicionado),
        "realizadas": float(realizadas.quantize(Decimal("0.01"))),
        "dias_total": int(dias_total),
        "rentabilidade_mensal": rentab_mensal,
    }
    return Response(resumo)

    # ======================
    # 3. Resposta única
    # ======================
    return Response({
        "cliente": {
            "id": cliente.id,
            "nome": cliente.nome,
            "percentual_patrimonio": cliente.percentual_patrimonio,
        },
        "resumo": resumo,
        "operacoes": operacoes_data,
    })


#---- ESSE É PRA GERAR A TELA CONSOLIDADA DE PATRIMÔNIO -------
@api_view(["GET"])
def patrimonio_disponivel(request):
    """
    Consolida por cliente os mesmos cálculos do `carteira_resumo`:
      - patrimonio_total  (tabela Patrimonio, último registro do cliente)
      - posicionadas_valor_atual (a mercado, via yfinance)
      - valor_disponivel = (patrimonio_total * percentual/100) - posicionadas_valor_atual
      - total_consolidado = posicionadas_valor_atual + valor_disponivel
    Retorna: codigo, nome, patrimonio, total_consolidado, valor_disponivel
    """
    clientes = Cliente.objects.all()
    saida = []

    for cliente in clientes:
        # -------- Patrimônio (tabela 'patrimonio') ----------
        cod_cliente = None
        if getattr(cliente, "codigo_xp", None):
            try:
                cod_cliente = int(str(cliente.codigo_xp).strip())
            except Exception:
                cod_cliente = None

        patrimonio_total = Decimal("0")
        saldo_total = Decimal("0")
        if cod_cliente is not None:
            ultimo = (
                Patrimonio.objects
                .filter(cod_cliente=cod_cliente)
                .order_by("-data_referencia", "-criado_em", "-id")
                .first()
            )
            if ultimo:
                patrimonio_total = _to_decimal(ultimo.patrimonio_total)
                saldo_total = _to_decimal(ultimo.saldo_total)

        percentual = _to_decimal(getattr(cliente, "percentual_patrimonio", 0))

        # -------- Posicionadas (a mercado via yfinance) ----------
        posicionadas_valor_atual = Decimal("0")
        posicionadas_custo = Decimal("0")

        abertos = OperacaoCarteira.objects.filter(cliente=cliente, data_venda__isnull=True)

        # tickers únicos
        tickers = list({f"{op.acao.ticker}.SA" for op in abertos if getattr(op.acao, "ticker", None)})

        cotacoes = {}
        if tickers:
            try:
                # usar 1m pra aproximar “a mercado” (igual ao carteira_resumo)
                data = yf.download(tickers=tickers, period="1d", interval="1m", progress=False)

                if len(tickers) == 1:
                    # quando é 1 ticker, yfinance devolve Series
                    ultimo_close = data["Close"].dropna().iloc[-1]
                    cotacoes[tickers[0]] = float(ultimo_close)
                else:
                    # quando são vários, vem DataFrame multi-coluna
                    for t in tickers:
                        serie = data["Close"][t] if isinstance(data["Close"], pd.DataFrame) else data["Close"]
                        ultimo_close = serie.dropna().iloc[-1]
                        cotacoes[t] = float(ultimo_close)
            except Exception as e:
                print("Erro yfinance:", e)

        # acumula valores a mercado e custo
        for op in abertos:
            t = f"{op.acao.ticker}.SA"
            # fallback: se faltar cotação, usa preço de compra
            preco_atual = _to_decimal(cotacoes.get(t, float(op.preco_unitario or 0)))
            qtd = _to_decimal(op.quantidade)
            pu  = _to_decimal(op.preco_unitario)

            posicionadas_valor_atual += (preco_atual * qtd)
            posicionadas_custo       += (pu * qtd)

        # arredondamentos iguais ao carteira_resumo
        posicionadas_valor_atual = posicionadas_valor_atual.quantize(Decimal("0.01"))
        posicionadas_custo       = posicionadas_custo.quantize(Decimal("0.01"))
        # posicionado = (- posicionadas_custo + posicionadas_valor_atual)  # não precisamos enviar aqui

        # -------- Valor disponível (mesma regra do carteira_resumo) --------
        valor_disponivel = (
            (patrimonio_total * (percentual / Decimal("100"))).quantize(Decimal("0.01"))
            - posicionadas_valor_atual
        ).quantize(Decimal("0.01"))

        # -------- Total consolidado (ações a mercado + disponível) --------
        total_consolidado = posicionadas_custo  

        saida.append({
            "codigo": cliente.id,
            "nome": cliente.nome,
            "patrimonio": float(patrimonio_total.quantize(Decimal("0.01"))),
            "total_consolidado": float(total_consolidado),
            "valor_disponivel": float(valor_disponivel),
        })

    return Response(saida)


def _build_mt5_status_url(ip: str) -> str:
    scheme = getattr(settings, "MT5_CLIENT_API_SCHEME", "http").rstrip(":/")
    port = getattr(settings, "MT5_CLIENT_API_PORT", "")
    path = getattr(settings, "MT5_CLIENT_API_STATUS_PATH", "/status")

    base = f"{scheme}://{ip}"
    if port:
        base = f"{base}:{port}"

    if not path.startswith("/"):
        path = f"/{path}"

    return f"{base}{path}"


def _evaluate_mt5_status(payload: dict | None) -> tuple[str, str | None]:
    if not payload:
        return "error", "Resposta vazia"

    terminal = payload.get("terminal") or {}
    if not terminal.get("connected"):
        return "offline", "Terminal MT5 desconectado"
    if terminal.get("trade_allowed") is False:
        return "warning", "Trade não permitido"

    return "online", None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def clientes_mt5_status(request):
    timeout = getattr(settings, "MT5_CLIENT_API_TIMEOUT", 5)
    resultados = []

    try:
        clientes = Cliente.objects.all()
    except Exception as exc:
        return Response(
            {"error": f"Falha ao carregar clientes: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    for cliente in clientes:
        ip_publico = (cliente.vm_ip or "").strip()
        ip_privado = (cliente.vm_private_ip or "").strip()
        ip_utilizado = ip_privado or ip_publico

        info = {
            "id": cliente.id,
            "nome": cliente.nome,
            "ip": ip_utilizado or None,
            "status": "missing_ip",
            "detail": None,
            "ping": None,
            "checked_at": timezone.now().isoformat(),
        }

        if not ip_utilizado:
            resultados.append(info)
            continue

        url = _build_mt5_status_url(ip_utilizado)
        try:
            resposta = requests.get(url, timeout=timeout)
            if resposta.ok:
                try:
                    payload = resposta.json()
                except ValueError:
                    payload = None

                status_label, detalhe = _evaluate_mt5_status(payload)
                info["status"] = status_label
                info["detail"] = detalhe

                if payload:
                    terminal = payload.get("terminal") or {}
                    info["ping"] = terminal.get("ping")
            else:
                info["status"] = "error"
                info["detail"] = f"HTTP {resposta.status_code}"
        except requests.Timeout:
            info["status"] = "timeout"
            info["detail"] = "Tempo limite excedido"
        except requests.RequestException as exc:
            info["status"] = "error"
            info["detail"] = str(exc)
        except Exception as exc:
            info["status"] = "error"
            info["detail"] = f"Falha inesperada: {exc}"

        resultados.append(info)

    return Response(resultados)


# =============================
# Recomendações disponíveis
# =============================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recomendacoes_disponiveis(request, cliente_id: int):
    try:
        Cliente.objects.get(pk=cliente_id)
    except Cliente.DoesNotExist:
        return Response({"detail": "Cliente não encontrado"}, status=404)

    # ações em aberto do cliente
    abertos = OperacaoCarteira.objects.filter(cliente_id=cliente_id, data_venda__isnull=True).values_list("acao_id", flat=True)
    qs = RecomendacaoDiariaAtualNova.objects.exclude(acao_id__in=list(abertos)).order_by("-probabilidade", "-percentual_estimado", "-data")
    dados = [
        {
            "acao_id": r.acao_id,
            "ticker": r.ticker,
            "empresa": r.empresa,
            "preco_compra": float(r.preco_compra or 0),
            "alvo_sugerido": float(r.alvo_sugerido or 0),
            "percentual_estimado": float(r.percentual_estimado or 0),
            "probabilidade": float(r.probabilidade or 0),
        }
        for r in qs
    ]
    return Response(dados)


# =============================
# Compra MT5 - validação e envio
# =============================

def _get_cliente_ip(cliente: Cliente) -> str | None:
    ip_publico = (cliente.vm_ip or "").strip()
    ip_privado = (cliente.vm_private_ip or "").strip()
    return ip_privado or ip_publico or None


def _base_from_symbol(symbol: str) -> str:
    return symbol[:-1] if symbol and symbol.endswith("F") else symbol


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mt5_compra_validar(request, cliente_id: int):
    """
    Valida compra e sugere distribuição fracionária quando necessário.

    Body:
    {
      "ticker": "PETR4",              # base
      "modo": "quantidade"|"valor",
      "quantidade": 150,               # quando modo=quantidade
      "valor": 1000.00,                # quando modo=valor
      "execucao": "mercado"|"limite",
      "preco": 36.20,                  # quando execucao=limite
      "tp": 37.50
    }
    """
    try:
        cliente = Cliente.objects.get(pk=cliente_id)
    except Cliente.DoesNotExist:
        return Response({"detail": "Cliente não encontrado"}, status=404)

    ip = _get_cliente_ip(cliente)
    if not ip:
        return Response({"detail": "Cliente sem IP configurado"}, status=400)

    body = request.data or {}
    ticker_base = str(body.get("ticker") or "").strip().upper()
    modo = (body.get("modo") or "quantidade").lower()
    quantidade = body.get("quantidade")
    valor = body.get("valor")
    execucao = (body.get("execucao") or "mercado").lower()
    preco = body.get("preco")
    tp = body.get("tp")

    if not ticker_base:
        return Response({"detail": "Parâmetro 'ticker' é obrigatório"}, status=400)
    if modo not in ("quantidade", "valor"):
        return Response({"detail": "Modo inválido"}, status=400)
    if execucao not in ("mercado", "limite"):
        return Response({"detail": "Execução inválida"}, status=400)
    if execucao == "limite" and preco is None:
        return Response({"detail": "Preço é obrigatório para ordem a limite"}, status=400)
    if tp is None:
        return Response({"detail": "TP (alvo) é obrigatório"}, status=400)

    mt5 = MT5Client(ip)
    base_info = mt5.simbolo(ticker_base)
    frac_ticker = f"{ticker_base}F"
    frac_info = mt5.simbolo(frac_ticker)

    if not base_info.ok:
        return Response({"detail": f"Símbolo base inválido: {ticker_base}"}, status=400)

    # preço de referência para cálculo por valor
    ref_price = None
    if execucao == "mercado":
        q = mt5.cotacao(ticker_base)
        if q.ok and isinstance(q.data, dict):
            ref_price = float(q.data.get("ask") or q.data.get("last") or 0) or None
    else:
        ref_price = float(preco)

    legs = []
    mensagens = []

    def _get_step(info: dict | None) -> tuple[float, float, float] | None:
        if not info or not isinstance(info.data, dict):
            return None
        d = info.data
        return float(d.get("volume_min", 0)), float(d.get("volume_step", 1)), float(d.get("volume_max", 0))

    base_rules = _get_step(base_info)
    frac_rules = _get_step(frac_info) if frac_info.ok else None

    if modo == "quantidade":
        if quantidade is None:
            return Response({"detail": "Informe a quantidade"}, status=400)
        qtd = float(quantidade)
        if base_rules:
            minv, step, _ = base_rules
            qtd_lote = (qtd // step) * step
            rem = qtd - qtd_lote
        else:
            qtd_lote, rem = 0, qtd

        if qtd_lote > 0:
            legs.append({"symbol": ticker_base, "quantidade": int(qtd_lote)})
        if rem > 0 and frac_rules:
            minf, stepf, _ = frac_rules
            # ajusta restante para step do fracionário
            rem_adj = int(rem // stepf) * stepf
            if rem_adj > 0:
                legs.append({"symbol": frac_ticker, "quantidade": int(rem_adj)})
            else:
                mensagens.append("Quantidade remanescente não respeita step do fracionário")

        if not legs:
            return Response({"detail": "Quantidade não respeita os passos de volume"}, status=400)

    else:  # modo == 'valor'
        if valor is None:
            return Response({"detail": "Informe o valor da compra"}, status=400)
        if not ref_price:
            return Response({"detail": "Sem preço de referência para cálculo"}, status=400)
        val = float(valor)
        qtd_lote = 0
        if base_rules:
            minv, step, _ = base_rules
            custo_lote = ref_price * step
            if custo_lote > 0:
                qtd_lote = int(val // custo_lote) * step
                val -= qtd_lote * ref_price
        if qtd_lote > 0:
            legs.append({"symbol": ticker_base, "quantidade": int(qtd_lote)})

        # fracionário com o restante
        if frac_rules and val > 0:
            minf, stepf, _ = frac_rules
            qtd_frac = int(val // (ref_price * stepf)) * stepf
            if qtd_frac > 0:
                legs.append({"symbol": frac_ticker, "quantidade": int(qtd_frac)})

        if not legs:
            return Response({"detail": "Valor insuficiente para os passos de volume"}, status=400)

    # valida cada perna via /validar-ordem
    validacoes = []
    for lg in legs:
        params = {
            "ticker": lg["symbol"],
            "tipo": "compra",
            "quantidade": lg["quantidade"],
            "execucao": execucao,
        }
        if execucao == "limite":
            params["preco"] = preco
        params["tp"] = tp
        v = mt5.validar_ordem(**params)
        validacoes.append({"symbol": lg["symbol"], "ok": v.ok and isinstance(v.data, dict) and v.data.get("ok", False), "motivo": None if not v.ok else (v.data.get("motivo") if isinstance(v.data, dict) else None)})

    return Response({
        "ticker_base": ticker_base,
        "execucao": execucao,
        "preco": preco,
        "tp": tp,
        "legs_sugeridas": legs,
        "validacoes": validacoes,
        "mensagens": mensagens,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mt5_compra(request, cliente_id: int):
    """
    Envia as ordens (1..N) com TP quando possível. Grava MT5Order e retorna group_id + order_tickets.

    Body:
    {
      "ticker_base": "PETR4",
      "execucao": "mercado"|"limite",
      "preco": 36.20,              # quando execucao=limite
      "tp": 37.50,
      "legs": [ {"symbol":"PETR4","quantidade":100}, {"symbol":"PETR4F","quantidade":7} ]
    }
    """
    try:
        cliente = Cliente.objects.get(pk=cliente_id)
    except Cliente.DoesNotExist:
        return Response({"detail": "Cliente não encontrado"}, status=404)

    ip = _get_cliente_ip(cliente)
    if not ip:
        return Response({"detail": "Cliente sem IP configurado"}, status=400)

    body = request.data or {}
    ticker_base = str(body.get("ticker_base") or "").strip().upper()
    execucao = (body.get("execucao") or "mercado").lower()
    preco = body.get("preco")
    tp = body.get("tp")
    legs = body.get("legs") or []

    if not ticker_base or not legs:
        return Response({"detail": "Parâmetros inválidos"}, status=400)
    if execucao not in ("mercado", "limite"):
        return Response({"detail": "Execução inválida"}, status=400)
    if execucao == "limite" and preco is None:
        return Response({"detail": "Preço é obrigatório para ordem a limite"}, status=400)
    if tp is None:
        return Response({"detail": "TP (alvo) é obrigatório"}, status=400)

    mt5 = MT5Client(ip)
    group_id = uuid4()

    # pega login da conta (best-effort)
    acc = mt5.status()
    account_login = None
    try:
        if acc.ok and isinstance(acc.data, dict):
            account_login = (acc.data.get("conta") or {}).get("login")
    except Exception:
        account_login = None

    results = []
    for lg in legs:
        symbol = lg.get("symbol")
        qtd = lg.get("quantidade")
        if not symbol or not qtd:
            continue
        payload = {
            "ticker": symbol,
            "tipo": "compra",
            "quantidade": float(qtd),
            "execucao": execucao,
            "tp": float(tp),
        }
        if execucao == "limite":
            payload["preco"] = float(preco)

        # tenta enviar com TP
        r = mt5.enviar_ordem(payload)
        apply_tp_after_exec = False
        response_json = None
        order_ticket = None
        retcode = None

        if not r.ok:
            # tenta reenviar sem TP se erro provável de stops
            apply_tp_after_exec = True
            payload.pop("tp", None)
            r2 = mt5.enviar_ordem(payload)
            if not r2.ok:
                # registra como rejeitada
                obj = MT5Order.objects.create(
                    group_id=group_id,
                    cliente=cliente,
                    base_ticker=ticker_base,
                    symbol=symbol,
                    lado="compra",
                    execucao=execucao,
                    volume_req=qtd,
                    price_req=preco if execucao == "limite" else None,
                    tp_req=tp,
                    apply_tp_after_exec=apply_tp_after_exec,
                    account_login=account_login,
                    status="rejeitada",
                    response_json=str(r2.data if r2.data is not None else r2.error),
                )
                results.append({"symbol": symbol, "status": "rejeitada", "detail": obj.response_json})
                continue
            response_json = r2.data
        else:
            response_json = r.data

        try:
            order_ticket = int(response_json.get("order") or response_json.get("order_ticket") or 0)
        except Exception:
            order_ticket = None
        try:
            retcode = int(response_json.get("retcode") or 0)
        except Exception:
            retcode = None

        MT5Order.objects.create(
            group_id=group_id,
            cliente=cliente,
            base_ticker=ticker_base,
            symbol=symbol,
            lado="compra",
            execucao=execucao,
            volume_req=qtd,
            price_req=preco if execucao == "limite" else None,
            tp_req=tp,
            apply_tp_after_exec=apply_tp_after_exec,
            account_login=account_login,
            order_ticket=order_ticket,
            retcode=retcode,
            response_json=str(response_json),
            status="enviada",
        )

        results.append({"symbol": symbol, "order_ticket": order_ticket, "status": "enviada"})

    return Response({"group_id": str(group_id), "results": results})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def mt5_compra_status(request, cliente_id: int, group_id):
    """
    Verifica status das ordens de um group_id. Quando todas executadas, cria OperacaoCarteira consolidada
    e configura TP via SLTP se necessário.
    """
    try:
        cliente = Cliente.objects.get(pk=cliente_id)
    except Cliente.DoesNotExist:
        return Response({"detail": "Cliente não encontrado"}, status=404)

    ip = _get_cliente_ip(cliente)
    if not ip:
        return Response({"detail": "Cliente sem IP configurado"}, status=400)

    mt5 = MT5Client(ip)
    orders = list(MT5Order.objects.filter(cliente=cliente, group_id=group_id))
    if not orders:
        return Response({"detail": "group_id desconhecido"}, status=404)

    # verifica deals por ordem
    agora = timezone.now()
    inicio_epoch = int((min(o.created_at for o in orders) - timedelta(hours=1)).timestamp())
    fim_epoch = int((agora + timedelta(minutes=5)).timestamp())

    deals_resp = mt5.historico_deals(inicio=inicio_epoch, fim=fim_epoch)
    deals_by_order = {}
    if deals_resp.ok and isinstance(deals_resp.data, list):
        for d in deals_resp.data:
            try:
                order_id = int(d.get("order")) if isinstance(d, dict) else None
            except Exception:
                order_id = None
            if not order_id:
                continue
            deals_by_order.setdefault(order_id, []).append(d)

    # atualiza status local e consolida volumes
    executed_all = True
    summary = []
    for o in orders:
        o_status = o.status
        order_deals = deals_by_order.get(int(o.order_ticket or 0), [])
        vol_exec = 0.0
        vwap_num = 0.0
        for d in order_deals:
            vol = float(d.get("volume", 0))
            price = float(d.get("price", 0))
            vol_exec += vol
            vwap_num += vol * price
            # upsert MT5Deal
            try:
                deal_ticket = int(d.get("ticket"))
            except Exception:
                deal_ticket = None
            if deal_ticket:
                MT5Deal.objects.get_or_create(
                    deal_ticket=deal_ticket,
                    defaults={
                        "cliente": cliente,
                        "order_ticket": int(d.get("order") or 0) or None,
                        "position_ticket": int(d.get("position_id") or d.get("position") or 0) or None,
                        "symbol": d.get("symbol"),
                        "lado": "compra" if int(d.get("type", 0)) in (0, 2) else "venda",  # Buy/Buy limit/stop
                        "volume": vol,
                        "price": price,
                        "commission": float(d.get("commission", 0) or 0),
                        "swap": float(d.get("swap", 0) or 0),
                        "profit": float(d.get("profit", 0) or 0),
                        "time": datetime.fromtimestamp(int(d.get("time")), tz=timezone.utc),
                        "magic": int(d.get("magic", 0) or 0) or None,
                        "comment": d.get("comment"),
                        "raw_json": json.dumps(d),
                    }
                )

        if vol_exec >= float(o.volume_req):
            if o_status != "executada":
                o.status = "executada"
                o.save(update_fields=["status", "updated_at"])
            avg = (vwap_num / vol_exec) if vol_exec > 0 else None
            summary.append({"symbol": o.symbol, "executada": True, "volume": vol_exec, "preco_medio": avg})
        else:
            executed_all = False
            if o_status != "pendente":
                o.status = "pendente"
                o.save(update_fields=["status", "updated_at"])
            summary.append({"symbol": o.symbol, "executada": False, "volume_exec": vol_exec})

    # quando todas executadas, cria OperacaoCarteira consolidada e aplica TP via SLTP (se necessário)
    created_operacao = None
    if executed_all:
        base = _base_from_symbol(orders[0].symbol)
        # soma volumes e vwap por symbol
        legs_vwap = {}
        for s in summary:
            if not s.get("executada"):
                continue
            symbol = s["symbol"]
            legs_vwap[symbol] = {
                "volume": float(s["volume"]),
                "preco_medio": float(s.get("preco_medio") or 0),
            }

        total_vol = sum(v["volume"] for v in legs_vwap.values())
        if total_vol > 0:
            vwap_total = sum(v["volume"] * v["preco_medio"] for v in legs_vwap.values()) / total_vol
        else:
            vwap_total = 0.0

        # acha acao base
        try:
            acao = Acao.objects.get(ticker=base)
        except Acao.DoesNotExist:
            acao = None

        if acao is not None:
            op = OperacaoCarteira(
                cliente=cliente,
                acao=acao,
                data_compra=timezone.now().date(),
                preco_unitario=Decimal(str(vwap_total)).quantize(Decimal("0.01")),
                quantidade=int(total_vol),
                valor_total_compra=Decimal(str(vwap_total * total_vol)).quantize(Decimal("0.01")),
                valor_alvo=Decimal(str(orders[0].tp_req or 0)).quantize(Decimal("0.01")),
            )
            # Como OperacaoCarteira é unmanaged, usamos .save() assumindo tabela existente
            op.save(force_insert=True)
            created_operacao = op.id

            # vincula legs com position_ticket corrente
            # tenta obter posições para cada symbol
            pos = mt5.posicoes()
            pos_map = {}
            if pos.ok and isinstance(pos.data, list):
                for p in pos.data:
                    if isinstance(p, dict):
                        pos_map[p.get("symbol")] = p
            for sym, data_leg in legs_vwap.items():
                p = pos_map.get(sym)
                position_ticket = int(p.get("ticket")) if p else None
                OperacaoMT5Leg.objects.create(
                    operacao=op,
                    symbol=sym,
                    position_ticket=position_ticket or 0,
                    volume=Decimal(str(data_leg["volume"])),
                    price_open=Decimal(str(data_leg["preco_medio"])),
                    order_ticket=next((int(o.order_ticket or 0) for o in orders if o.symbol == sym), None),
                    deal_tickets=None,
                )

            # aplica TP via SLTP se alguma ordem marcou apply_tp_after_exec
            if any(o.apply_tp_after_exec for o in orders) and created_operacao:
                alvo = float(orders[0].tp_req or 0)
                for sym in legs_vwap.keys():
                    p = pos_map.get(sym)
                    if p and alvo > 0:
                        mt5.ajustar_stop({"ticket": int(p.get("ticket")), "stop_gain": alvo})

    return Response({
        "executed_all": executed_all,
        "summary": summary,
        "created_operacao_id": created_operacao,
    })


def _run_recomendacoes():
    try:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        script_path = os.path.join(base_dir, "core", "scripts", "A03Recomendcoes_intraday.py")

        # executa o script com o mesmo Python do projeto
        result = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            check=False,
        )

        if result.returncode == 0:
            return True, f"Rotina concluída com sucesso.\n{result.stdout}"
        else:
            return False, f"Erro na execução ({result.returncode}):\n{result.stderr}"
    except Exception as e:
        return False, f"Falha ao executar: {e}"  

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def recomendacoes_api(request):
    """
    GET: retorna dados da vw_recomendacoes_diarias_atual_nova
    POST: dispara a rotina _run_recomendacoes()
    """
    from .models import RecomendacaoDiariaAtual  # importa dentro pra evitar loop
    if request.method == "POST":
        ok, msg = _run_recomendacoes()
        status = "success" if ok else "error"
        return JsonResponse({"status": status, "message": msg})

    qs = RecomendacaoDiariaAtual.objects.all().order_by("-data")
    dados = [
        {
            "acao_id": r.acao_id,
            "ticker": r.ticker,
            "empresa": r.empresa,
            "setor": r.setor,
            "data": r.data,
            "preco_compra": float(r.preco_compra or 0),
            "alvo_sugerido": float(r.alvo_sugerido or 0),
            "percentual_estimado": float(r.percentual_estimado or 0),
            "probabilidade": float(r.probabilidade or 0),
            "vezes_atingiu_alvo_1m": r.vezes_atingiu_alvo_1m,
            "cruza_medias": bool(r.cruza_medias),
            "obv_cres": bool(r.obv_cres),
            "vol_acima_media": bool(r.vol_acima_media),
            "wma602": float(r.wma602 or 0),
        }
        for r in qs
    ]
    return JsonResponse(dados, safe=False)
