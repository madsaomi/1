from django.http import HttpResponse


def healthz(request):
    """Unauthenticated load-balancer probe: answers plain «ok», never a redirect or an admin page."""
    return HttpResponse('ok', content_type='text/plain; charset=utf-8')
