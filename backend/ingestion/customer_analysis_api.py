from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q
from django.core.cache import cache
from django.db import InternalError, OperationalError
from datetime import datetime

from .models import DataCleanerRun, DataCleanerRunPayload


UPLOAD_SCAN_LIMIT = 60
CUSTOMER_ANALYSIS_CACHE_TTL = 600


def _to_num(value, fallback=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(fallback)


def _normalize_text(value):
    return str(value or '').strip()


def _normalize_key(value):
    return _normalize_text(value).lower().replace('_', '').replace('-', '').replace(' ', '')


def _compact_identity(value):
    raw = _normalize_text(value)
    if not raw:
        return ''
    # Drop parenthetical suffixes like "Name (Name2026...)" for stable matching.
    raw = raw.split('(')[0].strip()
    return _normalize_key(raw)


def _identity_match(left, right):
    l = _compact_identity(left)
    r = _compact_identity(right)
    if not l or not r:
        return False
    if l == r:
        return True
    # Allow containment for same customer represented with appended metadata IDs.
    if len(l) >= 5 and l in r:
        return True
    if len(r) >= 5 and r in l:
        return True
    return False


def _to_datetime(value):
    raw = _normalize_text(value)
    if not raw:
        return None
    for fmt in ('%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%d-%m-%Y', '%d/%m/%Y', '%Y/%m/%d', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(raw[:19], fmt)
        except ValueError:
            continue
    return None


def _is_sale_like(value):
    raw = _normalize_text(value).upper()
    if not raw:
        return True
    tokens = {"SALE", "SALES", "OUT", "ISSUE", "DISPATCH", "DELIVERY", "SOLD"}
    negative_tokens = {"PURCHASE", "IN", "RETURN", "RECEIPT", "RESTOCK"}
    if any(tok in raw for tok in tokens):
        return True
    if any(tok in raw for tok in negative_tokens):
        return False
    return True


def _is_stock_in_like(value):
    raw = _normalize_text(value).upper()
    if not raw:
        return True

    positive_tokens = {
        "PURCHASE", "PURCHASES", "IN", "INWARD", "RECEIPT", "RESTOCK", "STOCKIN", "STOCK IN"
    }
    negative_tokens = {
        "SALE", "SALES", "OUT", "ISSUE", "DISPATCH", "DELIVERY", "SOLD"
    }

    if any(tok in raw for tok in positive_tokens):
        return True
    if any(tok in raw for tok in negative_tokens):
        return False

    # Unknown movement label: keep it instead of dropping potential stock-in data.
    return True


def _pick_first(row, aliases):
    if not isinstance(row, dict):
        return None
    normalized = {_normalize_key(k): v for k, v in row.items()}
    for alias in aliases:
        hit = normalized.get(_normalize_key(alias))
        if hit is not None and _normalize_text(hit) != '':
            return hit
    return None


def _same_product(left, right):
    l = _normalize_key(left)
    r = _normalize_key(right)
    if not l or not r:
        return False
    return l == r


def _derive_buyers_from_analysis_products(products, product_name, product_sku):
    candidates = [_normalize_text(product_name), _normalize_text(product_sku)]
    out = []
    synthetic_tokens = {
        'SYNTHETIC_AGGREGATE',
        'MARKET-AGGREGATE',
        'MARKET AGGREGATE',
        'STANDARD MARKET VOLUME',
    }
    for product in products or []:
        row_keys = [
            _normalize_text(product.get('name')),
            _normalize_text(product.get('sku')),
            _normalize_text(product.get('product')),
            _normalize_text(product.get('product_name')),
        ]
        if not any(_same_product(c, r) for c in candidates if c for r in row_keys if r):
            continue

        top_customers = product.get('top_customers') if isinstance(product, dict) else None
        if not isinstance(top_customers, list):
            continue

        for i, cust in enumerate(top_customers):
            if not isinstance(cust, dict):
                continue
            cid = _normalize_text(cust.get('base_customer_id') or cust.get('customer_id') or '')
            name = _normalize_text(cust.get('name') or cust.get('company') or cust.get('base_customer_id') or cust.get('customer_id'))
            if not name:
                continue
            if _normalize_text(name).upper() in synthetic_tokens:
                continue
            if _normalize_text(cid).upper() in synthetic_tokens:
                continue
            qty_val = round(_to_num(cust.get('total_purchased', cust.get('total_purchase', 0.0))), 2)
            if qty_val <= 0:
                continue
            out.append({
                'customer_id': cid or f'CUST-{i + 1}',
                'name': name,
                'company': _normalize_text(cust.get('company') or name),
                'total_purchased': qty_val,
                'last_order': _normalize_text(cust.get('last_order') or cust.get('last_order_date')) or None,
                'next_expected': _normalize_text(cust.get('next_expected')) or None,
                'risk_level': _normalize_text(cust.get('risk_level')) or 'Low',
                'trend_tag': _normalize_text(cust.get('trend_tag')) or 'Stable',
            })

    dedup = {}
    for row in out:
        key = _normalize_key(row.get('customer_id') or row.get('name'))
        if not key:
            continue
        prev = dedup.get(key)
        if not prev:
            dedup[key] = row
            continue

        prev_qty = _to_num(prev.get('total_purchased', 0.0), 0.0)
        row_qty = _to_num(row.get('total_purchased', 0.0), 0.0)
        prev_dt = _to_datetime(prev.get('last_order'))
        row_dt = _to_datetime(row.get('last_order'))

        prev['total_purchased'] = round(prev_qty + row_qty, 2)
        if row_dt and (not prev_dt or row_dt > prev_dt):
            prev['last_order'] = row.get('last_order')
            prev['next_expected'] = row.get('next_expected')
        dedup[key] = prev
    return sorted(dedup.values(), key=lambda x: x.get('total_purchased', 0), reverse=True)[:12]


def _extract_buyers_from_raw_rows(rows, product_name, product_sku):
    if not isinstance(rows, list) or not rows:
        return []

    product_aliases = ['product', 'product_name', 'item', 'item_name', 'sku', 'code', 'product_code']
    customer_name_aliases = ['party_name', 'customer_name', 'customer', 'client_name', 'buyer_name', 'name']
    customer_id_aliases = ['customer_id', 'party_id', 'party_code', 'customer_code', 'account_id']
    qty_aliases = [
        'quantity', 'qty', 'units', 'unit', 'sale_qty', 'sales_qty', 'sold_qty',
        'order_qty', 'ordered_qty', 'purchased_qty', 'quantity_sold'
    ]
    fallback_qty_aliases = ['total_units', 'units_total', 'total_qty']
    date_aliases = ['date', 'order_date', 'sales_date', 'transaction_date', 'month']
    delivery_date_aliases = ['delivery_date', 'delivered_date', 'delivery', 'dispatch_date', 'dispatched_date', 'ship_date']

    candidates = [_normalize_text(product_name), _normalize_text(product_sku)]
    buyers = {}

    for row in rows:
        if not isinstance(row, dict):
            continue

        # If ingestion tags are present, trust only transaction rows for buyer truth.
        row_sheet_type = _normalize_text(row.get('_sheet_type')).upper()
        if row_sheet_type and row_sheet_type != 'TRANSACTION':
            continue

        # Include only sale/outward flows when transaction type is available.
        tx_val = _pick_first(row, ['type', 'transaction_type', 'txn_type', 'movement', 'in_out'])
        tx_upper = _normalize_text(tx_val).upper()
        is_explicit_in = tx_upper in ['IN', 'I']
        is_explicit_out = tx_upper in ['OUT', 'O']

        if tx_val is not None:
            if not is_explicit_in and not is_explicit_out and not _is_sale_like(tx_val):
                continue

        row_product = _pick_first(row, product_aliases)
        if not row_product:
            continue
        if not any(_same_product(c, row_product) for c in candidates if c):
            continue

        name = _normalize_text(_pick_first(row, customer_name_aliases))
        cid = _normalize_text(_pick_first(row, customer_id_aliases))
        if not name and not cid:
            continue
        qty_val = _pick_first(row, qty_aliases)
        if qty_val is None:
            qty_val = _pick_first(row, fallback_qty_aliases)
        qty = abs(_to_num(qty_val, 0.0))
        if qty <= 0:
            continue
        dt = _to_datetime(_pick_first(row, date_aliases))
        delivery_dt = _to_datetime(_pick_first(row, delivery_date_aliases))

        if is_explicit_in:
            delivery_dt = None
        if is_explicit_out and not delivery_dt:
            delivery_dt = dt

        key = _normalize_key(cid or name)
        if not key:
            continue
        if key not in buyers:
            buyers[key] = {
                'customer_id': cid or name,
                'name': name or cid,
                'company': name or cid,
                'total_purchased': 0.0,
                'last_order_dt': None,
                'latest_delivery_dt': None,
                'order_events': []
            }

        qty = round(abs(_to_num(qty_val, 0.0)), 2)
        if qty <= 0:
            continue
            
        buyers[key]['total_purchased'] += qty
        
        if dt or delivery_dt:
            buyers[key]['order_events'].append({
                'order_date': dt.strftime('%Y-%m-%d') if dt else None,
                'delivery_date': delivery_dt.strftime('%Y-%m-%d') if delivery_dt else None,
                'units': qty
            })
            
        if dt and (buyers[key]['last_order_dt'] is None or dt > buyers[key]['last_order_dt']):
            buyers[key]['last_order_dt'] = dt
            
        if delivery_dt and (buyers[key]['latest_delivery_dt'] is None or delivery_dt > buyers[key]['latest_delivery_dt']):
            buyers[key]['latest_delivery_dt'] = delivery_dt

    out = []
    for _, v in buyers.items():
        v['order_events'].sort(key=lambda e: e.get('order_date') or e.get('delivery_date') or '', reverse=True)
        
        out.append({
            'customer_id': v['customer_id'],
            'name': v['name'],
            'company': v['company'],
            'total_purchased': round(v['total_purchased'], 2),
            'last_order': v['last_order_dt'].strftime('%Y-%m-%d') if v['last_order_dt'] else None,
            'next_expected': v['latest_delivery_dt'].strftime('%Y-%m-%d') if v['latest_delivery_dt'] else None,
            'risk_level': 'Low',
            'trend_tag': 'Derived From Raw Data',
            'order_events': v['order_events']
        })

    return sorted(out, key=lambda x: x.get('total_purchased', 0), reverse=True)[:12]


def _normalize_product_rows(rows):
    out = []
    for row in rows or []:
        status = str(row.get('status') or row.get('intensity_level') or 'STABLE').upper()
        prev_qty = _to_num(row.get('previous_month', row.get('prev_qty', 0.0)), 0.0)
        curr_qty = _to_num(row.get('current_month', row.get('current_qty', 0.0)), 0.0)
        change = ((curr_qty - prev_qty) / prev_qty * 100.0) if prev_qty > 0 else (100.0 if curr_qty > 0 else 0.0)

        trend = str(row.get('trend') or '').lower()
        if trend not in {'up', 'down', 'flat'}:
            if status == 'NOT_PURCHASED' or curr_qty < prev_qty:
                trend = 'down'
            elif curr_qty > prev_qty:
                trend = 'up'
            else:
                trend = 'flat'

        out.append(
            {
                'product_name': row.get('product_name') or row.get('name') or row.get('product') or 'Product',
                'status': status,
                'previous_month': round(prev_qty, 2),
                'current_month': round(curr_qty, 2),
                'change': round(change, 1),
                'trend': trend,
            }
        )
    return out


def _has_usable_analysis(payload):
    if not payload:
        return False
    analysis = payload.analysis_snapshot if hasattr(payload, 'analysis_snapshot') else None
    if isinstance(analysis, dict) and len(analysis.keys()) > 0:
        return True
    raw_rows = payload.raw_data if hasattr(payload, 'raw_data') else None
    if isinstance(raw_rows, list) and len(raw_rows) > 0:
        return True
    return False


def _parse_positive_int(value, default, minimum=1, maximum=250):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    if parsed < minimum:
        return minimum
    if parsed > maximum:
        return maximum
    return parsed


def _recent_upload_ids_for_user(user, limit=UPLOAD_SCAN_LIMIT):
    own_ids = list(
        DataCleanerRun.objects.filter(uploaded_by=user)
        .order_by('-id')
        .values_list('id', flat=True)[:limit]
    )
    if len(own_ids) >= limit:
        return own_ids

    legacy_ids = list(
        DataCleanerRun.objects.filter(uploaded_by__isnull=True)
        .order_by('-id')
        .values_list('id', flat=True)[: max(0, limit - len(own_ids))]
    )
    merged = own_ids + [rid for rid in legacy_ids if rid not in set(own_ids)]
    merged.sort(reverse=True)
    return merged[:limit]


def _select_best_upload_for_user(user, upload_id=None):
    if upload_id:
        exact = (
            DataCleanerRun.objects.filter(id=upload_id)
            .filter(Q(uploaded_by=user) | Q(uploaded_by__isnull=True))
            .select_related('payload')
            .first()
        )
        if exact and getattr(exact, 'payload', None) and _has_usable_analysis(exact.payload):
            return exact

    run_ids = _recent_upload_ids_for_user(user, limit=UPLOAD_SCAN_LIMIT)
    if not run_ids:
        return None

    payload_rows = list(
        DataCleanerRunPayload.objects.filter(run_id__in=run_ids)
        .values('run_id', 'processed_rows')
    )
    processed_map = {row['run_id']: int(row.get('processed_rows') or 0) for row in payload_rows}

    candidate_id = None
    for run_id in run_ids:
        if processed_map.get(run_id, 0) > 0:
            candidate_id = run_id
            break
    if candidate_id is None:
        candidate_id = run_ids[0]

    return (
        DataCleanerRun.objects.filter(id=candidate_id)
        .select_related('payload')
        .first()
    )


def _derive_rows_from_products(products, target_id, target_name):
    rows = []
    for product in products or []:
        top_customers = product.get('top_customers') if isinstance(product, dict) else None
        if not isinstance(top_customers, list):
            continue

        matched = None
        for c in top_customers:
            cid = str(c.get('customer_id') or '').strip().upper()
            cname = str(c.get('name') or c.get('company') or '').strip().upper()
            if (target_id and cid == target_id) or (target_name and (cname == target_name or cid == target_name)):
                matched = c
                break

        if not matched:
            continue

        trend_tag = str(matched.get('trend_tag') or '').upper()
        risk_tag = str(matched.get('risk_level') or '').upper()
        status = 'STABLE'
        if 'DROP' in trend_tag or 'HIGH' in risk_tag:
            status = 'MAJOR_DROP'
        elif 'MIXED' in trend_tag or 'MEDIUM' in risk_tag:
            status = 'MINOR_DROP'
        elif 'UP' in trend_tag:
            status = 'GROWING'

        prev_qty = _to_num(
            matched.get('previous_month')
            or matched.get('prev_month_qty')
            or matched.get('previous_qty')
            or matched.get('last_month_qty')
            or 0.0,
            0.0,
        )
        curr_qty = _to_num(
            matched.get('current_month')
            or matched.get('current_month_qty')
            or matched.get('this_month_qty')
            or matched.get('total_purchased')
            or matched.get('total_purchase')
            or 0.0,
            0.0,
        )
        change = ((curr_qty - prev_qty) / prev_qty * 100.0) if prev_qty > 0 else (100.0 if curr_qty > 0 else 0.0)
        rows.append(
            {
                'product_name': product.get('name') or product.get('product') or product.get('sku') or 'Product',
                'status': status,
                'previous_month': round(prev_qty, 2),
                'current_month': round(curr_qty, 2),
                'change': round(change, 1),
                'trend': 'up' if status == 'GROWING' else ('down' if status in {'MAJOR_DROP', 'MINOR_DROP', 'NOT_PURCHASED'} else 'flat'),
            }
        )

    return rows


def _month_key_from_value(value):
    raw = _normalize_text(value)
    if not raw:
        return None
    if len(raw) >= 7 and raw[4] == '-':
        return raw[:7]
    dt = _to_datetime(raw)
    if dt:
        return dt.strftime('%Y-%m')
    return None


def _extract_stock_in_from_monthly_breakdown(monthly_breakdown):
    if not isinstance(monthly_breakdown, list):
        return []

    out = []
    for row in monthly_breakdown:
        if not isinstance(row, dict):
            continue
        month = _month_key_from_value(row.get('month'))
        if not month:
            continue
        units = _to_num(row.get('units', row.get('amount', 0.0)), 0.0)
        if units <= 0:
            continue
        out.append({
            'month': month,
            'stock_in_units': round(units, 2),
            'transaction_count': 0,
            'active_days': 0,
            'top_product': '-',
            'product_count': 0,
        })

    out.sort(key=lambda x: x.get('month', ''))
    return out


def _extract_customer_stock_in_from_raw_rows(rows, target_id, target_name):
    if not isinstance(rows, list) or not rows:
        return {'monthly_stock_in': [], 'stock_in_by_date': []}

    customer_name_aliases = ['party_name', 'customer_name', 'customer', 'client_name', 'buyer_name', 'name']
    customer_id_aliases = ['customer_id', 'party_id', 'party_code', 'customer_code', 'account_id']
    qty_aliases = [
        'quantity', 'qty', 'units', 'unit', 'sale_qty', 'sales_qty', 'sold_qty',
        'order_qty', 'ordered_qty', 'purchased_qty', 'quantity_sold'
    ]
    fallback_qty_aliases = ['total_units', 'units_total', 'total_qty']
    date_aliases = ['date', 'order_date', 'sales_date', 'transaction_date', 'month']
    product_aliases = ['product', 'product_name', 'item', 'item_name', 'sku', 'code', 'product_code']

    target_id_key = _compact_identity(target_id)
    target_name_key = _compact_identity(target_name)
    by_date = {}
    by_month = {}

    for row in rows:
        if not isinstance(row, dict):
            continue

        tx_type = _pick_first(row, ['type', 'transaction_type', 'txn_type', 'movement', 'in_out'])
        if tx_type is not None and not (_is_sale_like(tx_type) or _is_stock_in_like(tx_type)):
            continue

        cid = _normalize_text(_pick_first(row, customer_id_aliases))
        cname = _normalize_text(_pick_first(row, customer_name_aliases))
        cid_key = _compact_identity(cid)
        cname_key = _compact_identity(cname)

        is_match = False
        if target_id_key and (cid_key and _identity_match(target_id_key, cid_key)):
            is_match = True
        elif target_name_key and (
            (cname_key and _identity_match(target_name_key, cname_key))
            or (cid_key and _identity_match(target_name_key, cid_key))
        ):
            is_match = True

        if not is_match:
            continue

        qty_val = _pick_first(row, qty_aliases)
        if qty_val is None:
            qty_val = _pick_first(row, fallback_qty_aliases)
        qty = _to_num(qty_val, 0.0)
        if qty <= 0:
            continue

        product_name = _normalize_text(_pick_first(row, product_aliases)) or '-'

        raw_date = _pick_first(row, date_aliases)
        dt = _to_datetime(raw_date)
        date_key = dt.strftime('%Y-%m-%d') if dt else _normalize_text(raw_date)
        month_key = dt.strftime('%Y-%m') if dt else _month_key_from_value(raw_date)

        if date_key:
            slot = by_date.setdefault(date_key, {'stock_in_units': 0.0, 'transaction_count': 0, 'products': {}})
            slot['stock_in_units'] += qty
            slot['transaction_count'] += 1
            slot['products'][product_name] = slot['products'].get(product_name, 0.0) + qty
        if month_key:
            mslot = by_month.setdefault(month_key, {'stock_in_units': 0.0, 'transaction_count': 0, 'products': {}})
            mslot['stock_in_units'] += qty
            mslot['transaction_count'] += 1
            mslot['products'][product_name] = mslot['products'].get(product_name, 0.0) + qty

    monthly_rows = [
        {
            'month': m,
            'stock_in_units': round(v['stock_in_units'], 2),
            'transaction_count': int(v['transaction_count']),
            'active_days': 0,
            'top_product': max(v['products'].items(), key=lambda x: x[1])[0] if v.get('products') else '-',
            'product_count': len(v.get('products', {})),
        }
        for m, v in by_month.items()
    ]
    monthly_rows.sort(key=lambda x: x.get('month', ''))

    date_rows = [
        {
            'date': d,
            'stock_in_units': round(v['stock_in_units'], 2),
            'transaction_count': int(v['transaction_count']),
            'top_product': max(v['products'].items(), key=lambda x: x[1])[0] if v.get('products') else '-',
            'product_count': len(v.get('products', {})),
        }
        for d, v in by_date.items()
    ]
    date_rows.sort(key=lambda x: x.get('date', ''))

    return {'monthly_stock_in': monthly_rows, 'stock_in_by_date': date_rows}


def _extract_customer_stock_in_from_products(products, target_id, target_name):
    if not isinstance(products, list) or not products:
        return {'monthly_stock_in': [], 'stock_in_by_date': []}

    by_date = {}
    by_month = {}

    for product in products:
        top_customers = product.get('top_customers') if isinstance(product, dict) else None
        if not isinstance(top_customers, list):
            continue

        for cust in top_customers:
            if not isinstance(cust, dict):
                continue
            cid = cust.get('customer_id') or cust.get('base_customer_id')
            cname = cust.get('name') or cust.get('company') or cid

            is_match = False
            if target_id and (_identity_match(target_id, cid) or _identity_match(target_id, cname)):
                is_match = True
            elif target_name and (_identity_match(target_name, cname) or _identity_match(target_name, cid)):
                is_match = True

            if not is_match:
                continue

            qty = _to_num(cust.get('total_purchased', cust.get('total_purchase', 0.0)), 0.0)
            if qty <= 0:
                continue

            product_name = _normalize_text(product.get('name') or product.get('product') or product.get('sku')) or '-'

            last_order = _normalize_text(cust.get('last_order') or cust.get('last_order_date'))
            dt = _to_datetime(last_order)
            if not dt:
                continue

            date_key = dt.strftime('%Y-%m-%d')
            month_key = dt.strftime('%Y-%m')

            slot = by_date.setdefault(date_key, {'stock_in_units': 0.0, 'transaction_count': 0, 'products': {}})
            slot['stock_in_units'] += qty
            slot['transaction_count'] += 1
            slot['products'][product_name] = slot['products'].get(product_name, 0.0) + qty

            mslot = by_month.setdefault(month_key, {'stock_in_units': 0.0, 'transaction_count': 0, 'products': {}})
            mslot['stock_in_units'] += qty
            mslot['transaction_count'] += 1
            mslot['products'][product_name] = mslot['products'].get(product_name, 0.0) + qty

    monthly_rows = [
        {
            'month': m,
            'stock_in_units': round(v['stock_in_units'], 2),
            'transaction_count': int(v['transaction_count']),
            'active_days': 0,
            'top_product': max(v['products'].items(), key=lambda x: x[1])[0] if v.get('products') else '-',
            'product_count': len(v.get('products', {})),
        }
        for m, v in by_month.items()
    ]
    monthly_rows.sort(key=lambda x: x.get('month', ''))

    date_rows = [
        {
            'date': d,
            'stock_in_units': round(v['stock_in_units'], 2),
            'transaction_count': int(v['transaction_count']),
            'top_product': max(v['products'].items(), key=lambda x: x[1])[0] if v.get('products') else '-',
            'product_count': len(v.get('products', {})),
        }
        for d, v in by_date.items()
    ]
    date_rows.sort(key=lambda x: x.get('date', ''))

    return {'monthly_stock_in': monthly_rows, 'stock_in_by_date': date_rows}


def _build_customer_stock_in_analysis(matched_customer, raw_rows, products, target_id, target_name):
    monthly_from_customer = _extract_stock_in_from_monthly_breakdown(
        matched_customer.get('monthly_breakdown') if isinstance(matched_customer, dict) else []
    )
    raw_stock = _extract_customer_stock_in_from_raw_rows(raw_rows, target_id, target_name)
    monthly_from_raw = raw_stock.get('monthly_stock_in', [])
    by_date_from_raw = raw_stock.get('stock_in_by_date', [])

    products_stock = _extract_customer_stock_in_from_products(products, target_id, target_name)
    monthly_from_products = products_stock.get('monthly_stock_in', [])
    by_date_from_products = products_stock.get('stock_in_by_date', [])

    # Analysis snapshot monthly breakdown is the primary truth for this panel.
    monthly = monthly_from_customer if monthly_from_customer else (monthly_from_raw if monthly_from_raw else monthly_from_products)
    monthly.sort(key=lambda x: x.get('month', ''))

    by_date = by_date_from_raw if by_date_from_raw else by_date_from_products

    current_month = datetime.utcnow().strftime('%Y-%m')
    previous_rows = [r for r in monthly if _normalize_text(r.get('month')) and r.get('month') < current_month]
    previous_total = round(sum(_to_num(r.get('stock_in_units'), 0.0) for r in previous_rows), 2)
    total_units = round(sum(_to_num(r.get('stock_in_units'), 0.0) for r in monthly), 2)

    first_date = by_date[0]['date'] if by_date else None
    last_date = by_date[-1]['date'] if by_date else None

    source = 'none'
    if monthly_from_raw:
        source = 'customer_raw_rows'
    elif monthly_from_customer:
        source = 'customer_monthly_breakdown'
    elif monthly_from_products:
        source = 'customer_product_history'

    return {
        'total_stock_in_units': total_units,
        'previous_months_total_stock_in_units': previous_total,
        'transaction_count': int(sum(_to_num(r.get('transaction_count'), 0) for r in by_date)),
        'monthly_stock_in': monthly,
        'previous_months_breakdown': previous_rows,
        'stock_in_by_date': by_date,
        'first_stock_in_date': first_date,
        'latest_stock_in_date': last_date,
        'source': source,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_customer_purchase_analysis(request, *args, **kwargs):
    customer_id = request.GET.get('customer_id')
    customer_name = request.GET.get('customer_name')

    if not customer_id and not customer_name:
        return Response({'error': 'Provide customer_id or customer_name'}, status=400)

    target_id = str(customer_id or '').strip().upper()
    target_name = str(customer_name or '').strip().upper()
    limit = _parse_positive_int(request.GET.get('limit'), default=50, minimum=1, maximum=200)
    cache_key = f"customer-analysis:v2:{request.user.id}:{target_id}:{target_name}:{limit}"

    cached_payload = cache.get(cache_key)
    if cached_payload:
        return Response(cached_payload)

    try:
        latest_upload = _select_best_upload_for_user(request.user)
    except (OperationalError, InternalError):
        stale = cache.get(cache_key)
        if stale:
            stale['cache_fallback'] = True
            return Response(stale)
        return Response({'error': 'Database temporarily unavailable. Try again shortly.'}, status=503)

    if not latest_upload or not getattr(latest_upload, 'payload', None):
        empty = {
            'customer_name': customer_name,
            'products': [],
            'total_products': 0,
            'returned_products': 0,
            'limit': limit,
            'source': 'analysis_snapshot',
            'analysis_available': False,
        }
        cache.set(cache_key, empty, CUSTOMER_ANALYSIS_CACHE_TTL)
        return Response(empty)

    analysis = latest_upload.payload.analysis_snapshot or {}
    raw_rows = latest_upload.payload.raw_data if isinstance(latest_upload.payload.raw_data, list) else []
    customers = analysis.get('customers') if isinstance(analysis, dict) else None
    products = analysis.get('products') if isinstance(analysis, dict) else None

    if not isinstance(customers, list):
        customers = []
    if not isinstance(products, list):
        products = []

    matched_customer = None
    for c in customers:
        candidates = [
            c.get('customer_id'),
            c.get('party_id'),
            c.get('party_code'),
            c.get('customer_name'),
            c.get('name'),
            c.get('company'),
            c.get('party_name'),
            c.get('party'),
        ]
        id_match = target_id and any(_identity_match(target_id, v) for v in candidates if v)
        name_match = target_name and any(_identity_match(target_name, v) for v in candidates if v)
        if id_match or name_match:
            matched_customer = c
            break

    rows = []
    if matched_customer:
        rows = _normalize_product_rows(matched_customer.get('product_breakdown') or [])

    if not rows:
        rows = _derive_rows_from_products(products, target_id, target_name)

    if not rows:
        available_ids = [
            str(c.get('customer_id') or c.get('name') or '').strip()
            for c in customers[:20]
            if isinstance(c, dict)
        ]
        customer_stock_in = _build_customer_stock_in_analysis(matched_customer, raw_rows, products, target_id, target_name)
        return Response(
            {
                'customer_name': (matched_customer or {}).get('name') if isinstance(matched_customer, dict) else customer_name,
                'products': [],
                'total_products': 0,
                'source': 'analysis_snapshot',
                'analysis_available': bool(customers or products),
                'stock_in_analysis': customer_stock_in,
                'debug': {'available_ids': [x for x in available_ids if x]},
            }
        )

    customer_stock_in = _build_customer_stock_in_analysis(matched_customer, raw_rows, products, target_id, target_name)

    paged_rows = rows[:limit]

    response_payload = {
        'customer_name': (matched_customer or {}).get('name') if isinstance(matched_customer, dict) else customer_name,
        'products': paged_rows,
        'total_products': len(rows),
        'returned_products': len(paged_rows),
        'limit': limit,
        'source': 'analysis_snapshot',
        'stock_in_analysis': customer_stock_in,
    }
    cache.set(cache_key, response_payload, CUSTOMER_ANALYSIS_CACHE_TTL)

    return Response(
        response_payload
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_product_buyer_analysis(request, *args, **kwargs):
    product_name = request.GET.get('product_name')
    product_sku = request.GET.get('product_sku')
    upload_id = request.GET.get('upload_id')
    strict_mode = str(request.GET.get('strict', 'true')).strip().lower() != 'false'
    limit = _parse_positive_int(request.GET.get('limit'), default=50, minimum=1, maximum=200)

    if not product_name and not product_sku:
        return Response({'error': 'Provide product_name or product_sku'}, status=400)

    cache_key = f"product-buyers:v8:{request.user.id}:{_normalize_text(product_name)}:{_normalize_text(product_sku)}:{_normalize_text(upload_id)}:{int(strict_mode)}:{limit}"
    cached_payload = cache.get(cache_key)
    if cached_payload:
        return Response(cached_payload)

    try:
        latest_upload = _select_best_upload_for_user(request.user, upload_id=upload_id)
    except (OperationalError, InternalError):
        stale = cache.get(cache_key)
        if stale:
            stale['cache_fallback'] = True
            return Response(stale)
        return Response({'error': 'Database temporarily unavailable. Try again shortly.'}, status=503)

    if not latest_upload or not getattr(latest_upload, 'payload', None):
        empty = {'buyers': [], 'total_buyers': 0, 'returned_buyers': 0, 'limit': limit, 'source': 'none'}
        cache.set(cache_key, empty, CUSTOMER_ANALYSIS_CACHE_TTL)
        return Response(empty)

    payload = latest_upload.payload
    analysis = payload.analysis_snapshot or {}
    products = analysis.get('products') if isinstance(analysis, dict) else []
    if not isinstance(products, list):
        products = []

    raw_rows = payload.raw_data if isinstance(payload.raw_data, list) else []

    buyers = _extract_buyers_from_raw_rows(raw_rows, product_name, product_sku)
    source = 'raw_data'

    # Strict mode: never return inferred/estimated buyers; return only row-verified buyers.
    if strict_mode and not buyers:
        source = 'strict_no_match'
    elif not buyers:
        buyers = _derive_buyers_from_analysis_products(products, product_name, product_sku)
        source = 'analysis_products'

    paged_buyers = buyers[:limit]
    response_payload = {
        'buyers': paged_buyers,
        'total_buyers': len(buyers),
        'returned_buyers': len(paged_buyers),
        'limit': limit,
        'source': source,
        'product_name': product_name,
        'product_sku': product_sku,
    }
    cache.set(cache_key, response_payload, CUSTOMER_ANALYSIS_CACHE_TTL)

    return Response(
        response_payload
    )
