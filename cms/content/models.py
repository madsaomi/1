"""Site content edited in the hidden admin and published to content.js (PLAN-044).

Validators mirror validateContent() in build.mjs so mistakes surface in the form, before publishing.
"""
from urllib.parse import urlsplit
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.utils.text import slugify

from .validators import PHOTO_VALIDATORS

slug_validator = RegexValidator(r'^[a-z0-9-]+$', 'Только строчные латинские буквы, цифры и дефис.')
phone_validator = RegexValidator(r'^\+998\d{9}$', 'Формат +998 и 9 цифр, например +998913036001.')
positive_validator = MinValueValidator(1, 'Значение должно быть больше нуля.')
photo_path_validator = RegexValidator(
    r'^assets/(?:[a-z0-9_-]+/)*[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$',
    'Допустим только локальный путь assets/… к JPG, PNG или WebP.')


def assign_slug(instance, fallback):
    """Generate the public identifier once; changing the name never breaks existing links."""
    if instance.slug:
        return
    limit = instance._meta.get_field('slug').max_length
    stem = slugify(instance.name)[:limit].strip('-') or f'{fallback}-{uuid4().hex[:10]}'
    candidate, suffix = stem, 2
    others = type(instance).objects.exclude(pk=instance.pk)
    while others.filter(slug=candidate).exists():
        tail = f'-{suffix}'
        candidate = stem[:limit - len(tail)].rstrip('-') + tail
        suffix += 1
    instance.slug = candidate


def validate_https_site_url(value):
    """Public site address: HTTPS, no credentials, query or hash; a path after the domain is fine (build.mjs)."""
    if not value:
        return
    url = urlsplit(value)
    if (url.scheme != 'https' or not url.netloc or url.username or url.password or url.query or url.fragment
            or '@' in url.netloc):
        raise ValidationError('Только https:// без логина, параметров (?…) и якоря (#…). Путь после домена можно.')

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
    demo_labels = models.BooleanField('Плашки «Пример»', default=True,
                                      help_text='Показывать баннер демо-версии и метки «Пример» на блоках. Выключите, чтобы смотреть сайт без служебных подписей.')
    site_url = models.URLField('Адрес сайта', blank=True, validators=[validate_https_site_url],
                               help_text='Нужен для canonical и превью в соцсетях. Только https://.')
    city = models.CharField('Город', max_length=60, default='Нукус')

    class Meta:
        verbose_name = verbose_name_plural = 'Настройки сайта'

    def __str__(self):
        return 'Настройки сайта'

    def clean(self):
        if not self.demo_mode and StudentResult.objects.filter(is_published=True, consent=False).exists():
            raise ValidationError({'demo_mode': 'Сначала подтвердите согласие для опубликованных результатов '
                                                'студентов или скройте эти результаты.'})


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
    slug = models.CharField('Код (в адресе)', max_length=60, unique=True, blank=True, validators=[slug_validator])
    name = models.CharField('Название', max_length=80)
    subtitle = models.CharField('Уточнение', max_length=80, blank=True, help_text='Например: на каракалпакском')
    category = models.CharField('Направление', max_length=20, choices=CATEGORIES)
    description = models.TextField('Описание', max_length=400)
    price = models.PositiveIntegerField('Цена в месяц, сум', validators=[positive_validator])
    special_price = models.PositiveIntegerField('Семейная цена, сум', null=True, blank=True,
                                                validators=[positive_validator],
                                                help_text='Для семьи или записи на два курса. Пусто — не предусмотрена.')
    target = models.CharField('Ссылка «Подробнее»', max_length=40, default='#prices', validators=[target_validator])
    is_published = models.BooleanField('Показывать на сайте', default=True)

    class Meta(Ordered.Meta):
        verbose_name = 'Курс'
        verbose_name_plural = 'Курсы и цены'

    def __str__(self):
        return ' '.join(filter(None, [self.name, self.subtitle]))

    def clean(self):
        assign_slug(self, 'course')
        errors = {}
        # build.mjs rejects empty name/description and non-positive prices, so the form must too.
        if not (self.name or '').strip():
            errors['name'] = 'Укажите название курса.'
        if not (self.description or '').strip():
            errors['description'] = 'Укажите описание курса.'
        if self.special_price is not None and self.price is not None and self.special_price >= self.price:
            errors['special_price'] = 'Семейная цена должна быть ниже обычной.'
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        assign_slug(self, 'course')
        super().save(*args, **kwargs)


class CourseSkill(Ordered):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='skills')
    text = models.CharField('Пункт программы', max_length=120)

    class Meta(Ordered.Meta):
        verbose_name = 'Пункт программы'
        verbose_name_plural = 'В программе'

    def __str__(self):
        return self.text


