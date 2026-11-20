"""The address used by the brute-force lock behind Railway's proxy."""
import os
from unittest import mock

from django.core.exceptions import ImproperlyConfigured
from django.test import RequestFactory, SimpleTestCase

from config.client_ip import client_ip, trusted_proxy_hops


class ClientAddressTests(SimpleTestCase):
    def request(self, forwarded=None):
        meta = {'REMOTE_ADDR': '10.0.0.5'}
        if forwarded is not None:
            meta['HTTP_X_FORWARDED_FOR'] = forwarded
        return RequestFactory().get('/', **meta)

    def test_without_trusted_proxies_the_header_is_ignored(self):
        self.assertEqual(client_ip(self.request('203.0.113.7'), hops=0), '10.0.0.5')

    def test_one_trusted_proxy_takes_the_address_it_saw_not_a_forged_leftmost_one(self):
        self.assertEqual(client_ip(self.request('203.0.113.7'), hops=1), '203.0.113.7')
        self.assertEqual(client_ip(self.request('6.6.6.6, 203.0.113.7'), hops=1), '203.0.113.7')
        self.assertEqual(client_ip(self.request('not-an-ip, 203.0.113.7'), hops=1), '10.0.0.5')
        self.assertEqual(client_ip(self.request(), hops=1), '10.0.0.5')

    def test_the_setting_must_be_a_small_number(self):
        for bad in ('-1', 'one', '11'):
            with mock.patch.dict(os.environ, {'DJANGO_TRUST_PROXY_HOPS': bad}), self.assertRaises(ImproperlyConfigured):
                trusted_proxy_hops()
        with mock.patch.dict(os.environ, {'DJANGO_TRUST_PROXY_HOPS': '1'}):
            self.assertEqual(trusted_proxy_hops(), 1)
