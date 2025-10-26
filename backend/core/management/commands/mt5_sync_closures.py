from __future__ import annotations

import json
from decimal import Decimal
from datetime import datetime, time as dtime, timedelta
from typing import Dict, List, Any

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction

from core.models import Cliente, OperacaoCarteira, OperacaoMT5Leg, MT5Deal
from core.mt5_client import MT5Client


def _get_cliente_ip(cliente: Cliente) -> str | None:
    ip_publico = (cliente.vm_ip or "").strip()
    ip_privado = (cliente.vm_private_ip or "").strip()
    return ip_privado or ip_publico or None


def _epoch(dt: datetime) -> int:
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return int(dt.timestamp())


class Command(BaseCommand):
    help = "Sincroniza fechamentos (TP/vendas) das VMs MT5 e atualiza OperacaoCarteira quando 100% encerrada"

    def add_arguments(self, parser):
        parser.add_argument(
            "--cliente-id",
            type=int,
            default=None,
            help="Restringe a sincronização a um cliente específico (ID)",
        )
        parser.add_argument(
            "--since-days",
            type=int,
            default=30,
            help="Janela máxima em dias para buscar deals caso a data de compra não esteja disponível",
        )

    def handle(self, *args, **options):
        cliente_id = options.get("cliente_id")
        since_days = int(options.get("since_days") or 30)

        if cliente_id:
            clientes = Cliente.objects.filter(pk=cliente_id)
        else:
            clientes = Cliente.objects.all()

        now = timezone.now()
        total_ops = 0
        total_closed = 0

        for cliente in clientes:
            ip = _get_cliente_ip(cliente)
            if not ip:
                continue

            mt5 = MT5Client(ip)

            # mapa de posições abertas na VM por ticket (para saber se leg ainda existe)
            pos_map_by_ticket: Dict[int, dict] = {}
            pos_resp = mt5.posicoes()
            if pos_resp.ok and isinstance(pos_resp.data, list):
                for p in pos_resp.data:
                    try:
                        tkt = int(p.get("ticket"))
                    except Exception:
                        tkt = None
                    if tkt:
                        pos_map_by_ticket[tkt] = p

            # operações do cliente em aberto (criadas/gerenciadas pela plataforma)
            ops = OperacaoCarteira.objects.filter(cliente=cliente, data_venda__isnull=True)

            for op in ops:
                legs = list(OperacaoMT5Leg.objects.filter(operacao=op))
                if not legs:
                    # sem legs associadas, não temos como reconciliar via VM → ignora
                    continue

                total_ops += 1

                # janela de histórico
                start_dt = datetime.combine(op.data_compra, dtime.min) if getattr(op, "data_compra", None) else (now - timedelta(days=since_days))
                start_epoch = _epoch(start_dt)
                end_epoch = _epoch(now + timedelta(minutes=5))

                deals_resp = mt5.historico_deals(inicio=start_epoch, fim=end_epoch)
                if not deals_resp.ok or not isinstance(deals_resp.data, list):
                    # não conseguimos carregar deals agora; tentaremos no próximo ciclo
                    continue

                # Idempotência: upsert dos deals no nosso log MT5Deal
                for d in deals_resp.data:
                    try:
                        deal_ticket = int(d.get("ticket"))
                    except Exception:
                        deal_ticket = None
                    if not deal_ticket:
                        continue
                    defaults = {
                        "cliente": cliente,
                        "order_ticket": int(d.get("order") or 0) or None,
                        "position_ticket": int(d.get("position_id") or d.get("position") or 0) or None,
                        "symbol": d.get("symbol"),
                        "lado": "venda" if int(d.get("type", 0)) in (1, 3) else "compra",
                        "volume": Decimal(str(d.get("volume", 0) or 0)),
                        "price": Decimal(str(d.get("price", 0) or 0)),
                        "commission": Decimal(str(d.get("commission", 0) or 0)),
                        "swap": Decimal(str(d.get("swap", 0) or 0)),
                        "profit": Decimal(str(d.get("profit", 0) or 0)),
                        "time": timezone.make_aware(datetime.fromtimestamp(int(d.get("time")))),
                        "magic": int(d.get("magic", 0) or 0) or None,
                        "comment": d.get("comment"),
                        "raw_json": json.dumps(d),
                    }
                    MT5Deal.objects.get_or_create(deal_ticket=deal_ticket, defaults=defaults)

                # para fechamento consolidado precisamos que TODAS as legs tenham sido encerradas
                all_legs_closed = True
                for leg in legs:
                    if leg.position_ticket and int(leg.position_ticket) in pos_map_by_ticket:
                        all_legs_closed = False
                        break

                if not all_legs_closed:
                    continue

                # Coleta deals de saída (venda) por leg (via position_ticket se possível)
                all_sells: List[dict] = []
                for leg in legs:
                    pt = int(leg.position_ticket or 0)
                    for d in deals_resp.data:
                        pos_id = int(d.get("position_id") or d.get("position") or 0)
                        if pt and pos_id and pos_id != pt:
                            continue
                        if not pt:
                            # fallback por símbolo
                            if d.get("symbol") != leg.symbol:
                                continue
                        # selecionar somente saídas (entry OUT) quando disponível
                        entry = d.get("entry")
                        if entry is not None:
                            try:
                                if int(entry) != 1:  # DEAL_ENTRY_OUT
                                    continue
                            except Exception:
                                pass
                        else:
                            # fallback: considerar tipos de SELL (1,3) como saída (cenário long-only)
                            try:
                                if int(d.get("type", 0)) not in (1, 3):
                                    continue
                            except Exception:
                                continue
                        all_sells.append(d)

                if not all_sells:
                    # todas as legs parecem fechadas, mas não achamos deals de saída na janela; aguarda próximo ciclo
                    continue

                # VWAP e data de venda (último deal)
                sum_vol = Decimal("0")
                sum_px_vol = Decimal("0")
                last_time = None
                by_leg_tickets: Dict[int, List[int]] = {}
                for d in all_sells:
                    vol = Decimal(str(d.get("volume", 0) or 0))
                    px = Decimal(str(d.get("price", 0) or 0))
                    sum_vol += vol
                    sum_px_vol += (px * vol)
                    try:
                        ts = int(d.get("time"))
                        dt = timezone.make_aware(datetime.fromtimestamp(ts))
                        if (last_time is None) or (dt > last_time):
                            last_time = dt
                    except Exception:
                        pass
                    try:
                        tkt = int(d.get("ticket"))
                    except Exception:
                        tkt = None
                    try:
                        pos_id = int(d.get("position_id") or d.get("position") or 0)
                    except Exception:
                        pos_id = None
                    if tkt and pos_id:
                        by_leg_tickets.setdefault(pos_id, []).append(tkt)

                if sum_vol <= 0:
                    continue

                vwap = (sum_px_vol / sum_vol).quantize(Decimal("0.01"))
                venda_data = (last_time.date() if last_time else timezone.now().date())

                with transaction.atomic():
                    # Atualiza OperacaoCarteira (unmanaged, mas update funciona)
                    op.preco_venda_unitario = vwap
                    op.valor_total_venda = (vwap * Decimal(str(op.quantidade))).quantize(Decimal("0.01"))
                    op.data_venda = venda_data
                    op.save(update_fields=["preco_venda_unitario", "valor_total_venda", "data_venda"])

                    # Guarda tickets usados em cada leg (idempotência e auditoria)
                    for leg in legs:
                        tickets = by_leg_tickets.get(int(leg.position_ticket or 0), [])
                        if tickets:
                            leg.deal_tickets = json.dumps(tickets)
                            leg.save(update_fields=["deal_tickets"])

                total_closed += 1

        self.stdout.write(self.style.SUCCESS(
            f"Sincronização finalizada. Operações verificadas: {total_ops}. Encerradas agora: {total_closed}."
        ))

