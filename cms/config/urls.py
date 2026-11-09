from django.conf import settings
from django.contrib import admin
from django.contrib.staticfiles.views import serve as serve_static
from django.urls import path, re_path
from django.views.static import serve as serve_media

from config.views import healthz

urlpatterns = [
    path('healthz', healthz),  # must stay unauthenticated and outside the secret admin path
    path(settings.ADMIN_PATH, admin.site.urls),
]
if settings.LOCAL or not settings.WHITENOISE_AVAILABLE:
    # Local preview runs without DEBUG, so serve static files explicitly; production uses WhiteNoise.
    urlpatterns.append(re_path(r'^%s(?P<path>.*)$' % settings.STATIC_URL.lstrip('/'), serve_static, {'insecure': True}))
# Photos from the admin are low-traffic, so Django serves them even in production (WhiteNoise is static-only).
urlpatterns.append(re_path(r'^%s(?P<path>.*)$' % settings.MEDIA_URL.lstrip('/'), serve_media,
                           {'document_root': settings.MEDIA_ROOT}))
