from django.urls import path
from .views import GenerateEmailResponseView

urlpatterns = [
    path('generate/', GenerateEmailResponseView.as_view(), name='email-generate'),
]
