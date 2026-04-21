from django.db import models
from django.db.models import Sum
from datetime import timedelta


class Product(models.Model):
    sku = models.CharField(max_length=100)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    opening_stock = models.IntegerField(default=0)  # Opening balance per accounting period
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.sku} — {self.name}"

    @property
    def current_closing_stock(self):
        """Calculate current closing stock using: Opening Stock + Purchases - Sales + Returns"""
        from django.utils import timezone
        today = timezone.now().date()
        
        # Get opening balance
        opening = self.opening_stock
        
        # Sum all purchases
        purchases = InventoryTransaction.objects.filter(
            product=self, 
            transaction_type='PURCHASE'
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        # Sum all sales (stored as negative quantities in some sources)
        sales = InventoryTransaction.objects.filter(
            product=self,
            transaction_type='SALE'
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        # Sum all returns
        returns = InventoryTransaction.objects.filter(
            product=self, 
            transaction_type='RETURN'
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        # Adjustments
        adjustments = InventoryTransaction.objects.filter(
            product=self, 
            transaction_type='ADJUSTMENT'
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        closing = opening + purchases - abs(sales) + returns + adjustments
        return max(0, closing)  # Never negative

    @property
    def total_revenue_real(self):
        """Calculate total revenue from actual sales transactions"""
        sales = InventoryTransaction.objects.filter(
            product=self, 
            transaction_type='SALE'
        ).aggregate(total=Sum('amount'))['total'] or 0
        return sales

    class Meta:
        unique_together = ('sku',)
        ordering = ['-created_at']


class InventoryTransaction(models.Model):
    """
    Every inventory movement is recorded here.
    Formula: Opening Stock + Purchases - Sales + Returns + Adjustments = Closing Stock
    """
    TRANSACTION_TYPES = [
        ('PURCHASE', 'Purchase'),
        ('SALE', 'Sale'),
        ('RETURN', 'Return'),
        ('ADJUSTMENT', 'Inventory Adjustment'),
        ('TRANSFER', 'Transfer'),
    ]

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    quantity = models.IntegerField()  # Can be negative for sales
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)  # quantity * unit_price
    reference_id = models.CharField(max_length=100, blank=True)  # PO#, Invoice#, etc.
    reason = models.TextField(blank=True)
    recorded_by = models.CharField(max_length=100, blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True)
    transaction_date = models.DateTimeField()  # When the actual transaction occurred

    class Meta:
        ordering = ['-transaction_date']
        indexes = [
            models.Index(fields=['product', '-transaction_date']),
            models.Index(fields=['transaction_type', '-transaction_date']),
            models.Index(fields=['transaction_type', 'product', '-transaction_date'], name='inventory_trx_tp_pr_dt_idx'),
            models.Index(fields=['recorded_at'], name='inventory_trx_recorded_idx'),
        ]

    def __str__(self):
        return f"{self.transaction_type} - {self.product.sku} ({self.quantity}) on {self.transaction_date.date()}"

    def save(self, *args, **kwargs):
        # Auto-calculate amount if not provided
        if not self.amount and self.unit_price:
            self.amount = self.quantity * self.unit_price
        super().save(*args, **kwargs)


class StockRecord(models.Model):
    """Configuration and policy for each product"""
    product = models.OneToOneField(Product, on_delete=models.CASCADE, related_name='stock')
    reorder_point = models.IntegerField(default=10)
    safety_stock = models.IntegerField(default=5)
    max_stock = models.IntegerField(default=500)
    lead_time_days = models.IntegerField(default=7)  # Supplier lead time
    last_restocked = models.DateTimeField(auto_now=True)

    @property
    def current_quantity(self):
        """Get current quantity on hand from calculated closing stock"""
        return self.product.current_closing_stock

    class Meta:
        ordering = ['product__name']


class ForecastResult(models.Model):
    """
    Forecast data based on real historical sales analysis.
    Actual demand is tracked through InventoryTransaction(SALE) records.
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='forecasts')
    week_start = models.DateField()
    predicted_demand = models.IntegerField()
    confidence_lower = models.IntegerField(default=0)
    confidence_upper = models.IntegerField(default=0)
    confidence_score = models.DecimalField(max_digits=5, decimal_places=2, default=0.0)  # percentage
    model_used = models.CharField(max_length=50, default='statistical')
    
    # Actual demand (populated after week ends)
    actual_demand = models.IntegerField(null=True, blank=True)
    accuracy_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def calculate_accuracy(self):
        """Calculate forecast accuracy after week ends"""
        if self.actual_demand is None:
            return None
        
        if self.predicted_demand == 0:
            return 100.0 if self.actual_demand == 0 else 0.0

        accuracy = (self.actual_demand / self.predicted_demand) * 100
        return round(accuracy, 2)

    def get_actual_demand(self):
        """Calculate actual demand from sales transactions in this week"""
        from django.utils import timezone
        from datetime import timedelta
        
        week_end = self.week_start + timedelta(days=6)
        actual = InventoryTransaction.objects.filter(
            product=self.product,
            transaction_type='SALE',
            transaction_date__date__gte=self.week_start,
            transaction_date__date__lte=week_end
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        return abs(actual)  # Sales are stored as negative, so take absolute

    class Meta:
        unique_together = ('product', 'week_start')
        ordering = ['week_start']


class Recommendation(models.Model):
    """
    AI-generated recommendations based on real data analysis.
    Each recommendation includes detailed explanation of WHY and WHAT.
    """
    class Action(models.TextChoices):
        PRODUCE = 'PRODUCE', 'Produce'
        BUY = 'BUY', 'Buy'
        STOP = 'STOP', 'Stop Production'
        TRANSFER = 'TRANSFER', 'Transfer'

    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True, related_name='recommendations')
    title = models.CharField(max_length=255)
    action = models.CharField(max_length=20, choices=Action.choices)
    quantity = models.IntegerField(default=0)
    timeframe_days = models.IntegerField(default=7)
    confidence_score = models.FloatField(default=0.0)  # 0.0 – 1.0
    
    # Real analysis data
    explanation = models.TextField()  # WHY this action is needed
    action_details = models.TextField(blank=True)  # WHAT needs to be done and HOW
    
    # Analysis source
    analysis_data = models.JSONField(default=dict, blank=True)  # Stores the raw analysis metrics used
    
    is_executed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    executed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-confidence_score', '-created_at']

    def __str__(self):
        return f"{self.action}: {self.title} ({self.confidence_score:.0%})"


class StockAlert(models.Model):
    class Risk(models.TextChoices):
        OUT_OF_STOCK = 'OUT_OF_STOCK', 'Out of Stock'
        LOW_STOCK = 'LOW_STOCK', 'Low Stock'
        DEADSTOCK = 'DEADSTOCK', 'Deadstock'
        OVERSTOCK = 'OVERSTOCK', 'Overstock'
        HEALTHY = 'HEALTHY', 'Healthy'

    product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_alerts',
    )
    run = models.ForeignKey('ingestion.DataCleanerRun', on_delete=models.SET_NULL, null=True, blank=True, related_name='stock_alert_rows')
    uploaded_sheet_name = models.CharField(max_length=255, blank=True, default='')
    sku = models.CharField(max_length=100, db_index=True)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True)
    on_hand = models.IntegerField(default=0)
    reorder = models.IntegerField(default=0)
    max = models.IntegerField(default=0)
    risk = models.CharField(max_length=20, choices=Risk.choices, db_index=True)
    days_to_stock = models.IntegerField(null=True, blank=True)
    meta = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-updated_at', 'risk', 'name']
        indexes = [
            models.Index(fields=['risk', '-updated_at']),
            models.Index(fields=['sku']),
            models.Index(fields=['run', '-updated_at'], name='stockalert_run_upd_idx'),
        ]

    def __str__(self):
        return f"{self.sku} [{self.risk}]"
