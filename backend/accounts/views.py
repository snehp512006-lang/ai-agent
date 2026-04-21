from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.db.models import Q
from django.db import OperationalError, InternalError
from django.contrib.auth.models import User
from .models import AdminUser


def _db_overload_response():
    return Response(
        {'error': 'Database temporarily overloaded. Please retry in a few seconds.'},
        status=503,
    )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            identifier = request.data.get('username') or request.data.get('email') or request.data.get('identifier')
            identifier = str(identifier or '').strip()
            password = request.data.get('password')
            if not identifier or not password:
                return Response({'error': 'Username/email and password are required'}, status=400)

            user = authenticate(username=identifier, password=password)
            if not user:
                candidate = User.objects.filter(
                    Q(username__iexact=identifier) | Q(email__iexact=identifier)
                ).first()
                if candidate:
                    user = authenticate(username=candidate.username, password=password)

            if not user or not user.is_active:
                return Response({'error': 'Invalid credentials'}, status=401)

            refresh = RefreshToken.for_user(user)

            return Response({
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'organization': None,
                    'organization_id': None,
                }
            })
        except (OperationalError, InternalError):
            return _db_overload_response()


class SignupAllowedView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            return Response({
                'allowed': AdminUser.signup_allowed()
            })
        except (OperationalError, InternalError):
            return _db_overload_response()


class SignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            if not AdminUser.signup_allowed():
                return Response({'error': 'Signup is disabled. Admin already exists.'}, status=403)

            username = (request.data.get('username') or '').strip()
            email = (request.data.get('email') or '').strip()
            password = request.data.get('password')
            confirm_password = request.data.get('confirm_password')

            if not username or not email or not password or not confirm_password:
                return Response({'error': 'All fields are required.'}, status=400)
            if password != confirm_password:
                return Response({'error': 'Passwords do not match.'}, status=400)
            if User.objects.filter(username__iexact=username).exists():
                return Response({'error': 'Username already exists.'}, status=400)
            if User.objects.filter(email__iexact=email).exists():
                return Response({'error': 'Email already exists.'}, status=400)

            user = User.objects.create_user(username=username, email=email, password=password)
            user.is_staff = True
            user.is_superuser = True
            user.save(update_fields=['is_staff', 'is_superuser'])

            refresh = RefreshToken.for_user(user)

            return Response({
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'organization': None,
                    'organization_id': None,
                }
            }, status=201)
        except (OperationalError, InternalError):
            return _db_overload_response()


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            return Response({
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'organization': None,
            })
        except (OperationalError, InternalError):
            return _db_overload_response()