class CashbackTier(Ordered):
    """One «exam score → cash reward» row of the cashback section (stage 3 of PLAN-044)."""
    EXAMS = [('ielts', 'IELTS'), ('sat', 'SAT')]
    exam = models.CharField('Экзамен', max_length=10, choices=EXAMS)
    score = models.CharField('Балл', max_length=8, help_text='Например: 7.5 или 1500')
    reward = models.PositiveIntegerField('Выплата, сум', validators=[positive_validator])
    label = models.CharField('Подпись суммы', max_length=40, blank=True,
                             help_text='Например: 2 000 000 сум. Пусто — соберется само из выплаты.')
    hero = models.BooleanField('Сумма в баннере', default=False,
                               help_text='Показывать сумму в верхнем баннере «Кэшбэк за результат».')

    class Meta(Ordered.Meta):
        verbose_name = 'Ступень кэшбэка'
        verbose_name_plural = 'Кэшбэк за баллы'
        ordering = ['exam', 'order', 'pk']
        constraints = [models.UniqueConstraint(fields=['exam', 'score'], name='content_cashbacktier_unique_exam_score')]

    def __str__(self):
        return f'{self.get_exam_display()} {self.score} — {self.reward:,}'.replace(',', ' ') + ' сум'

    def clean(self):
        if self.reward is not None and self.reward <= 0:
            raise ValidationError({'reward': 'Выплата должна быть больше нуля.'})


class CashbackRule(Ordered):
    """A numbered step of «Условия получения кэшбэка»."""
    title = models.CharField('Шаг', max_length=60)
    text = models.CharField('Пояснение', max_length=200)

    class Meta(Ordered.Meta):
        verbose_name = 'Условие кэшбэка'
        verbose_name_plural = 'Условия кэшбэка'

    def __str__(self):
        return self.title


class Contacts(Singleton):
    verified = models.BooleanField('Контакты подтверждены', default=True,
                                   help_text='Выключено — на сайте вместо телефонов надпись «Контакты уточняются».')
    hr_telegram = models.URLField('Telegram по вопросам работы', blank=True, validators=[telegram_validator])
    instagram = models.URLField('Instagram', blank=True, validators=[instagram_validator])

    class Meta:
        verbose_name = verbose_name_plural = 'Контакты'

    def __str__(self):
        return 'Контакты'

    def clean(self):
        # build.mjs publishes verified contacts only with an admissions channel, and keeps HR separate.
        # Existing channels are read from the database: save the contacts once (verification can be off),
        # add a phone/Telegram on the same page, then enable «Контакты подтверждены».
        if not self.verified or not self.pk or getattr(self, '_validate_inline_channels', False):
            return
        errors = {}
        phones = list(self.phones.values_list('number', flat=True))
        telegrams = [url.lower() for url in self.telegrams.values_list('url', flat=True)]
        if not phones and not telegrams:
            errors['verified'] = 'Добавьте хотя бы один телефон или Telegram для записи, иначе контакты нельзя подтвердить.'
        if self.hr_telegram and self.hr_telegram.lower() in telegrams:
            errors['hr_telegram'] = 'Telegram для вопросов работы должен отличаться от Telegram для записи.'
        if errors:
            raise ValidationError(errors)


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
    slug = models.CharField('Код', max_length=40, unique=True, blank=True, validators=[slug_validator])
    name = models.CharField('Название', max_length=80)
    address = models.CharField('Адрес', max_length=160)
    longitude = models.DecimalField('Долгота', max_digits=10, decimal_places=7, null=True, blank=True)
    latitude = models.DecimalField('Широта', max_digits=10, decimal_places=7, null=True, blank=True)
    google_embed = models.URLField('Google-карта для сайта', max_length=1000, blank=True, validators=[google_embed_validator],
                                   help_text='Google Maps → Поделиться → Встраивание карт → ссылка из src. Без нее филиал не показывается на карте.')
    photo = models.ImageField('Фото входа', upload_to='branches/', blank=True, validators=PHOTO_VALIDATORS,
                              help_text='JPG, PNG или WebP до 5 МБ.')
    photo_path = models.CharField('Фото из файлов сайта', max_length=240, blank=True, validators=[photo_path_validator],
                                  help_text='Сохраняется при импорте. Загруженное фото имеет приоритет.')

    class Meta(Ordered.Meta):
        verbose_name = 'Филиал'
        verbose_name_plural = 'Филиалы и карты'

    def __str__(self):
        return self.name

    def clean(self):
        assign_slug(self, 'branch')
        if (self.longitude is None) != (self.latitude is None):
            raise ValidationError('Укажите обе координаты или ни одной.')
        if self.longitude is not None and (abs(self.longitude) > 180 or abs(self.latitude) > 90):
            raise ValidationError('Координаты вне допустимого диапазона.')

    def save(self, *args, **kwargs):
        assign_slug(self, 'branch')
        super().save(*args, **kwargs)


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
    photo_path = models.CharField('Фото из файлов сайта', max_length=240, blank=True, validators=[photo_path_validator],
                                  help_text='Сохраняется при импорте. Загруженное фото имеет приоритет.')
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

    def clean(self):
        if self.is_published and not self.consent:
            settings = SiteSettings.objects.filter(pk=1).first()
            if settings is not None and not settings.demo_mode:
                raise ValidationError({'consent': 'Для публикации реального результата нужно согласие студента.'})


