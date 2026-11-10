from django.contrib import admin
from django import forms
from django.contrib.admin import ModelAdmin, TabularInline
from django.contrib.auth.admin import GroupAdmin as BaseGroupAdmin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group, User
from django.shortcuts import redirect
from django.forms.models import BaseInlineFormSet
from django.core.exceptions import ValidationError
from django.utils.html import format_html

from .models import (AdmissionsTelegram, CashbackRule, CashbackTier, Contacts, Course, CourseSkill, Faq, Location,
                     MapLink, PageText, Phone, SiteSettings, Stat, StudentResult, Teacher, Translation)

admin.site.unregister(User)
admin.site.unregister(Group)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    pass


@admin.register(Group)
class GroupAdmin(BaseGroupAdmin):
    pass


class SingletonAdmin(ModelAdmin):
    """Settings-like records: one page, no list, no add/delete."""

    def has_add_permission(self, request):
        return not self.model.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        return redirect('admin:%s_%s_change' % (self.model._meta.app_label, self.model._meta.model_name), self.model.load().pk)


def thumbnail(image, initials=''):
    if image:
        return format_html('<img src="{}" style="width:48px;height:48px;object-fit:cover;border-radius:12px">', image.url)
    return format_html('<span style="display:inline-grid;place-items:center;width:48px;height:48px;border-radius:12px;'
                       'background:#ffb703;color:#070707;font-weight:700">{}</span>', initials or '—')


@admin.register(SiteSettings)
class SiteSettingsAdmin(SingletonAdmin):
    fieldsets = [('Режим сайта', {'fields': ['demo_mode', 'demo_labels']}), ('Сайт', {'fields': ['site_url', 'city']})]


@admin.register(Stat)
class StatAdmin(ModelAdmin):
    list_display = ['value', 'label', 'order']
    list_editable = ['order']


class RequiredContentInlineFormSet(BaseInlineFormSet):
    """Validate what will remain after this save, including deletion of all existing rows."""

    def clean(self):
        super().clean()
        if any(form.errors for form in self.forms):
            return
        deleted = [form.instance.pk for form in self.forms
                   if form.cleaned_data.get('DELETE') and form.instance.pk]
        remaining = self.get_queryset().exclude(pk__in=deleted).count()
        remaining += sum(1 for form in self.forms if form.cleaned_data
                         and not form.cleaned_data.get('DELETE') and not form.instance.pk)
        if remaining == 0:
            raise ValidationError('Добавьте хотя бы одну запись в этот список.')


class CourseSkillInline(TabularInline):
    model = CourseSkill
    formset = RequiredContentInlineFormSet
    extra = 1
    fields = ['text', 'order']


@admin.register(Course)
class CourseAdmin(ModelAdmin):
    readonly_fields = ['slug', 'target']
    list_display = ['__str__', 'category', 'price_display', 'special_display', 'is_published', 'order']
    list_editable = ['is_published', 'order']
    list_filter = ['category', 'is_published']
    search_fields = ['name', 'subtitle', 'description']
    inlines = [CourseSkillInline]
    fieldsets = [
        (None, {'fields': ['name', 'subtitle', 'category', 'description']}),
        ('Цены', {'fields': [('price', 'special_price')]}),
        ('Публикация', {'fields': ['is_published', 'order', 'slug', 'target'], 'classes': ['collapse']}),
    ]

    @admin.display(description='Цена', ordering='price')
    def price_display(self, obj):
        return f'{obj.price:,}'.replace(',', ' ') + ' сум'

    @admin.display(description='Семейная')
    def special_display(self, obj):
        return f'{obj.special_price:,}'.replace(',', ' ') + ' сум' if obj.special_price else '—'


class PhoneInline(TabularInline):
    model = Phone
    extra = 0
    fields = ['number', 'order']


class TelegramInline(TabularInline):
    model = AdmissionsTelegram
    extra = 0
    fields = ['url', 'order']


class ContactsForm(forms.ModelForm):
    class Meta:
        model = Contacts
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Model.clean sees yesterday's rows. The form below checks this submission's final inlines.
        self.instance._validate_inline_channels = True

    def channel_values(self, prefix, field):
        existing = {str(row.pk): getattr(row, field) for row in getattr(self.instance, prefix).all()} if self.instance.pk else {}
        values = []
        try:
            count = min(max(int(self.data.get(f'{prefix}-TOTAL_FORMS', 0)), 0), 1000)
        except (ValueError, TypeError):
            return list(existing.values())  # the inline management form reports malformed counts
        for index in range(count):
            key = f'{prefix}-{index}-'
            pk = str(self.data.get(key + 'id', ''))
            existing.pop(pk, None)
            if self.data.get(key + 'DELETE'):
                continue
            value = str(self.data.get(key + field, '')).strip()
            if value:
                values.append(value)
        return [*existing.values(), *values]

    def clean(self):
        cleaned = super().clean()
        phones = self.channel_values('phones', 'number')
        telegrams = [value.lower() for value in self.channel_values('telegrams', 'url')]
        if cleaned.get('verified') and not phones and not telegrams:
            self.add_error('verified', 'Добавьте хотя бы один телефон или Telegram для записи.')
        hr = (cleaned.get('hr_telegram') or '').lower()
        if hr and hr in telegrams:
            self.add_error('hr_telegram', 'Telegram для вопросов работы должен отличаться от Telegram для записи.')
        return cleaned


