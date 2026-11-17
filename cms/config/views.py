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


@never_cache
def backup(request, kind):
    """Backup download for the nightly GitHub workflow, protected by BACKUP_TOKEN; without the token it does not exist."""
    import hmac
    import json
    import tempfile
    from django.http import FileResponse
    from content.backup import dump_database, media_manifest, write_media_tar

    token = settings.BACKUP_TOKEN
    supplied = request.headers.get('Authorization', '').removeprefix('Bearer ').strip()
    if request.method != 'GET' or not token or not hmac.compare_digest(supplied.encode(), token.encode()):
        raise Http404
    if kind == 'db':
        response = HttpResponse(dump_database(), content_type='application/gzip')
        response['Content-Disposition'] = 'attachment; filename="database.json.gz"'
        return response
    if kind == 'media-manifest':
        return HttpResponse(json.dumps(media_manifest()), content_type='application/json')
    if kind == 'media':
        archive = tempfile.TemporaryFile()
        write_media_tar(archive)
        archive.seek(0)
        return FileResponse(archive, as_attachment=True, filename='media.tar', content_type='application/x-tar')
    raise Http404
