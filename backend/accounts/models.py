from django.contrib.auth.models import User


class AdminUser(User):
	"""Proxy model for auth policy helpers used by login/signup endpoints."""

	class Meta:
		proxy = True
		verbose_name = 'Admin user'
		verbose_name_plural = 'Admin users'

	@classmethod
	def signup_allowed(cls):
		# Allow only first-account bootstrap signup.
		return not cls.objects.exists()
