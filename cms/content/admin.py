from django.contrib import admin
from django.contrib.auth.admin import GroupAdmin as BaseGroupAdmin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group, User
from django.shortcuts import redirect
from django.utils.html import format_html
from unfold.admin import ModelAdmin, TabularInline
from unfold.forms import AdminPasswordChangeForm, UserChangeForm, UserCreationForm

from .models import (AdmissionsTelegram, Contacts, Course, CourseSkill, Location, MapLink, Phone, SiteSettings, Stat,
                     StudentResult, Teacher)

admin.site.unregister(User)
admin.site.unregister(Group)


@admin.register(User)
class UserAdmin(BaseUserAdmin, ModelAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    change_password_form = AdminPasswordChangeForm


@admin.register(Group)
class GroupAdmin(BaseGroupAdmin, ModelAdmin):
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
    fieldsets = [('Режим сайта', {'fields': ['demo_mode']}), ('Сайт', {'fields': ['site_url', 'city']})]


@admin.register(Stat)
class StatAdmin(ModelAdmin):
    list_display = ['value', 'label', 'order']
    list_editable = ['order']


class CourseSkillInline(TabularInline):
    model = CourseSkill
    extra = 0
    fields = ['text', 'order']


@admin.register(Course)
class CourseAdmin(ModelAdmin):
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


@admin.register(Contacts)
class ContactsAdmin(SingletonAdmin):
    inlines = [PhoneInline, TelegramInline]
    fieldsets = [(None, {'fields': ['verified']}), ('Дополнительно', {'fields': ['instagram', 'hr_telegram']})]


class MapLinkInline(TabularInline):
    model = MapLink
    extra = 0
    fields = ['provider', 'url', 'order']


@admin.register(Location)
class LocationAdmin(ModelAdmin):
    list_display = ['photo_preview', 'name', 'address', 'on_map', 'order']
    list_display_links = ['photo_preview', 'name']
    list_editable = ['order']
    inlines = [MapLinkInline]
    fieldsets = [
        (None, {'fields': ['name', 'address', 'photo']}),
        ('Карта на сайте', {'fields': ['google_embed', ('longitude', 'latitude')]}),
        ('Служебное', {'fields': ['slug', 'order'], 'classes': ['collapse']}),
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
    fields = ['name', 'role', 'qualification', 'experience', 'photo', 'is_published', 'order']

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
