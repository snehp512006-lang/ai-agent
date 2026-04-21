from django.test import TestCase
from django.utils import timezone
from .models import Product, InventoryTransaction, ForecastResult
from .services import InventoryService


class InventoryFormulaTests(TestCase):
	def setUp(self):
		self.product = Product.objects.create(
			sku='SKU-1',
			name='Test Product',
			opening_stock=100
		)

	def test_current_closing_stock_formula(self):
		now = timezone.now()
		InventoryTransaction.objects.create(
			product=self.product,
			transaction_type='PURCHASE',
			quantity=50,
			transaction_date=now
		)
		InventoryTransaction.objects.create(
			product=self.product,
			transaction_type='SALE',
			quantity=-30,
			transaction_date=now
		)
		InventoryTransaction.objects.create(
			product=self.product,
			transaction_type='RETURN',
			quantity=10,
			transaction_date=now
		)
		InventoryTransaction.objects.create(
			product=self.product,
			transaction_type='ADJUSTMENT',
			quantity=-5,
			transaction_date=now
		)

		self.assertEqual(self.product.current_closing_stock, 125)

	def test_sales_velocity_handles_negative_sales(self):
		now = timezone.now()
		InventoryTransaction.objects.create(
			product=self.product,
			transaction_type='SALE',
			quantity=-60,
			transaction_date=now
		)

		velocity = InventoryService.get_sales_velocity(self.product, days=30)
		self.assertEqual(round(velocity, 2), 2.0)


class ForecastAccuracyTests(TestCase):
	def setUp(self):
		self.product = Product.objects.create(
			sku='SKU-2',
			name='Forecast Product',
			opening_stock=0
		)

	def test_accuracy_formula_actual_over_predicted(self):
		forecast = ForecastResult.objects.create(
			product=self.product,
			week_start=timezone.now().date(),
			predicted_demand=100,
			actual_demand=80
		)
		self.assertEqual(forecast.calculate_accuracy(), 80.0)
