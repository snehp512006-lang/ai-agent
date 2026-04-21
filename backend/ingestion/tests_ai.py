from django.test import TestCase
from django.contrib.auth.models import User
from ingestion.models import DataCleanerRun, DataCleanerRunPayload
from ingestion.agent_analysis import AIAgentAnalyzer
from ingestion.processing_service import DataProcessingService
import pandas as pd
import json

class EnterpriseEngineTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="admin", password="password")
        
        # Sample data for deterministic classification
        self.data = [
            {"product": "Normal Item", "stock": 50, "sales": 5},    # Normal (10 days supply, between 7 and 30)
            {"product": "Understock Item", "stock": 10, "sales": 5}, # Understock (2 days supply < 7)
            {"product": "Overstock Item", "stock": 200, "sales": 5}, # Overstock (40 days supply > 30)
            {"product": "Deadstock Item", "stock": 100, "sales": 0}, # Deadstock (Stock > 0, Sales = 0)
        ]
        self.df = pd.DataFrame(self.data)
        
        self.upload = DataCleanerRun.objects.create(
            uploaded_sheet_name="enterprise_test.csv",
            file_type="csv",
            uploaded_by=self.user,
            analysis_status=DataCleanerRun.AnalysisStatus.PENDING,
        )
        self.payload = DataCleanerRunPayload.objects.create(run=self.upload, raw_data=self.data)

    def test_analyzer_deterministic_classification(self):
        """Verify analyzer returns strict final report structure."""
        analyzer = AIAgentAnalyzer(self.df)
        package = analyzer.get_analysis_package()

        self.assertIn('summary', package)
        self.assertIn('products', package)
        self.assertIn('customers', package)
        self.assertIn('forecast', package)
        self.assertEqual(package['summary']['total_products'], 4)
        self.assertTrue(isinstance(package.get('products'), list))
        self.assertGreaterEqual(len(package.get('products', [])), 1)
        self.assertTrue(isinstance(package.get('customers'), list))
        self.assertGreaterEqual(len(package.get('customers', [])), 1)

    def test_processing_service_batch_output(self):
        """Verify that the processing service yields the correct JSON structure and counts."""
        service = DataProcessingService(self.upload, self.df)
        generator = service.run_generator(batch_size=2)

        processing_update = None
        final_update = None
        for chunk in generator:
            payload = json.loads(chunk.replace("data: ", ""))
            status = payload.get('status')
            if status == 'PROCESSING' and processing_update is None:
                processing_update = payload
            if status == 'COMPLETED':
                final_update = payload

        self.assertIsNotNone(processing_update)
        self.assertIn('progress', processing_update)
        self.assertEqual(processing_update['summary']['processed'], 2)

        self.assertIsNotNone(final_update)
        
        self.assertEqual(final_update['status'], "COMPLETED")
        self.assertEqual(final_update['summary']['total_records'], 4)
        self.assertEqual(final_update['summary']['low_stock'], 1)
        self.assertEqual(final_update['summary']['overstock'], 1)
        self.assertEqual(final_update['summary']['deadstock'], 1)
        self.assertEqual(final_update['summary']['healthy'], 1)

    def test_schema_isolation_fingerprint(self):
        """Ensure each analysis has a unique dataset fingerprint."""
        service = DataProcessingService(self.upload, self.df)
        fp1 = service.dataset_fingerprint
        
        # Different upload ID should change fingerprint
        upload2 = DataCleanerRun.objects.create(
            uploaded_sheet_name="other.csv",
            file_type="csv",
            uploaded_by=self.user,
            analysis_status=DataCleanerRun.AnalysisStatus.PENDING,
        )
        DataCleanerRunPayload.objects.create(run=upload2, raw_data=self.data)
        service2 = DataProcessingService(upload2, self.df)
        fp2 = service2.dataset_fingerprint
        
        self.assertNotEqual(fp1, fp2)
