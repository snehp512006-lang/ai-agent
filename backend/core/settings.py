import warnings
from pathlib import Path
from datetime import timedelta
from core.env import EnvConfig

BASE_DIR = Path(__file__).resolve().parent.parent

env = EnvConfig(BASE_DIR)


def _env_int(name, default):
    try:
        return int(env.get(name, default))
    except (TypeError, ValueError):
        return int(default)


def _env_float(name, default):
    try:
        return float(env.get(name, default))
    except (TypeError, ValueError):
        return float(default)

try:
    import pymysql
    pymysql.install_as_MySQLdb()
except Exception:
    # MySQLdb-compatible shim; safe to skip if not using MySQL locally.
    pass

# Suppress third-party startup noise from deprecated pkg_resources in coreapi.
warnings.filterwarnings(
    'ignore',
    message='pkg_resources is deprecated as an API.*',
    category=UserWarning,
)

SECRET_KEY = env.get('SECRET_KEY', 'django-insecure-change-me-in-production')
DEBUG = env.get_bool('DEBUG', True)
ALLOWED_HOSTS = env.get_list('ALLOWED_HOSTS', '*')

# ── Apps ──────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # 3rd party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    # Internal
    'accounts',
    'inventory',
    'ai_engine',
    'ingestion',
    'email_agent',
    'production',
]

# ── Middleware ─────────────────────────────────────────────────────────
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'core.middleware.SlowQueryLogMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [],
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]

WSGI_APPLICATION = 'core.wsgi.application'

# ── Database ──────────────────────────────────────────────────────────
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': env.get('MYSQL_DATABASE', 'inventory_db'),
        'USER': env.get('MYSQL_USER', 'root'),
        'PASSWORD': env.get('MYSQL_PASSWORD', 'password'),
        'HOST': env.get('MYSQL_HOST', 'localhost'),
        'PORT': env.get('MYSQL_PORT', '3306'),
        'CONN_MAX_AGE': _env_int('DB_CONN_MAX_AGE', 300),
        'OPTIONS': {
            'connect_timeout': 30,
            'read_timeout': _env_int('MYSQL_READ_TIMEOUT', 60),
            'write_timeout': _env_int('MYSQL_WRITE_TIMEOUT', 60),
            'charset': 'utf8mb4',
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES';",
        },
    }
}

# ── Cache / Celery ────────────────────────────────────────────────────
REDIS_URL = env.get('REDIS_URL', 'redis://localhost:6379/0')
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
USE_REDIS_CACHE = env.get_bool('USE_REDIS_CACHE', True)

if USE_REDIS_CACHE:
    try:
        import django_redis  # noqa: F401
        CACHES = {
            'default': {
                'BACKEND': 'django_redis.cache.RedisCache',
                'LOCATION': REDIS_URL,
                'OPTIONS': {
                    'CLIENT_CLASS': 'django_redis.client.DefaultClient',
                    'SOCKET_CONNECT_TIMEOUT': _env_float('REDIS_SOCKET_CONNECT_TIMEOUT', 3.0),
                    'SOCKET_TIMEOUT': _env_float('REDIS_SOCKET_TIMEOUT', 3.0),
                    'IGNORE_EXCEPTIONS': True,
                },
                'TIMEOUT': _env_int('CACHE_DEFAULT_TIMEOUT', 600),
            }
        }
    except Exception:
        CACHES = {
            'default': {
                'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            }
        }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    }

ENABLE_DB_QUERY_PROFILING = env.get_bool('ENABLE_DB_QUERY_PROFILING', False)
SLOW_QUERY_THRESHOLD_MS = _env_int('SLOW_QUERY_THRESHOLD_MS', 250)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'db.slow': {
            'handlers': ['console'],
            'level': env.get('DB_SLOW_LOG_LEVEL', 'WARNING'),
            'propagate': False,
        },
    },
}

# ── REST Framework ────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'core.authentication.ResilientJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny',
    ],
    # 'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    # 'PAGE_SIZE': 20,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ] if env.get_bool('ENABLE_API_THROTTLING', default=(not DEBUG)) else [],
    'DEFAULT_THROTTLE_RATES': {
        'anon': env.get('DRF_THROTTLE_ANON_RATE', '120/hour'),
        'user': env.get('DRF_THROTTLE_USER_RATE', '2400/hour'),
    } if env.get_bool('ENABLE_API_THROTTLING', default=(not DEBUG)) else {},
    'EXCEPTION_HANDLER': 'core.exceptions.api_exception_handler',
}

# ── JWT Configuration ─────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ── CORS ──────────────────────────────────────────────────────────────
CORS_ALLOW_ALL_ORIGINS = env.get_bool('CORS_ALLOW_ALL_ORIGINS', default=DEBUG)
CORS_ALLOWED_ORIGINS = env.get_list('CORS_ALLOWED_ORIGINS', env.get('CORS_ORIGINS', 'http://localhost:5173'))
CORS_ALLOW_CREDENTIALS = env.get_bool('CORS_ALLOW_CREDENTIALS', True)
CSRF_TRUSTED_ORIGINS = env.get_list('CSRF_TRUSTED_ORIGINS', 'http://localhost:5173')

# ── Auth / Password ───────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ── I18n / Static ─────────────────────────────────────────────────────
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Media / File Upload ───────────────────────────────────────────────
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
FILE_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024  # 50 MB

# ── SQLite WAL Mode (concurrent reads during SSE streaming writes) ─────
# Enabled only when using SQLite (not when DATABASE_URL points to Postgres etc.)
if DATABASES.get('default', {}).get('ENGINE') == 'django.db.backends.sqlite3':
    from django.db.backends.signals import connection_created

    def _enable_wal_mode(sender, connection, **kwargs):
        """Enable WAL journal mode for every new SQLite connection.
        WAL allows readers to proceed while the SSE generator holds a write lock,
        which eliminates 'database is locked' errors under concurrent load."""
        if connection.vendor == 'sqlite':
            connection.cursor().execute('PRAGMA journal_mode=WAL;')
            connection.cursor().execute('PRAGMA synchronous=NORMAL;')

    connection_created.connect(_enable_wal_mode)
