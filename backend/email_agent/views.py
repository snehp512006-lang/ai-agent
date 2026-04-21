from rest_framework.views import APIView
from rest_framework.response import Response
from .services import EmailResponseService


class GenerateEmailResponseView(APIView):
    def post(self, request):
        user_email = request.data.get('user_email', '')
        user_email_address = request.data.get('user_email_address', '')
        conversation_history = request.data.get('conversation_history', '')
        project_context = request.data.get('project_context', '')

        if not user_email or not user_email_address:
            return Response({"error": "user_email and user_email_address are required."}, status=400)

        result = EmailResponseService.generate_response(
            user_email=user_email,
            user_email_address=user_email_address,
            conversation_history=conversation_history,
            project_context=project_context
        )
        return Response(result)
