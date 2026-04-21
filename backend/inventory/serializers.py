from rest_framework import serializers
from .models import Product, StockRecord, ForecastResult, Recommendation, InventoryTransaction, StockAlert
from .stock_alerts import StockAlertService


class InventoryTransactionSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    
    class Meta:
        model = InventoryTransaction
        fields = ['id', 'product', 'product_sku', 'transaction_type', 'quantity', 'unit_price', 
                  'amount', 'reference_id', 'reason', 'recorded_by', 'transaction_date', 'recorded_at']
        read_only_fields = ['recorded_at']


class StockRecordSerializer(serializers.ModelSerializer):
    risk_level = serializers.SerializerMethodField()
    current_quantity = serializers.ReadOnlyField()
    days_until_stockout = serializers.SerializerMethodField()

    class Meta:
        model = StockRecord
        fields = ['id', 'product', 'reorder_point', 'safety_stock', 'max_stock', 'lead_time_days',
                  'current_quantity', 'risk_level', 'days_until_stockout', 'last_restocked']
        read_only_fields = ['current_quantity', 'last_restocked']

    def get_risk_level(self, obj):
        product_alert = obj.product.stock_alerts.filter(
            run__isnull=True,
        ).order_by('-updated_at').first()
        daily_sales = float((product_alert.meta or {}).get('daily_sales', 0.0)) if product_alert else 0.0
        return StockAlertService._classify(
            on_hand=int(obj.current_quantity),
            reorder=int(obj.reorder_point or 0),
            max_stock=int(obj.max_stock or 0),
            daily_sales=daily_sales,
        )

    def get_days_until_stockout(self, obj):
        product_alert = obj.product.stock_alerts.filter(
            run__isnull=True,
        ).order_by('-updated_at').first()
        daily_sales = float((product_alert.meta or {}).get('daily_sales', 0.0)) if product_alert else 0.0
        return StockAlertService._days_to_stockout(int(obj.current_quantity), daily_sales)


class ProductSerializer(serializers.ModelSerializer):
    stock = StockRecordSerializer(read_only=True)
    current_closing_stock = serializers.ReadOnlyField()
    total_revenue_real = serializers.ReadOnlyField()

    class Meta:
        model = Product
        fields = ['id', 'sku', 'name', 'category', 'price', 'opening_stock',
                  'current_closing_stock', 'total_revenue_real', 'stock', 'created_at', 'updated_at']
        read_only_fields = ['current_closing_stock', 'total_revenue_real', 'created_at', 'updated_at']


class ForecastResultSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    actual_demand = serializers.SerializerMethodField()

    class Meta:
        model = ForecastResult
        fields = ['id', 'product', 'product_name', 'product_sku', 'week_start', 'predicted_demand',
                  'actual_demand', 'confidence_lower', 'confidence_upper', 'confidence_score',
                  'accuracy_percentage', 'model_used', 'created_at', 'updated_at']
        read_only_fields = ['actual_demand', 'accuracy_percentage', 'created_at', 'updated_at']

    def get_actual_demand(self, obj):
        """Calculate actual demand from real sales transactions"""
        return obj.get_actual_demand()


class RecommendationSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)

    class Meta:
        model = Recommendation
        fields = ['id', 'product', 'product_name', 'product_sku', 'title', 'action',
                  'quantity', 'timeframe_days', 'confidence_score', 'explanation', 'action_details',
                  'analysis_data', 'is_executed', 'executed_at', 'created_at']
        read_only_fields = ['created_at', 'executed_at']


class StockAlertSerializer(serializers.ModelSerializer):
    upload_id = serializers.IntegerField(source='run_id', read_only=True)
    sheet_name = serializers.CharField(source='uploaded_sheet_name', read_only=True)

    class Meta:
        model = StockAlert
        fields = [
            'id',
            'upload_id',
            'run',
            'sheet_name',
            'uploaded_sheet_name',
            'sku',
            'name',
            'category',
            'on_hand',
            'reorder',
            'max',
            'risk',
            'days_to_stock',
        ]

