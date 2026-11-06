from django.conf import settings
from django.contrib import admin
from django.contrib.staticfiles.views import serve as serve_static
from django.urls import path, re_path
from django.views.static import serve as serve_media

urlpatterns = [path(settings.ADMIN_PATH, admin.site.urls)]
if settings.LOCAL:
    # Local preview runs without DEBUG, so serve files explicitly; production uses a proper file server (stage 5).
    urlpatterns += [
        re_path(r'^%s(?P<path>.*)$' % settings.STATIC_URL.lstrip('/'), serve_static, {'insecure': True}),
        re_path(r'^%s(?P<path>.*)$' % settings.MEDIA_URL.lstrip('/'), serve_media, {'document_root': settings.MEDIA_ROOT}),
    ]
