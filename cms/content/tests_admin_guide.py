"""The admin explains itself: sections grouped by topic, «где на сайте» everywhere, and a help page."""
from django.contrib import admin
from django.urls import reverse

from .admin_guide import GROUPS, GUIDE, HELP
from .tests import AdminTestCase


class AdminGuideTests(AdminTestCase):
    def test_every_content_section_has_a_group_and_an_explanation(self):
        content_models = {model.__name__ for model in admin.site._registry if model._meta.app_label == 'content'}
        grouped = {name for _, _, names in GROUPS for name in names}
        self.assertEqual(content_models - grouped, set(), 'Every content section belongs to a group of the menu')
        for name in content_models:
            self.assertTrue(GUIDE.get(name, {}).get('where'), f'{name} says where it shows on the site')

    def test_home_shows_groups_with_hints_and_the_help_link(self):
        self.login()
        response = self.client.get(self.index_url)
        self.assertContains(response, 'Курсы, цены и кэшбэк')
        self.assertContains(response, 'Преподаватели и результаты учеников')
        self.assertContains(response, 'class="model-hint"')
        self.assertContains(response, reverse('admin:help'))
        # Access sections come after the site's content.
        page = response.content.decode()
        self.assertLess(page.index('Контакты и филиалы'), page.index('Доступ: пользователи и группы'))

    def test_section_pages_explain_what_it_is_and_where_on_the_site(self):
        self.login()
        for url in (reverse('admin:content_course_changelist'), reverse('admin:content_studentresult_add')):
            response = self.client.get(url)
            self.assertContains(response, 'class="site-guide"')
            self.assertContains(response, 'Где на сайте:')

    def test_help_page_lists_every_topic_with_working_links(self):
        self.login()
        response = self.client.get(reverse('admin:help'))
        self.assertEqual(response.status_code, 200)
        for topic in HELP:
            self.assertContains(response, topic['title'])
            if topic.get('link'):
                self.assertContains(response, reverse(topic['link'][0]))
        # The stock page of the whole app still opens (breadcrumbs link to it).
        self.assertEqual(self.client.get(reverse('admin:app_list', args=['content'])).status_code, 200)
