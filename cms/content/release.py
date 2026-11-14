"""Conservative, explicit upgrade of existing content after the release schema migrations.

This is deliberately separate from first import and service startup. Only frozen,
recognizable sample records are removed; a complete content-only backup precedes
the transaction commit. No account, OTP device or environment data is serialized.
"""
import json
import os
from datetime import datetime, timezone
from uuid import uuid4

from django.apps import apps
from django.core import serializers
from django.core.management.base import CommandError
from django.db import transaction

from .media import media_root, safe_media_path
from .models import Location, PageText, Practice, SiteSettings, Stat, StudentResult, Teacher, Translation
from .serialization import (TRANSLATION_LANGUAGES, load_translation_strings, normalize_text, read_content,
                            read_page_texts, read_translation_strings, validate_content)


# Frozen identities from the original sample content, never inferred from current
# source data: an owner's new records must not become deletion candidates.
LEGACY_TEACHERS = (
    dict(name='Азиз Каримов', role='General English · IELTS', qualification='IELTS 8.5', experience='6 лет опыта'),
    dict(name='Дилноза Юсупова', role='Kids English', qualification='CELTA', experience='5 лет опыта'),
    dict(name='Айгуль Бекмуратова', role='Немецкий язык', qualification='Goethe B2', experience='4 года опыта'),
    dict(name='Рустем Жумабаев', role='Математика · SAT', qualification='SAT Math 780', experience='7 лет опыта'),
)
LEGACY_RESULTS = (
    dict(score='8.0', exam='IELTS', level='C1', student='Малика Т.', course='IELTS, 4 месяца',
         quote='За четыре месяца Writing вырос с 6.0 до 7.5: каждое эссе разбирали с преподавателем.'),
    dict(score='7.5', exam='IELTS', level='C1', student='Бекзод А.', course='General English и IELTS, 6 месяцев',
         quote='Speaking Club помог перестать бояться говорить. На экзамене было спокойно.'),
    dict(score='1450', exam='SAT', level='из 1600', student='Нурлан К.', course='SAT, 5 месяцев',
         quote='Math подтянул с Supporter, Reading — на пробных тестах каждую неделю.'),
)
LEGACY_STATS = (('2016', 'год основания'), ('5 000+', 'выпускников'), ('25', 'преподавателей'))
BRANCH_TEXTS = {
    'why.title5': ('Три филиала', 'Два филиала'),
    'why.text5': ('На Сараева, на Абдирова и в «Жазлар ораый».', 'На Сараева и на Абдирова.'),
    'meta.og_description': (
        'Языки, IELTS, SAT и математика. Программы, цены и три филиала Stanford.',
        'Языки, IELTS, SAT и математика. Программы, цены и два филиала Stanford.'),
}
OBSOLETE_CLUB_KEYS = tuple(f'clubs.{kind}{number}' for kind, number in (
    ('label', 1), ('title', 2), ('text', 2), ('label', 2), ('title', 3),
    ('text', 3), ('label', 3), ('title', 4), ('text', 4)))
OBSOLETE_TEXT_KEYS = (*OBSOLETE_CLUB_KEYS, 'courses.text2')
COURSE_TEXTS = {
    'courses.text1': ('Стоимость в месяц, скидка и программа — в каждой карточке.',
                      'Стоимость в месяц и программа — в каждой карточке.'),
}


def content_snapshot():
    """Deterministic Django fixture data restricted to the content application."""
    objects = []
    for model in sorted(apps.get_app_config('content').get_models(), key=lambda item: item._meta.label_lower):
        objects.extend(model.objects.order_by('pk'))
    return json.loads(serializers.serialize('json', objects))


def write_release_backup(objects, source):
    """A private, exclusive backup; failure aborts the surrounding DB transaction."""
    root = media_root()
    directory = safe_media_path('release-backups')
    if directory is None:
        raise CommandError('Небезопасный каталог резервных копий. База не изменена.')
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.mkdir(exist_ok=True, mode=0o700)
    name = f'release-backups/prepare-release-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{uuid4().hex}.json'
    path = safe_media_path(name)
    if path is None:
        raise CommandError('Небезопасный путь резервной копии. База не изменена.')
    payload = {'schema': 1, 'created_at': datetime.now(timezone.utc).isoformat(),
               'source': source, 'objects': objects}
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='\n') as output:
            json.dump(payload, output, ensure_ascii=False, indent=2)
            output.write('\n')
            output.flush()
            os.fsync(output.fileno())
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return name


def _preserve_slot_translation(slot):
    """Retired sources retain custom translations when the HTML slot disappears."""
    source = normalize_text(slot.text)
    if not source or not any(getattr(slot, language).strip() for language in TRANSLATION_LANGUAGES):
        return
    item, _created = Translation.objects.get_or_create(source=source)
    fields = []
    for language in TRANSLATION_LANGUAGES:
        value = getattr(slot, language)
        if value.strip() and not getattr(item, language).strip():
            setattr(item, language, value)
            fields.append(language)
    if fields:
        item.save(update_fields=fields)


def _replace_legacy_texts(replacements):
    count = 0
    for key, (old, new) in replacements.items():
        slot = PageText.objects.filter(key=key, text=old).first()
        if slot:
            _preserve_slot_translation(slot)
            slot.text = new
            slot.uz = slot.kaa = ''
            slot.save(update_fields=['text', 'uz', 'kaa'])
            count += 1
    return count


