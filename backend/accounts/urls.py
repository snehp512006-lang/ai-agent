from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import LoginView, MeView, SignupView, SignupAllowedView

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth-login'),
    path('signup/', SignupView.as_view(), name='auth-signup'),
    path('signup-allowed/', SignupAllowedView.as_view(), name='auth-signup-allowed'),
    path('refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('token/refresh/', TokenRefreshView.as_view(), name='auth-token-refresh'),
    path('me/', MeView.as_view(), name='auth-me'),
]
