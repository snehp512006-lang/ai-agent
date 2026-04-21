"""
Inventory Services
Real data-driven calculations for inventory management
"""
from django.db.models import Sum, Q
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
from .models import Product, StockRecord, InventoryTransaction, ForecastResult


class InventoryService:
    """
    Calculates real inventory metrics based on transaction data.
    All calculations are 100% data-driven with no assumptions.
    """

    @staticmethod
    def get_current_stock(product: Product) -> int:
        """
        Calculate current closing stock using the formula:
        Opening Stock + Purchases - Sales + Returns + Adjustments = Closing Stock
        """
        return product.current_closing_stock

    @staticmethod
    def get_sales_velocity(product: Product, days: int = 30) -> float:
        """
        Calculate average daily sales based on actual transactions
        
        Args:
            product: Product instance
            days: Number of days to look back
            
        Returns:
            Average units sold per day
        """
        cutoff_date = timezone.now() - timedelta(days=days)
        sales = InventoryTransaction.objects.filter(
            product=product,
            transaction_type='SALE',
            transaction_date__gte=cutoff_date
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        return abs(sales) / days if days > 0 else 0

    @staticmethod
    def get_purchase_velocity(product: Product, days: int = 30) -> float:
        """Calculate average daily purchases"""
        cutoff_date = timezone.now() - timedelta(days=days)
        purchases = InventoryTransaction.objects.filter(
            product=product,
            transaction_type='PURCHASE',
            transaction_date__gte=cutoff_date
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        return purchases / days if days > 0 else 0

    @staticmethod
    def estimate_days_until_stockout(stock_record: StockRecord) -> int:
        """
        Estimate days until stockout based on current stock and sales velocity
        
        Returns:
            Number of days, or -1 if no sales activity
        """
        current_qty = stock_record.current_quantity
        
        if current_qty == 0:
            return 0
        
        daily_sales = InventoryService.get_sales_velocity(stock_record.product, days=14)
        
        if daily_sales == 0:
            return 9999  # High number if no sales
        
        return int(current_qty / daily_sales)

    @staticmethod
    def get_revenue_trend(product: Product, periods: int = 12) -> dict:
        """
        Calculate revenue trend over periods (e.g., last 12 weeks)
        
        Returns:
            {
                'total_revenue': Decimal,
                'avg_revenue_per_period': Decimal,
                'trend': 'UP', 'DOWN', 'FLAT',
                'periods_data': [...]
            }
        """
        period_length_days = 7  # Weekly
        now = timezone.now()
        
        periods_data = []
        total_revenue = Decimal('0')
        
        for i in range(periods, 0, -1):
            period_start = now - timedelta(days=period_length_days * i)
            period_end = now - timedelta(days=period_length_days * (i - 1))
            
            revenue = InventoryTransaction.objects.filter(
                product=product,
                transaction_type='SALE',
                transaction_date__gte=period_start,
                transaction_date__lte=period_end
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
            
            total_revenue += revenue
            periods_data.append({
                'period': period_start.date().isoformat(),
                'revenue': float(revenue)
            })
        
        avg_revenue = total_revenue / periods if periods > 0 else Decimal('0')
        
        # Determine trend: compare first half with second half
        trend = 'FLAT'
        if periods >= 2:
            first_half = sum(p['revenue'] for p in periods_data[:periods//2])
            second_half = sum(p['revenue'] for p in periods_data[periods//2:])
            
            if second_half > first_half * 1.1:
                trend = 'UP'
            elif second_half < first_half * 0.9:
                trend = 'DOWN'
        
        return {
            'total_revenue': float(total_revenue),
            'avg_revenue_per_period': float(avg_revenue),
            'trend': trend,
            'periods_data': periods_data
        }

    @staticmethod
    def get_return_rate(product: Product, days: int = 30) -> float:
        """
        Calculate return rate as percentage of sales
        
        Returns:
            Return rate percentage (0-100)
        """
        cutoff_date = timezone.now() - timedelta(days=days)
        
        sales = abs(InventoryTransaction.objects.filter(
            product=product,
            transaction_type='SALE',
            transaction_date__gte=cutoff_date
        ).aggregate(total=Sum('quantity'))['total'] or 0)
        
        returns = InventoryTransaction.objects.filter(
            product=product,
            transaction_type='RETURN',
            transaction_date__gte=cutoff_date
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        if sales == 0:
            return 0.0
        
        return float((returns / sales) * 100)

    @staticmethod
    def get_inventory_turnover(product: Product, days: int = 90) -> float:
        """
        Calculate inventory turnover ratio = Cost of Goods Sold / Average Inventory
        Using quantities for calculation
        """
        cutoff_date = timezone.now() - timedelta(days=days)
        
        # COGS (units sold)
        units_sold = abs(InventoryTransaction.objects.filter(
            product=product,
            transaction_type='SALE',
            transaction_date__gte=cutoff_date
        ).aggregate(total=Sum('quantity'))['total'] or 0)
        
        # Average inventory
        current_inventory = product.current_closing_stock
        
        if current_inventory == 0 or units_sold == 0:
            return 0.0
        
        return float(units_sold / current_inventory)

    @staticmethod
    def get_waste_analysis(product: Product, days: int = 90) -> dict:
        """
        Analyze waste/adjustments to understand data quality
        
        Returns:
            {
                'adjustments_count': int,
                'adjustment_units': int,
                'adjustment_impact_pct': float,
                'issues': []
            }
        """
        cutoff_date = timezone.now() - timedelta(days=days)
        
        adjustments = InventoryTransaction.objects.filter(
            product=product,
            transaction_type='ADJUSTMENT',
            transaction_date__gte=cutoff_date
        )
        
        adjustment_units = adjustments.aggregate(total=Sum('quantity'))['total'] or 0
        
        total_transactions = InventoryTransaction.objects.filter(
            product=product,
            transaction_date__gte=cutoff_date
        ).aggregate(total=Sum('quantity'))['total'] or 1
        
        impact_pct = float((abs(adjustment_units) / abs(total_transactions)) * 100) if total_transactions != 0 else 0
        
        issues = []
        if impact_pct > 5:
            issues.append(f"High adjustment volume ({impact_pct:.1f}% of total transactions)")
        
        return {
            'adjustments_count': adjustments.count(),
            'adjustment_units': adjustment_units,
            'adjustment_impact_pct': impact_pct,
            'issues': issues
        }
