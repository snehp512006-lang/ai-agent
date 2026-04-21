"""
Demand Forecasting Engine — Phase 1 (Statistical)
Uses moving averages and trend detection as a Prophet-compatible stub.
Swap ForecastEngine.predict() with a real Prophet/LSTM call in Phase 2.
"""
import math
from datetime import date, timedelta
from django.utils import timezone
from django.db.models import Sum
from inventory.models import Product, ForecastResult, InventoryTransaction


class ForecastEngine:
    @classmethod
    def forecast_product(cls, product: Product, weeks: int = 8) -> list[dict]:
        """
        Generates a weekly demand forecast based on REAL sales history.
        Uses a Weighted Moving Average (WMA) over 90 days.
        """
        today = timezone.now()
        thirty_days_ago = today - timedelta(days=30)
        ninety_days_ago = today - timedelta(days=90)

        # 1. Fetch real sales data (Sales are stored as negative quantities)
        recent_sales = InventoryTransaction.objects.filter(
            product=product,
            transaction_type='SALE',
            transaction_date__gte=thirty_days_ago
        ).aggregate(total=Sum('quantity'))['total'] or 0
        
        older_sales = InventoryTransaction.objects.filter(
            product=product,
            transaction_type='SALE',
            transaction_date__gte=ninety_days_ago,
            transaction_date__lt=thirty_days_ago
        ).aggregate(total=Sum('quantity'))['total'] or 0

        # Convert to absolute units
        recent_units = abs(recent_sales)
        older_units = abs(older_sales)

        # 2. Calculate Weighted Daily Velocity
        # Weight recent 30 days twice as much as previous 60 days
        weight_recent = 2.0
        weight_older = 1.0
        
        total_weighted_units = (recent_units * weight_recent) + (older_units * weight_older)
        total_weighted_days = (30 * weight_recent) + (60 * weight_older)
        
        daily_velocity = total_weighted_units / total_weighted_days
        
        # 3. Handle "Insufficient Data"
        is_low_data = (recent_units + older_units) < 5
        confidence_score = 95.0 if not is_low_data else 40.0
        model_name = 'transaction_weighted_ma_v2' if not is_low_data else 'insufficient_data_fallback'

        results = []
        forecast_start = today.date() + timedelta(days=(7 - today.weekday()) % 7)

        for w in range(weeks):
            week_start = forecast_start + timedelta(weeks=w)
            
            # Deterministic weekly demand
            predicted = int(daily_velocity * 7)
            
            # Confidence interval based on volatility (Phase 3 would use StdDev, Phase 2 uses 15% fixed)
            margin = int(predicted * 0.15) if not is_low_data else int(predicted * 0.5)

            # Persist for audit
            obj, _ = ForecastResult.objects.update_or_create(
                product=product,
                week_start=week_start,
                defaults=dict(
                    predicted_demand=predicted,
                    confidence_lower=max(0, predicted - margin),
                    confidence_upper=predicted + margin,
                    confidence_score=confidence_score,
                    model_used=model_name,
                )
            )
            
            results.append({
                'week_start': str(week_start),
                'predicted_demand': predicted,
                'confidence_lower': max(0, predicted - margin),
                'confidence_upper': predicted + margin,
                'model_used': model_name,
                'confidence_score': float(confidence_score)
            })

        return results

    @classmethod
    def forecast_global(cls, weeks: int = 8) -> list[dict]:
        products = Product.objects.all()
        return [
            {
                'sku': p.sku,
                'product_name': p.name,
                'weeks': cls.forecast_product(p, weeks),
            }
            for p in products
        ]
