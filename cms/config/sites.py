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
        return [path('publish/', self.admin_view(require_POST(self.publish_view)), name='publish'),
                path('translations/', self.admin_view(self.translations_view), name='translations'),
                path('help/', self.admin_view(self.help_view), name='help'),
                path('preview/build/', self.admin_view(require_POST(self.preview_build_view)), name='preview_build'),
                path('preview/', self.admin_view(self.preview_view), {'path': ''}, name='preview'),
                path('preview/<path:path>', self.admin_view(self.preview_view), name='preview_file')] + super().get_urls()

    def translations_view(self, request):
        """Every Russian text of the site with its UZ / QQ / EN translations in one editable table."""
        from urllib.parse import urlencode
        from django.core.exceptions import PermissionDenied
        from django.core.paginator import Paginator
        from django.template.response import TemplateResponse
        from content.translation_table import PAGE_SIZE, filter_rows, missing_counts, save_rows, sections, table_rows
        needed = ('content.change_pagetext', 'content.change_faq', 'content.add_translation', 'content.change_translation',
                  'content.delete_translation')
        if not request.user.has_perms(needed):
            raise PermissionDenied
        rows = table_rows()
        if request.method == 'POST':
            saved, errors = save_rows(request.POST, rows)
            for error in errors:
                messages.error(request, error)
            if saved:
                messages.success(request, f'Сохранено строк: {saved}. На сайте переводы появятся после публикации.')
            elif not errors:
                messages.info(request, 'Изменений не было.')
            return redirect(request.get_full_path())
        query, section, missing = request.GET.get('q', ''), request.GET.get('section', ''), request.GET.get('missing', '')
        filtered = filter_rows(rows, query=query, missing=missing, section=section)
        page_obj = Paginator(filtered, PAGE_SIZE).get_page(request.GET.get('page'))
        base = urlencode({key: value for key, value in (('q', query), ('section', section), ('missing', missing)) if value})
        context = {**self.each_context(request), 'title': 'Таблица переводов', 'page_obj': page_obj, 'query': query,
                   'section': section, 'missing': missing, 'sections': sections(rows), 'counts': missing_counts(rows),
                   'base_query': f'{base}&' if base else ''}
        return TemplateResponse(request, 'admin/translation_table.html', context)

    def preview_build_view(self, request):
        """Build the preview from the current drafts and open it."""
        from content.publish import PublishError
        from content.preview import build_preview
        if not request.user.is_superuser:
            messages.error(request, 'Предпросмотр доступен только владельцу (суперпользователю).')
            return redirect('admin:index')
        try:
            build_preview()
        except PublishError as error:
            messages.error(request, str(error))
            return redirect('admin:index')
        return redirect('admin:preview')

    def preview_view(self, request, path=''):
        """Pages and files of the last preview, only for the signed-in owner."""
        from django.http import FileResponse, Http404, HttpResponse
        from content.preview import content_type, fallback, mark_page, resolve
        if not request.user.is_superuser:
            raise Http404
        file = resolve(path) or fallback(path)
        if file is None:
            # On the server the admin has no copy of the shared files (styles, scripts, pictures): take them
            # from the published site. Pages, texts and new photos always come from the preview itself.
            from content.models import SiteSettings
            site_url = (SiteSettings.load().site_url or '').rstrip('/')
            if not site_url or path.endswith('.html') or not path:
                raise Http404
            from django.http import HttpResponseRedirect
            query = request.META.get('QUERY_STRING')
            return HttpResponseRedirect(f"{site_url}/{path}{'?' + query if query else ''}")
        if file.suffix == '.html':
            page = mark_page(file.read_text(encoding='utf-8'), path if not path.endswith('/') else path + 'index.html')
            response = HttpResponse(page, content_type='text/html; charset=utf-8')
        else:
            response = FileResponse(file.open('rb'), content_type=content_type(file))
        response['Cache-Control'] = 'no-store'
        response['X-Robots-Tag'] = 'noindex'
        return response

    def get_app_list(self, request, app_label=None):
        """Side menu and home page: the site's content in plain sections («Курсы, цены и кэшбэк», …), access last.
        Each section of content carries a one-line «где на сайте» for the home page (content.admin_guide)."""
        from content.admin_guide import ACCESS_APPS, ACCESS_MODELS, GROUPS, GUIDE
        apps = super().get_app_list(request, app_label)
        if app_label:
            return apps
        models = {model['object_name']: model for app in apps if app['app_label'] == 'content' for model in app['models']}
        for name, model in models.items():
            model['hint'] = GUIDE.get(name, {}).get('where', '')
        grouped, used = [], set()
        for slug, title, names in GROUPS:
            items = [models[name] for name in names if name in models]
            used.update(name for name in names if name in models)
            if items:
                grouped.append({'name': title, 'app_label': f'group-{slug}', 'app_url': f'#group-{slug}',
                                'has_module_perms': True, 'models': items})
        rest = [model for name, model in models.items() if name not in used]
        if rest:
            grouped.append({'name': 'Прочее', 'app_label': 'group-other', 'app_url': '#group-other',
                            'has_module_perms': True, 'models': rest})
        access = [app for app in apps if app['app_label'] != 'content']
        order = list(ACCESS_APPS)
        access.sort(key=lambda app: order.index(app['app_label']) if app['app_label'] in order else len(order))
        for app in access:
            app['name'] = ACCESS_APPS.get(app['app_label'], app['name'])
            for model in app['models']:
                model['name'] = ACCESS_MODELS.get(model['object_name'], model['name'])
        return grouped + access

    def help_view(self, request):
        """«Как сделать…»: what to fill in for typical tasks and where the result shows on the site."""
        from django.template.response import TemplateResponse
        from django.urls import NoReverseMatch, reverse
        from content.admin_guide import HELP
        topics = []
        for index, topic in enumerate(HELP, start=1):
            item = {**topic, 'id': f'help-{index}'}
            if topic.get('link'):
                try:
                    item['url'] = reverse(topic['link'][0], current_app=self.name)
                    item['label'] = topic['link'][1]
                except NoReverseMatch:
                    item['url'] = None
            topics.append(item)
        context = {**self.each_context(request), 'title': 'Справка: как добавить и где это на сайте', 'topics': topics}
        return TemplateResponse(request, 'admin/stanford_help.html', context)

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
        for language, label in (('uz', 'узбекского'), ('kaa', 'каракалпакского')):
            missing = result.get(f'missing_{language}', {})
            if missing.get('page_texts') or missing.get('faq'):
                messages.warning(request, f"Без {label} перевода: текстов страницы {missing['page_texts']}, "
                                          f"вопросов {missing['faq']}. Они останутся по-русски.")
        return redirect('admin:index')

    def has_permission(self, request):
        # A password alone is not enough: the session must be verified by an OTP device.
        return super().has_permission(request) and request.user.is_verified()
