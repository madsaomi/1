"""Dependency-free structural checks for the shipped static HTML, not a browser test."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.anchors, self.labels, self.files = [], [], [], []
        self.stack, self.errors = [], []
        self.h1 = 0

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag not in VOID:
            self.stack.append(tag)
        if tag == 'h1':
            self.h1 += 1
        if 'id' in values:
            self.ids.append(values['id'])
        if values.get('href', '').startswith('#'):
            self.anchors.append(values['href'][1:])
        if tag == 'label' and 'for' in values:
            self.labels.append(values['for'])
        if tag in {'script', 'img', 'source', 'link'}:
            for key in ('src', 'srcset', 'href'):
                value = values.get(key, '').split('?')[0]
                if value and not value.startswith(('http:', 'https:', '#', 'data:')):
                    self.files.append(value)

    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1] != tag:
            self.errors.append(f'Unexpected closing tag: {tag}, stack: {self.stack[-3:]}')
        else:
            self.stack.pop()


def main():
    for filename in ('index.html', 'results.html', 'career.html', 'teachers.html'):
        page = Page()
        page.feed((ROOT / filename).read_text(encoding='utf-8'))
        assert not page.errors, (filename, page.errors)
        assert not page.stack, (filename, page.stack)
        assert page.h1 == 1, f'{filename}: Expected one H1'
        assert all(count == 1 for count in Counter(page.ids).values()), f'{filename}: Duplicate IDs'
        assert set(page.anchors + page.labels) <= set(page.ids), f'{filename}: Unresolved anchor or label'
        assert all((ROOT / path).is_file() for path in page.files), f'{filename}: Missing static resource'
        assert not {'team', 'quiz', 'reviews', 'comparison', 'schedule', 'floating-island'} & set(page.ids)
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    assert ('class="demo-banner"' in html) == ('class="demo-tag"' in html), 'Demo banner and «Пример» tags appear together'
    css = (ROOT / 'style.css').read_text(encoding='utf-8')
    assert css.count('{') == css.count('}'), 'Unbalanced CSS braces'
    assert css.count(':root {') == 1, 'Expected one token definition'
    # The requested multicolour map illustration has four scoped tokens; UI colours stay branded.
    palette_css = css
    for name, value in {'red': 'ea4335', 'blue': '4285f4', 'green': '34a853', 'yellow': 'fbbc04'}.items():
        palette_css = palette_css.replace(f'--map-{name}: #{value};', '')
    for match in re.finditer(r'#[0-9a-fA-F]{3,8}\b', palette_css):
        value = match[0][1:]
        value = ''.join(char * 2 for char in value) if len(value) in (3, 4) else value
        rgb = value[:6].lower()
        assert rgb == 'ffb703' or len({rgb[:2], rgb[2:4], rgb[4:6]}) == 1, f'Off-brand color: {rgb}'
    print('PASS: HTML nesting, IDs, anchors, resources, labels and brand palette')


if __name__ == '__main__':
    main()
