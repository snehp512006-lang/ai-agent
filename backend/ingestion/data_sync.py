import pandas as pd
import re
from datetime import datetime, date
from django.db import transaction
from django.utils import timezone
from django.core.cache import cache
from inventory.models import Product, StockRecord, Recommendation, InventoryTransaction
from ai_engine.forecasting import ForecastEngine
import logging

logger = logging.getLogger(__name__)

_MONTH_NAME_MAP = {
    'jan': 1, 'january': 1,
    'feb': 2, 'february': 2,
    'mar': 3, 'march': 3,
    'apr': 4, 'april': 4,
    'may': 5,
    'jun': 6, 'june': 6,
    'jul': 7, 'july': 7,
    'aug': 8, 'august': 8,
    'sep': 9, 'sept': 9, 'september': 9,
    'oct': 10, 'october': 10,
    'nov': 11, 'november': 11,
    'dec': 12, 'december': 12
}


def _normalize_month_token(value):
    token = str(value).strip().lower()
    return re.sub(r'[^a-z0-9]', '', token)


def _coerce_month_series(series):
    if series is None:
        return None
    values = series.dropna()
    if values.empty:
        return None

    month_nums = []
    for val in values:
        token = _normalize_month_token(val)
        if token in _MONTH_NAME_MAP:
            month_nums.append(_MONTH_NAME_MAP[token])
            continue
        if token.isdigit():
            num = int(token)
            if 1 <= num <= 12:
                month_nums.append(num)
                continue
        return None

    if not month_nums:
        return None

    year = datetime.utcnow().year

    def to_dt(value):
        token = _normalize_month_token(value)
        month = None
        if token in _MONTH_NAME_MAP:
            month = _MONTH_NAME_MAP[token]
        elif token.isdigit():
            num = int(token)
            if 1 <= num <= 12:
                month = num
        if month:
            return datetime(year, month, 1)
        return pd.NaT

    return series.apply(to_dt)


def _infer_month_span_days(series):
    if series is None:
        return None
    values = series.dropna()
    if values.empty:
        return None

    month_nums = []
    for val in values:
        token = _normalize_month_token(val)
        if token in _MONTH_NAME_MAP:
            month_nums.append(_MONTH_NAME_MAP[token])
            continue
        if token.isdigit():
            num = int(token)
            if 1 <= num <= 12:
                month_nums.append(num)
                continue
        return None

    if not month_nums:
        return None

    return max(1, len(set(month_nums)) * 30)

