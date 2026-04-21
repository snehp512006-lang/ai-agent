from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import InventoryTransaction, Product, StockAlert, StockRecord


@dataclass(frozen=True)
class StockAlertSnapshot:
    sku: str
    name: str
    category: str
    on_hand: int
    reorder: int
    max_stock: int
    risk: str
    days_to_stock: int | None


class StockAlertService:
    """Builds and persists stock-alert rows that mirror frontend table fields."""

    LOOKBACK_DAYS = 30

    @staticmethod
    def _to_int(value, default=0):
        try:
            if value is None:
                return default
            if isinstance(value, str):
                cleaned = value.replace(',', '').strip()
                if not cleaned:
                    return default
                return int(float(cleaned))
            return int(float(value))
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _normalize_risk(value: str) -> str:
        raw = str(value or '').upper().replace('-', '_').replace(' ', '_')
        if 'OUT' in raw and 'STOCK' in raw:
            return StockAlert.Risk.OUT_OF_STOCK
        if 'LOW' in raw and 'STOCK' in raw:
            return StockAlert.Risk.LOW_STOCK
        if 'DEAD' in raw:
            return StockAlert.Risk.DEADSTOCK
        if 'OVER' in raw and 'STOCK' in raw:
            return StockAlert.Risk.OVERSTOCK
        return StockAlert.Risk.HEALTHY

    @classmethod
    def _sales_velocity_map(cls) -> Dict[int, float]:
        cutoff = timezone.now() - timezone.timedelta(days=cls.LOOKBACK_DAYS)
        rows = (
            InventoryTransaction.objects.filter(
                transaction_type='SALE',
                transaction_date__gte=cutoff,
            )
            .values('product_id')
            .annotate(total=Sum('quantity'))
        )
        result: Dict[int, float] = {}
        for row in rows:
            pid = row['product_id']
            sold_units = abs(float(row['total'] or 0))
            result[pid] = sold_units / cls.LOOKBACK_DAYS if cls.LOOKBACK_DAYS else 0.0
        return result

    @staticmethod
    def _classify(on_hand: int, reorder: int, max_stock: int, daily_sales: float) -> str:
        if on_hand <= 0:
            return StockAlert.Risk.OUT_OF_STOCK
        if daily_sales <= 0:
            return StockAlert.Risk.DEADSTOCK

        low_threshold = max(reorder, int(daily_sales * 7))
        if on_hand < low_threshold:
            return StockAlert.Risk.LOW_STOCK

        over_threshold = max(max_stock, int(daily_sales * 30)) if max_stock > 0 else int(daily_sales * 30)
        if over_threshold > 0 and on_hand > over_threshold:
            return StockAlert.Risk.OVERSTOCK

        return StockAlert.Risk.HEALTHY

    @staticmethod
    def _days_to_stockout(on_hand: int, daily_sales: float) -> int | None:
        if on_hand <= 0:
            return 0
        if daily_sales <= 0:
            return 999
        return int(on_hand / daily_sales)

    @classmethod
    def build_snapshot(cls, product: Product, stock: StockRecord | None, daily_sales: float) -> StockAlertSnapshot:
        on_hand = int(product.current_closing_stock)
        reorder = int(getattr(stock, 'reorder_point', 0) or 0)
        max_stock = int(getattr(stock, 'max_stock', 0) or 0)
        risk = cls._classify(on_hand, reorder, max_stock, daily_sales)
        days_to_stock = cls._days_to_stockout(on_hand, daily_sales)
        return StockAlertSnapshot(
            sku=product.sku,
            name=product.name,
            category=product.category or 'General',
            on_hand=on_hand,
            reorder=reorder,
            max_stock=max_stock,
            risk=risk,
            days_to_stock=days_to_stock,
        )

    @classmethod
    @transaction.atomic
    def refresh_alerts(cls) -> list[StockAlert]:
        sales_velocity = cls._sales_velocity_map()
        products = Product.objects.select_related('stock').all()
        seen_skus = set()

        for product in products:
            stock = getattr(product, 'stock', None)
            daily_sales = float(sales_velocity.get(product.id, 0.0))
            snap = cls.build_snapshot(product, stock, daily_sales)
            StockAlert.objects.update_or_create(
                sku=snap.sku,
                run=None,
                defaults={
                    'product': product,
                    'uploaded_sheet_name': '',
                    'name': snap.name,
                    'category': snap.category,
                    'on_hand': snap.on_hand,
                    'reorder': snap.reorder,
                    'max': snap.max_stock,
                    'risk': snap.risk,
                    'days_to_stock': snap.days_to_stock,
                    'meta': {'daily_sales': round(daily_sales, 4)},
                },
            )
            seen_skus.add(snap.sku)

        if seen_skus:
            StockAlert.objects.filter(
                run__isnull=True,
            ).exclude(sku__in=seen_skus).delete()
        else:
            StockAlert.objects.filter(
                run__isnull=True,
            ).delete()

        return list(
            StockAlert.objects.filter(
                run__isnull=True,
            )
        )

    @classmethod
    @transaction.atomic
    def persist_analysis_alerts(cls, run_obj, analysis: dict | None) -> list[StockAlert]:
        if not run_obj or not isinstance(analysis, dict):
            return []

        rows = analysis.get('products_analysis') or analysis.get('products') or []
        if not isinstance(rows, list):
            rows = []

        # Replace this run's previous snapshot rows; keep all other run histories.
        StockAlert.objects.filter(
            run=run_obj,
        ).delete()

        upserts: dict[str, StockAlert] = {}
        for idx, row in enumerate(rows):
            if not isinstance(row, dict):
                continue
            sku = str(
                row.get('sku')
                or row.get('product_sku')
                or row.get('item_code')
                or row.get('product_name')
                or row.get('name')
                or f"RUN-{run_obj.id}-{idx + 1}"
            ).strip()
            if not sku:
                continue

            risk_value = (
                row.get('risk')
                or row.get('stock_risk')
                or row.get('prediction')
                or row.get('inventory_status')
            )

            upserts[sku] = StockAlert(
                run=run_obj,
                uploaded_sheet_name=getattr(run_obj, 'uploaded_sheet_name', '') or '',
                sku=sku,
                name=str(row.get('name') or row.get('product_name') or sku).strip(),
                category=str(row.get('category') or row.get('classification') or '').strip(),
                on_hand=cls._to_int(row.get('on_hand', row.get('current_stock', row.get('stock', 0))), 0),
                reorder=cls._to_int(row.get('reorder', row.get('reorder_point', 0)), 0),
                max=cls._to_int(row.get('max', row.get('max_stock', 0)), 0),
                risk=cls._normalize_risk(risk_value),
                days_to_stock=cls._to_int(
                    row.get('days_to_stock', row.get('days_to_stockout', row.get('days_of_inventory'))),
                    None,
                ),
                meta={
                    'analysis_source': 'analysis_snapshot',
                    'confidence_score': row.get('confidence_score'),
                },
            )

        if upserts:
            StockAlert.objects.bulk_create(list(upserts.values()), batch_size=500)

        return list(
            StockAlert.objects.filter(
                run=run_obj,
            ).order_by('risk', 'name')
        )

    @classmethod
    def summarize(cls, alerts: Iterable[StockAlert]) -> dict:
        summary = {
            'out_of_stock': 0,
            'low_stock': 0,
            'deadstock': 0,
            'overstock': 0,
            'healthy': 0,
        }
        for item in alerts:
            if item.risk == StockAlert.Risk.OUT_OF_STOCK:
                summary['out_of_stock'] += 1
            elif item.risk == StockAlert.Risk.LOW_STOCK:
                summary['low_stock'] += 1
            elif item.risk == StockAlert.Risk.DEADSTOCK:
                summary['deadstock'] += 1
            elif item.risk == StockAlert.Risk.OVERSTOCK:
                summary['overstock'] += 1
            elif item.risk == StockAlert.Risk.HEALTHY:
                summary['healthy'] += 1
        return summary
