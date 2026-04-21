from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProductViewSet, 
    StockRecordViewSet, 
    ForecastResultViewSet, 
    RecommendationViewSet,
    DashboardSummaryView,
    StockAlertsView,
    AggregateForecastView,
    ForecastAuditView,
    BatchInventoryAnalysisView
)

router = DefaultRouter()
router.register(r'products', ProductViewSet, basename='product')
router.register(r'stock', StockRecordViewSet, basename='stockrecord')
router.register(r'forecast', ForecastResultViewSet, basename='forecastresult')
router.register(r'recommendations', RecommendationViewSet, basename='recommendation')

urlpatterns = [
    path('', include(router.urls)),
    path('stock-alerts/', StockAlertsView.as_view(), name='stock-alerts'),
    path('dashboard-summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('aggregate-forecast/', AggregateForecastView.as_view(), name='aggregate-forecast'),
    path('forecast-audit/', ForecastAuditView.as_view(), name='forecast-audit'),
    path('batch-analysis/', BatchInventoryAnalysisView.as_view(), name='batch-analysis'),
]