text_key_validator = RegexValidator(r'^[a-z0-9._-]+$', 'Только строчные латинские буквы, цифры, точка и дефис.')


class PageText(models.Model):
    """One editable text of the page frame: index.html marks its place with data-text="<key>" (build.mjs)."""
    SECTIONS = [
        ('meta', 'Заголовок вкладки и описание для поиска'), ('page', 'Служебные ссылки'), ('header', 'Шапка и меню'),
        ('hero', 'Первый экран'), ('why', 'Почему Stanford'), ('courses', 'Курсы и цены'), ('cashback', 'Кэшбэк'),
        ('about', 'Как начать заниматься'), ('clubs', 'Практика вне уроков'), ('partners', 'Партнёры и экзамены'),
        ('faq', 'Вопросы: заголовок'), ('ielts', 'Вопрос про IELTS'), ('sat', 'Вопрос про SAT'),
        ('enroll', 'Контакты'), ('footer', 'Подвал'), ('modal', 'Окно курса'),
        ('results', 'Страница результатов'), ('career', 'Анкета для работы'),
    ]
    KINDS = {'title': 'Заголовок', 'text': 'Текст', 'link': 'Ссылка', 'button': 'Кнопка', 'question': 'Вопрос',
             'item': 'Пункт списка', 'table': 'Таблица', 'label': 'Надпись', 'description': 'Описание для поиска',
             'og_title': 'Заголовок для соцсетей', 'og_description': 'Описание для соцсетей'}
    key = models.CharField('Код места', max_length=60, unique=True, validators=[text_key_validator])
    section = models.CharField('Раздел', max_length=20, choices=SECTIONS, db_index=True, editable=False)
    text = models.TextField('Текст', max_length=800)
    uz = models.TextField('По-узбекски', max_length=800, blank=True,
                          help_text='Показывается, когда посетитель выбирает UZ. Пусто — останется русский текст.')
    order = models.PositiveIntegerField('Порядок на странице', default=0, db_index=True, editable=False)

    class Meta:
        ordering = ['order', 'pk']
        verbose_name = 'Текст страницы'
        verbose_name_plural = 'Тексты страницы'

    def __str__(self):
        return f'{self.get_section_display()} — {self.place()}'

    def place(self):
        """Human name of the slot, e.g. «Заголовок 2» for key why.title2."""
        name = self.key.split('.', 1)[-1]
        kind = name.rstrip('0123456789')
        number = name[len(kind):]
        return ' '.join(filter(None, [self.KINDS.get(kind, kind), number]))

    def clean(self):
        if not (self.text or '').strip():
            raise ValidationError({'text': 'Текст не может быть пустым.'})

    def save(self, *args, **kwargs):
        section = self.key.split('.', 1)[0]
        self.section = section if section in dict(self.SECTIONS) else 'page'
        super().save(*args, **kwargs)


class Faq(Ordered):
    """A plain question of «Частые вопросы»; the IELTS and SAT entries are page texts."""
    question = models.CharField('Вопрос', max_length=160)
    answer = models.TextField('Ответ', max_length=800)
    question_uz = models.CharField('Вопрос по-узбекски', max_length=160, blank=True)
    answer_uz = models.TextField('Ответ по-узбекски', max_length=800, blank=True)
    is_published = models.BooleanField('Показывать на сайте', default=True)

    class Meta(Ordered.Meta):
        verbose_name = 'Вопрос'
        verbose_name_plural = 'Вопросы и ответы'

    def __str__(self):
        return self.question

    def clean(self):
        errors = {}
        if not (self.question or '').strip():
            errors['question'] = 'Укажите вопрос.'
        if not (self.answer or '').strip():
            errors['answer'] = 'Укажите ответ.'
        if errors:
            raise ValidationError(errors)


class Translation(models.Model):
    """Uzbek for texts that have no «По-узбекски» field of their own: courses, cashback, teachers, results, buttons."""
    source = models.CharField('Текст на сайте (по-русски)', max_length=800, unique=True,
                              help_text='Точно как на сайте: с теми же знаками и регистром.')
    uz = models.CharField('По-узбекски', max_length=800)

    class Meta:
        ordering = ['source']
        verbose_name = 'Перевод'
        verbose_name_plural = 'Переводы на узбекский'

    def __str__(self):
        return self.source

    def clean(self):
        self.source = ' '.join((self.source or '').split())
        if not self.source or not (self.uz or '').strip():
            raise ValidationError('Заполните оба поля.')
