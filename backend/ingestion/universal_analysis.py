from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple
import random

import pandas as pd

from .agent_analysis import AIAgentAnalyzer


CANONICAL_ALIASES: Dict[str, List[str]] = {
    "date": ["date", "day", "time", "invoice_date", "order_date", "sales_date", "transaction_date", "month"],
    "customer": ["customer", "client", "buyer", "name", "party", "account", "company"],
    "product": ["product", "item", "sku", "material", "model", "code"],
    "quantity": ["qty", "quantity", "units", "count", "volume", "sold_qty", "order_stock", "order_qty"],
    "revenue": ["amount", "price", "total", "revenue", "sales_value", "net_amount", "value"],
}

DATE_FORMATS = [
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%d-%m-%Y",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%m-%d-%Y",
    "%Y-%m",
    "%m-%Y",
]


def _normalize_key(value: Any) -> str:
    return str(value or "").strip().lower().replace("_", " ").replace("-", " ")


def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _to_date(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None

    for fmt in DATE_FORMATS:
        try:
            if fmt == "%m-%Y":
                dt = datetime.strptime(text, fmt)
                return datetime(dt.year, dt.month, 1)
            dt = datetime.strptime(text[: len(fmt)], fmt)
            return dt
        except ValueError:
            continue

    try:
        dt = pd.to_datetime(text, errors="coerce")
        if pd.isna(dt):
            return None
        return dt.to_pydatetime() if hasattr(dt, "to_pydatetime") else datetime(dt.year, dt.month, dt.day)
    except Exception:
        return None


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _build_forecast_series(baseline: float, past_sales_daily: List[Dict[str, Any]], seed: int) -> List[float]:
    if baseline <= 0:
        return [0.0] * 365

    default_pattern = [1.03, 1.01, 0.99, 1.0, 1.02, 1.05, 0.95]
    weekday_factors = {i: default_pattern[i] for i in range(7)}

    weekday_values: Dict[int, List[float]] = defaultdict(list)
    for row in past_sales_daily[-120:]:
        dt = _to_date(row.get("date"))
        if not dt:
            continue
        value = _to_float(row.get("actual"))
        if value is None:
            continue
        weekday_values[dt.weekday()].append(value)

    if weekday_values:
        all_vals = [v for rows in weekday_values.values() for v in rows]
        overall = max(1e-6, sum(all_vals) / max(1, len(all_vals)))
        for wd in range(7):
            if weekday_values.get(wd):
                avg = sum(weekday_values[wd]) / len(weekday_values[wd])
                weekday_factors[wd] = _clamp(avg / overall, 0.85, 1.15)

    rng = random.Random(seed)
    preds: List[float] = []
    for i in range(365):
        seasonal = weekday_factors[i % 7]
        jitter = rng.uniform(-0.04, 0.04)
        value = baseline * seasonal * (1 + jitter)
        if preds and abs(value - preds[-1]) < 1e-6:
            value = value * (1.015 if jitter >= 0 else 0.985)
        preds.append(round(max(0.0, value), 2))

    return preds


def _column_profile(rows: List[Dict[str, Any]], column: str) -> Dict[str, float]:
    values = [row.get(column) for row in rows]
    non_null = [v for v in values if v not in (None, "", "-")]
    if not non_null:
        return {
            "non_null_rate": 0.0,
            "numeric_rate": 0.0,
            "date_rate": 0.0,
            "text_rate": 0.0,
            "non_negative_rate": 0.0,
            "unique_ratio": 0.0,
        }

    numeric_values = [_to_float(v) for v in non_null]
    numeric_ok = [v for v in numeric_values if v is not None]
    date_values = [_to_date(v) for v in non_null]
    date_ok = [v for v in date_values if v is not None]

    non_negative_ok = [v for v in numeric_ok if v >= 0]
    text_ok = [v for v in non_null if _to_float(v) is None and _to_date(v) is None]

    return {
        "non_null_rate": len(non_null) / max(1, len(values)),
        "numeric_rate": len(numeric_ok) / max(1, len(non_null)),
        "date_rate": len(date_ok) / max(1, len(non_null)),
        "text_rate": len(text_ok) / max(1, len(non_null)),
        "non_negative_rate": len(non_negative_ok) / max(1, len(numeric_ok)),
        "unique_ratio": len(set(str(v) for v in non_null)) / max(1, len(non_null)),
    }


def _pattern_score(field: str, profile: Dict[str, float]) -> float:
    if field == "date":
        return 0.75 * profile["date_rate"] + 0.25 * profile["non_null_rate"]
    if field in {"quantity", "revenue"}:
        return 0.6 * profile["numeric_rate"] + 0.3 * profile["non_negative_rate"] + 0.1 * profile["non_null_rate"]
    if field in {"customer", "product"}:
        return 0.5 * profile["text_rate"] + 0.3 * profile["non_null_rate"] + 0.2 * min(1.0, profile["unique_ratio"] * 2.0)
    return profile["non_null_rate"]


def detect_semantic_mapping(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(rows, list) or not rows:
        return {
            "selected_fields": {},
            "confidence_by_field": {},
            "field_candidates": {},
            "unmapped_fields": list(CANONICAL_ALIASES.keys()),
            "mapping_coverage_percent": 0,
        }

    columns = sorted({k for row in rows if isinstance(row, dict) for k in row.keys()})
    profiles = {col: _column_profile(rows, col) for col in columns}

    field_candidates: Dict[str, List[Dict[str, Any]]] = {}
    selected_fields: Dict[str, Optional[str]] = {}
    confidence_by_field: Dict[str, float] = {}
    used_columns = set()

    for field, aliases in CANONICAL_ALIASES.items():
        candidates = []
        for col in columns:
            normalized_col = _normalize_key(col)
            name_score = max(_similarity(normalized_col, alias) for alias in aliases)
            pattern_score = _pattern_score(field, profiles[col])
            confidence = round((0.55 * name_score) + (0.45 * pattern_score), 4)
            candidates.append(
                {
                    "column": col,
                    "name_score": round(name_score, 4),
                    "pattern_score": round(pattern_score, 4),
                    "confidence": confidence,
                }
            )

        candidates.sort(key=lambda x: x["confidence"], reverse=True)
        field_candidates[field] = candidates[:5]

        chosen = None
        for cand in candidates:
            if cand["column"] in used_columns:
                continue
            chosen = cand
            break

        if chosen:
            selected_fields[field] = chosen["column"]
            confidence_by_field[field] = chosen["confidence"]
            used_columns.add(chosen["column"])
        else:
            selected_fields[field] = None
            confidence_by_field[field] = 0.0

    mapped = sum(1 for v in selected_fields.values() if v)
    coverage = int(round((mapped / max(1, len(CANONICAL_ALIASES))) * 100))

    return {
        "columns_detected": columns,
        "selected_fields": selected_fields,
        "confidence_by_field": confidence_by_field,
        "field_candidates": field_candidates,
        "unmapped_fields": [k for k, v in selected_fields.items() if not v],
        "mapping_coverage_percent": coverage,
    }


def _build_fallback_analysis(rows: List[Dict[str, Any]], mapping_report: Dict[str, Any]) -> Dict[str, Any]:
    selected = mapping_report.get("selected_fields", {})
    date_col = selected.get("date")
    qty_col = selected.get("quantity") or selected.get("revenue")
    customer_col = selected.get("customer")
    product_col = selected.get("product")

    daily = defaultdict(float)
    synthetic_daily = []
    customer_totals = defaultdict(float)
    product_totals = defaultdict(float)

    def _row_metric(row: Dict[str, Any]) -> Optional[float]:
        # Prefer selected quantity/revenue signal.
        if qty_col:
            primary = _to_float(row.get(qty_col))
            if primary is not None and primary > 0:
                return primary

        # Fallback: scan row for strongest positive numeric value.
        best = None
        for key, value in row.items():
            numeric = _to_float(value)
            if numeric is None or numeric <= 0:
                continue
            k = _normalize_key(key)
            if any(token in k for token in ["id", "code", "phone", "mobile", "pin", "pincode", "gst", "year"]):
                continue
            if best is None or numeric > best:
                best = numeric
        return best

    for row in rows:
        if not isinstance(row, dict):
            continue

        qty = _row_metric(row)
        if qty is None or qty <= 0:
            continue

        dt = _to_date(row.get(date_col)) if date_col else None
        if dt:
            day = dt.strftime("%Y-%m-%d")
            daily[day] += qty
        else:
            synthetic_daily.append(qty)

        if customer_col:
            customer = str(row.get(customer_col) or "").strip()
            if customer:
                customer_totals[customer] += qty

        if product_col:
            product = str(row.get(product_col) or "").strip()
            if product:
                product_totals[product] += qty

    past_sales_daily = [
        {"date": k, "actual": round(v, 2)}
        for k, v in sorted(daily.items())
    ]

    # If no date-like column exists, build deterministic pseudo-timeline from row order.
    if not past_sales_daily and synthetic_daily:
        base = datetime.utcnow() - timedelta(days=len(synthetic_daily))
        for idx, qty in enumerate(synthetic_daily, start=1):
            day = (base + timedelta(days=idx)).strftime("%Y-%m-%d")
            past_sales_daily.append({"date": day, "actual": round(qty, 2)})

    baseline = 0.0
    if past_sales_daily:
        recent_vals = [x["actual"] for x in past_sales_daily[-7:]]
        baseline = sum(recent_vals) / max(1, len(recent_vals))
    seed = int((baseline * 1000) % 2147483647) + (len(past_sales_daily) * 13)
    forecast_series = _build_forecast_series(baseline, past_sales_daily, seed)

    start_date = _to_date(past_sales_daily[-1]["date"]) if past_sales_daily else datetime.utcnow()
    demand_forecast = []
    for i in range(1, 91):
        day = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        predicted = max(0.0, baseline)
        demand_forecast.append(
            {
                "date": day,
                "predicted": round(predicted, 2),
                "lower": round(predicted * 0.9, 2),
                "upper": round(predicted * 1.1, 2),
                "production": round(predicted * 1.15, 2),
            }
        )

    customers = []
    for idx, (name, total) in enumerate(sorted(customer_totals.items(), key=lambda x: x[1], reverse=True)[:100], start=1):
        customers.append(
            {
                "customer_id": f"CUST-{idx}",
                "customer_name": name,
                "company": name,
                "total_purchase": round(total, 2),
                "intensity_level": "STABLE",
                "intensity_label": "Stable Buying Pattern",
                "risk": "HEALTHY",
                "reason": "Fallback-derived customer summary from raw rows.",
                "monthly_trend": "flat",
            }
        )

    products = []
    for idx, (name, total) in enumerate(sorted(product_totals.items(), key=lambda x: x[1], reverse=True)[:100], start=1):
        products.append(
            {
                "sku": f"SKU-{idx}",
                "name": name,
                "product": name,
                "total_sales": round(total, 2),
                "risk": "HEALTHY",
                "confidence_score": 55,
            }
        )

    total_sales = sum(x["actual"] for x in past_sales_daily)

    return {
        "analysis_isolation": {"analysis_mode": "FALLBACK", "confidence": "LOW"},
        "confidence_score": 55,
        "confidence_label": "LOW",
        "sales_summary": {"total_sales": round(total_sales, 2), "trend": "Derived"},
        "forecast": {"next_365_days": forecast_series},
        "past_sales_daily": past_sales_daily,
        "past_sales_weekly": [],
        "demand_forecast": demand_forecast,
        "customers": customers,
        "customer_analysis": [],
        "products": products,
        "products_analysis": [],
        "inventory_summary": {
            "total_products": len(products),
            "total_sales": round(total_sales, 2),
            "total_stock": 0,
            "total_revenue": 0,
        },
        "summary": {
            "out_of_stock": 0,
            "low_stock": 0,
            "deadstock": 0,
            "overstock": 0,
            "healthy": len(products),
        },
        "metadata": {
            "mapping_report": mapping_report,
            "analysis_mode": "FALLBACK",
            "confidence": "LOW",
            "explainability": {
                "notes": [
                    "Fallback engine used because structured analysis was not reliable for this sheet.",
                    "Results are derived from detected date/metric patterns in raw rows.",
                ]
            },
        },
        "recommendations": [],
    }


def build_universal_analysis(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    if rows:
        keys = set(str(k).upper().strip() for k in rows[0].keys())
        # Check for strict or relaxed inventory markers
        if {"PRODUCT", "IN/OUT", "QUANTITY", "CHECK QUANTITY"}.issubset(keys):
            try:
                from .demand_calculator import generate_full_analysis_payload
                import pandas as pd
                return generate_full_analysis_payload(pd.DataFrame(rows))
            except Exception:
                pass

    mapping_report = detect_semantic_mapping(rows)
    confidence_by_field = mapping_report.get("confidence_by_field", {})

    date_conf = confidence_by_field.get("date", 0.0)
    qty_conf = max(confidence_by_field.get("quantity", 0.0), confidence_by_field.get("revenue", 0.0))

    mode = "FALLBACK"
    confidence_label = "LOW"
    confidence_score = 55
    if date_conf >= 0.75 and qty_conf >= 0.75:
        mode = "FULL"
        confidence_label = "HIGH"
        confidence_score = 90
    elif date_conf >= 0.45 and qty_conf >= 0.45:
        mode = "PARTIAL"
        confidence_label = "MEDIUM"
        confidence_score = 72

    if mode in {"FULL", "PARTIAL"}:
        try:
            df = pd.DataFrame(rows)
            out = AIAgentAnalyzer(df).run_analysis()
            fallback = _build_fallback_analysis(rows, mapping_report)

            # Render contract: never return sparse analysis without chart/customer essentials.
            if not isinstance(out.get("past_sales_daily"), list) or len(out.get("past_sales_daily") or []) == 0:
                out["past_sales_daily"] = fallback.get("past_sales_daily", [])
            if not isinstance(out.get("past_sales_weekly"), list) or len(out.get("past_sales_weekly") or []) == 0:
                out["past_sales_weekly"] = fallback.get("past_sales_weekly", [])
            if not isinstance(out.get("demand_forecast"), list) or len(out.get("demand_forecast") or []) == 0:
                out["demand_forecast"] = fallback.get("demand_forecast", [])
            if not isinstance(out.get("customers"), list) or len(out.get("customers") or []) == 0:
                out["customers"] = fallback.get("customers", [])
            if not isinstance(out.get("products"), list) or len(out.get("products") or []) == 0:
                out["products"] = fallback.get("products", [])
            if not isinstance(out.get("forecast"), dict) or not out.get("forecast"):
                out["forecast"] = fallback.get("forecast", {})

            out.setdefault("metadata", {})
            out["metadata"]["mapping_report"] = mapping_report
            out["metadata"]["analysis_mode"] = mode
            out["metadata"]["confidence"] = confidence_label
            out["metadata"].setdefault("explainability", {})
            out["metadata"]["explainability"]["notes"] = [
                f"Universal mapper selected {mode.lower()} analysis path.",
                "Column confidence and fallback thresholds were evaluated deterministically.",
            ]
            out.setdefault("analysis_isolation", {})
            out["analysis_isolation"]["analysis_mode"] = mode
            out["analysis_isolation"]["confidence"] = confidence_label
            out["confidence_score"] = max(int(out.get("confidence_score", 0) or 0), confidence_score)
            out["confidence_label"] = confidence_label
            return out
        except Exception:
            # Fall through to strict fallback.
            pass

    return _build_fallback_analysis(rows, mapping_report)
