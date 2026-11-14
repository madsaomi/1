from django.conf import settings
from django.contrib import admin
from django.contrib.staticfiles.views import serve as serve_static
from django.urls import path, re_path

from config.views import healthz, private_media

urlpatterns = [
    path('healthz', healthz),  # must stay unauthenticated and outside the secret admin path
    path(settings.ADMIN_PATH, admin.site.urls),
]
if settings.LOCAL or not settings.WHITENOISE_AVAILABLE:
    # Local preview runs without DEBUG, so serve static files explicitly; production uses WhiteNoise.
    urlpatterns.append(re_path(r'^%s(?P<path>.*)$' % settings.STATIC_URL.lstrip('/'), serve_static, {'insecure': True}))
# Draft photos are private. The public site gets only sanitized copies at assets/uploads/ on publication.
urlpatterns.append(re_path(r'^%s(?P<path>.*)$' % settings.MEDIA_URL.lstrip('/'), private_media))
