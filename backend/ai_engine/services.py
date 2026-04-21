"""
AI Decision Engine
Converts real inventory/forecast data into structured, actionable business decisions.
Every recommendation is based on actual transaction analysis.
"""
from decimal import Decimal
import logging
from django.db import IntegrityError
from django.db.models import Sum, Q
from django.utils import timezone
from datetime import timedelta
from inventory.models import Product, StockRecord, Recommendation, ForecastResult, InventoryTransaction
from inventory.services import InventoryService
from inventory.stock_alerts import StockAlertService


class DecisionEngine:
    """
    Analyzes real transaction data to generate recommendations.
    Every decision includes:
    - WHY the condition occurred (cause analysis)
    - WHAT action to take (specific recommendation)
    - HOW to measure success (metrics)
    """
    
    # Confidence tuning weights
    _CONF_CRITICAL = 0.98
    _CONF_HIGH = 0.92
    _CONF_MED = 0.75
    _CONF_LOW = 0.58

    logger = logging.getLogger(__name__)

    @classmethod
    def run_global(cls) -> list[dict]:
        """
        Main entry point. Analyzes all products and
        returns actionable decisions based on REAL-TIME data.
        
        IMPORTANT: Clears old recommendations and generates fresh ones
        based on current inventory state.
        """
        # Clear old recommendations - ensure fresh analysis every time
        Recommendation.objects.filter(is_executed=False).delete()
        
        decisions = []
        products = Product.objects.select_related('stock')

        for product in products:
            try:
                stock = product.stock
            except StockRecord.DoesNotExist:
                # Create default stock record if missing
                stock = StockRecord.objects.create(product=product)

            try:
                # Analyze this product based on CURRENT data
                product_decisions = cls._analyze_product(product, stock)
                decisions.extend(product_decisions)
            except Exception as e:
                print(f"Error analyzing {product.sku}: {str(e)}")
                continue

        return decisions[:10]  # Return top 10 decisions

    @classmethod
    def _analyze_product(cls, product: Product, stock: StockRecord) -> list[dict]:
        """
        Comprehensive analysis of a single product based on real data
        """
        decisions = []
        
        # Get real metrics
        current_qty = InventoryService.get_current_stock(product)
        daily_sales = InventoryService.get_sales_velocity(product, days=30)
        days_to_stockout = InventoryService.estimate_days_until_stockout(stock)
        revenue_trend = InventoryService.get_revenue_trend(product, periods=12)
        return_rate = InventoryService.get_return_rate(product, days=30)
        turnover = InventoryService.get_inventory_turnover(product, days=90)
        
        # Get forecast
        today = timezone.now().date()
        next_week_forecast = ForecastResult.objects.filter(
            product=product,
            week_start__gte=today
        ).first()
        predicted_demand = next_week_forecast.predicted_demand if next_week_forecast else 0
        
        risk_level = StockAlertService._classify(
            on_hand=int(current_qty),
            reorder=int(stock.reorder_point or 0),
            max_stock=int(stock.max_stock or 0),
            daily_sales=float(daily_sales),
        )

        # Decision 1: CRITICAL LOW STOCK
        if current_qty == 0 or (current_qty < stock.safety_stock and daily_sales > 0):
            analysis_data = {
                'current_qty': current_qty,
                'reorder_point': stock.reorder_point,
                'daily_sales': float(daily_sales),
                'days_to_stockout': days_to_stockout,
                'predicted_next_week': predicted_demand
            }
            
            if current_qty == 0:
                confidence = cls._CONF_CRITICAL
                title = f"CRITICAL: {product.sku} out of stock"
                explanation = (
                    f"{product.name} ({product.sku}) has ZERO units in stock. "
                    f"Based on 30-day historical sales data, the average daily demand is {daily_sales:.1f} units. "
                    f"Next week forecast predicts {predicted_demand} units of demand. "
                    f"This creates a critical stockout situation affecting revenue."
                )
            else:
                confidence = cls._CONF_HIGH
                title = f"HIGH PRIORITY: Restock {product.sku}"
                explanation = (
                    f"{product.name} has {current_qty} units on hand (below safety stock of {stock.safety_stock}). "
                    f"Historical analysis shows {daily_sales:.1f} units sold daily. "
                    f"At current sales velocity, stock will be depleted in {days_to_stockout} days. "
                    f"Next week's forecast is {predicted_demand} units. "
                    f"Immediate restocking required to prevent stockout."
                )
            
            qty_to_order = max(stock.reorder_point * 2, int(predicted_demand * 1.5))
            days_cover = int(qty_to_order / daily_sales) if daily_sales > 0 else 0
            
            decision = cls._build_decision(
                product=product,
                action=Recommendation.Action.BUY,
                quantity=qty_to_order,
                timeframe=3 if current_qty == 0 else 5,
                confidence=confidence,
                title=title,
                explanation=explanation,
                action_details=(
                    f"Place purchase order for {qty_to_order} units immediately. "
                    f"With supplier lead time of {stock.lead_time_days} days, this will arrive in time. "
                    f"This brings stock to {qty_to_order} units, covering {days_cover} days of sales."
                ),
                analysis_data=analysis_data
            )
            if decision:
                decisions.append(decision)

        # Decision 2: OVERSTOCK
        elif risk_level == 'OVERSTOCK':
            analysis_data = {
                'current_qty': current_qty,
                'max_stock': stock.max_stock,
                'threshold': int(stock.max_stock * 0.85),
                'daily_sales': float(daily_sales),
                'holding_days': int(current_qty / daily_sales) if daily_sales > 0 else 0,
                'revenue_trend': revenue_trend['trend']
            }
            
            holding_days = int(current_qty / daily_sales) if daily_sales > 0 else 9999
            
            confidence = cls._CONF_MED
            title = f"Reduce production: {product.sku} overstock"
            explanation = (
                f"{product.name} has {current_qty} units in stock, exceeding 85% of maximum ({stock.max_stock}). "
                f"This excess inventory will require {holding_days} days to sell at current velocity ({daily_sales:.1f} units/day). "
                f"Revenue trend is {revenue_trend['trend']}, indicating {'decreasing' if revenue_trend['trend'] == 'DOWN' else 'stable'} demand. "
                f"Holding excess inventory increases carrying costs and obsolescence risk."
            )
            
            decision = cls._build_decision(
                product=product,
                action=Recommendation.Action.STOP,
                quantity=0,
                timeframe=21,
                confidence=confidence,
                title=title,
                explanation=explanation,
                action_details=(
                    f"Pause production for {stock.max_stock // max(1, int(daily_sales))} days. "
                    f"This allows current inventory to normalize while meeting demand. "
                    f"Resume production when stock falls below {stock.reorder_point} units."
                ),
                analysis_data=analysis_data
            )
            if decision:
                decisions.append(decision)

        # Decision 3: POOR FORECAST ACCURACY
        if next_week_forecast:
            actual_demand = next_week_forecast.get_actual_demand()
            if next_week_forecast.predicted_demand > 0:
                accuracy = (actual_demand / next_week_forecast.predicted_demand) * 100
            elif actual_demand == 0:
                accuracy = 100.0
            else:
                accuracy = 0.0

            if accuracy < 70:
                analysis_data = {
                    'predicted': next_week_forecast.predicted_demand,
                    'actual': actual_demand,
                    'accuracy': max(0, accuracy),
                    'confidence_band': [next_week_forecast.confidence_lower, next_week_forecast.confidence_upper],
                    'model_used': next_week_forecast.model_used
                }
                
                confidence = cls._CONF_LOW
                title = f"Low forecast accuracy: {product.sku}"
                explanation = (
                    f"Forecasting model for {product.name} has {max(0, accuracy):.0f}% accuracy. "
                    f"Predicted {next_week_forecast.predicted_demand} units but actual was {actual_demand} units. "
                    f"This indicates forecast model needs recalibration or external factors have changed demand patterns."
                )
                
                decision = cls._build_decision(
                    product=product,
                    action=Recommendation.Action.TRANSFER,
                    quantity=0,
                    timeframe=7,
                    confidence=confidence,
                    title=title,
                    explanation=explanation,
                    action_details=(
                        f"Review recent sales pattern changes and external factors (seasonality, promotions, market events). "
                        f"Current model: {next_week_forecast.model_used}. "
                        f"Recommend manual adjustment of forecasts until model accuracy improves."
                    ),
                    analysis_data=analysis_data
                )
                if decision:
                    decisions.append(decision)

        return decisions

    @staticmethod
    def _build_decision(product, action, quantity, timeframe, confidence, title, explanation, action_details, analysis_data) -> dict:
        """Create fresh recommendation based on current analysis"""
        if not Product.objects.filter(pk=product.pk).exists():
            return None

        try:
            # Create new recommendation (old ones are deleted in run_for_organization)
            rec = Recommendation.objects.create(
                product=product,
                action=action,
                title=title,
                quantity=quantity,
                timeframe_days=timeframe,
                confidence_score=confidence,
                explanation=explanation,
                action_details=action_details,
                analysis_data=analysis_data,
                is_executed=False,
            )
        except IntegrityError as exc:
            DecisionEngine.logger.warning("Recommendation create skipped: %s", exc)
            return None
        
        return {
            'id': rec.id,
            'title': rec.title,
            'action': rec.action,
            'sku': product.sku,
            'product_name': product.name,
            'quantity': rec.quantity,
            'timeframe_days': rec.timeframe_days,
            'confidence_score': round(rec.confidence_score * 100),
            'explanation': rec.explanation,
            'action_details': rec.action_details,
            'analysis_data': rec.analysis_data,
        }
