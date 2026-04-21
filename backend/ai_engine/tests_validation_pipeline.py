from django.test import SimpleTestCase
import pandas as pd

from ai_engine.coo_core import COOCore


class PipelineValidationTests(SimpleTestCase):
    def _build_bundle(self, entry_df=None, ink_df=None, fix_df=None, mapping_override=None):
        if entry_df is None:
            entry_df = pd.DataFrame(
                [
                    {
                        "Date": "2026-01-01",
                        "Product": "CYAN INK",
                        "Qty": 100,
                        "Type": "IN",
                        "Rate": 10,
                        "Party": "A TRADERS",
                        "Location": "Udhana",
                    },
                    {
                        "Date": "2026-01-02",
                        "Product": "CYAN INK",
                        "Qty": 20,
                        "Type": "OUT",
                        "Rate": 10,
                        "Party": "A TRADERS",
                        "Location": "Udhana",
                    },
                    {
                        "Date": "2026-01-03",
                        "Product": "MAGENTA INK",
                        "Qty": 30,
                        "Type": "OUT",
                        "Rate": 12,
                        "Party": "A. TRADERS",
                        "Location": "Sachin",
                    },
                ]
            )

        if ink_df is None:
            ink_df = pd.DataFrame(
                [
                    {"Item": "CYAN INK", "Current Stock": 50, "Location": "Udhana"},
                    {"Item": "MAGENTA INK", "Current Stock": 40, "Location": "Sachin"},
                ]
            )

        if fix_df is None:
            fix_df = pd.DataFrame(
                [
                    {"source_party": "A. TRADERS", "target_party": "A TRADERS"},
                ]
            )

        mapping = {
            "date": "Date",
            "product": "Product",
            "quantity": "Qty",
            "type": "Type",
            "price": "Rate",
            "customer": "Party",
            "location": "Location",
        }
        if mapping_override:
            mapping.update(mapping_override)

        return {
            "sheets": {
                "TRANSACTION": [{"name": "Entry", "df": entry_df, "mapping": mapping}],
                "INVENTORY_REFERENCE": [
                    {
                        "name": "INK_DATA",
                        "df": ink_df,
                        "mapping": {"product": "Item", "stock": "Current Stock", "location": "Location"},
                    }
                ],
                "FIX_DATA": [
                    {
                        "name": "FIX-DATA",
                        "df": fix_df,
                        "mapping": {"source_party": "source_party", "target_party": "target_party"},
                    }
                ],
                "PRODUCT_MASTER": [],
                "CUSTOMER": [],
                "ANALYTICS_REFERENCE": [],
                "IGNORE": [],
            },
            "confidence_score": 95,
            "report": [],
            "warnings": [],
        }

    def test_end_to_end_consistency(self):
        result = COOCore(self._build_bundle()).process()
        checks = {c["name"]: c for c in result.get("consistency_checks", [])}
        self.assertTrue(checks["inventory_balance"]["passed"])
        self.assertTrue(checks["analytics_vs_transactions"]["passed"])
        self.assertTrue(checks["customers_vs_transactions"]["passed"])
        self.assertTrue(checks["inventory_vs_location_totals"]["passed"])

    def test_fix_data_alias_is_applied_before_customer_aggregation(self):
        result = COOCore(self._build_bundle()).process()
        customers = result.get("customers", [])
        names = [str(c.get("customer_id")) for c in customers]
        self.assertEqual(names.count("A TRADERS"), 1)

    def test_unknown_transaction_type_does_not_crash_and_logs_warning(self):
        entry_df = self._build_bundle()["sheets"]["TRANSACTION"][0]["df"].copy()
        entry_df["Type"] = "UNKNOWN_TYPE"
        result = COOCore(self._build_bundle(entry_df=entry_df)).process()
        report = " | ".join(result.get("data_quality_report", []))
        self.assertIn("unknown", report.lower())

    def test_missing_location_is_imputed_and_remains_consistent(self):
        entry_df = self._build_bundle()["sheets"]["TRANSACTION"][0]["df"].drop(columns=["Location"]).copy()
        result = COOCore(self._build_bundle(entry_df=entry_df, mapping_override={"location": None})).process()
        by_location = result.get("inventory_by_location", [])
        checks = {c["name"]: c for c in result.get("consistency_checks", [])}
        self.assertTrue(checks["inventory_vs_location_totals"]["passed"])
        self.assertTrue(any(str(row.get("location")) in {"UDHANA", "SACHIN"} for row in by_location))

    def test_duplicate_rows_are_removed(self):
        entry_df = self._build_bundle()["sheets"]["TRANSACTION"][0]["df"].copy()
        entry_df = pd.concat([entry_df, entry_df.iloc[[0]]], ignore_index=True)
        result = COOCore(self._build_bundle(entry_df=entry_df)).process()
        report = " | ".join(result.get("data_quality_report", []))
        self.assertIn("duplicate", report.lower())
