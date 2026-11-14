"""Canonical content.js: reading it for import and building it for export (PLAN-044, stages 3–4).

The public site loads `window.schoolContent = {…};`; `build.mjs` validates it and renders the HTML.
Export writes the same structure back so a published file can be imported again without loss.

Photos preserve imported asset paths or export sanitized uploads under content-addressed names.
collect_photo_files() returns bytes for publication without changing working files.
"""
import json
import re
import hashlib
from pathlib import Path
from html.parser import HTMLParser

from django.conf import settings
from django.core.exceptions import SuspiciousFileOperation, ValidationError
from django.core.management.base import CommandError
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from .media import normalize_image

from .models import (AdmissionsTelegram, CashbackRule, CashbackTier, Contacts, Course, CourseSkill, Event, Faq, Location,
                     MapLink, PageText, Phone, Practice, SiteSettings, Stat, StudentResult, Teacher, Translation,
                     photo_path_validator, validate_https_site_url)

PREFIX = 'window.schoolContent = '
BANNER = '// Данные сайта. Публикуются из админки (PLAN-044); при ручной правке затем запустить node build.mjs.\n'

# Everything import_content replaces; order is also the deletion order for children before parents.
CONTENT_MODELS = (CashbackTier, CashbackRule, CourseSkill, Course, Stat, Teacher, StudentResult, Event, Practice,
                  MapLink, Location, Phone, AdmissionsTelegram, Contacts, SiteSettings, Faq, PageText)


class _PageTextParser(HTMLParser):
    """Read explicitly marked text slots and attributes; no scripts or markup are evaluated."""
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.slots = {}
        self.frames = []

    def put(self, key, value):
        if not key or not re.fullmatch(r'[a-z0-9._-]+', key):
            return
        value = value.strip()
        if not value:
            return
        if key in self.slots and self.slots[key] != value:
            raise CommandError(f'Разным надписям назначен один код текста: {key}.')
        self.slots[key] = value

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for attribute in ('placeholder', 'title', 'aria-label', 'alt'):
            if f'data-text-{attribute}' in attrs:
                self.put(attrs[f'data-text-{attribute}'], attrs.get(attribute) or '')
        key = attrs.get('data-text')
        if tag == 'meta':
            self.put(key, attrs.get('content') or '')
        if tag not in self.VOID:
            self.frames.append([tag, key, []])

    def handle_data(self, data):
        for _tag, key, parts in self.frames:
            if key:
                parts.append(data)

    def handle_endtag(self, tag):
        for index in range(len(self.frames) - 1, -1, -1):
            if self.frames[index][0] == tag:
                _tag, key, parts = self.frames[index]
                self.put(key, ''.join(parts))
                del self.frames[index:]
                break


def read_page_texts(site_root):
    """Read slots from available site pages next to an imported content.js, in page order."""
    slots = {}
    for name in ('index.html', 'results.html', 'career.html', 'teachers.html'):
        path = Path(site_root) / name
        if not path.is_file():
            continue
        parser = _PageTextParser()
        parser.feed(path.read_text(encoding='utf-8'))
        for key, value in parser.slots.items():
            if key in slots and slots[key] != value:
                raise CommandError(f'Разным надписям назначен один код текста: {key}.')
            slots[key] = value
    return slots


def sync_page_texts(site_root):
    """Add newly introduced editable slots, preserving every saved draft and Uzbek translation."""
    created = 0
    for order, (key, value) in enumerate(read_page_texts(site_root).items()):
        if len(key) > 60 or len(value) > 800:
            raise CommandError(f'Код или надпись слишком длинные: {key}.')
        _obj, added = PageText.objects.get_or_create(key=key, defaults={'text': value, 'order': order})
        created += added
    return created


