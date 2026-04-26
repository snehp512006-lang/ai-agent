from django.test import SimpleTestCase
import pandas as pd
import numpy as np
from ai_engine.business_intelligence import AdvancedBusinessIntelligenceEngine

class StrictEngineTests(SimpleTestCase):
    def test_ingestion_and_cleaning(self):
        data = [
            {"product": "A", "date": "2026-01-01", "quantity": 10, "price": 100, "customer": "C1"},
            {"product": "A", "date": "2026-01-02", "quantity": 20, "price": 100, "customer": "C1"},
            {"product": "B", "date": "2026-01-01", "quantity": 5, "price": 50, "customer": "C2"},
            {"product": "B", "date": "2026-01-01", "quantity": 5, "price": 50, "customer": "C2"}, # Duplicate
        ]
        df = pd.DataFrame(data)
        engine = AdvancedBusinessIntelligenceEngine(df)
        results = engine.run_pipeline()
        
        self.assertEqual(results["status"], "success")
        # Duplicate should be removed (3 unique rows)
        self.assertEqual(results["summary"]["total_orders"], 3)
        # 10 + 20 + 5 = 35
        self.assertEqual(results["summary"]["total_units"], 35)

    def test_forecasting_uplift(self):
        # Create 12 months of data to trigger seasonal logic
        data = []
        for m in range(1, 13):
            data.append({"product": "X", "date": f"2025-{m:02d}-01", "quantity": 100, "price": 10, "customer": "C1"})
        
        df = pd.DataFrame(data)
        engine = AdvancedBusinessIntelligenceEngine(df)
        results = engine.run_pipeline()
        
        # Check if Diwali (October - 10) uplift is applied in monthly forecast
        # Forecast is for next 30 days. If last data is 2025-12-01, forecast will be for Dec/Jan.
        # Let's check seasonal_adjustments instead.
        self.assertIn("DIWALI", results["seasonal_adjustments"])
        self.assertIn("CHRISTMAS", results["seasonal_adjustments"])
        self.assertIn("NEW YEAR", results["seasonal_adjustments"])

    def test_invalid_data_handling(self):
        df = pd.DataFrame([{"product": "A"}]) # Missing fields
        engine = AdvancedBusinessIntelligenceEngine(df)
        results = engine.run_pipeline()
        self.assertEqual(results["status"], "failed")
        self.assertIn("Required fields missing", results["error"])