@admin.register(Contacts)
class ContactsAdmin(SingletonAdmin):
    form = ContactsForm
    inlines = [PhoneInline, TelegramInline]
    fieldsets = [(None, {'fields': ['verified']}), ('Дополнительно', {'fields': ['instagram', 'hr_telegram']})]


class MapLinkInline(TabularInline):
    model = MapLink
    formset = RequiredContentInlineFormSet
    extra = 1
    fields = ['provider', 'url', 'order']


@admin.register(Location)
class LocationAdmin(ModelAdmin):
    readonly_fields = ['slug']
    list_display = ['photo_preview', 'name', 'address', 'on_map', 'order']
    list_display_links = ['photo_preview', 'name']
    list_editable = ['order']
    inlines = [MapLinkInline]
    fieldsets = [
        (None, {'fields': ['name', 'address', 'photo']}),
        ('Карта на сайте', {'fields': ['google_embed', ('longitude', 'latitude')]}),
        ('Служебное', {'fields': ['slug', 'order', 'photo_path'], 'classes': ['collapse']}),
    ]

    @admin.display(description='Фото')
    def photo_preview(self, obj):
        return thumbnail(obj.photo)

    @admin.display(description='На карте', boolean=True)
    def on_map(self, obj):
        return bool(obj.google_embed)


@admin.register(Teacher)
class TeacherAdmin(ModelAdmin):
    list_display = ['photo_preview', 'name', 'role', 'qualification', 'experience', 'is_published', 'order']
    list_display_links = ['photo_preview', 'name']
    list_editable = ['is_published', 'order']
    search_fields = ['name', 'role']
    fields = ['name', 'role', 'qualification', 'experience', 'photo', 'photo_path', 'is_published', 'order']

    @admin.display(description='Фото')
    def photo_preview(self, obj):
        return thumbnail(obj.photo, ''.join(word[0] for word in obj.name.split()[:2]).upper())


@admin.register(StudentResult)
class StudentResultAdmin(ModelAdmin):
    list_display = ['score', 'exam', 'level', 'student', 'consent', 'is_published', 'order']
    list_editable = ['is_published', 'order']
    list_filter = ['exam', 'consent', 'is_published']
    fieldsets = [
        ('Результат', {'fields': [('score', 'exam', 'level')]}),
        ('Отзыв', {'fields': ['quote', ('student', 'course')]}),
        ('Публикация', {'fields': ['consent', 'is_published', 'order']}),
    ]


@admin.register(CashbackTier)
class CashbackTierAdmin(ModelAdmin):
    list_display = ['__str__', 'exam', 'score', 'reward_display', 'hero', 'order']
    list_editable = ['hero', 'order']
    list_filter = ['exam', 'hero']
    fields = ['exam', 'score', 'reward', 'label', 'hero', 'order']

    @admin.display(description='Выплата', ordering='reward')
    def reward_display(self, obj):
        return f'{obj.reward:,}'.replace(',', ' ') + ' сум'


@admin.register(CashbackRule)
class CashbackRuleAdmin(ModelAdmin):
    list_display = ['title', 'text', 'order']
    list_editable = ['order']
    fields = ['title', 'text', 'order']


def shorten(value, limit=90):
    value = ' '.join((value or '').split())
    return value if len(value) <= limit else value[:limit - 1] + '…'


@admin.register(PageText)
class PageTextAdmin(ModelAdmin):
    """Texts are tied to places in the page, so they are edited but never added or removed here."""
    list_display = ['place_display', 'section', 'text_display', 'uz_display']
    list_display_links = ['place_display', 'text_display']
    list_filter = ['section']
    search_fields = ['text', 'uz']
    list_per_page = 200
    fields = ['where', 'text', 'uz']
    readonly_fields = ['where']

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description='Место', ordering='order')
    def place_display(self, obj):
        return obj.place()

    @admin.display(description='Текст')
    def text_display(self, obj):
        return shorten(obj.text)

    @admin.display(description='По-узбекски')
    def uz_display(self, obj):
        return shorten(obj.uz, 60) or '—'

    @admin.display(description='Где на сайте')
    def where(self, obj):
        return str(obj)


@admin.register(Faq)
class FaqAdmin(ModelAdmin):
    list_display = ['question', 'has_uz', 'is_published', 'order']
    list_editable = ['is_published', 'order']
    search_fields = ['question', 'answer']
    fieldsets = [
        (None, {'fields': ['question', 'answer']}),
        ('По-узбекски', {'fields': ['question_uz', 'answer_uz']}),
        ('Публикация', {'fields': ['is_published', 'order']}),
    ]

    @admin.display(description='Есть перевод', boolean=True)
    def has_uz(self, obj):
        return bool(obj.question_uz.strip() and obj.answer_uz.strip())


@admin.register(Translation)
class TranslationAdmin(ModelAdmin):
    list_display = ['source_display', 'uz_display']
    search_fields = ['source', 'uz']
    list_per_page = 100
    fields = ['source', 'uz']

    @admin.display(description='Текст на сайте', ordering='source')
    def source_display(self, obj):
        return shorten(obj.source)

    @admin.display(description='По-узбекски')
    def uz_display(self, obj):
        return shorten(obj.uz)