class DataSyncService:
    @staticmethod
    def sync_to_db(parsed_rows, mapping=None):
        """
        Takes a list of analyzed row dictionaries (containing ai_status, ai_result, cleaned columns, etc.)
        and statically maps them to the Core Django Database models.
        """
        if not parsed_rows:
            logger.info("DataSyncService: No rows to sync.")
            return

        logger.info("DataSyncService: Starting DB sync for %s rows", len(parsed_rows))

        sync_key = "global_sync_in_progress"
        try:
            cache.set(sync_key, True, timeout=600)
            with transaction.atomic():
                # Step 1: Clear existing data for a fresh start so demo dashboards aren't cluttered eternally
                Product.objects.all().delete()
                # (Deleting products cascades to StockRecords and Recommendations due to FK relationships)
                
                # Step 2: Extract distinct products using mapping (or heuristics as fallback)
                df = pd.DataFrame(parsed_rows)

                col_map = {col.strip().lower().replace('_', ' '): col for col in df.columns}

                def get_col(*variants):
                    for v in variants:
                        if v in col_map:
                            return col_map[v]
                    return None

                product_col = (mapping or {}).get('product') or get_col('product name', 'product_name', 'item', 'product')
                sku_col = get_col('sku', 'product id', 'item id', 'product_id', 'code')
                date_col = (mapping or {}).get('date') or get_col('date', 'timestamp', 'period', 'order date')
                stock_col = (mapping or {}).get('stock') or get_col('stock', 'stock on hand', 'inventory', 'on hand', 'qty on hand')
                sales_col = (mapping or {}).get('sales') or get_col('units sold', 'sold qty', 'sales units', 'quantity sold', 'sales qty', 'units', 'sold', 'demand', 'sales', 'quantity', 'qty')
                revenue_col = (mapping or {}).get('revenue') or get_col('revenue', 'amount', 'total price', 'sales val')
                cat_col = (mapping or {}).get('category') or get_col('category', 'product category')
                opening_col = (mapping or {}).get('opening_stock') or get_col('opening stock', 'opening_stock', 'beginning stock', 'starting stock')
                purchased_col = (mapping or {}).get('purchased_stock') or get_col('purchased stock', 'purchased_stock', 'purchases', 'purchase qty', 'received qty')
                returns_col = (mapping or {}).get('returns') or get_col('returns', 'return qty', 'returned qty')
                adjustments_col = (mapping or {}).get('adjustments') or get_col('adjustment', 'adjustments', 'inventory adjustment')

                if not product_col:
                    logger.warning("DataSyncService: Could not identify a Product column. Sync aborted.")
                    return

                raw_date_series = None
                month_coerced = None
                if date_col:
                    raw_date_series = df[date_col].copy()
                    month_coerced = _coerce_month_series(raw_date_series)
                    if month_coerced is not None:
                        df[date_col] = month_coerced
                    else:
                        df[date_col] = pd.to_datetime(df[date_col], errors='coerce')

                for col in [stock_col, sales_col, revenue_col, opening_col, purchased_col, returns_col, adjustments_col]:
                    if col and col in df.columns:
                        df[col] = pd.to_numeric(df[col].astype(str).str.replace(r'[$,]', '', regex=True), errors='coerce').fillna(0)

                grouped = df.groupby(product_col, as_index=False)

                products_to_create = []
                product_meta = {}

                for name, group in grouped:
                    group = group.copy()
                    if date_col and date_col in group.columns:
                        group = group.sort_values(by=date_col)

                    sku_val = str(group[sku_col].dropna().iloc[0]) if sku_col and not group[sku_col].dropna().empty else None
                    slug_name = ''.join(e for e in str(name) if e.isalnum())[:20].upper()
                    base_sku = sku_val or slug_name
                    sku = f"{base_sku}-{len(products_to_create)}"[:100]

                    opening_val = group[opening_col].dropna().iloc[0] if opening_col and not group[opening_col].dropna().empty else 0
                    purchases = group[purchased_col].sum() if purchased_col else 0
                    sales = group[sales_col].sum() if sales_col else 0
                    returns = group[returns_col].sum() if returns_col else 0
                    adjustments = group[adjustments_col].sum() if adjustments_col else 0

                    if stock_col:
                        if date_col and date_col in group.columns and not group[date_col].isnull().all():
                            current_stock = group.sort_values(by=date_col)[stock_col].iloc[-1]
                        else:
                            current_stock = group[stock_col].iloc[-1]
                    elif any([opening_col, purchased_col, returns_col, adjustments_col, sales_col]):
                        current_stock = opening_val + purchases - sales + returns + adjustments
                    else:
                        current_stock = 0

                    create_transactions = bool(date_col and (sales_col or purchased_col or returns_col or adjustments_col))
                    opening_for_product = opening_val if create_transactions or opening_col else current_stock

                    products_to_create.append(Product(
                        sku=sku,
                        name=str(name)[:255],
                        category=str(group[cat_col].dropna().iloc[0])[:100] if cat_col and not group[cat_col].dropna().empty else "General",
                        opening_stock=max(0, int(round(opening_for_product)))
                    ))

                    product_meta[str(name)] = {
                        'current_stock': max(0, float(current_stock)),
                        'sales_total': float(sales),
                        'returns_total': float(returns),
                        'adjustments_total': float(adjustments),
                        'group': group
                    }

                Product.objects.bulk_create(products_to_create, batch_size=500)

                inserted_products = Product.objects.all()
                product_dict = {p.name: p for p in inserted_products}

                stock_records = []
                transactions = []

                def _coerce_tx_date(value):
                    if value is None:
                        return None
                    try:
                        if pd.isna(value):
                            return None
                    except Exception:
                        pass

                    if isinstance(value, pd.Timestamp):
                        value = value.to_pydatetime()

                    if isinstance(value, datetime):
                        if timezone.is_naive(value):
                            return timezone.make_aware(value, timezone.get_current_timezone())
                        return value

                    if isinstance(value, date):
                        dt = datetime.combine(value, datetime.min.time())
                        return timezone.make_aware(dt, timezone.get_current_timezone())

                    return None

                for name, meta in product_meta.items():
                    prod_obj = product_dict.get(name)
                    if not prod_obj:
                        continue

                    group = meta['group']
                    total_sales = meta['sales_total']

                    avg_daily_sales = 0
                    if sales_col and date_col and date_col in group.columns and not group[date_col].isnull().all():
                        if month_coerced is not None and raw_date_series is not None:
                            month_span = _infer_month_span_days(raw_date_series.loc[group.index])
                            if month_span:
                                days_range = month_span
                            else:
                                days_range = (group[date_col].max() - group[date_col].min()).days
                        else:
                            days_range = (group[date_col].max() - group[date_col].min()).days
                        days_range = max(1, days_range)
                        avg_daily_sales = abs(total_sales) / days_range

                    if avg_daily_sales > 0:
                        lead_time = 7
                        safety_stock = int(round(avg_daily_sales * 7))
                        reorder_point = int(round(avg_daily_sales * lead_time + safety_stock))
                        max_stock = int(round(avg_daily_sales * 90))
                        stock_records.append(StockRecord(
                            product=prod_obj,
                            reorder_point=max(1, reorder_point),
                            safety_stock=max(1, safety_stock),
                            max_stock=max(1, max_stock)
                        ))
                    else:
                        stock_records.append(StockRecord(product=prod_obj))

                    if date_col and date_col in group.columns and create_transactions:
                        for _, row in group.iterrows():
                            tx_date = _coerce_tx_date(row[date_col])
                            if not tx_date:
                                continue
                            sales_qty = row.get(sales_col, 0)
                            if sales_qty:
                                transactions.append(InventoryTransaction(
                                    product=prod_obj,
                                    transaction_type='SALE',
                                    quantity=-abs(int(round(sales_qty))),
                                    amount=row.get(revenue_col, 0) if revenue_col else 0,
                                    transaction_date=tx_date
                                ))
                            purchase_qty = row.get(purchased_col, 0) if purchased_col else 0
                            if purchase_qty:
                                transactions.append(InventoryTransaction(
                                    product=prod_obj,
                                    transaction_type='PURCHASE',
                                    quantity=int(round(purchase_qty)),
                                    amount=0,
                                    transaction_date=tx_date
                                ))
                            return_qty = row.get(returns_col, 0) if returns_col else 0
                            if return_qty:
                                transactions.append(InventoryTransaction(
                                    product=prod_obj,
                                    transaction_type='RETURN',
                                    quantity=int(round(return_qty)),
                                    amount=0,
                                    transaction_date=tx_date
                                ))
                            adjustment_qty = row.get(adjustments_col, 0) if adjustments_col else 0
                            if adjustment_qty:
                                transactions.append(InventoryTransaction(
                                    product=prod_obj,
                                    transaction_type='ADJUSTMENT',
                                    quantity=int(round(adjustment_qty)),
                                    amount=0,
                                    transaction_date=tx_date
                                ))

                StockRecord.objects.bulk_create(stock_records, batch_size=500)
                if transactions:
                    InventoryTransaction.objects.bulk_create(transactions, batch_size=1000)

                # Trigger deterministic forecasts using real transaction data
                for prod in inserted_products:
                    ForecastEngine.forecast_product(prod, weeks=8)

                # Step 5: Gather AI Insights / Recommendations
                recs_to_create = []
                anomaly_rows = [r for r in parsed_rows if "Anomaly" in str(r.get('ai_result', ''))]
                
                for r in anomaly_rows[:10]:
                    title = f"Review Anomaly: {r.get(product_col, 'Unknown Item')}"
                    recs_to_create.append(Recommendation(
                        title=title[:255],
                        action=Recommendation.Action.PRODUCE,
                        confidence_score=0.92,
                        explanation=f"AI pipeline flagged anomaly: {r.get('ai_result', '')}. Prediction context: {r.get('prediction', '')}"
                    ))
                
                if recs_to_create:
                    Recommendation.objects.bulk_create(recs_to_create)

                logger.info("DataSyncService: Sync complete successfully.")
                
        except Exception as e:
            logger.exception(f"DataSyncService: Fatal Error during db mapping: {e}")
        finally:
            cache.delete(sync_key)
