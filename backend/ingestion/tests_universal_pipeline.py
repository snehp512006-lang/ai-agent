from django.core.management import call_command
from django.test import TestCase

from ingestion.models import DataCleanerRun, DataCleanerRunPayload
from ingestion.universal_analysis import build_universal_analysis, detect_semantic_mapping


class UniversalPipelineTests(TestCase):
    def test_semantic_mapping_detects_core_fields_with_noisy_headers(self):
        rows = [
            {"Invoice Date": "2026-04-01", "Client Name": "A", "Item SKU": "P1", "Units Count": 5, "Total Amount": 1200},
            {"Invoice Date": "2026-04-02", "Client Name": "B", "Item SKU": "P2", "Units Count": 3, "Total Amount": 700},
        ]

        report = detect_semantic_mapping(rows)
        selected = report.get("selected_fields", {})

        self.assertEqual(selected.get("date"), "Invoice Date")
        self.assertEqual(selected.get("customer"), "Client Name")
        self.assertEqual(selected.get("product"), "Item SKU")
        self.assertEqual(selected.get("quantity"), "Units Count")

    def test_universal_analysis_returns_confidence_contract(self):
        rows = [
            {"date": "2026-04-01", "customer": "Alpha", "product": "P1", "qty": 10},
            {"date": "2026-04-02", "customer": "Alpha", "product": "P2", "qty": 8},
            {"date": "2026-04-03", "customer": "Beta", "product": "P1", "qty": 7},
        ]

        analysis = build_universal_analysis(rows)

        self.assertIn("confidence_label", analysis)
        self.assertIn(analysis.get("confidence_label"), ["HIGH", "MEDIUM", "LOW"])
        self.assertIn("analysis_isolation", analysis)
        self.assertIn("analysis_mode", analysis.get("analysis_isolation", {}))

    def test_repair_payloads_marks_missing_payload_runs_invalid(self):
        run = DataCleanerRun.objects.create(
            uploaded_sheet_name="legacy.csv",
            file_type="csv",
            analysis_status=DataCleanerRun.AnalysisStatus.COMPLETED,
        )

        call_command("repair_payloads", limit=10)

        run.refresh_from_db()
        payload = DataCleanerRunPayload.objects.filter(run=run).first()

        self.assertIsNotNone(payload)
        self.assertEqual(run.analysis_status, DataCleanerRun.AnalysisStatus.FAILED)
        self.assertTrue(isinstance(payload.processing_summary, dict))
        self.assertTrue(bool(payload.processing_summary.get("invalid_reason")))
