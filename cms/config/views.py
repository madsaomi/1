from pathlib import Path

from django.conf import settings
from django.contrib import admin
from django.http import Http404, HttpResponse
from django.views.decorators.cache import never_cache
from django.views.static import serve


def healthz(request):
    """Unauthenticated load-balancer probe: answers plain «ok», never a redirect or an admin page."""
    return HttpResponse('ok', content_type='text/plain; charset=utf-8')


@never_cache
def private_media(request, path):
    """Draft uploads belong to the verified admin; publication creates separate public copies."""
    if not admin.site.has_permission(request):
        raise Http404
    root = Path(settings.MEDIA_ROOT).resolve()
    try:
        target = (root / path).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            raise Http404
    except (OSError, ValueError):
        raise Http404 from None
    return serve(request, path, document_root=root, show_indexes=False)
