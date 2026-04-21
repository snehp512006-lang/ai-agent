from django.urls import path
from .views import DecisionsView, ForecastView, InventoryRisksView, COOAnalysisView, CommitAnalysisView, COODuplicateCheckView

urlpatterns = [
    path('decisions/', DecisionsView.as_view(), name='ai-decisions'),
    path('forecast/', ForecastView.as_view(), name='ai-forecast'),
    path('inventory-risks/', InventoryRisksView.as_view(), name='ai-inventory-risks'),
    path('analyze/', COOAnalysisView.as_view(), name='coo_analyze'),
    path('duplicate-check/', COODuplicateCheckView.as_view(), name='coo_duplicate_check'),
    path('commit/', CommitAnalysisView.as_view(), name='coo_commit'),
]
