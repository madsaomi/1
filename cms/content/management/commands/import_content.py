"""Load the published content.js into the database (first launch, or restore after data loss)."""
import json
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from content.models import (AdmissionsTelegram, Contacts, Course, CourseSkill, Location, MapLink, Phone, SiteSettings,
                            Stat, StudentResult, Teacher)

PREFIX = 'window.schoolContent = '


def read_content(path):
    text = Path(path).read_text(encoding='utf-8')
    if PREFIX not in text:
        raise CommandError(f'{path} does not define window.schoolContent')
    body = text[text.index(PREFIX) + len(PREFIX):].rstrip()
    return json.loads(body[:body.rindex(';')])


class Command(BaseCommand):
    help = 'Импорт content.js в базу админки (заменяет текущие данные).'

    def add_arguments(self, parser):
        parser.add_argument('--path', default=settings.SITE_ROOT / 'content.js')

    @transaction.atomic
    def handle(self, *args, path, **options):
        data = read_content(path)
        for model in (CourseSkill, Course, Stat, Teacher, StudentResult, MapLink, Location, Phone, AdmissionsTelegram):
            model.objects.all().delete()

        site = data.get('site', {})
        SiteSettings(demo_mode=site.get('demoMode', False), site_url=site.get('url', ''), city=site.get('city', '')).save()

        for order, stat in enumerate(data.get('stats', [])):
            Stat.objects.create(order=order, value=stat['value'], label=stat['label'])

        for order, item in enumerate(data['courses']):
            course = Course.objects.create(
                order=order, slug=item['id'], name=item['name'], subtitle=item.get('subtitle', ''), category=item['category'],
                description=item['description'], price=item['price'], special_price=item.get('specialPrice'), target=item['target'])
            for skill_order, skill in enumerate(item['skills']):
                CourseSkill.objects.create(course=course, order=skill_order, text=skill)

        for order, item in enumerate(data.get('teachers', [])):
            Teacher.objects.create(order=order, name=item['name'], role=item['role'], qualification=item.get('qualification', ''),
                                   experience=item.get('experience', ''))

        for order, item in enumerate(data.get('results', [])):
            StudentResult.objects.create(order=order, score=item['score'], exam=item['exam'], level=item.get('level', ''),
                                         quote=item['quote'], student=item['student'], course=item.get('course', ''),
                                         consent=item.get('consent', False))

        source = data['contacts']
        contacts = Contacts(verified=source.get('verified', False), hr_telegram=source.get('hrTelegram', ''),
                            instagram=source.get('instagram', ''))
        contacts.save()
        for order, number in enumerate(source.get('phones', [])):
            Phone.objects.create(contacts=contacts, order=order, number=number)
        for order, url in enumerate(source.get('telegrams', [])):
            AdmissionsTelegram.objects.create(contacts=contacts, order=order, url=url)
        for order, item in enumerate(source.get('locations', [])):
            longitude, latitude = (Decimal(str(value)) for value in item['coordinates']) if item.get('coordinates') else (None, None)
            location = Location.objects.create(order=order, slug=item['id'], name=item['name'], address=item['address'],
                                               longitude=longitude, latitude=latitude, google_embed=item.get('googleEmbed', ''))
            for map_order, link in enumerate(item['maps']):
                MapLink.objects.create(location=location, order=map_order, provider=link['provider'], url=link['url'])

        self.stdout.write(self.style.SUCCESS(
            f"Импортировано: курсов {Course.objects.count()}, преподавателей {Teacher.objects.count()}, "
            f"результатов {StudentResult.objects.count()}, филиалов {Location.objects.count()}."))