def read_content(path):
    """Parse a content.js file into its data dict; raises CommandError with a readable message."""
    try:
        text = Path(path).read_text(encoding='utf-8')
    except OSError as error:
        raise CommandError(f'Не удалось прочитать {path}: {error.strerror or error}') from error
    if PREFIX not in text:
        raise CommandError(f'{path}: не найден {PREFIX.strip()}')
    body = text[text.index(PREFIX) + len(PREFIX):].rstrip()
    try:
        return json.loads(body[:body.rindex(';')])
    except (ValueError, json.JSONDecodeError) as error:
        raise CommandError(f'{path}: некорректный JSON ({error})') from error


def write_content(data, path):
    """Write the canonical one-statement content.js (2-space JSON, stable key order)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(BANNER + PREFIX + json.dumps(data, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8',
                    newline='\n')


def _singleton(model, label):
    """Read a one-record table without the get_or_create side effect: export must not write to the database."""
    try:
        return model.objects.get(pk=1)
    except model.DoesNotExist as error:
        raise CommandError(f'В базе нет записи «{label}»: сначала выполните import_content.') from error


def _cashback_data():
    cashback = {}
    for exam, _label in CashbackTier.EXAMS:
        tiers = []
        for tier in CashbackTier.objects.filter(exam=exam):
            item = {'score': tier.score, 'reward': tier.reward}
            if tier.label:
                item['label'] = tier.label
            if tier.hero:
                item['hero'] = True
            tiers.append(item)
        if tiers:
            cashback[exam] = tiers
    rules = [{'title': rule.title, 'text': rule.text} for rule in CashbackRule.objects.all()]
    if rules:
        cashback['rules'] = rules
    return cashback or None


def _courses_data():
    courses = []
    for course in Course.objects.filter(is_published=True):
        item = {'name': course.name}
        if course.subtitle:
            item['subtitle'] = course.subtitle
        item.update({
            'category': course.category,
            'description': course.description,
            'skills': list(course.skills.values_list('text', flat=True)),
            'price': course.price,
        })
        item.update({'target': course.target, 'id': course.slug})
        courses.append(item)
    return courses


def _photo_data(obj, files=None):
    """Uploads always become bounded JPEGs; arbitrary names and metadata never leave storage."""
    if not obj.photo:
        if obj.photo_path:
            try:
                photo_path_validator(obj.photo_path)
            except ValidationError as error:
                raise CommandError('Недопустимый путь фото в содержимом сайта.') from error
        return obj.photo_path
    try:
        with obj.photo.open('rb') as source:
            raw = source.read(settings.MAX_UPLOAD_BYTES + 1)
        encoded = normalize_image(raw)
    except (OSError, ValueError, SyntaxError, SuspiciousFileOperation, ValidationError) as error:
        raise CommandError(f'Не удалось подготовить фото «{obj}»: загрузите исправный JPG, PNG или WebP до 5 МБ.') from error
    path = f'assets/uploads/{hashlib.sha256(encoded).hexdigest()}.jpg'
    if files is not None:
        files[path] = encoded
    return path


def collect_photo_files():
    """Return {asset path: sanitized JPEG bytes} for photos needed by published content."""
    files = {}
    for obj in [*Teacher.objects.filter(is_published=True), *Practice.objects.filter(is_published=True), *Location.objects.all()]:
        _photo_data(obj, files)
    return files


def _teachers_data(photo_files=None):
    teachers = []
    for teacher in Teacher.objects.filter(is_published=True):
        item = {'name': teacher.name, 'role': teacher.role}
        if teacher.qualification:
            item['qualification'] = teacher.qualification
        if teacher.experience:
            item['experience'] = teacher.experience
        if teacher.featured:
            item['featured'] = True
        photo = _photo_data(teacher, photo_files)
        if photo:
            item['photo'] = photo
        teachers.append(item)
    return teachers


def _results_data():
    results = []
    for result in StudentResult.objects.filter(is_published=True):
        item = {'score': result.score, 'exam': result.exam}
        if result.level:
            item['level'] = result.level
        item.update({'quote': result.quote, 'student': result.student})
        if result.course:
            item['course'] = result.course
        if result.consent:
            item['consent'] = True
        if result.featured:
            item['featured'] = True
        results.append(item)
    return results


def _practices_data(photo_files=None):
    practices = []
    for practice in Practice.objects.filter(is_published=True):
        item = {'id': practice.slug, 'title': practice.title, 'description': practice.description}
        if practice.label:
            item['label'] = practice.label
        photo = _photo_data(practice, photo_files)
        if photo:
            item['photo'] = photo
        if practice.photo_alt:
            item['photoAlt'] = practice.photo_alt
        practices.append(item)
    return practices


def _contacts_data(photo_files=None):
    contacts = _singleton(Contacts, 'Контакты')
    data = {
        'verified': contacts.verified,
        'phones': list(contacts.phones.values_list('number', flat=True)),
        'telegrams': list(contacts.telegrams.values_list('url', flat=True)),
    }
    if contacts.hr_telegram:
        data['hrTelegram'] = contacts.hr_telegram
    if contacts.instagram:
        data['instagram'] = contacts.instagram
    locations = []
    for location in Location.objects.all():
        item = {'id': location.slug, 'name': location.name, 'address': location.address}
        if location.longitude is not None and location.latitude is not None:
            item['coordinates'] = [float(location.longitude), float(location.latitude)]
        if location.google_embed:
            item['googleEmbed'] = location.google_embed
        photo = _photo_data(location, photo_files)
        if photo:
            item['photo'] = photo
        item['maps'] = [{'provider': link.provider, 'url': link.url} for link in location.maps.all()]
        locations.append(item)
    data['locations'] = locations
    return data


def build_content(photo_files=None):
    """Collect the database into the canonical content.js structure (not yet validated)."""
    settings = _singleton(SiteSettings, 'Настройки сайта')
    data = {
        'site': {'url': settings.site_url, 'city': settings.city, 'demoMode': settings.demo_mode,
                 'demoLabels': settings.demo_labels},
        'stats': [{'value': stat.value, 'label': stat.label} for stat in Stat.objects.all()],
    }
    cashback = _cashback_data()
    if cashback:
        data['cashback'] = cashback
    data['courses'] = _courses_data()
    data['teachers'] = _teachers_data(photo_files)
    data['results'] = _results_data()
    data['practices'] = _practices_data(photo_files)
    events = []
    for event in Event.objects.filter(is_published=True):
        item = {'title': event.title, 'startsAt': event.starts_at.isoformat()}
        if event.description:
            item['description'] = event.description
        if event.url:
            item['url'] = event.url
        events.append(item)
    if events:
        data['events'] = events
    data['contacts'] = _contacts_data(photo_files)
    faq = [{'question': item.question, 'answer': item.answer} for item in Faq.objects.filter(is_published=True)]
    if faq:
        data['faq'] = faq
    texts = {item.key: item.text for item in PageText.objects.all()}
    if texts:
        data['texts'] = texts
    return data


def validate_content(data):
    """Catch the publication rules that model validation cannot see (e.g. contacts created empty)."""
    problems = []
    site_url = (data.get('site') or {}).get('url') or ''
    try:
        validate_https_site_url(site_url)
    except ValidationError as error:
        problems.extend(error.messages)
    contacts = data.get('contacts') or {}
    if contacts.get('verified'):
        telegrams = [url.lower() for url in contacts.get('telegrams') or []]
        if not contacts.get('phones') and not telegrams:
            problems.append('Подтвержденные контакты без телефона и Telegram не публикуются.')
        if contacts.get('hrTelegram') and contacts['hrTelegram'].lower() in telegrams:
            problems.append('Telegram для работы совпадает с Telegram для записи.')
    if not data.get('courses'):
        problems.append('Опубликуйте хотя бы один курс.')
    practices = data.get('practices', [])
    if not isinstance(practices, list) or len(practices) > 100:
        problems.append('Практика вне уроков должна быть списком до 100 занятий.')
    else:
        seen = set()
        for item in practices:
            try:
                if not isinstance(item, dict) or item.get('id') in seen:
                    raise ValueError('Коды занятий должны быть уникальными.')
                practice = Practice(slug=item.get('id', ''), title=item.get('title', ''),
                                    description=item.get('description', ''), label=item.get('label', ''),
                                    photo_path=item.get('photo', ''), photo_alt=item.get('photoAlt', ''))
                if not practice.slug:
                    raise ValueError('У занятия нужен код.')
                practice.full_clean(validate_unique=False)
                seen.add(practice.slug)
            except (ValidationError, ValueError, TypeError) as error:
                problems.append('Некорректное занятие: ' + str(error))
    events = data.get('events', [])
    if not isinstance(events, list):
        problems.append('События должны быть списком.')
    else:
        for item in events:
            try:
                if not isinstance(item, dict) or not isinstance(item.get('startsAt'), str):
                    raise ValueError('У события нужна дата с часовым поясом.')
                starts_at = parse_datetime(item['startsAt'])
                if starts_at is None or timezone.is_naive(starts_at):
                    raise ValueError('У события нужна дата с часовым поясом.')
                Event(title=item.get('title', ''), description=item.get('description', ''),
                      starts_at=starts_at, url=item.get('url', '')).full_clean()
            except (ValidationError, ValueError, TypeError) as error:
                problems.append('Некорректное событие: ' + str(error))
    for course in data.get('courses') or []:
        if not course.get('skills') or any(not skill.strip() for skill in course['skills']):
            problems.append(f'У курса «{course.get("name", "")}» нужен хотя бы один пункт программы.')
    for location in contacts.get('locations') or []:
        if not location.get('maps'):
            problems.append(f'У филиала «{location.get("name", "")}» нужна ссылка на карту.')
    if not (data.get('site') or {}).get('demoMode'):
        if any(not result.get('consent') for result in data.get('results') or []):
            problems.append('Для публикации результатов студентов нужно согласие.')
    if problems:
        raise CommandError('content.js не пройдет публикацию: ' + '; '.join(problems))


# --- Translation dictionaries (assets/i18n/{uz,kaa}.js) -------------------------------------------------------
# The site script reads `strings: { "русский текст": "o‘zbekcha" }` and a hand-written `patterns` list for texts
# with numbers. The admin owns only the strings block; patterns and the rest of the file are left untouched.
UZ_BLOCK = re.compile(r'(\bstrings:\s*\{\n)([\s\S]*?)(\n  \},\s*\n(?:\s*//[^\n]*\n)*\s*patterns:)')
_JS_STRING = r"""'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*\""""
UZ_PAIR = re.compile(rf'({_JS_STRING})\s*:\s*({_JS_STRING})')
TRANSLATION_LANGUAGES = ('uz', 'kaa')


