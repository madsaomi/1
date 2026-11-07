"""Address of the public site for the «На главную» button on error pages.

Error pages also render without a request context (500), so a template tag reads the address itself:
PUBLIC_SITE_URL from the environment, else site.url from the published content.js. Only HTTPS
addresses are used; anything else hides the button rather than breaking the error page.
"""
import os
from functools import lru_cache

from django import template
from django.conf import settings

register = template.Library()


@lru_cache(maxsize=1)
def _site_url():
    url = os.environ.get('PUBLIC_SITE_URL', '').strip()
    if not url:
        try:
            from content.management.commands.import_content import read_content
            url = str((read_content(settings.SITE_ROOT / 'content.js').get('site') or {}).get('url') or '')
        except Exception:  # an error page must render even if content.js is missing or malformed
            url = ''
    return url if url.startswith('https://') else ''


@register.simple_tag
def public_site_url():
    return _site_url()
