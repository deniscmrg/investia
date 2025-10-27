from datetime import date
from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Cliente, Acao, OperacaoCarteira, Patrimonio, Custodia, RecomendacaoDiariaAtualNova, MT5Order, OperacaoMT5Leg
from decimal import Decimal, InvalidOperation

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name"]


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = "__all__"


class AcaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Acao
        fields = ["id", "ticker", "empresa", "setor"]


class OperacaoCarteiraSerializer(serializers.ModelSerializer):
    acao_nome = serializers.CharField(source="acao.ticker", read_only=True)

    # trocar DecimalField(read_only=True) por SerializerMethodField
    valor_total_compra = serializers.SerializerMethodField()
    valor_total_venda  = serializers.SerializerMethodField()
    lucro_percentual   = serializers.SerializerMethodField()
    dias_posicionado   = serializers.SerializerMethodField()
    status             = serializers.SerializerMethodField()

    class Meta:
        model = OperacaoCarteira
        fields = [
            "id",
            "cliente",
            "acao",
            "acao_nome",
            "data_compra",
            "preco_unitario",
            "quantidade",
            "valor_total_compra",
            "data_venda",
            "preco_venda_unitario",
            "valor_total_venda",
            "valor_alvo",
            "lucro_percentual",
            "dias_posicionado",
            "status",
        ]
        read_only_fields = [
            "valor_total_compra",
            "valor_total_venda",
            "lucro_percentual",
            "dias_posicionado",
        ]

    # ---------- Saída ----------
    def get_valor_total_compra(self, obj):
        try:
            if hasattr(obj, "valor_total_compra") and obj.valor_total_compra is not None:
                return float(obj.valor_total_compra)
            return float(Decimal(obj.preco_unitario) * Decimal(obj.quantidade))
        except Exception:
            return None

    def get_valor_total_venda(self, obj):
        try:
            if hasattr(obj, "valor_total_venda") and obj.valor_total_venda is not None:
                return float(obj.valor_total_venda)
            if obj.data_venda and obj.preco_venda_unitario is not None:
                return float(Decimal(obj.preco_venda_unitario) * Decimal(obj.quantidade))
        except Exception:
            pass
        return None

    def get_lucro_percentual(self, obj):
        try:
            if obj.data_venda and obj.preco_venda_unitario is not None and obj.preco_unitario:
                venda = Decimal(obj.preco_venda_unitario)
                compra = Decimal(obj.preco_unitario)
                if compra != 0:
                    return float(((venda / compra) - Decimal("1")) * Decimal("100"))
        except Exception:
            pass
        return None

    def get_dias_posicionado(self, obj):
        try:
            if obj.data_compra:
                return (date.today() - obj.data_compra).days
        except Exception:
            pass
        return None

    def get_status(self, obj):
        try:
            # Encerrada
            if getattr(obj, "data_venda", None):
                return "encerrada"

            # Executada quando já temos legs vinculadas
            try:
                if OperacaoMT5Leg.objects.filter(operacao=obj).exists():
                    return "executada"
            except Exception:
                pass

            # Vínculo por request_id nos MT5Order (op:<id>)
            req_id = f"op:{obj.id}"
            ords = list(MT5Order.objects.filter(cliente=obj.cliente, request_id=req_id))
            if not ords:
                return "manual"  # operação criada manualmente (sem MT5)

            statuses = {str(getattr(o, "status", "")).lower() for o in ords}
            if statuses and statuses.issubset({"executada"}):
                return "executada"
            if "executada" in statuses or "parcial" in statuses:
                return "parcial"
            if "pendente" in statuses or "enviada" in statuses:
                return "pendente"
            if statuses and statuses.issubset({"rejeitada", "cancelada"}):
                return "falha"
        except Exception:
            pass
        return None

    # ---------- Entrada (garante NOT NULL no banco) ----------
    def _dec(self, value, field):
        if value is None:
            raise serializers.ValidationError({field: "Campo obrigatório."})
        try:
            return Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            raise serializers.ValidationError({field: "Valor inválido."})

    def _int(self, value, field):
        if value is None:
            raise serializers.ValidationError({field: "Campo obrigatório."})
        try:
            return int(value)
        except (TypeError, ValueError):
            raise serializers.ValidationError({field: "Valor inteiro inválido."})

    def create(self, validated_data):
        preco = self._dec(validated_data.get("preco_unitario"), "preco_unitario")
        qtd   = self._int(validated_data.get("quantidade"), "quantidade")

        # se os campos existem no modelo e são NOT NULL, preencha antes de salvar
        model_fields = {f.name for f in OperacaoCarteira._meta.get_fields()}
        if "valor_total_compra" in model_fields:
            validated_data["valor_total_compra"] = preco * Decimal(qtd)

        data_venda = validated_data.get("data_venda")
        pvu = validated_data.get("preco_venda_unitario")
        if data_venda and pvu is not None and "valor_total_venda" in model_fields:
            validated_data["valor_total_venda"] = self._dec(pvu, "preco_venda_unitario") * Decimal(qtd)

        return super().create(validated_data)

    def update(self, instance, validated_data):
        # atualiza campos básicos
        for f in ["cliente","acao","data_compra","data_venda","valor_alvo"]:
            if f in validated_data:
                setattr(instance, f, validated_data[f])

        if "preco_unitario" in validated_data:
            instance.preco_unitario = self._dec(validated_data["preco_unitario"], "preco_unitario")
        if "quantidade" in validated_data:
            instance.quantidade = self._int(validated_data["quantidade"], "quantidade")
        if "preco_venda_unitario" in validated_data:
            pvu = validated_data.get("preco_venda_unitario")
            instance.preco_venda_unitario = None if pvu in [None, ""] else self._dec(pvu, "preco_venda_unitario")

        # recalcula totais se existirem no modelo
        model_fields = {f.name for f in OperacaoCarteira._meta.get_fields()}
        try:
            if "valor_total_compra" in model_fields:
                instance.valor_total_compra = (
                    instance.preco_unitario * Decimal(instance.quantidade)
                    if instance.preco_unitario is not None and instance.quantidade is not None
                    else None
                )
            if "valor_total_venda" in model_fields:
                instance.valor_total_venda = (
                    instance.preco_venda_unitario * Decimal(instance.quantidade)
                    if instance.data_venda and instance.preco_venda_unitario is not None
                    else None
                )
        except Exception:
            pass

        instance.save()
        return instance


# serializers.py
class PatrimonioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patrimonio
        fields = "__all__"

class CustodiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Custodia
        fields = "__all__"



class RecomendacaoDiariaAtualNovaSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecomendacaoDiariaAtualNova
        fields = "__all__"
