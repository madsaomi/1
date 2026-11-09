"""Canonical content.js: reading it for import and building it for export (PLAN-044, stages 3–4).

The public site loads `window.schoolContent = {…};`; `build.mjs` validates it and renders the HTML.
Export writes the same structure back so a published file can be imported again without loss.

Photos are deliberately NOT part of content.js: `Location.photo` and `Teacher.photo` are admin-only
uploads. Stage 4 (publishing through the GitHub API) must copy them into the site's `assets/`
directory and reference them from content.js; that step is not implemented here.
"""
import json
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.management.base import CommandError

from .models import (AdmissionsTelegram, CashbackRule, CashbackTier, Contacts, Course, CourseSkill, Location, MapLink,
                     Phone, SiteSettings, Stat, StudentResult, Teacher, validate_https_site_url)

PREFIX = 'window.schoolContent = '
BANNER = '// Данные сайта. Публикуются из админки (PLAN-044); при ручной правке затем запустить node build.mjs.\n'

# Everything import_content replaces; order is also the deletion order for children before parents.
CONTENT_MODELS = (CashbackTier, CashbackRule, CourseSkill, Course, Stat, Teacher, StudentResult,
                  MapLink, Location, Phone, AdmissionsTelegram, Contacts, SiteSettings)


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
    path.write_text(BANNER + PREFIX + json.dumps(data, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')


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


def _teachers_data():
    teachers = []
    for teacher in Teacher.objects.filter(is_published=True):
        item = {'name': teacher.name, 'role': teacher.role}
        if teacher.qualification:
            item['qualification'] = teacher.qualification
        if teacher.experience:
            item['experience'] = teacher.experience
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
        results.append(item)
    return results


def _contacts_data():
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
        item['maps'] = [{'provider': link.provider, 'url': link.url} for link in location.maps.all()]
        locations.append(item)
    data['locations'] = locations
    return data


def build_content():
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
    data['teachers'] = _teachers_data()
    data['results'] = _results_data()
    data['contacts'] = _contacts_data()
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
    if problems:
        raise CommandError('content.js не пройдет публикацию: ' + '; '.join(problems))