def normalize_text(value):
    """Texts are matched the way script.js does it: trimmed, with runs of whitespace collapsed."""
    return ' '.join((value or '').split())


def _unquote_js(literal):
    if literal.startswith('"'):
        return json.loads(literal)
    inner = literal[1:-1].replace("\\'", "'")
    inner = re.sub(r'(?<!\\)"', r'\\"', inner)
    return json.loads(f'"{inner}"')


def read_translation_strings(path):
    """Read Russian → translated pairs while leaving the handwritten dynamic patterns alone."""
    try:
        text = Path(path).read_text(encoding='utf-8')
    except OSError as error:
        raise CommandError(f'Не удалось прочитать {path}: {error.strerror or error}') from error
    block = UZ_BLOCK.search(text)
    if not block:
        raise CommandError(f'{path}: не найден блок strings: {{ … }} перед patterns.')
    body = '\n'.join(line for line in block.group(2).split('\n') if not line.lstrip().startswith('//'))
    try:
        return {_unquote_js(key): _unquote_js(value) for key, value in UZ_PAIR.findall(body)}
    except (ValueError, json.JSONDecodeError) as error:
        raise CommandError(f'{path}: не удалось разобрать словарь ({error})') from error


def write_translation_strings(path, strings):
    """Replace only strings; patterns and other JavaScript remain untouched."""
    path = Path(path)
    text = path.read_text(encoding='utf-8')
    if not UZ_BLOCK.search(text):
        raise CommandError(f'{path}: не найден блок strings: {{ … }} перед patterns.')
    lines = ',\n'.join(f'    {json.dumps(key, ensure_ascii=False)}: {json.dumps(value, ensure_ascii=False)}'
                       for key, value in strings.items())
    note = '    // Этот блок собирает админка (тексты страницы, вопросы, переводы); правьте переводы там.\n'
    path.write_text(UZ_BLOCK.sub(lambda match: match.group(1) + note + lines + match.group(3), text, count=1),
                    encoding='utf-8', newline='\n')


