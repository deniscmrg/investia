from decimal import Decimal
from django.db import models

# =======================
# Ações / Cotações / Recs
# =======================

class Acao(models.Model):
    ticker = models.CharField(max_length=10, unique=True)
    empresa = models.CharField(max_length=100, blank=True, null=True)
    setor = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        db_table = "cotacoes_acao"
        managed = False  # tabela já existe no banco

    def __str__(self):
        return self.ticker


class Cotacao(models.Model):
    acao = models.ForeignKey('Acao', on_delete=models.CASCADE)
    data = models.DateField()

    # Preços e volume
    abertura = models.DecimalField(max_digits=10, decimal_places=2)
    fechamento = models.DecimalField(max_digits=10, decimal_places=2)
    minima = models.DecimalField(max_digits=10, decimal_places=2)
    maxima = models.DecimalField(max_digits=10, decimal_places=2)
    volume = models.BigIntegerField()

    # Médias de Welles Wilder
    wma17 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    wma34 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    wma72 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    wma144 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    wma602 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # Indicadores
    ad = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    obv = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    rsi_14 = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    media_volume_20d = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)

    # Derivados p/ ML
    fechamento_anterior = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    rsi_14_anterior = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    volume_m3 = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    max_5dias = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    target_compra = models.BooleanField(default=False)
    atr = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)

    class Meta:
        db_table = "cotacoes_cotacao"  # nome correto da tabela
        managed = False
        unique_together = ('acao', 'data')

    def __str__(self):
        return f'{self.acao.ticker} {self.data} - {self.fechamento}'


class RecomendacaoDiariaAtualNova(models.Model):
    acao_id = models.IntegerField(primary_key=True)
    ticker = models.CharField(max_length=20)
    empresa = models.CharField(max_length=255)
    setor = models.CharField(max_length=255, null=True, blank=True)
    data = models.DateField()
    preco_compra = models.DecimalField(max_digits=10, decimal_places=2)
    alvo_sugerido = models.DecimalField(max_digits=10, decimal_places=2)
    percentual_estimado = models.DecimalField(max_digits=6, decimal_places=2)
    probabilidade = models.DecimalField(max_digits=6, decimal_places=2)
    vezes_atingiu_alvo_1m = models.BigIntegerField(null=True, blank=True)
    cruza_medias = models.BooleanField(null=True, blank=True)
    obv_cres = models.BooleanField(null=True, blank=True)
    vol_acima_media = models.BooleanField(null=True, blank=True)
    wma602 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # campos com nomes que contêm espaços → usa db_column
    MIN = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    MAX = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    ALTA = models.DecimalField(max_digits=29, decimal_places=2, null=True, blank=True)
    BAIXA = models.DecimalField(max_digits=29, decimal_places=2, null=True, blank=True)
    AMPLITUDE = models.DecimalField(max_digits=17, decimal_places=2, null=True, blank=True)
    AMP_AxF = models.DecimalField(max_digits=21, decimal_places=2, null=True, blank=True, db_column="AMP A x F")
    AMP_MXxMN = models.DecimalField(max_digits=17, decimal_places=2, null=True, blank=True, db_column="AMP MX x MN")
    A_x_F = models.DecimalField(max_digits=21, decimal_places=2, null=True, blank=True, db_column="A x F")
    ALVO = models.DecimalField(max_digits=21, decimal_places=2, null=True, blank=True, db_column="ALVO")

    class Meta:
        managed = False
        db_table = "vw_recomendacoes_diarias_atual_nova"



class RecomendacaoDiaria(models.Model):
    acao = models.ForeignKey('Acao', on_delete=models.CASCADE)
    data = models.DateField()  # data da recomendação
    preco_compra = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    alvo_sugerido = models.DecimalField(max_digits=10, decimal_places=2)
    perc_alvo = models.DecimalField(max_digits=5, decimal_places=2)
    probabilidade = models.DecimalField(max_digits=5, decimal_places=2, default=0)  # 0-100

    # Detalhamento técnico
    abaixo_wma = models.BooleanField()
    wma602 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cruzamento_medias = models.BooleanField(null=True, blank=True)
    volume_acima_media = models.BooleanField(null=True, blank=True)
    obv_crescente = models.BooleanField(null=True, blank=True)

    # Resultado monitorado
    data_alvo = models.DateField(null=True, blank=True)
    fechamento_alvo = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    perc_alvo_realizado = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    origem = models.CharField(
        max_length=10,
        choices=[('score', 'Score'), ('ia', 'IA')],
        default='ia'
    )

    class Meta:
        db_table = "cotacoes_recomendacaodiaria"  # nome correto da tabela
        managed = False
        unique_together = ('acao', 'data', 'origem')

    def __str__(self):
        return f'{self.acao.ticker} {self.data} ({self.origem})'


class RecomendacaoSimulada(models.Model):
    acao = models.ForeignKey('Acao', on_delete=models.CASCADE)
    data = models.DateField()
    fechamento = models.DecimalField(max_digits=10, decimal_places=2)
    wma602 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    percentual_diferenca = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    subindo_3dias = models.BooleanField(null=True, blank=True)
    cruzamento_medias = models.BooleanField(null=True, blank=True)
    volume_acima_media = models.BooleanField(null=True, blank=True)
    obv_crescente = models.BooleanField(null=True, blank=True)
    score_reversao = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    atingiu_alvo = models.BooleanField(null=True, blank=True)
    rsi_14 = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    retorno_5d = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    media_volume_20d = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)

    class Meta:
        unique_together = ('acao', 'data')

    def __str__(self):
        return f'{self.acao.ticker} {self.data}'


