from django.db import close_old_connections, connections
from django.db.utils import InternalError, OperationalError
from rest_framework_simplejwt.authentication import JWTAuthentication


class ResilientJWTAuthentication(JWTAuthentication):
    """Retry JWT user resolution once for transient MySQL connection corruption."""

    _RECOVERABLE_TOKENS = (
        'packet sequence number wrong',
        'server has gone away',
        'lost connection to mysql server',
    )

    @classmethod
    def _is_recoverable_db_error(cls, err):
        text = str(err or '').lower()
        return any(token in text for token in cls._RECOVERABLE_TOKENS)

    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except (InternalError, OperationalError) as db_err:
            if not self._is_recoverable_db_error(db_err):
                raise

            # Force stale sockets to close and let Django open a clean connection.
            close_old_connections()
            connections.close_all()
            return super().authenticate(request)