def _translation_language(language):
    if language not in TRANSLATION_LANGUAGES:
        raise ValueError('Неподдерживаемый язык перевода.')
    return language


def build_translation_strings(language):
    """General translations first; dedicated page text and FAQ fields win on conflicts."""
    language = _translation_language(language)
    strings = {normalize_text(item.source): getattr(item, language).strip() for item in Translation.objects.all()}
    for item in PageText.objects.exclude(**{language: ''}):
        strings[normalize_text(item.text)] = getattr(item, language).strip()
    for item in Faq.objects.all():
        for field in ('question', 'answer'):
            value = getattr(item, f'{field}_{language}').strip()
            if value:
                strings[normalize_text(getattr(item, field))] = value
    return {key: value for key, value in strings.items() if key and value}


def load_translation_strings(strings, language, *, overwrite=True):
    """Import one language without deleting omitted drafts or changing the other language.

    overwrite=False seeds a new language pack while preserving every existing owner translation.
    """
    language = _translation_language(language)
    strings = {normalize_text(key): value.strip() for key, value in strings.items()
               if isinstance(key, str) and isinstance(value, str) and key.strip() and value.strip()
               and len(normalize_text(key)) <= 800 and len(value.strip()) <= 800}
    used = set()
    page_texts = 0
    for item in PageText.objects.all():
        key = normalize_text(item.text)
        if key in strings:
            if overwrite or not getattr(item, language).strip():
                setattr(item, language, strings[key])
                item.save(update_fields=[language])
            used.add(key)
            page_texts += 1
    for item in Faq.objects.all():
        updated = []
        for field in ('question', 'answer'):
            key = normalize_text(getattr(item, field))
            translated_field = f'{field}_{language}'
            if key in strings:
                limit = item._meta.get_field(translated_field).max_length
                if len(strings[key]) > limit:
                    raise CommandError(f'Перевод вопроса или ответа слишком длинный: {key[:60]}.')
                if overwrite or not getattr(item, translated_field).strip():
                    setattr(item, translated_field, strings[key])
                    updated.append(translated_field)
                used.add(key)
        if updated:
            item.save(update_fields=updated)
    rest = {key: value for key, value in strings.items() if key not in used}
    for key, value in rest.items():
        item, created = Translation.objects.get_or_create(source=key, defaults={language: value})
        if not created and (overwrite or not getattr(item, language).strip()):
            setattr(item, language, value)
            item.save(update_fields=[language])
    return {'page_texts': page_texts, 'translations': len(rest)}


def missing_translations(language):
    """Counts of dedicated admin texts that will stay Russian in the selected language."""
    language = _translation_language(language)
    return {
        'page_texts': PageText.objects.filter(**{language: ''}).exclude(text__regex=r'^[^А-Яа-яЁё]*$').count(),
        'faq': sum(1 for item in Faq.objects.filter(is_published=True)
                   if not getattr(item, f'question_{language}').strip() or not getattr(item, f'answer_{language}').strip()),
    }


# Keep the established Uzbek API for older integrations and tests.
read_uz_strings = read_translation_strings
write_uz_strings = write_translation_strings


def build_uz_strings():
    return build_translation_strings('uz')


def load_uz_strings(strings):
    return load_translation_strings(strings, 'uz')


def missing_uz():
    return missing_translations('uz')
