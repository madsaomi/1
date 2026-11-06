"""Site content edited in the hidden admin and published to content.js (PLAN-044).

Validators mirror validateContent() in build.mjs so mistakes surface in the form, before publishing.
"""
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models

from .validators import PHOTO_VALIDATORS

slug_validator = RegexValidator(r'^[a-z0-9-]+$', 'Только строчные латинские буквы, цифры и дефис.')
phone_validator = RegexValidator(r'^\+[1-9]\d{7,14}$', 'Международный формат, например +998913036001.')
telegram_validator = RegexValidator(r'^https://t\.me/[a-zA-Z0-9_]{5,32}$', 'Прямая ссылка вида https://t.me/имя.')
instagram_validator = RegexValidator(r'^https://www\.instagram\.com/[a-zA-Z0-9_.]{1,30}/?$', 'Ссылка вида https://www.instagram.com/имя/.')
target_validator = RegexValidator(r'^#[a-z0-9-]+$', 'Якорь на странице, например #prices.')
MAP_PATTERNS = {
    'google': RegexValidator(r'^https://maps\.app\.goo\.gl/[a-zA-Z0-9_-]+/?$', 'Короткая ссылка Google Maps (maps.app.goo.gl).'),
    'yandex': RegexValidator(r'^https://yandex\.(?:uz|com|ru)/maps/(?:-/[a-zA-Z0-9_-]+|org/[a-zA-Z0-9_-]+/\d+)/?$', 'Ссылка Яндекс Карт (yandex.uz/maps/-/…).'),
}
google_embed_validator = RegexValidator(r'^https://www\.google\.com/maps/embed\?pb=[^&#\s]+$', 'Ссылка «Встроить карту» из Google Maps (https://www.google.com/maps/embed?pb=…).')


class Ordered(models.Model):
    order = models.PositiveIntegerField('Порядок', default=0, db_index=True)

    class Meta:
        abstract = True
        ordering = ['order', 'pk']


class Singleton(models.Model):
    """One editable record (settings, contacts); always pk=1."""

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        return cls.objects.get_or_create(pk=1)[0]


class SiteSettings(Singleton):
    demo_mode = models.BooleanField('Демо-режим', default=True,
                                    help_text='Включен: на сайте плашка «Демо-версия» и метки «Пример». Выключите, когда все данные реальные.')
    site_url = models.URLField('Адрес сайта', blank=True, help_text='Нужен для canonical и превью в соцсетях.')
    city = models.CharField('Город', max_length=60, default='Нукус')

    class Meta:
        verbose_name = verbose_name_plural = 'Настройки сайта'

    def __str__(self):
        return 'Настройки сайта'


class Stat(Ordered):
    value = models.CharField('Цифра', max_length=12, help_text='Например: 2016, 5 000+, 25')
    label = models.CharField('Подпись', max_length=40, help_text='Например: год основания')

    class Meta(Ordered.Meta):
        verbose_name = 'Цифра'
        verbose_name_plural = 'Цифры'

    def __str__(self):
        return f'{self.value} — {self.label}'


class Course(Ordered):
    CATEGORIES = [('languages', 'Языки'), ('kids', 'Для детей'), ('subjects', 'Математика'), ('exam', 'IELTS и SAT')]
    slug = models.CharField('Код (в адресе)', max_length=60, unique=True, validators=[slug_validator])
    name = models.CharField('Название', max_length=80)
    subtitle = models.CharField('Уточнение', max_length=80, blank=True, help_text='Например: на каракалпакском')
    category = models.CharField('Направление', max_length=20, choices=CATEGORIES)
    description = models.TextField('Описание', max_length=400)
    price = models.PositiveIntegerField('Цена в месяц, сум')
    special_price = models.PositiveIntegerField('Семейная цена, сум', null=True, blank=True,
                                                help_text='Для семьи или записи на два курса. Пусто — не предусмотрена.')
    target = models.CharField('Ссылка «Подробнее»', max_length=40, default='#prices', validators=[target_validator])
    is_published = models.BooleanField('Показывать на сайте', default=True)

    class Meta(Ordered.Meta):
        verbose_name = 'Курс'
        verbose_name_plural = 'Курсы и цены'

    def __str__(self):
        return ' '.join(filter(None, [self.name, self.subtitle]))

    def clean(self):
        if self.special_price is not None and self.price is not None and self.special_price > self.price:
            raise ValidationError({'special_price': 'Семейная цена не может быть выше обычной.'})


class CourseSkill(Ordered):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='skills')
    text = models.CharField('Пункт программы', max_length=120)

    class Meta(Ordered.Meta):
        verbose_name = 'Пункт программы'
        verbose_name_plural = 'В программе'

    def __str__(self):
        return self.text


class Contacts(Singleton):
    verified = models.BooleanField('Контакты подтверждены', default=True,
                                   help_text='Выключено — на сайте вместо телефонов надпись «Контакты уточняются».')
    hr_telegram = models.URLField('Telegram по вопросам работы', blank=True, validators=[telegram_validator])
    instagram = models.URLField('Instagram', blank=True, validators=[instagram_validator])

    class Meta:
        verbose_name = verbose_name_plural = 'Контакты'

    def __str__(self):
        return 'Контакты'