def prepare_release(site_root, *, apply=False, source=None):
    """Return a dry-run/apply summary. Only apply may create a backup file."""
    data = read_content(site_root / 'content.js')
    validate_content(data)
    strings = {language: read_translation_strings(site_root / 'assets' / 'i18n' / f'{language}.js')
               for language in TRANSLATION_LANGUAGES}
    slots = read_page_texts(site_root)
    incoming_texts = data.get('texts', {})
    if not isinstance(incoming_texts, dict):
        raise CommandError('Некорректный список текстов в content.js.')
    slots.update(incoming_texts)
    for key, text in slots.items():
        if not isinstance(key, str) or not isinstance(text, str):
            raise CommandError('Некорректное место текста в content.js.')
        # save() computes the private, non-editable section.
        instance = PageText(key=key, text=text, section='page')
        instance.full_clean(validate_unique=False)

    counts = dict(teachers_removed=0, results_removed=0, stats_removed=0, branches_removed=0,
                  branch_stats_updated=0, branch_texts_updated=0, course_texts_updated=0, obsolete_texts_removed=0,
                  practices_added=0, texts_added=0, translations_changed=0, demo_disabled=0)
    with transaction.atomic():
        # Lock content rows so an in-flight admin edit cannot be overwritten during
        # this explicitly scheduled upgrade. Readers continue to see the old data.
        for model in sorted(apps.get_app_config('content').get_models(), key=lambda item: item._meta.label_lower):
            list(model.objects.select_for_update().order_by('pk').values_list('pk', flat=True))
        before = content_snapshot()
        for identity in LEGACY_TEACHERS:
            candidates = Teacher.objects.filter(**identity, photo='', photo_path='')
            counts['teachers_removed'] += candidates.count()
            candidates.delete()
        for identity in LEGACY_RESULTS:
            candidates = StudentResult.objects.filter(**identity, consent=False)
            counts['results_removed'] += candidates.count()
            candidates.delete()
        for value, label in LEGACY_STATS:
            candidates = Stat.objects.filter(value=value, label=label)
            counts['stats_removed'] += candidates.count()
            candidates.delete()
        branch = Location.objects.filter(slug='youth-center', name='Филиал «Жазлар ораый»',
                                         address='Центр молодёжи', photo='', photo_path='')
        counts['branches_removed'] = branch.count()
        branch.delete()
        if set(Location.objects.values_list('slug', flat=True)) == {'saraeva', 'abdirova'}:
            counts['branch_stats_updated'] = Stat.objects.filter(value='3', label='филиала').update(value='2')
            counts['branch_texts_updated'] = _replace_legacy_texts(BRANCH_TEXTS)
        counts['course_texts_updated'] = _replace_legacy_texts(COURSE_TEXTS)
        for slot in PageText.objects.filter(key__in=OBSOLETE_TEXT_KEYS):
            _preserve_slot_translation(slot)
            slot.delete()
            counts['obsolete_texts_removed'] += 1
        for order, item in enumerate(data.get('practices', [])):
            if not Practice.objects.filter(slug=item['id']).exists():
                practice = Practice(slug=item['id'], title=item['title'], description=item['description'],
                                    label=item.get('label', ''), photo_path=item.get('photo', ''),
                                    photo_alt=item.get('photoAlt', ''), order=order, is_published=True)
                practice.full_clean()
                practice.save()
                counts['practices_added'] += 1
        for order, (key, text) in enumerate(slots.items()):
            if key not in OBSOLETE_TEXT_KEYS:
                _slot, created = PageText.objects.get_or_create(key=key, defaults={'text': text, 'order': order})
                counts['texts_added'] += created
        translations_before = {(row['model'], row['pk']): row['fields'] for row in content_snapshot()
                               if row['model'] in {'content.translation', 'content.pagetext', 'content.faq'}}
        for language in TRANSLATION_LANGUAGES:
            load_translation_strings(strings[language], language, overwrite=False)
        counts['translations_changed'] = sum(
            translations_before.get((row['model'], row['pk'])) != row['fields'] for row in content_snapshot()
            if row['model'] in {'content.translation', 'content.pagetext', 'content.faq'})
        if StudentResult.objects.filter(is_published=True, consent=False).exists():
            raise CommandError('Остались опубликованные результаты без согласия. Подтвердите согласие или '
                               'скройте их в админке. Обновление отменено, демо-режим не отключён.')
        site = SiteSettings.objects.filter(pk=1).first()
        if site is None:
            raise CommandError('Настройки сайта отсутствуют: нужен первый импорт, а не обновление релиза.')
        if site.demo_mode or site.demo_labels:
            counts['demo_disabled'] = int(site.demo_mode)
            site.demo_mode = site.demo_labels = False
            site.full_clean()
            site.save(update_fields=['demo_mode', 'demo_labels'])
        changed = before != content_snapshot()
        backup = write_release_backup(before, source or {'kind': 'local'}) if apply and changed else None
        if not apply:
            transaction.set_rollback(True)
    return {'changed': changed, 'backup': backup, 'counts': counts}
