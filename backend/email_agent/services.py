import os
import json
import logging
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

logger = logging.getLogger(__name__)

class EmailResponseService:
    """
    AI Email Response Agent powered by Google Gemini (Modern SDK).
    Generates human-like, professional email replies based on user context.
    """

    SYSTEM_PROMPT = """
    You are an elite, professional customer success agent for the Artificial Intelligence Operations Brain Platform.
    Your job is to read user inquiries and draft a warm, concise, and helpful reply.
    - Always reply in a professional but human tone.
    - Output strictly valid JSON with no markdown formatting.
    - Keys required: "subject" (string), "body" (string).
    """

    @staticmethod
    def generate_response(user_email: str, user_email_address: str,
                          conversation_history: str = "",
                          project_context: str = "") -> dict:
        """
        Generates a professional email response.

        Args:
            user_email: The incoming email content from the user.
            user_email_address: The sender's email address.
            conversation_history: Prior thread context (optional).
            project_context: Knowledge base context (optional).

        Returns:
            dict with 'subject' and 'body' keys.
        """

        if not genai or not os.getenv("GEMINI_API_KEY"):
            logger.warning("Gemini API key or SDK missing. Falling back to generic template.")
            return EmailResponseService._generate_fallback(user_email_address, user_email)

        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

        try:
            prompt = f"""
            {EmailResponseService.SYSTEM_PROMPT}

            Please draft an email response to the following query.
            Conversation Context: {conversation_history}
            Project Knowledge Base: {project_context}
            
            User Email Content:
            "{user_email}"
            """
            
            response = client.models.generate_content(
                model='gemini-2.0-flash', 
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
            
            output = json.loads(response.text)
            
            return {
                "to": user_email_address,
                "subject": output.get("subject", "Re: Your message to AI Ops Brain"),
                "body": output.get("body", "Thank you for reaching out. We will address your query shortly.")
            }
        except Exception as e:
            logger.error(f"Gemini API failure during email generation: {e}")
            return EmailResponseService._generate_fallback(user_email_address, user_email)

    @staticmethod
    def _generate_fallback(user_email_address: str, user_email: str) -> dict:
        """Fallback when Gemini is unavailable."""
        subject = "Re: Your Inquiry to AI Ops Brain Support"
        email_lower = user_email.lower()
        
        if 'price' in email_lower or 'cost' in email_lower:
            reply = "We offer flexible plans. Our team will reach out with a personalized quote."
        elif 'ingest' in email_lower or 'csv' in email_lower:
            reply = "Our Smart Ingest module natively supports CSV, Excel, and JSON files."
        else:
            reply = "Your message has been noted and forwarded to the appropriate team."

        body = f"Hi there,\n\n{reply}\n\nWarm regards,\nAI Ops Support Team"
        
        return {
            "to": user_email_address,
            "subject": subject,
            "body": body
        }
