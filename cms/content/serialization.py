"""Canonical content.js: reading it for import and building it for export (PLAN-044, stages 3–4).

The public site loads `window.schoolContent = {…};`; `build.mjs` validates it and renders the HTML.
Export writes the same structure back so a published file can be imported again without loss.

Photos preserve imported asset paths or export sanitized uploads under content-addressed names.
collect_photo_files() returns bytes for publication without changing working files.
"""
import json
import re
import hashlib
import io
import warnings
from pathlib import Path
from html.parser import HTMLParser

from PIL import Image, ImageOps, UnidentifiedImageError
from django.conf import settings
from django.core.exceptions import SuspiciousFileOperation, ValidationError
from django.core.management.base import CommandError

from .models import (AdmissionsTelegram, CashbackRule, CashbackTier, Contacts, Course, CourseSkill, Faq, Location,
                     MapLink, PageText, Phone, SiteSettings, Stat, StudentResult, Teacher, Translation,
                     photo_path_validator, validate_https_site_url)

PREFIX = 'window.schoolContent = '
BANNER = '// Данные сайта. Публикуются из админки (PLAN-044); при ручной правке затем запустить node build.mjs.\n'

# Everything import_content replaces; order is also the deletion order for children before parents.
CONTENT_MODELS = (CashbackTier, CashbackRule, CourseSkill, Course, Stat, Teacher, StudentResult,
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
        if course.special_price is not None:
            item['specialPrice'] = course.special_price
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
        if len(raw) > settings.MAX_UPLOAD_BYTES:
            raise ValueError('Фото превышает допустимый размер.')
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as probe:
                if probe.format not in {'JPEG', 'PNG', 'WEBP'} or probe.width * probe.height > 16_000_000:
                    raise ValueError('Недопустимый формат или слишком большое разрешение фото.')
                probe.verify()
            with Image.open(io.BytesIO(raw)) as source:
                image = ImageOps.exif_transpose(source)
                image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
                if image.mode in {'RGBA', 'LA'} or 'transparency' in image.info:
                    rgba = image.convert('RGBA')
                    clean = Image.new('RGB', image.size, 'white')
                    clean.paste(rgba, mask=rgba.getchannel('A'))
                else:
                    clean = image.convert('RGB')
                output = io.BytesIO()
                clean_image = Image.new('RGB', clean.size)
                clean_image.paste(clean)
                clean_image.save(output, 'JPEG', quality=88, optimize=True)
                encoded = output.getvalue()
    except (OSError, ValueError, SyntaxError, SuspiciousFileOperation, UnidentifiedImageError, Image.DecompressionBombError,
            Image.DecompressionBombWarning) as error:
        raise CommandError(f'Не удалось подготовить фото «{obj}»: загрузите исправный JPG, PNG или WebP до 5 МБ.') from error
    path = f'assets/uploads/{hashlib.sha256(encoded).hexdigest()}.jpg'
    if files is not None:
        files[path] = encoded
    return path


def collect_photo_files():
    """Return {asset path: sanitized JPEG bytes} for photos needed by published content."""
    files = {}
    for obj in [*Teacher.objects.filter(is_published=True), *Location.objects.all()]:
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


# --- Uzbek dictionary (assets/i18n/uz.js) -----------------------------------------------------------------------
# The site script reads `strings: { "русский текст": "o‘zbekcha" }` and a hand-written `patterns` list for texts
# with numbers. The admin owns only the strings block; patterns and the rest of the file are left untouched.
UZ_BLOCK = re.compile(r'(\bstrings:\s*\{\n)([\s\S]*?)(\n  \},\s*\n(?:\s*//[^\n]*\n)*\s*patterns:)')
_JS_STRING = r"""'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*\""""
UZ_PAIR = re.compile(rf'({_JS_STRING})\s*:\s*({_JS_STRING})')


def normalize_text(value):
    """Texts are matched the way script.js does it: trimmed, with runs of whitespace collapsed."""
    return ' '.join((value or '').split())


def _unquote_js(literal):
    if literal.startswith('"'):
        return json.loads(literal)
    inner = literal[1:-1].replace("\\'", "'")
    inner = re.sub(r'(?<!\\)"', r'\\"', inner)
    return json.loads(f'"{inner}"')


def read_uz_strings(path):
    """Russian → Uzbek pairs from the strings block of uz.js."""
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


def write_uz_strings(path, strings):
    """Replace only the strings block of uz.js; a file without that block is left alone and reported."""
    path = Path(path)
    text = path.read_text(encoding='utf-8')
    if not UZ_BLOCK.search(text):
        raise CommandError(f'{path}: не найден блок strings: {{ … }} перед patterns.')
    lines = ',\n'.join(f'    {json.dumps(key, ensure_ascii=False)}: {json.dumps(value, ensure_ascii=False)}'
                       for key, value in strings.items())
    note = '    // Этот блок собирает админка (тексты страницы, вопросы, переводы); правьте переводы там.\n'
    path.write_text(UZ_BLOCK.sub(lambda match: match.group(1) + note + lines + match.group(3), text, count=1),
                    encoding='utf-8', newline='\n')


def build_uz_strings():
    """Every Russian → Uzbek pair the admin knows: general translations first, page texts and FAQ win on conflict."""
    strings = {normalize_text(item.source): item.uz.strip() for item in Translation.objects.all()}
    for item in PageText.objects.exclude(uz=''):
        strings[normalize_text(item.text)] = item.uz.strip()
    for item in Faq.objects.all():
        if item.question_uz.strip():
            strings[normalize_text(item.question)] = item.question_uz.strip()
        if item.answer_uz.strip():
            strings[normalize_text(item.answer)] = item.answer_uz.strip()
    return {key: value for key, value in strings.items() if key and value}


def load_uz_strings(strings):
    """Spread an imported dictionary over the admin: page texts and FAQ get their own field, the rest become
    general translations. Returns how many pairs went where."""
    used = set()
    page_texts = 0
    for item in PageText.objects.all():
        key = normalize_text(item.text)
        if key in strings:
            item.uz = strings[key]
            item.save(update_fields=['uz'])
            used.add(key)
            page_texts += 1
    for item in Faq.objects.all():
        question, answer = normalize_text(item.question), normalize_text(item.answer)
        item.question_uz = strings.get(question, '')
        item.answer_uz = strings.get(answer, '')
        item.save(update_fields=['question_uz', 'answer_uz'])
        used.update(key for key in (question, answer) if key in strings)
    Translation.objects.all().delete()
    rest = [Translation(source=key, uz=value) for key, value in strings.items()
            if key not in used and key.strip() and value.strip() and len(key) <= 800 and len(value) <= 800]
    Translation.objects.bulk_create(rest)
    return {'page_texts': page_texts, 'translations': len(rest)}


def missing_uz():
    """Counts of admin texts that will stay Russian on the Uzbek version."""
    return {
        'page_texts': PageText.objects.filter(uz='').exclude(text__regex=r'^[^А-Яа-яЁё]*$').count(),
        'faq': sum(1 for item in Faq.objects.filter(is_published=True)
                   if not item.question_uz.strip() or not item.answer_uz.strip()),
    }
