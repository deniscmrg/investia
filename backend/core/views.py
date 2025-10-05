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
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from datetime import date

from .models import (
    Cliente,
    OperacaoCarteira,
    Acao,
    ImportacaoJob,   # log das importações (mantido)
    Patrimonio,      # <<< tipado
    Custodia,
    Cotacao,
    RecomendacaoDiariaAtual, RecomendacaoDiariaAtualNova
)
from .serializers import (
    UserSerializer,
    ClienteSerializer,
    OperacaoCarteiraSerializer,
    AcaoSerializer,
)


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
  

# def recomendacoes_api(request):
#     if request.method == "POST":
#         ok, msg = _run_recomendacoes()
#         status = "success" if ok else "error"
#         return JsonResponse({"status": status, "message": msg})

#     qs = RecomendacaoDiariaAtual.objects.all()
#     dados = [
#         {
#             "ticker": r.ticker,
#             "empresa": r.empresa,
#             "setor": r.setor,
#             "data": r.data,
#             "preco_compra": float(r.preco_compra),
#             "alvo_sugerido": float(r.alvo_sugerido),
#             "percentual_estimado": float(r.percentual_estimado),
#             "probabilidade": float(r.probabilidade),
#             "vezes_atingiu_alvo_1m": r.vezes_atingiu_alvo_1m,
#             "cruza_medias": r.cruza_medias,
#             "obv_cres": r.obv_cres,
#             "vol_acima_media": r.vol_acima_media,
#             "wma602": r.wma602,
#             "origem": r.origem,
#         }
#         for r in qs
#     ]
#     return JsonResponse(dados, safe=False)

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def recomendacoes_api(request):
    """
    GET: retorna dados da vw_recomendacoes_diarias_atual_nova
    POST: dispara a rotina _run_recomendacoes() (mantida igual)
    """
    if request.method == "POST":
        ok, msg = _run_recomendacoes()
        status = "success" if ok else "error"
        return JsonResponse({"status": status, "message": msg})

    qs = RecomendacaoDiariaAtualNova.objects.all().order_by("-data")

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
            "MIN": float(r.MIN or 0),
            "MAX": float(r.MAX or 0),
            "ALTA": float(r.ALTA or 0),
            "BAIXA": float(r.BAIXA or 0),
            "AMPLITUDE": float(r.AMPLITUDE or 0),
            "AMP_AxF": float(r.AMP_AxF or 0),
            "AMP_MXxMN": float(r.AMP_MXxMN or 0),
            "A_x_F": float(r.A_x_F or 0),
            "ALVO": float(r.ALVO or 0),
        }
        for r in qs
    ]

    return JsonResponse(dados, safe=False)
