"""
One business must never see or change another business's records.
"""
from datetime import date
from unittest import mock

from django.test import TestCase

from apps.inventory.models import Product

from .testing import make_business, make_product, sell


class TenantIsolationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        # Business A owns one of everything; business B owns nothing.
        cls.a = make_business('Alpha Agro', 'alpha')
        cls.b = make_business('Beta Agro', 'beta')

        a = cls.a
        cls.product = make_product(a, sku='A1', quantity=20)
        cls.records = {
            '/api/inventory/products/': cls.product,
            '/api/sales/': sell(a, cls.product, 2, unit_price='1000').data['id'],
            '/api/purchases/': a.post('/api/purchases/', {
                'reference': 'PO1', 'amount_paid': '0',
                'items': [{'product': cls.product, 'quantity': 1, 'unit_cost': '400'}],
            }, format='json').data['id'],
            '/api/debts/': a.post('/api/debts/', {
                'debt_type': 'receivable', 'party_name': 'Okello', 'amount': '5000',
            }, format='json').data['id'],
            '/api/expenses/categories/': a.post('/api/expenses/categories/', {
                'name': 'Rent',
            }, format='json').data['id'],
            '/api/expenses/': a.post('/api/expenses/', {
                'description': 'Shop rent', 'amount': '300000',
                'expense_date': str(date.today()),
            }, format='json').data['id'],
            '/api/returns/': a.post('/api/returns/', {
                'reference': 'R1', 'return_type': 'sales', 'resolution': 'refund',
                'items': [{'product': cls.product, 'quantity': 1, 'unit_price': '1000'}],
            }, format='json').data['id'],
        }
        assert all(cls.records.values()), cls.records

    def assert_isolated(self):
        for url, pk in self.records.items():
            with self.subTest(url=url):
                # A sees its own record...
                self.assertIn(pk, [r['id'] for r in self.a.get(url).data])
                # ...B doesn't see it in the list...
                self.assertNotIn(pk, [r['id'] for r in self.b.get(url).data])
                # ...and can't open, change or delete it.
                detail = f'{url}{pk}/'
                self.assertEqual(self.b.get(detail).status_code, 404)
                self.assertEqual(
                    self.b.patch(detail, {'notes': 'x'}, format='json').status_code, 404)
                self.assertEqual(self.b.delete(detail).status_code, 404)
                self.assertEqual(self.a.get(detail).status_code, 200)

    def test_businesses_cannot_see_each_others_records(self):
        self.assert_isolated()

    def test_isolation_holds_even_without_thread_local_tenant(self):
        # If the thread-local tenant were ever left unset, TenantManager
        # would return every business's rows. The viewsets must still
        # filter by the user's own business.
        with mock.patch('apps.accounts.authentication.set_current_tenant'):
            self.assert_isolated()

    def test_cannot_sell_another_business_product(self):
        res = sell(self.b, self.product, 1)
        self.assertEqual(res.status_code, 400, res.data)
        # 20 opening - 2 sold + 1 returned by a customer
        self.assertEqual(Product.all_objects.get(pk=self.product).quantity, 19)

    def test_new_records_belong_to_the_creating_business(self):
        pid = make_product(self.b, sku='B1')
        self.assertEqual(
            Product.all_objects.get(pk=pid).tenant.name, 'Beta Agro')


class BusinessTypeEditTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        from rest_framework.test import APIClient
        from apps.accounts.models import User
        from .models import BusinessType

        User.objects.create_user(username='root', password='rootpass1', role='super')
        cache.clear()
        token = APIClient().post('/api/auth/login/', {
            'username': 'root', 'password': 'rootpass1'}, format='json').data['access']
        self.super = APIClient()
        self.super.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.type = BusinessType.objects.get(slug='hardware')
        self.url = f'/api/tenants/business-types/{self.type.id}/'

    def test_super_admin_can_edit(self):
        res = self.super.patch(self.url, {
            'name': 'Hardware & Building', 'icon': '🧱',
            'features': ['sales', 'inventory', 'barcode', 'sales'],
            'slug': 'changed',
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.type.refresh_from_db()
        self.assertEqual(self.type.name, 'Hardware & Building')
        self.assertEqual(self.type.features, ['inventory', 'sales', 'barcode'])
        self.assertEqual(self.type.slug, 'hardware')          # read-only

    def test_unknown_feature_and_bad_plan_rejected(self):
        self.assertEqual(self.super.patch(
            self.url, {'features': ['sales', 'teleport']}, format='json').status_code, 400)
        self.assertEqual(self.super.patch(
            self.url, {'default_plan': 'suspended'}, format='json').status_code, 400)

    def test_business_admin_and_anonymous_cannot_edit(self):
        from rest_framework.test import APIClient
        owner = make_business('Not Super', 'notsuper')
        self.assertEqual(owner.patch(self.url, {'name': 'x'}, format='json').status_code, 403)
        self.assertIn(APIClient().patch(self.url, {'name': 'x'}, format='json').status_code,
                      (401, 403))

    def test_hidden_type_leaves_signup_list_but_super_still_sees_it(self):
        from rest_framework.test import APIClient
        self.super.patch(self.url, {'is_active': False}, format='json')
        public = [t['slug'] for t in APIClient().get('/api/tenants/business-types/').data]
        self.assertNotIn('hardware', public)
        admin = [t['slug'] for t in self.super.get('/api/tenants/business-types/').data]
        self.assertIn('hardware', admin)

    def test_feature_keys(self):
        from .models import BusinessType
        res = self.super.get('/api/tenants/business-types/feature-keys/')
        self.assertEqual(res.data, BusinessType.ALL_FEATURE_KEYS)
