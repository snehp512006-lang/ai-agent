from django.urls import path
from . import views
from .customer_analysis_api import get_customer_purchase_analysis, get_product_buyer_analysis

urlpatterns = [
    path('upload/', views.FileUploadView.as_view(), name='file-upload'),
    path('uploads-list/', views.UploadListView.as_view(), name='uploads-list'),
    path('data-cleaner-runs/', views.DataCleanerRunListView.as_view(), name='data-cleaner-runs'),
    path('latest-analysis/', views.LatestAnalysisView.as_view(), name='latest-analysis'),
    path('upload-analysis/<int:upload_id>/', views.UploadAnalysisView.as_view(), name='upload-analysis'),
    path('upload-sheet-preview/<int:upload_id>/', views.UploadSheetPreviewView.as_view(), name='upload-sheet-preview'),
    path('upload-ledger-risk-summary/<int:upload_id>/', views.UploadLedgerRiskSummaryView.as_view(), name='upload-ledger-risk-summary'),
    path('debug-uploads/', views.DebugUploadsView.as_view(), name='debug-uploads'),
    path('simple-count/', views.SimpleCountView.as_view(), name='simple-count'),
    path('sheets/', views.SheetListCreateView.as_view(), name='sheet-list-create'),
    path('sheets/<int:pk>/', views.SheetDetailView.as_view(), name='sheet-detail'),
    path('stream/<int:upload_id>/', views.ProcessStreamView.as_view(), name='process-stream'),
    path('customer-analysis/', get_customer_purchase_analysis, name='customer-analysis'),
    path('product-buyers/', get_product_buyer_analysis, name='product-buyers'),
]
