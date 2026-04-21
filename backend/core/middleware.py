import logging
import time
from django.conf import settings
from django.db import connection


logger = logging.getLogger('db.slow')


class SlowQueryLogMiddleware:
    """Log per-request SQL activity and slow request-level DB time."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if getattr(settings, 'ENABLE_DB_QUERY_PROFILING', False):
            connection.force_debug_cursor = True

        start = time.perf_counter()
        response = self.get_response(request)

        if not getattr(settings, 'ENABLE_DB_QUERY_PROFILING', False):
            return response

        elapsed_ms = (time.perf_counter() - start) * 1000.0
        threshold_ms = float(getattr(settings, 'SLOW_QUERY_THRESHOLD_MS', 250))

        total_sql_ms = 0.0
        slow_count = 0
        for item in connection.queries:
            try:
                sql_ms = float(item.get('time', 0.0)) * 1000.0
            except (TypeError, ValueError):
                sql_ms = 0.0
            total_sql_ms += sql_ms
            if sql_ms >= threshold_ms:
                slow_count += 1

        if total_sql_ms >= threshold_ms or slow_count > 0:
            logger.warning(
                'Slow DB request path=%s method=%s elapsed_ms=%.1f sql_ms=%.1f query_count=%d slow_queries=%d',
                request.path,
                request.method,
                elapsed_ms,
                total_sql_ms,
                len(connection.queries),
                slow_count,
            )

        return response
