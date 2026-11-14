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

