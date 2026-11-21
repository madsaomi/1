"""{% site_guide opts %} — the «Что это и где на сайте» box at the top of each content section (content.admin_guide)."""
from django import template

from content.admin_guide import GUIDE

register = template.Library()


@register.inclusion_tag('admin/includes/site_guide.html')
def site_guide(opts):
    return {'guide': GUIDE.get(opts.object_name) if opts else None}
