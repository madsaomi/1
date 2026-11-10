"""Stock Django admin site that requires a one-time code from an authenticator app (django-otp TOTP)."""
from django import forms
from django.contrib import messages
from django.shortcuts import redirect
from django.urls import path
from django.views.decorators.http import require_POST
from django_otp import devices_for_user
from django.contrib.admin import AdminSite
from django_otp.admin import OTPAdminAuthenticationForm


class OTPLoginForm(OTPAdminAuthenticationForm):
    otp_token = forms.CharField(
        label='Код из приложения', required=True,
        widget=forms.TextInput(attrs={'autocomplete': 'one-time-code', 'inputmode': 'numeric', 'pattern': '[0-9]*', 'maxlength': 8}),
        help_text='6 цифр из Google Authenticator.')

    def _chosen_device(self, user):
        # django-otp requires an explicit device; each account has exactly one authenticator,
        # so use it rather than showing a device picker. With several devices nothing is guessed.
        device = super()._chosen_device(user)
        if device is None:
            devices = list(devices_for_user(user, confirmed=True, for_verify=True))
            device = devices[0] if len(devices) == 1 else None
        return device


class StanfordAdminSite(AdminSite):
    site_header = 'Stanford'
    site_title = 'Stanford — админка'
    index_title = 'Содержимое сайта'
    site_url = None  # the admin has no site of its own; hides the «View site» link
    login_form = OTPLoginForm
    login_template = 'admin/stanford_login.html'
    index_template = 'admin/stanford_index.html'

    def get_urls(self):
        return [path('publish/', self.admin_view(require_POST(self.publish_view)), name='publish')] + super().get_urls()

    def each_context(self, request):
        from content.publish import site_available, publish_target
        context = super().each_context(request)
        context['can_publish'] = site_available() and request.user.is_active and request.user.is_superuser
        context['publish_target'] = publish_target()
        return context

    def publish_view(self, request):
        """Publish a validated release to the configured target."""
        from content.publish import PublishError, publish_site
        if not request.user.is_superuser:
            messages.error(request, 'Публиковать может только владелец (суперпользователь).')
            return redirect('admin:index')
        try:
            result = publish_site()
        except PublishError as error:
            messages.error(request, str(error))
            return redirect('admin:index')
        if result['target'] == 'github':
            message = (f"Отправлено в GitHub: {result['commit'][:12]}. Дождитесь успешного развёртывания Railway "
                       'и проверьте сайт.') if result['changed'] else 'Сайт уже содержит эти изменения.'
        else:
            message = 'Файлы сайта на этом компьютере обновлены. Проверьте сайт; отправка в GitHub выполняется отдельно.'
        messages.success(request, message)
        if result['demo']:
            messages.warning(request, 'Опубликован демо-режим. Перед финальным запуском замените примеры реальными данными, '
                                      'получите согласия учеников и выключите демо-режим в настройках сайта.')
        missing = result['missing_uz']
        if missing['page_texts'] or missing['faq']:
            messages.warning(request, f"Без узбекского перевода: текстов страницы {missing['page_texts']}, "
                                      f"вопросов {missing['faq']}. На узбекской версии они останутся по-русски.")
        return redirect('admin:index')

    def has_permission(self, request):
        # A password alone is not enough: the session must be verified by an OTP device.
        return super().has_permission(request) and request.user.is_verified()
