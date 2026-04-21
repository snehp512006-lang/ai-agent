import re
from typing import Any, Dict, List


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _coerce_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        if isinstance(value, str):
            cleaned = value.replace(',', '').strip()
            if not cleaned:
                return default
            return float(cleaned)
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(_coerce_float(value, default))
    except (TypeError, ValueError):
        return default


def _to_title(raw: Any) -> str:
    text = str(raw or '').replace('_', ' ').lower()
    return re.sub(r'(^|\s)\S', lambda match: match.group(0).upper(), text)


def _normalize_risk_label(value: Any) -> str:
    raw = str(value or '').upper()
    if 'OUT' in raw:
        return 'OUT OF STOCK'
    if 'LOW' in raw:
        return 'LOW STOCK'
    if 'OVER' in raw:
        return 'OVERSTOCK'
    if 'DEAD' in raw or 'NOT SELLING' in raw:
        return 'DEADSTOCK'
    if 'HEALTHY' in raw:
        return 'HEALTHY'
    return raw


def _format_units(value: Any) -> int:
    return int(round(_coerce_float(value, 0.0)))


def _build_product_action(product: Dict[str, Any], risk: str) -> str:
    name = str((product or {}).get('name') or 'Unknown SKU')
    sku = str((product or {}).get('sku') or (product or {}).get('code') or (product or {}).get('product_id') or (product or {}).get('id') or '').strip()
    label = f"{name} ({sku})" if sku else name
    sales = _format_units((product or {}).get('sales_velocity'))
    stock = _format_units((product or {}).get('current_stock'))

    if risk == 'OUT OF STOCK':
        return f"{label}: Increase procurement immediately (target +30%) and prioritize supplier dispatch; current stock {stock}, sales velocity {sales}."
    if risk == 'LOW STOCK':
        return f"{label}: Increase reorder quantity by 15-20% this cycle; current stock {stock}, sales velocity {sales}."
    if risk == 'OVERSTOCK':
        return f"{label}: Do not increase purchase next cycle; apply 10-20% markdown to improve sell-through (stock {stock}, velocity {sales})."
    if risk == 'DEADSTOCK':
        return f"{label}: Stop new procurement and run aggressive liquidation (25-40% discount / bundle clearance)."
    return f"{label}: Monitor weekly and keep procurement aligned to demand."


