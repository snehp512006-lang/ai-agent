from django.http import StreamingHttpResponse
from rest_framework.views import APIView
from rest_framework.renderers import BaseRenderer
from rest_framework.permissions import AllowAny
from .models import DataCleanerRun
import pandas as pd
import logging
import time
from django.db import OperationalError

logger = logging.getLogger(__name__)

class EventStreamRenderer(BaseRenderer):
    media_type = 'text/event-stream'
    format = 'txt'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data

class ProcessStreamView(APIView):
    """
    Server-Sent Events (SSE) endpoint for row-by-row AI data processing.
    """
    permission_classes = [AllowAny]
    renderer_classes = [EventStreamRenderer] # Avoids 406 Not Acceptable

    def options(self, request, *args, **kwargs):
        response = StreamingHttpResponse('')
        origin = request.headers.get('Origin')
        if origin:
            response['Access-Control-Allow-Origin'] = origin
            response['Vary'] = 'Origin'
        response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'
        return response

    def get(self, request, upload_id):
        upload_obj = None
        # 0. Handle Token in Query Param (for EventSource compatibility)
        token = request.query_params.get('token')
        if token and not request.user.is_authenticated:
            from rest_framework_simplejwt.tokens import AccessToken
            try:
                access_token = AccessToken(token)
                from django.contrib.auth.models import User
                user_id = access_token.get('user_id')
                user = User.objects.get(id=user_id)
                request.user = user
                logger.info(f"Authenticated via query token for User: {user.username}")
            except Exception as te:
                logger.error(f"SSE Auth Failure: {te}")
                return StreamingHttpResponse("Unauthorized", status=401)

        try:
            # 1. Fetch file record
            if not request.user.is_authenticated:
                 return StreamingHttpResponse("Unauthorized", status=401)
            
            upload_obj = DataCleanerRun.objects.filter(
                id=upload_id,
                uploaded_by=request.user,
            ).first()
            if not upload_obj:
                logger.error(f"ProcessStreamView: File {upload_id} not accessible for user {request.user.id}.")
                return StreamingHttpResponse("File not found.", status=404)

            if upload_obj.analysis_status == DataCleanerRun.AnalysisStatus.PROCESSING:
                logger.warning(
                    "ProcessStreamView: Upload %s is already processing; rejecting concurrent stream.",
                    upload_obj.pk,
                )
                return StreamingHttpResponse(
                    "This upload is already being processed. Please wait for completion.",
                    status=409
                )

            try:
                latest_obj = DataCleanerRun.objects.only('id').filter(uploaded_by=request.user).order_by('-id').first()
                latest_upload_id = latest_obj.id if latest_obj else None
            except DataCleanerRun.DoesNotExist:
                latest_upload_id = None
            if latest_upload_id and int(upload_id) != int(latest_upload_id):
                logger.warning(
                    f"ProcessStreamView: Rejected stale upload {upload_id}; latest upload is {latest_upload_id}."
                )
                return StreamingHttpResponse(
                    "This upload has been superseded by a newer sheet. Please process the latest upload.",
                    status=409
                )
            
            # 2. Extract data (convert raw_data JSON back to DataFrame)
            payload_obj = getattr(upload_obj, 'payload', None)
            if not payload_obj or not payload_obj.raw_data:
                return StreamingHttpResponse("No data found to process.", status=400)

            confirm_reanalysis = str(request.query_params.get('confirm_reanalysis', '')).strip().lower() in {
                '1',
                'true',
                'yes',
            }
            is_reanalysis = upload_obj.analysis_status in {
                DataCleanerRun.AnalysisStatus.COMPLETED,
                DataCleanerRun.AnalysisStatus.SUCCESS,
                DataCleanerRun.AnalysisStatus.FAILED,
                DataCleanerRun.AnalysisStatus.REANALYSIS,
            }
            if is_reanalysis and not confirm_reanalysis:
                return StreamingHttpResponse(
                    'Re-analysis requires confirmation. Pass confirm_reanalysis=true to continue.',
                    status=409,
                )
            if is_reanalysis:
                upload_obj.analysis_status = DataCleanerRun.AnalysisStatus.REANALYSIS
                upload_obj.save(update_fields=['analysis_status'])
            
            df = pd.DataFrame(payload_obj.raw_data)
            
            # 3. Mark as processing with retry to survive temporary lock contention.
            marked_processing = False
            for attempt in range(3):
                try:
                    DataCleanerRun.objects.filter(pk=upload_obj.pk).update(
                        analysis_status=DataCleanerRun.AnalysisStatus.REANALYSIS if is_reanalysis else DataCleanerRun.AnalysisStatus.PROCESSING,
                    )
                    marked_processing = True
                    break
                except OperationalError as lock_err:
                    if attempt == 2:
                        logger.warning(
                            "Could not mark upload %s as PROCESSING due lock timeout: %s",
                            upload_obj.pk,
                            lock_err,
                        )
                    else:
                        time.sleep(0.15 * (attempt + 1))

            if not marked_processing:
                logger.info("Proceeding with stream for upload %s without immediate PROCESSING mark.", upload_obj.pk)
            upload_obj.analysis_status = DataCleanerRun.AnalysisStatus.REANALYSIS if is_reanalysis else DataCleanerRun.AnalysisStatus.PROCESSING
            
            # 4. Initialize DataProcessingService
            from .processing_service import DataProcessingService
            service = DataProcessingService(upload_obj, df)
            
            # 5. Return Streaming Response
            response = StreamingHttpResponse(
                service.run_generator(),
                content_type='text/event-stream'
            )
            response['Cache-Control'] = 'no-cache'
            response['X-Accel-Buffering'] = 'no' # Disable buffering for Nginx
            origin = request.headers.get('Origin')
            if origin:
                response['Access-Control-Allow-Origin'] = origin
                response['Vary'] = 'Origin'
            return response

        except Exception as e:
            logger.exception(f"Critical error in ProcessStreamView: {e}")
            if upload_obj is not None:
                try:
                    DataCleanerRun.objects.filter(pk=upload_obj.pk).update(
                        analysis_status=DataCleanerRun.AnalysisStatus.FAILED,
                    )
                    if payload_obj:
                        payload_obj.error_log = [str(e)]
                        payload_obj.save(update_fields=['error_log'])
                except Exception:
                    logger.exception('Failed to mark upload %s as FAILED after stream error.', upload_obj.pk)
            return StreamingHttpResponse(f"Server Error: {str(e)}", status=500)

