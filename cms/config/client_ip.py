"""The visitor's address for the brute-force lock (django-axes).

Railway puts its proxy in front of the admin, so REMOTE_ADDR is the proxy's address, shared by everybody. Only when
DJANGO_TRUST_PROXY_HOPS says how many trusted proxies stand in front (1 on Railway) is the address taken from
X-Forwarded-For, counting from the nearest proxy: a forged leftmost value can never choose the key.
"""
import ipaddress
import os

from django.core.exceptions import ImproperlyConfigured


def trusted_proxy_hops():
    value = os.environ.get('DJANGO_TRUST_PROXY_HOPS', '0')
    if not value.isdigit() or int(value) > 10:
        raise ImproperlyConfigured('DJANGO_TRUST_PROXY_HOPS must be an integer from 0 to 10')
    return int(value)


def _is_ip(value):
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return False


def client_ip(request, hops=None):
    remote = request.META.get('REMOTE_ADDR') or ''
    hops = trusted_proxy_hops() if hops is None else hops
    if hops == 0:
        return remote
    forwarded = [part.strip() for part in request.META.get('HTTP_X_FORWARDED_FOR', '').split(',') if part.strip()]
    chain = [*forwarded, remote]
    if len(chain) <= hops or not all(_is_ip(part) for part in forwarded):
        return remote
    return chain[-1 - hops]