def build_tasks_from_analysis(analysis: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not analysis or not isinstance(analysis, dict):
        return []

    summary = analysis.get('summary') or {}
    stock = analysis.get('stock_analysis') or {
        'out_of_stock_items': summary.get('out_of_stock', 0),
        'low_stock_items': summary.get('low_stock', 0),
        'deadstock_items': summary.get('deadstock', 0),
        'healthy_items': summary.get('healthy', 0),
        'overstock_items': summary.get('overstock', 0),
    }
    products = analysis.get('products') if isinstance(analysis.get('products'), list) else []
    recommendations = analysis.get('recommendations') if isinstance(analysis.get('recommendations'), list) else []
    alerts = analysis.get('alerts') if isinstance(analysis.get('alerts'), list) else []
    forecast = analysis.get('demand_forecast') if isinstance(analysis.get('demand_forecast'), list) else []
    if not forecast and isinstance(analysis.get('forecast'), dict):
        next_3 = analysis.get('forecast', {}).get('next_3_months') or []
        forecast = [
            {
                'date': f"M+{idx + 1}",
                'predicted_demand': value,
            }
            for idx, value in enumerate(next_3)
        ]
    customers = analysis.get('customers') if isinstance(analysis.get('customers'), list) else []

    confidence_base = _clamp(_coerce_float(analysis.get('confidence_score', 80), 80.0), 50.0, 99.0)

    products_by_risk: Dict[str, List[Dict[str, Any]]] = {}
    for product in products:
        label = _normalize_risk_label((product or {}).get('risk'))
        products_by_risk.setdefault(label, []).append(product)

    def top_risk_products(risk_label: str, limit: int = 8) -> List[str]:
        items = products_by_risk.get(risk_label) or []
        ranked = sorted(items, key=lambda p: _coerce_float((p or {}).get('sales_velocity', 0), 0.0), reverse=True)
        return [_build_product_action(p, risk_label) for p in ranked[:limit]]

    candidates: List[Dict[str, Any]] = []

    def push_task(task: Dict[str, Any]) -> None:
        if not task or not task.get('title'):
            return
        task_type = task.get('task_type') or task.get('type') or 'ALERT'
        confidence = _coerce_float(task.get('confidence', confidence_base), confidence_base)
        task['task_type'] = task_type
        task['confidence'] = int(round(_clamp(confidence, 45.0, 99.0)))
        task['task_key'] = f"{task_type}-{task.get('title')}"
        task['action_options'] = list(task.get('action_options') or [])
        task['product_actions'] = list(task.get('product_actions') or [])
        candidates.append(task)

    out_of_stock = _to_int(stock.get('out_of_stock_items'), 0)
    low_stock = _to_int(stock.get('low_stock_items'), 0)
    deadstock = _to_int(stock.get('deadstock_items'), 0)
    overstock = _to_int(stock.get('overstock_items'), 0)
    healthy = _to_int(stock.get('healthy_items'), 0)

    if out_of_stock > 0:
        push_task({
            'title': f"Low Stock Risk Detected in {out_of_stock} SKU{'s' if out_of_stock > 1 else ''}",
            'task_type': 'RISK',
            'priority': 'HIGH',
            'status': 'PENDING',
            'timeframe': 'IMMEDIATE',
            'description': f"{out_of_stock} products are already out of stock and may impact fulfillment.",
            'action': 'Reorder critical SKUs today and rebalance existing inventory.',
            'action_options': [
                'Raise emergency purchase orders for top-selling SKUs.',
                'Transfer available stock from low-demand locations.',
                'Enable substitute products to avoid lost sales while replenishing.'
            ],
            'product_actions': top_risk_products('OUT OF STOCK'),
            'confidence': confidence_base,
        })

    if low_stock > 0:
        push_task({
            'title': f"Replenishment Needed for {low_stock} Low-Stock Item{'s' if low_stock > 1 else ''}",
            'task_type': 'ALERT',
            'priority': 'HIGH' if low_stock > 10 else 'MEDIUM',
            'status': 'IN_PROGRESS',
            'timeframe': 'SHORT_TERM',
            'description': f"{low_stock} items are approaching risk threshold based on current demand velocity.",
            'action': 'Raise purchase orders for the next 7 days and validate supplier lead times.',
            'action_options': [
                'Create a 7-day replenishment plan using current run-rate.',
                'Increase reorder point for fast-moving SKUs by 10-15%.',
                'Lock supplier delivery slots for priority categories.'
            ],
            'product_actions': top_risk_products('LOW STOCK'),
            'confidence': confidence_base - 2,
        })

    if deadstock > 0 or overstock > 0:
        total = deadstock + overstock
        push_task({
            'title': f"Overstock Identified in {total} Product Line{'s' if total > 1 else ''}",
            'task_type': 'OPTIMIZATION',
            'priority': 'MEDIUM' if total > 8 else 'LOW',
            'status': 'PENDING',
            'timeframe': 'SHORT_TERM',
            'description': f"{deadstock} deadstock and {overstock} overstock items are tying up working capital.",
            'action': 'Run discount and bundling campaigns to clear excess inventory this week.',
            'action_options': [
                'Pause new purchase orders for overstocked SKUs until sell-through improves.',
                'Run tiered markdowns (10-25%) based on ageing bucket.',
                'Bundle slow movers with fast sellers to improve liquidation.',
                'Push inventory through secondary channels or B2B clearance.',
                'Reduce next cycle procurement quantity using adjusted demand baseline.'
            ],
            'product_actions': top_risk_products('OVERSTOCK', 5) + top_risk_products('DEADSTOCK', 5),
            'confidence': confidence_base - 3,
        })

    if forecast:
        predicted_total = sum(_coerce_float((item or {}).get('predicted_demand', 0), 0.0) for item in forecast)
        avg_forecast = predicted_total / max(len(forecast), 1)
        push_task({
            'title': 'Demand Spike Predicted for Upcoming Cycle',
            'task_type': 'FORECAST',
            'priority': 'MEDIUM' if avg_forecast > 0 else 'LOW',
            'status': 'PENDING',
            'timeframe': 'LONG_TERM',
            'description': f"Forecast engine projects average demand near {round(avg_forecast)} units over the next cycle.",
            'action': 'Increase production allocation by 15-20% for high-velocity SKUs.',
            'action_options': [
                'Increase production plan by 15-20% for top demand SKUs.',
                'Secure raw material buffers before expected demand spike.',
                'Pre-position inventory in high-conversion regions.'
            ],
            'product_actions': [
                f"Forecast {str((item or {}).get('date') or (item or {}).get('day') or 'upcoming')}: plan capacity for predicted demand {_format_units((item or {}).get('predicted_demand'))} units."
                for item in forecast[:5]
            ],
            'confidence': confidence_base - 1,
        })

    for idx, alert in enumerate(alerts[:5]):
        alert_type = str((alert or {}).get('type') or '').upper()
        push_task({
            'title': f"{_to_title((alert or {}).get('type') or 'Risk')} Signal: {(alert or {}).get('product') or f'Item {idx + 1}'}",
            'task_type': 'RISK',
            'priority': 'HIGH' if alert_type == 'CRITICAL' else 'MEDIUM',
            'status': 'PENDING',
            'timeframe': 'IMMEDIATE',
            'description': (alert or {}).get('message') or 'AI detected a business-critical exception in uploaded data.',
            'action': 'Open SKU details, validate root cause, and apply corrective action immediately.',
            'action_options': [
                'Validate root cause against latest stock, sales, and lead-time data.',
                'Assign owner and deadline for this alert within the current shift.',
                'Escalate critical items to operations manager for same-day closure.'
            ],
            'confidence': confidence_base - 2,
        })

    for idx, rec in enumerate(recommendations[:6]):
        push_task({
            'title': f"Optimization Insight {idx + 1}",
            'task_type': 'OPTIMIZATION' if idx % 2 == 0 else 'FORECAST',
            'priority': 'LOW',
            'status': 'PENDING',
            'timeframe': 'SHORT_TERM' if idx < 2 else 'LONG_TERM',
            'description': rec,
            'action': 'Review with operations manager and schedule execution in next planning cycle.',
            'action_options': [
                'Validate impact with category-wise baseline metrics.',
                'Run a small pilot before full rollout.',
                'Track KPI lift for 7 days and promote if outcome is positive.'
            ],
            'confidence': confidence_base - 5,
        })

    churn_customers = [c for c in customers if str((c or {}).get('risk') or '').upper() == 'CHURN_RISK']
    if churn_customers:
        top = sorted(churn_customers, key=lambda c: _coerce_float((c or {}).get('total_purchase', 0), 0.0), reverse=True)[:5]
        push_task({
            'title': f"Customer Churn Alert for {len(churn_customers)} Account{'s' if len(churn_customers) > 1 else ''}",
            'task_type': 'RISK',
            'priority': 'HIGH' if len(churn_customers) >= 3 else 'MEDIUM',
            'status': 'PENDING',
            'timeframe': 'IMMEDIATE',
            'description': 'Customer behavior model detected decreasing monthly trend for key accounts.',
            'action': 'Launch retention outreach and tailored offers for high-value at-risk customers.',
            'action_options': [
                'Trigger retention campaign for top at-risk accounts.',
                'Assign account manager follow-up within 48 hours.',
                'Offer targeted incentives to reverse churn trend.'
            ],
            'product_actions': [
                f"Customer {str((c or {}).get('customer_id') or 'UNKNOWN')}: monthly trend down, predicted next-month sales {_format_units((c or {}).get('predicted_next_month_sales'))}."
                for c in top
            ],
            'confidence': confidence_base - 1,
        })

    if healthy > 0 and not candidates:
        push_task({
            'title': 'System Optimized',
            'task_type': 'OPTIMIZATION',
            'priority': 'LOW',
            'status': 'COMPLETED',
            'timeframe': 'IMMEDIATE',
            'description': f"No active risks detected across {healthy} healthy inventory records.",
            'action': 'Maintain current strategy and continue periodic monitoring.',
            'action_options': [
                'Keep procurement and pricing policy unchanged this cycle.',
                'Continue weekly monitoring to catch early deviations.',
                'Document current strategy as benchmark playbook.'
            ],
            'confidence': confidence_base,
        })

    unique: List[Dict[str, Any]] = []
    seen = set()
    for task in candidates:
        key = task.get('task_key')
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(task)

    return unique