class Phone(Ordered):
    contacts = models.ForeignKey(Contacts, on_delete=models.CASCADE, related_name='phones')
    number = models.CharField('Телефон', max_length=16, unique=True, validators=[phone_validator])

    class Meta(Ordered.Meta):
        verbose_name = 'Телефон'
        verbose_name_plural = 'Телефоны'

    def __str__(self):
        return self.number


class AdmissionsTelegram(Ordered):
    contacts = models.ForeignKey(Contacts, on_delete=models.CASCADE, related_name='telegrams')
    url = models.URLField('Telegram для записи', unique=True, validators=[telegram_validator])

    class Meta(Ordered.Meta):
        verbose_name = 'Telegram для записи'
        verbose_name_plural = 'Telegram для записи (первый — на кнопке «Бесплатный пробный урок»)'

    def __str__(self):
        return self.url


class Location(Ordered):
    slug = models.CharField('Код', max_length=40, unique=True, validators=[slug_validator])
    name = models.CharField('Название', max_length=80)
    address = models.CharField('Адрес', max_length=160)
    longitude = models.DecimalField('Долгота', max_digits=10, decimal_places=7, null=True, blank=True)
    latitude = models.DecimalField('Широта', max_digits=10, decimal_places=7, null=True, blank=True)
    google_embed = models.URLField('Google-карта для сайта', max_length=1000, blank=True, validators=[google_embed_validator],
                                   help_text='Google Maps → Поделиться → Встраивание карт → ссылка из src. Без нее филиал не показывается на карте.')
    photo = models.ImageField('Фото входа', upload_to='branches/', blank=True, validators=PHOTO_VALIDATORS,
                              help_text='JPG, PNG или WebP до 5 МБ.')

    class Meta(Ordered.Meta):
        verbose_name = 'Филиал'
        verbose_name_plural = 'Филиалы и карты'

    def __str__(self):
        return self.name

    def clean(self):
        if (self.longitude is None) != (self.latitude is None):
            raise ValidationError('Укажите обе координаты или ни одной.')
        if self.longitude is not None and (abs(self.longitude) > 180 or abs(self.latitude) > 90):
            raise ValidationError('Координаты вне допустимого диапазона.')


class MapLink(Ordered):
    PROVIDERS = [('google', 'Google Maps'), ('yandex', 'Яндекс Карты')]
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='maps')
    provider = models.CharField('Сервис', max_length=10, choices=PROVIDERS)
    url = models.URLField('Ссылка')

    class Meta(Ordered.Meta):
        verbose_name = 'Ссылка на карту'
        verbose_name_plural = 'Ссылки на карты'

    def __str__(self):
        return self.get_provider_display()

    def clean(self):
        if self.provider in MAP_PATTERNS and self.url:
            try:
                MAP_PATTERNS[self.provider](self.url)
            except ValidationError as error:
                raise ValidationError({'url': error.messages})


class Teacher(Ordered):
    name = models.CharField('Имя и фамилия', max_length=60)
    role = models.CharField('Что преподает', max_length=80, help_text='Например: General English · IELTS')
    qualification = models.CharField('Квалификация', max_length=40, blank=True, help_text='Например: IELTS 8.5, CELTA')
    experience = models.CharField('Опыт', max_length=40, blank=True, help_text='Например: 6 лет опыта')
    photo = models.ImageField('Фото', upload_to='teachers/', blank=True, validators=PHOTO_VALIDATORS,
                              help_text='Вертикальное 4:5, JPG/PNG/WebP до 5 МБ. Без фото — инициалы.')
    is_published = models.BooleanField('Показывать на сайте', default=True)

    class Meta(Ordered.Meta):
        verbose_name = 'Преподаватель'
        verbose_name_plural = 'Преподаватели'

    def __str__(self):
        return self.name


class StudentResult(Ordered):
    score = models.CharField('Балл', max_length=8, help_text='Например: 8.0 или 1450')
    exam = models.CharField('Экзамен', max_length=20, help_text='Например: IELTS')
    level = models.CharField('Уровень', max_length=20, blank=True, help_text='Например: C1 или «из 1600»')
    quote = models.TextField('Отзыв', max_length=240)
    student = models.CharField('Студент', max_length=40, help_text='Имя и первая буква фамилии')
    course = models.CharField('Курс и срок', max_length=60, blank=True, help_text='Например: IELTS, 4 месяца')
    consent = models.BooleanField('Есть согласие студента', default=False,
                                  help_text='Без согласия реальный отзыв не публикуется (вне демо-режима).')
    is_published = models.BooleanField('Показывать на сайте', default=True)

    class Meta(Ordered.Meta):
        verbose_name = 'Результат студента'
        verbose_name_plural = 'Результаты студентов'

    def __str__(self):
        return f'{self.score} {self.exam} — {self.student}'
