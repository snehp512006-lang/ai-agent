from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProductionOrderViewSet, WorkCenterViewSet

router = DefaultRouter()
router.register(r'orders', ProductionOrderViewSet)
router.register(r'work-centers', WorkCenterViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
