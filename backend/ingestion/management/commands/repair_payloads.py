from django.core.management.base import BaseCommand
from django.utils import timezone

from ingestion.models import DataCleanerRun, DataCleanerRunPayload
from ingestion.universal_analysis import build_universal_analysis


class Command(BaseCommand):
    help = "Repair historical runs with missing/incomplete payloads and mark unrecoverable runs as invalid." 

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=500, help="Max runs to inspect")

    def handle(self, *args, **options):
        limit = max(1, int(options.get("limit") or 500))

        repaired = 0
        marked_invalid = 0
        skipped = 0

        qs = DataCleanerRun.objects.order_by("-id")[:limit]
        for run in qs:
            payload = getattr(run, "payload", None)

            if payload and (payload.analysis_snapshot or payload.raw_data):
                if payload.raw_data and not payload.analysis_snapshot:
                    try:
                        analysis = build_universal_analysis(payload.raw_data)
                        payload.analysis_snapshot = analysis
                        summary = payload.processing_summary if isinstance(payload.processing_summary, dict) else {}
                        summary.update({
                            "self_healed": True,
                            "self_healed_at": timezone.now().isoformat(),
                            "analysis_mode": analysis.get("analysis_isolation", {}).get("analysis_mode", "FALLBACK"),
                        })
                        payload.processing_summary = summary
                        payload.last_processed_at = timezone.now()
                        payload.save(update_fields=["analysis_snapshot", "processing_summary", "last_processed_at"])
                        if run.analysis_status != DataCleanerRun.AnalysisStatus.COMPLETED:
                            run.analysis_status = DataCleanerRun.AnalysisStatus.COMPLETED
                            run.completed_at = run.completed_at or timezone.now()
                            run.save(update_fields=["analysis_status", "completed_at"])
                        repaired += 1
                    except Exception:
                        summary = payload.processing_summary if isinstance(payload.processing_summary, dict) else {}
                        summary.update({
                            "self_healed": False,
                            "invalid_reason": "universal_regeneration_failed",
                            "invalidated_at": timezone.now().isoformat(),
                        })
                        payload.processing_summary = summary
                        payload.error_log = (payload.error_log or []) + ["Self-healing regeneration failed."]
                        payload.save(update_fields=["processing_summary", "error_log"])
                        run.analysis_status = DataCleanerRun.AnalysisStatus.FAILED
                        run.completed_at = None
                        run.save(update_fields=["analysis_status", "completed_at"])
                        marked_invalid += 1
                else:
                    skipped += 1
                continue

            # Missing payload entirely: no source rows available, mark invalid.
            DataCleanerRunPayload.objects.update_or_create(
                run=run,
                defaults={
                    "raw_data": None,
                    "analysis_snapshot": {},
                    "processing_summary": {
                        "self_healed": False,
                        "invalid_reason": "payload_missing_no_source",
                        "invalidated_at": timezone.now().isoformat(),
                    },
                    "processed_rows": 0,
                    "last_processed_at": timezone.now(),
                    "error_log": ["Run marked invalid: payload missing and no recoverable source."],
                },
            )
            run.analysis_status = DataCleanerRun.AnalysisStatus.FAILED
            run.completed_at = None
            run.save(update_fields=["analysis_status", "completed_at"])
            marked_invalid += 1

        self.stdout.write(self.style.SUCCESS(
            f"repair_payloads done: repaired={repaired}, invalidated={marked_invalid}, skipped={skipped}, scanned={len(qs)}"
        ))
