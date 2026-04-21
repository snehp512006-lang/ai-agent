from django.db import models


class WorkCenter(models.Model):
    name = models.CharField(max_length=255)
    capacity = models.IntegerField(default=1)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['name']


class ProductionOrder(models.Model):
    STATUS_CHOICES = [
        ('PLANNED', 'Planned'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('ON_HOLD', 'On Hold'),
    ]

    work_center = models.ForeignKey(WorkCenter, on_delete=models.SET_NULL, null=True, blank=True)
    order_number = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    quantity = models.IntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PLANNED')
    scheduled_start = models.DateTimeField(null=True, blank=True)
    scheduled_end = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-scheduled_start', 'order_number']
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.order_number} - {self.status}"
