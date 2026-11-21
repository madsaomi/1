"""One table with every Russian text of the site next to its UZ / QQ / EN translations.

Rows come from the three places translations live: page texts (PageText), questions (Faq) and the general list
(Translation, for courses, people, contacts and buttons). Russian texts that are on the site but have no translation
yet appear as empty rows too; filling one creates its Translation. Uzbek is converted to the 2026 alphabet.
"""
import hashlib
import re
from dataclasses import dataclass

from django.db import transaction

from .models import Faq, PageText, Translation
from .serialization import build_content, normalize_text
from .uz_alphabet import to_2026

LANGUAGES = ('uz', 'kaa', 'en')
PAGE_SIZE = 50
CYRILLIC = re.compile('[А-Яа-яЁё]')
DATA_SECTIONS = {
    'courses': 'Курсы', 'teachers': 'Преподаватели', 'results': 'Результаты учеников', 'events': 'События',
    'practices': 'Практика вне уроков', 'contacts': 'Контакты и филиалы', 'stats': 'Цифры', 'cashback': 'Кэшбэк',
    'site': 'Настройки сайта',
}
OTHER_SECTION = 'Карточки и кнопки'
FAQ_SECTION = 'Вопросы и ответы'


@dataclass
class Row:
    key: str
    section: str
    source: str
    uz: str
    kaa: str
    en: str
    kind: str
    place: str = ''
    limit: int = 800

    @property
    def needs_translation(self):
        return bool(CYRILLIC.search(self.source or ''))

    def missing(self, language):
        return self.needs_translation and not (getattr(self, language) or '').strip()

    @property
    def cells(self):
        return [(getattr(self, language) or '', language) for language in LANGUAGES]


def site_strings():
    """Russian strings the admin data puts on the site (courses, people, contacts …), with their section."""
    found = {}

    def walk(value, section):
        if isinstance(value, str):
            text = normalize_text(value)
            if text and len(text) <= 800 and CYRILLIC.search(text):
                found.setdefault(text, section)
        elif isinstance(value, dict):
            for item in value.values():
                walk(item, section)
        elif isinstance(value, (list, tuple)):
            for item in value:
                walk(item, section)

    for key, value in build_content().items():
        if key not in ('texts', 'faq'):
            walk(value, DATA_SECTIONS.get(key, OTHER_SECTION))
    return found


def _new_key(text):
    return 'n' + hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]


def table_rows():
    rows = []
    page_texts = set()
    for item in PageText.objects.all():
        page_texts.add(normalize_text(item.text))
        rows.append(Row(f'p{item.pk}', item.get_section_display(), item.text, item.uz, item.kaa, item.en, 'page', item.place()))
    for item in Faq.objects.all():
        rows.append(Row(f'q{item.pk}', FAQ_SECTION, item.question, item.question_uz, item.question_kaa, item.question_en,
                        'faq-question', 'Вопрос', 160))
        rows.append(Row(f'a{item.pk}', FAQ_SECTION, item.answer, item.answer_uz, item.answer_kaa, item.answer_en,
                        'faq-answer', 'Ответ'))
    strings = site_strings()
    known = {}
    for item in Translation.objects.all():
        source = normalize_text(item.source)
        known[source] = item
        rows.append(Row(f't{item.pk}', strings.get(source, OTHER_SECTION), item.source, item.uz, item.kaa, item.en, 'translation'))
    for text, section in strings.items():
        if text not in known and text not in page_texts:
            rows.append(Row(_new_key(text), section, text, '', '', '', 'new', 'Ещё без перевода'))
    return rows


def sections(rows):
    seen = []
    for row in rows:
        if row.section not in seen:
            seen.append(row.section)
    return seen


def filter_rows(rows, *, query='', missing='', section=''):
    query = query.strip().lower()
    result = []
    for row in rows:
        if section and row.section != section:
            continue
        if missing in LANGUAGES and not row.missing(missing):
            continue
        if missing == 'any' and not any(row.missing(language) for language in LANGUAGES):
            continue
        if query and not any(query in (value or '').lower() for value in (row.source, row.uz, row.kaa, row.en)):
            continue
        result.append(row)
    return result


def missing_counts(rows):
    return {language: sum(row.missing(language) for row in rows) for language in LANGUAGES}


@transaction.atomic
def save_rows(post, rows):
    """Save the rows of the submitted page whose translations changed; returns (saved, errors)."""
    by_key = {row.key: row for row in rows}
    saved, errors = 0, []
    for key in post.getlist('row'):
        row = by_key.get(key)
        if row is None:
            continue
        values = {language: ' '.join((post.get(f'{key}-{language}') or '').split()) if row.kind != 'page' and row.kind != 'faq-answer'
                  else (post.get(f'{key}-{language}') or '').strip() for language in LANGUAGES}
        if values['uz']:
            values['uz'] = to_2026(values['uz'])
        if all(values[language] == (getattr(row, language) or '').strip() for language in LANGUAGES):
            continue
        too_long = [language for language in LANGUAGES if len(values[language]) > row.limit]
        if too_long:
            errors.append(f'«{row.source[:60]}»: перевод длиннее {row.limit} символов.')
            continue
        number = int(key[1:]) if key[0] in 'pqat' else None
        if row.kind == 'page':
            PageText.objects.filter(pk=number).update(**values)
        elif row.kind in ('faq-question', 'faq-answer'):
            field = 'question' if row.kind == 'faq-question' else 'answer'
            Faq.objects.filter(pk=number).update(**{f'{field}_{language}': values[language] for language in LANGUAGES})
        elif row.kind == 'translation':
            if any(values.values()):
                Translation.objects.filter(pk=number).update(**values)
            else:
                Translation.objects.filter(pk=number).delete()
        elif row.kind == 'new' and any(values.values()):
            Translation.objects.update_or_create(source=normalize_text(row.source), defaults=values)
        saved += 1
    return saved, errors