class RecomendacaoDiariaAtual(models.Model):
    # VIEW (somente leitura)
    acao_id = models.IntegerField(primary_key=True)
    ticker = models.CharField(max_length=20)
    empresa = models.CharField(max_length=255)
    setor = models.CharField(max_length=255, null=True, blank=True)
    data = models.DateField()
    preco_compra = models.DecimalField(max_digits=12, decimal_places=2)
    alvo_sugerido = models.DecimalField(max_digits=12, decimal_places=2)
    percentual_estimado = models.DecimalField(max_digits=6, decimal_places=2)
    probabilidade = models.DecimalField(max_digits=6, decimal_places=4)
    vezes_atingiu_alvo_1m = models.IntegerField()
    cruza_medias = models.BooleanField()
    obv_cres = models.BooleanField()
    vol_acima_media = models.BooleanField()
    wma602 = models.BooleanField()
    origem = models.CharField(max_length=50)

    class Meta:
        managed = False
        db_table = "vw_recomendacoes_diarias_atual"

    def __str__(self):
        return f'{self.ticker} {self.data}'


# =======================
# Clientes / Operações
# =======================

class Cliente(models.Model):
    nome = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    documento = models.CharField(max_length=20, unique=True)  # CPF/CNPJ
    telefone = models.CharField(max_length=20, blank=True)
    vm = models.CharField(max_length=20, blank=True)
    vm_ip = models.CharField(max_length=20, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    codigo_xp = models.CharField(max_length=30, blank=True, null=True)
    percentual_patrimonio = models.DecimalField(max_digits=5, decimal_places=2, default=0)


    class Meta:
        db_table = "cotacoes_cliente"
        managed = False  # tabela já existe

    def __str__(self):
        return f'{self.nome} ({self.email})'


class OperacaoCarteira(models.Model):
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE)
    acao = models.ForeignKey(Acao, on_delete=models.CASCADE)

    # compra
    data_compra = models.DateField()
    preco_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    quantidade = models.IntegerField()
    valor_total_compra = models.DecimalField(max_digits=12, decimal_places=2)

    # venda
    data_venda = models.DateField(null=True, blank=True)
    preco_venda_unitario = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    valor_total_venda = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # alvo
    valor_alvo = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = "cotacoes_operacaocarteira"
        managed = False  # tabela já existe

    def calcular_valor_total_compra(self):
        return Decimal(self.preco_unitario) * self.quantidade

    def calcular_valor_total_venda(self):
        if self.preco_venda_unitario:
            return Decimal(self.preco_venda_unitario) * self.quantidade
        return None

    def lucro_percentual(self):
        if self.valor_total_venda and self.valor_total_compra:
            lucro = ((self.valor_total_venda / self.valor_total_compra) - 1) * 100
            return round(lucro, 2)
        return None

    def dias_posicionado(self):
        if not self.data_venda:
            from datetime import date as _date
            return (_date.today() - self.data_compra).days
        return 0

    def __str__(self):
        return f'{self.cliente.nome} - {self.acao.ticker} ({self.data_compra})'


# =======================
# Importação (tipado)
# =======================

class ImportacaoJob(models.Model):
    TIPOS = (('patrimonio', 'Patrimônio'), ('custodia', 'Custódia'))
    tipo = models.CharField(max_length=20, choices=TIPOS)
    data_referencia = models.DateField()
    criado_em = models.DateTimeField(auto_now_add=True)
    total_linhas = models.IntegerField(default=0)
    status = models.CharField(max_length=20, default='ok')  # ok | sobrescrito

    class Meta:
        db_table = 'imp_jobs'
        indexes = [models.Index(fields=['tipo', 'data_referencia'])]

    def __str__(self):
        return f'{self.tipo} {self.data_referencia} ({self.total_linhas})'


class Patrimonio(models.Model):
    data_referencia = models.DateField()
    cod_cliente = models.BigIntegerField(null=True, blank=True)
    codigo_assessor = models.BigIntegerField(null=True, blank=True)
    nome = models.CharField(max_length=255, null=True, blank=True)

    patrimonio_total = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    saldo_total = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    garantia_utilizada = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    garantias_disponiveis = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)

    d0 = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    d1 = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    d2 = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)

    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'patrimonio'
        unique_together = (('data_referencia', 'cod_cliente'),)
        indexes = [
            models.Index(fields=['data_referencia']),
            models.Index(fields=['codigo_assessor']),
        ]

    def __str__(self):
        return f'{self.data_referencia} - {self.cod_cliente or "sem cliente"}'


class Custodia(models.Model):
    data_referencia = models.DateField()
    cod_cliente = models.BigIntegerField(null=True, blank=True)
    codigo_assessor = models.BigIntegerField(null=True, blank=True)
    nome = models.CharField(max_length=255, null=True, blank=True)

    ativo = models.CharField(max_length=40, null=True, blank=True)
    isin = models.CharField(max_length=20, null=True, blank=True)
    tipo_ativo = models.CharField(max_length=50, null=True, blank=True)
    quantidade = models.DecimalField(max_digits=24, decimal_places=8, null=True, blank=True)
    preco_medio = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    valor_total = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)

    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'custodia'
        indexes = [
            models.Index(fields=['data_referencia']),
            models.Index(fields=['data_referencia', 'cod_cliente']),
            models.Index(fields=['data_referencia', 'ativo']),
        ]

    def __str__(self):
        return f'{self.data_referencia} - {self.cod_cliente or "sem cliente"} - {self.ativo or "-"}'
