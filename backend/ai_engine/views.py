import logging
import math
from datetime import timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db import InternalError, OperationalError
from django.db.models import Q
from ingestion.models import DataCleanerRun, DataCleanerRunPayload
import json
import hashlib
from django.core.cache import cache
from .services import DecisionEngine
from .forecasting import ForecastEngine
from .forecast_service import AdvancedForecaster
from inventory.models import Recommendation, InventoryTransaction
from inventory.stock_alerts import StockAlertService
from ingestion.excel_processor import ExcelProcessor
from ingestion.agent_analysis import AIAgentAnalyzer
from .coo_core import COOCore
import pandas as pd

logger = logging.getLogger(__name__)

FORECAST_CACHE_TTL = 900
FORECAST_DB_FALLBACK_TTL = 1800
FORECAST_MAX_ROWS = 5000


def _to_json_db_safe(value):
    """Convert objects to strict JSON-safe values for MySQL JSON fields."""
    if value is None or isinstance(value, (str, bool, int)):
        return value

    if isinstance(value, float):
        return value if math.isfinite(value) else None

    if isinstance(value, dict):
        return {str(k): _to_json_db_safe(v) for k, v in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [_to_json_db_safe(v) for v in value]

    # Handle numpy scalar-like values without importing numpy directly.
    item_getter = getattr(value, "item", None)
    if callable(item_getter):
        try:
            return _to_json_db_safe(item_getter())
        except Exception:
            pass

    return str(value)


def _persist_upload_payload_resilient(upload, history_rows, analysis_snapshot, processing_summary):
    """Persist payload with graceful degradation when DB cannot store large JSON blobs."""
    history_rows_safe = _to_json_db_safe(history_rows)
    analysis_snapshot_safe = _to_json_db_safe(analysis_snapshot)
    processing_summary_safe = _to_json_db_safe(processing_summary)

    processed_rows = int((processing_summary or {}).get("total_rows", 0) or 0)
    if processed_rows <= 0:
        processed_rows = int((analysis_snapshot or {}).get("inventory_summary", {}).get("total_products", 0) or 0)

    defaults = {
        "raw_data": history_rows_safe,
        "analysis_snapshot": analysis_snapshot_safe,
        "processing_summary": processing_summary_safe,
        "processed_rows": processed_rows,
        "last_processed_at": timezone.now(),
        "error_log": [],
    }

    for attempt in range(3):
        try:
            payload, _ = DataCleanerRunPayload.objects.update_or_create(run=upload, defaults=defaults)
            return payload
        except Exception as full_save_err:
            logger.warning(
                "COO payload full-save failed for upload %s (attempt %s/3): %s",
                upload.id,
                attempt + 1,
                full_save_err,
            )

    compact_rows = history_rows_safe[: min(len(history_rows_safe), 2000)] if isinstance(history_rows_safe, list) else []
    compact_summary = {
        **(processing_summary_safe or {}),
        "payload_mode": "compact_fallback",
        "original_row_count": len(history_rows_safe) if isinstance(history_rows_safe, list) else 0,
        "stored_row_count": len(compact_rows),
    }

    payload, _ = DataCleanerRunPayload.objects.update_or_create(
        run=upload,
        defaults={
            "raw_data": compact_rows,
            "analysis_snapshot": analysis_snapshot_safe,
            "processing_summary": compact_summary,
            "processed_rows": max(processed_rows, len(compact_rows)),
            "last_processed_at": timezone.now(),
            "error_log": ["Payload stored in compact mode due storage constraints."],
        },
    )
    return payload


def _compute_file_hash(file_obj):
    hasher = hashlib.sha256()
    for chunk in file_obj.chunks():
        hasher.update(chunk)
    return hasher.hexdigest()


def _bundle_candidate_dataframes(bundle: dict):
    """Collect all non-empty classified sheet DataFrames for universal fallback."""
    candidates = []
    sheet_groups = (bundle or {}).get("sheets", {})
    for group_name in ["TRANSACTION", "PRODUCT_MASTER", "CUSTOMER", "INVENTORY_REFERENCE", "FIX_DATA"]:
        for entry in sheet_groups.get(group_name, []) or []:
            df = entry.get("df")
            if isinstance(df, pd.DataFrame) and not df.empty:
                candidates.append((group_name, entry.get("name", "UNKNOWN"), df.copy()))
    return candidates


def _bundle_rows_for_history(bundle: dict, max_rows: int = 50000):
    """Extract JSON-safe row snapshots, prioritizing transaction sheets for buyer mapping APIs."""
    sheets = (bundle or {}).get("sheets", {})
    rows = []

    prioritized_groups = ["TRANSACTION", "PRODUCT_MASTER", "CUSTOMER", "INVENTORY_REFERENCE"]
    for group in prioritized_groups:
        for entry in sheets.get(group, []) or []:
            df = entry.get("df")
            if not isinstance(df, pd.DataFrame) or df.empty:
                continue
            copy_df = df.copy()
            copy_df["_sheet_name"] = entry.get("name", "UNKNOWN_SHEET")
            copy_df["_sheet_type"] = group
            chunk = copy_df.to_dict(orient="records")
            rows.extend(chunk)
            if len(rows) >= max_rows:
                break
        if len(rows) >= max_rows:
            break

    if not rows:
        return []

    safe = _to_json_db_safe(rows[:max_rows])
    return safe


def _select_best_universal_df(candidates):
    """Pick the highest-signal dataframe by non-null cell count and width."""
    if not candidates:
        return pd.DataFrame(), {}

    ranked = sorted(
        candidates,
        key=lambda row: (
            int(row[2].notna().sum().sum()),
            int(len(row[2].columns)),
            int(len(row[2])),
        ),
        reverse=True,
    )
    group_name, sheet_name, best_df = ranked[0]
    return best_df, {"selected_group": group_name, "selected_sheet": sheet_name}


def _should_use_universal_fallback(bundle: dict, coo_output: dict) -> bool:
    """Trigger universal mode when fixed COO assumptions are too weak for available data."""
    sheet_groups = (bundle or {}).get("sheets", {})
    transaction_count = len(sheet_groups.get("TRANSACTION", []) or [])
    products = (coo_output or {}).get("products", []) or []
    summary = (coo_output or {}).get("summary", {}) or {}

    has_actionable_risk = any(
        int(summary.get(key, 0) or 0) > 0
        for key in ["out_of_stock", "low_stock", "deadstock", "overstock"]
    )

    # If there are no transaction sheets or no product intelligence, fallback to universal engine.
    if transaction_count == 0:
        return True
    if len(products) == 0:
        return True

    # If we only got minimal/no actionable output from fixed pipeline, universal mode usually yields better results.
    if not has_actionable_risk and len(products) <= 1:
        return True

    return False


def _build_forecast_from_latest_analysis(horizon: int):
    """Fallback forecast from latest persisted analysis snapshot when transaction table is empty."""
    terminal_statuses = [
        DataCleanerRun.AnalysisStatus.COMPLETED,
        DataCleanerRun.AnalysisStatus.SUCCESS,
    ]
    snapshot_cache_key = 'ai:forecast:fallback_snapshot:v2'
    source_run_id = None
    snapshot = cache.get(snapshot_cache_key)

    if not isinstance(snapshot, dict) or not snapshot:
        try:
            candidate_run_ids = list(
                DataCleanerRun.objects
                .filter(analysis_status__in=terminal_statuses)
                .order_by('-id')
                .values_list('id', flat=True)[:30]
            )
            if not candidate_run_ids:
                return None

            payloads = DataCleanerRunPayload.objects.filter(run_id__in=candidate_run_ids).only('run_id', 'analysis_snapshot')
            payload_map = {entry.run_id: entry for entry in payloads}

            selected_payload = None
            for run_id in candidate_run_ids:
                candidate = payload_map.get(run_id)
                if candidate and isinstance(candidate.analysis_snapshot, dict) and candidate.analysis_snapshot:
                    selected_payload = candidate
                    break

            if not selected_payload:
                return None

            snapshot = selected_payload.analysis_snapshot
            source_run_id = selected_payload.run_id
            cache.set(snapshot_cache_key, snapshot, 1800)
        except (OperationalError, InternalError):
            return None

    historical = []
    for row in snapshot.get('past_sales_daily', []) or []:
        if not isinstance(row, dict):
            continue
        date_value = row.get('date') or row.get('day') or row.get('ds')
        quantity_value = row.get('value')
        if quantity_value is None:
            quantity_value = row.get('sales')
        if quantity_value is None:
            quantity_value = row.get('y')
        if quantity_value is None:
            quantity_value = row.get('quantity_sold')
        try:
            numeric = float(quantity_value)
        except (TypeError, ValueError):
            continue
        if not date_value:
            continue
        historical.append({'date': str(date_value), 'value': max(0.0, numeric)})

    historical = historical[-365:]
    summary = snapshot.get('forecast_summary', {}) if isinstance(snapshot.get('forecast_summary'), dict) else {}
    total_predicted = summary.get('total_predicted_demand')

    base_daily = 0.0
    try:
        if total_predicted is not None:
            base_daily = max(0.0, float(total_predicted) / 30.0)
    except (TypeError, ValueError):
        base_daily = 0.0

    if base_daily <= 0.0 and historical:
        tail = historical[-14:] if len(historical) >= 14 else historical
        base_daily = sum(float(row['value']) for row in tail) / max(1, len(tail))

    if base_daily <= 0.0:
        return None

    trend_hint = 'stable'
    sales_summary = snapshot.get('sales_summary', {}) if isinstance(snapshot.get('sales_summary'), dict) else {}
    if isinstance(sales_summary.get('trend'), str):
        trend_hint = sales_summary.get('trend').strip().lower() or 'stable'

    growth_map = {
        'increasing': 0.0025,
        'upward': 0.0025,
        'decreasing': -0.0020,
        'downward': -0.0020,
        'stable': 0.0005,
    }
    drift = growth_map.get(trend_hint, 0.0005)

    start_date = timezone.now().date()
    forecast = []
    for day_index in range(1, int(max(1, horizon)) + 1):
        value = base_daily * (1.0 + drift * day_index)
        value = max(0.0, value)
        lower = max(0.0, value * 0.88)
        upper = value * 1.12
        forecast.append(
            {
                'date': (start_date + timedelta(days=day_index)).isoformat(),
                'value': round(value, 4),
                'lower': round(lower, 4),
                'upper': round(upper, 4),
            }
        )

    return {
        'historical': historical,
        'forecast': forecast,
        'metrics': {
            'model': 'analysis_snapshot_fallback',
            'source_run_id': source_run_id,
            'horizon_days': int(max(1, horizon)),
        },
        'trend': trend_hint,
    }


def _safe_horizon(raw_value, default=30, minimum=1, maximum=730):
    try:
        horizon = int(raw_value)
    except (TypeError, ValueError):
        return default
    if horizon < minimum:
        return minimum
    if horizon > maximum:
        return maximum
    return horizon


def _fetch_sales_dataframe(product_id=None):
    queryset = InventoryTransaction.objects.filter(transaction_type='SALE')
    if product_id:
        queryset = queryset.filter(product_id=product_id)

    rows = list(
        queryset.order_by('-transaction_date')
        .values_list('transaction_date', 'quantity')[:FORECAST_MAX_ROWS]
    )
    if not rows:
        return None

    rows.reverse()
    df = pd.DataFrame(rows, columns=['date', 'quantity_sold'])
    df['quantity_sold'] = df['quantity_sold'].abs()
    return df

class DecisionsView(APIView):
    """GET /api/ai/decisions/ — run decision engine and return recommendations."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if cache.get("global_sync_in_progress"):
            return Response({
                'count': 0,
                'decisions': [],
                'status': 'processing',
                'message': 'Inventory sync is in progress. Decisions will be available shortly.'
            }, status=202)

        decisions = DecisionEngine.run_global()
        return Response({'count': len(decisions), 'decisions': decisions})

class ForecastView(APIView):
    """
    Advanced GET /api/ai/forecast/ 
    Produces production-grade Prophet+ARIMA ensemble forecasts.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        product_id = request.query_params.get('product_id')
        horizon = _safe_horizon(request.query_params.get('days', 30))
        cache_key = f"ai:forecast:v3:{product_id or 'all'}:{horizon}"
        db_fallback_key = f"ai:forecast:last_success:{product_id or 'all'}"

        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        try:
            df = _fetch_sales_dataframe(product_id=product_id)
        except (OperationalError, InternalError):
            stale = cache.get(db_fallback_key)
            if stale:
                stale['cache_fallback'] = True
                stale['metrics'] = {
                    **(stale.get('metrics') or {}),
                    'db_status': 'temporary_failure',
                }
                return Response(stale, status=status.HTTP_200_OK)

            fallback = _build_forecast_from_latest_analysis(horizon)
            if fallback:
                fallback['metrics'] = {
                    **(fallback.get('metrics') or {}),
                    'db_status': 'temporary_failure',
                }
                return Response(fallback, status=status.HTTP_200_OK)

            return Response(
                {
                    'historical': [],
                    'forecast': [],
                    'metrics': {
                        'model': 'unavailable',
                        'reason': 'Database temporarily unavailable and no cached forecast found.',
                    },
                    'trend': 'unknown',
                    'message': 'Try again shortly.',
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if df is None:
            fallback = _build_forecast_from_latest_analysis(horizon)
            if fallback:
                cache.set(cache_key, fallback, FORECAST_CACHE_TTL)
                return Response(fallback, status=status.HTTP_200_OK)

            return Response(
                {
                    'historical': [],
                    'forecast': [],
                    'metrics': {
                        'model': 'unavailable',
                        'reason': 'No sales transactions available for forecasting.',
                    },
                    'trend': 'unknown',
                    'message': 'Upload sales transactions to generate forecast.',
                },
                status=status.HTTP_200_OK,
            )

        try:
            forecaster = AdvancedForecaster(df)
            result = forecaster.get_forecast(forecast_days=horizon)
        except Exception as forecast_error:
            logger.exception('Forecast generation failed: %s', forecast_error)
            stale = cache.get(db_fallback_key)
            if stale:
                stale['cache_fallback'] = True
                stale['metrics'] = {
                    **(stale.get('metrics') or {}),
                    'forecast_status': 'model_failure',
                }
                return Response(stale, status=status.HTTP_200_OK)
            return Response({'error': 'Forecast generation failed.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        if "error" in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        cache.set(cache_key, result, FORECAST_CACHE_TTL)
        cache.set(db_fallback_key, result, FORECAST_DB_FALLBACK_TTL)
        return Response(result)

class InventoryRisksView(APIView):
    """GET /api/ai/inventory-risks/ — return all products with risk classification."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        alerts = StockAlertService.refresh_alerts()
        rank = {
            'OUT_OF_STOCK': 0,
            'LOW_STOCK': 1,
            'DEADSTOCK': 2,
            'OVERSTOCK': 3,
            'HEALTHY': 4,
        }
        risks = [
            {
                'sku': alert.sku,
                'product_name': alert.name,
                'quantity_on_hand': alert.on_hand,
                'reorder_point': alert.reorder,
                'max_stock': alert.max,
                'risk_level': alert.risk,
            }
            for alert in alerts
        ]
        risks.sort(key=lambda r: rank.get(r['risk_level'], 99))
        return Response({'count': len(risks), 'risks': risks})

class COOAnalysisView(APIView):
    """
    MASTER API: Transforms raw file uploads into 11-phase AI Insights.
    Endpoint: POST /api/v1/coo/analyze/
    """
    parser_classes = (MultiPartParser, FormParser)
    # permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        confirm_replace = str(request.data.get('confirm_replace') or request.query_params.get('confirm_replace') or '').strip().lower() in {
            '1',
            'true',
            'yes',
        }

        file_hash = _compute_file_hash(file_obj)
        file_obj.seek(0)

        upload_user = request.user if getattr(request, "user", None) and request.user.is_authenticated else None
        
        # Only consider runs that actually succeeded or completed AND produced a result.
        success_statuses = [
            DataCleanerRun.AnalysisStatus.COMPLETED,
            DataCleanerRun.AnalysisStatus.SUCCESS,
        ]
        
        duplicate_qs = DataCleanerRun.objects.filter(
            file_hash=file_hash,
            analysis_status__in=success_statuses,
            payload__analysis_snapshot__isnull=False
        )
        if upload_user:
            duplicate_qs = duplicate_qs.filter(uploaded_by=upload_user)
        else:
            duplicate_qs = duplicate_qs.filter(uploaded_by__isnull=True)

        duplicate = duplicate_qs.order_by('-id').first()

        # Ensure we have a payload with results before flagging as duplicate.
        # If no result came (no snapshot), it's a broken run.
        if duplicate:
            has_payload = DataCleanerRunPayload.objects.filter(
                run=duplicate
            ).exclude(
                Q(analysis_snapshot={}) | Q(analysis_snapshot__isnull=True)
            ).exists()
            
            if not has_payload:
                duplicate = None

        if duplicate and not confirm_replace:
            return Response(
                {
                    "error": "duplicate_upload",
                    "message": "This file was already analyzed. Confirm to replace the existing result.",
                    "duplicate_upload_id": duplicate.id,
                    "duplicate_sheet_name": duplicate.uploaded_sheet_name,
                    "duplicate_completed_at": duplicate.completed_at,
                    "duplicate_status": duplicate.analysis_status,
                },
                status=status.HTTP_409_CONFLICT,
            )

        if duplicate and confirm_replace:
            upload = duplicate
            upload.uploaded_by = upload_user
            upload.uploaded_sheet_name = getattr(file_obj, "name", "upload")
            upload.file_type = str(upload.uploaded_sheet_name).split(".")[-1].lower() if "." in str(upload.uploaded_sheet_name) else "xlsx"
            upload.file_hash = file_hash
            upload.analysis_status = DataCleanerRun.AnalysisStatus.REANALYSIS
            upload.completed_at = None
            upload.save(update_fields=[
                "uploaded_by",
                "uploaded_sheet_name",
                "file_type",
                "file_hash",
                "analysis_status",
                "completed_at",
            ])
        else:
            file_name = getattr(file_obj, "name", "upload")
            ext = str(file_name).split(".")[-1].lower() if "." in str(file_name) else "xlsx"
            upload = DataCleanerRun.objects.create(
                uploaded_by=upload_user,
                uploaded_sheet_name=file_name,
                file_type=ext,
                file_hash=file_hash,
                analysis_status=DataCleanerRun.AnalysisStatus.PENDING,
            )

        try:
            # 1. Ingestion Phase 1-3: Multi-Sheet Classification
            processor = ExcelProcessor(file_obj)
            processor.load_and_classify()
            bundle = processor.get_bundle()

            candidates = _bundle_candidate_dataframes(bundle)
            if not candidates:
                upload.analysis_status = DataCleanerRun.AnalysisStatus.FAILED
                upload.completed_at = None
                upload.save(update_fields=["analysis_status", "completed_at"])
                return Response(
                    {
                        "error": "no_usable_data",
                        "message": "No usable rows detected in uploaded file. Please upload a clean sales/inventory sheet.",
                        "ingestion_report": bundle.get("report", []),
                        "ingestion_warnings": bundle.get("warnings", []),
                        "sheet_diagnostics": bundle.get("sheet_diagnostics", []),
                    },
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )
            
            # 2. AI Engine Phase 4-11: Relational Intelligence
            core = COOCore(bundle)
            final_output = core.process()
            history_rows = _bundle_rows_for_history(bundle)

            # Universal adaptive fallback for non-standard or sparse templates.
            if _should_use_universal_fallback(bundle, final_output):
                best_df, selection_meta = _select_best_universal_df(candidates)
                if not best_df.empty:
                    universal_output = AIAgentAnalyzer(best_df).run_analysis()
                    # Preserve compatibility fields expected by existing frontend.
                    universal_output.setdefault("sheet_analysis", final_output.get("sheet_analysis", []))
                    universal_output.setdefault("alerts", final_output.get("alerts", []))
                    universal_output.setdefault("recommendations", final_output.get("recommendations", []))
                    universal_output.setdefault("analysis_isolation", {})
                    universal_output["analysis_isolation"]["analysis_mode"] = "universal_adaptive"
                    universal_output["analysis_isolation"]["fallback_from"] = "coo_core"
                    universal_output["analysis_isolation"].update(selection_meta)
                    final_output = universal_output
            
            # Add bundle metadata
            transaction_count = len(bundle["sheets"]["TRANSACTION"])
            product_master_count = len(bundle["sheets"]["PRODUCT_MASTER"])
            customer_count = len(bundle["sheets"]["CUSTOMER"])
            ignored_count = len(bundle["sheets"].get("IGNORE", []))
            final_output["metadata"] = {
                "confidence_score": bundle["confidence_score"],
                "total_sheets_loaded": bundle.get("total_sheets_loaded", transaction_count + product_master_count + customer_count + ignored_count),
                "sheets_detected": transaction_count + product_master_count + customer_count,
                "sheet_breakdown": {
                    "transaction": transaction_count,
                    "product_master": product_master_count,
                    "customer": customer_count,
                    "ignored": ignored_count,
                },
                "ingestion_report": bundle["report"],
                "ingestion_warnings": bundle.get("warnings", []),
                "sheet_diagnostics": bundle.get("sheet_diagnostics", []),
                "sheet_previews": bundle.get("sheet_previews", []),
                "sheet_analysis_summary": final_output.get("sheet_analysis", []),
            }

            # Persist a history record so Past Results can show all analyzed sheets.
            try:
                safe_output = json.loads(json.dumps(final_output, default=str))
                safe_output.setdefault("analysis_isolation", {})

                file_name = getattr(file_obj, "name", "upload")
                ext = str(file_name).split(".")[-1].lower() if "." in str(file_name) else "xlsx"
                file_name = getattr(file_obj, "name", "upload")
                ext = str(file_name).split(".")[-1].lower() if "." in str(file_name) else "xlsx"

                safe_output["analysis_isolation"].setdefault("session_id", f"upload-{upload.id}")
                safe_output["analysis_isolation"]["sheet_id"] = upload.id
                safe_output["analysis_isolation"]["sheet_name"] = upload.uploaded_sheet_name

                payload = _persist_upload_payload_resilient(
                    upload=upload,
                    history_rows=history_rows,
                    analysis_snapshot=safe_output,
                    processing_summary={
                        "analysis_mode": "coo_pipeline",
                        "completed_at": timezone.now().isoformat(),
                        "total_sheets_loaded": safe_output.get("metadata", {}).get("total_sheets_loaded", 0),
                        "total_rows": len(history_rows) if isinstance(history_rows, list) else 0,
                    },
                )

                if not payload or (not payload.analysis_snapshot and not payload.raw_data):
                    upload.analysis_status = DataCleanerRun.AnalysisStatus.FAILED
                    upload.completed_at = None
                    upload.save(update_fields=["analysis_status", "completed_at"])
                    return Response({"error": "Payload persistence validation failed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

                # Persist run-wise stock alerts for professional traceability.
                try:
                    StockAlertService.persist_analysis_alerts(upload, safe_output)
                except Exception as alerts_exc:
                    logger.warning("Stock alert persistence failed for upload %s: %s", upload.id, alerts_exc)

                upload.analysis_status = DataCleanerRun.AnalysisStatus.COMPLETED
                upload.completed_at = timezone.now()
                upload.save(update_fields=["analysis_status", "completed_at"])
                final_output = safe_output
            except Exception as exc:
                logger.exception("COO history persist failed: %s", exc)
                if 'upload' in locals() and upload:
                    try:
                        upload.analysis_status = DataCleanerRun.AnalysisStatus.FAILED
                        upload.completed_at = None
                        upload.save(update_fields=["analysis_status", "completed_at"])
                    except Exception:
                        logger.exception("Failed to mark upload as FAILED after payload error.")

            return Response(final_output, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception(f"COO Pipeline Failure: {str(e)}")
            return Response({
                "error": "Pipeline failure",
                "details": str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class COODuplicateCheckView(APIView):
    """POST /api/v1/coo/duplicate-check/ — preflight file hash duplicate check."""
    def post(self, request, *args, **kwargs):
        file_hash = str(request.data.get("file_hash") or request.query_params.get("file_hash") or "").strip()
        if not file_hash:
            return Response({"error": "file_hash_required"}, status=status.HTTP_400_BAD_REQUEST)

        upload_user = request.user if getattr(request, "user", None) and request.user.is_authenticated else None
        
        # Only consider runs that actually succeeded or completed as potential duplicates.
        # CRITICAL: Also verify that analysis_snapshot exists; if no result was produced, it's not a valid duplicate.
        success_statuses = [
            DataCleanerRun.AnalysisStatus.COMPLETED,
            DataCleanerRun.AnalysisStatus.SUCCESS,
        ]
        
        duplicate_qs = DataCleanerRun.objects.filter(
            file_hash=file_hash,
            analysis_status__in=success_statuses,
            payload__analysis_snapshot__isnull=False
        )
        if upload_user:
            duplicate_qs = duplicate_qs.filter(uploaded_by=upload_user)
        else:
            duplicate_qs = duplicate_qs.filter(uploaded_by__isnull=True)

        duplicate = duplicate_qs.order_by("-id").first()
        
        # Ensure we have a payload with results before flagging as duplicate.
        # If no result came (no snapshot), it's a broken run.
        if duplicate:
            has_payload = DataCleanerRunPayload.objects.filter(
                run=duplicate
            ).exclude(
                Q(analysis_snapshot={}) | Q(analysis_snapshot__isnull=True)
            ).exists()
            
            if not has_payload:
                duplicate = None

        if not duplicate:
            return Response({"duplicate": False}, status=status.HTTP_200_OK)

        return Response(
            {
                "duplicate": True,
                "duplicate_upload_id": duplicate.id,
                "duplicate_sheet_name": duplicate.uploaded_sheet_name,
                "duplicate_completed_at": duplicate.completed_at,
                "duplicate_status": duplicate.analysis_status,
            },
            status=status.HTTP_200_OK,
        )

class CommitAnalysisView(APIView):
    """
    Saves AI Analytics results into the database:
    1. Updates Product metadata (Category, Price)
    2. Creates/Updates StockAlerts
    3. Generates Recommendations
    """
    def post(self, request, *args, **kwargs):
        products = request.data.get('products', [])
        if not products:
            return Response({"error": "No product data to commit"}, status=status.HTTP_400_BAD_REQUEST)
        
        from inventory.models import Product, StockAlert, Recommendation
        from django.utils import timezone
        
        committed_count = 0
        for item in products:
            sku = item.get('product', 'UNKNOWN')
            if sku == 'UNKNOWN': continue
            
            # 1. Update/Create Product
            product, created = Product.objects.update_or_create(
                sku=sku,
                defaults={
                    'name': sku,
                    'category': item.get('category', 'General'),
                    'price': item.get('current_price', 0) or item.get('price', 0)
                }
            )
            
            # 2. Update/Create StockAlert
            StockAlert.objects.update_or_create(
                sku=sku,
                run=None,
                defaults={
                    'product': product,
                    'uploaded_sheet_name': '',
                    'name': sku,
                    'on_hand': item.get('current_stock', 0),
                    'risk': item.get('risk_level', 'HEALTHY'),
                    'days_to_stock': item.get('days_to_stockout', 999),
                    'category': item.get('category', 'General')
                }
            )
            
            # 3. Create Recommendation (if high risk)
            if item.get('risk_level') in ['CRITICAL', 'HIGH']:
                Recommendation.objects.create(
                    product=product,
                    title=f"Replenish {sku}",
                    action='BUY' if item.get('risk_level') == 'CRITICAL' else 'PRODUCE',
                    quantity=int(item.get('velocity', 0) * 30),
                    explanation=item.get('why', ''),
                    action_details=item.get('what', ''),
                    confidence_score=0.9
                )
            
            committed_count += 1
            
        return Response({
            "message": f"Successfully committed {committed_count} product intelligence profiles to the Database.",
            "timestamp": timezone.now()
        }, status=status.HTTP_201_CREATED)