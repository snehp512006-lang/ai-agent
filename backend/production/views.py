from rest_framework import viewsets
from .models import WorkCenter, ProductionOrder
from .serializers import WorkCenterSerializer, ProductionOrderSerializer


class WorkCenterViewSet(viewsets.ModelViewSet):
    queryset = WorkCenter.objects.all()
    serializer_class = WorkCenterSerializer


class ProductionOrderViewSet(viewsets.ModelViewSet):
    queryset = ProductionOrder.objects.all()
    serializer_class = ProductionOrderSerializer
