"""
Bargained prices: discounts are recorded, staff are held to the business's
discount limit, and only admins / managers can sell below cost (after
confirming).
"""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import GarageSettings
from apps.inventory.models import Product
from apps.tenants.models import Tenant
from apps.tenants.testing import make_business, make_product

# make_product: cost 500, normal selling price 1000.


class DiscountTests(TestCase):
    def setUp(self):
        self.admin = make_business('Bargain Shop', 'bargain')
        self.pid = make_product(self.admin, quantity=50)
        self.tenant = Tenant.objects.get(name='Bargain Shop')

    def staff(self, role):
        username = f'{role}1'
        res = self.admin.post('/api/auth/users/', {
            'username': username, 'password': 'Staff-pass-123', 'role': role,
        }, format='json')
        assert res.status_code == 201, res.data
        cache.clear()
        token = APIClient().post('/api/auth/login/', {
            'username': username, 'password': 'Staff-pass-123'}, format='json').data['access']
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        return client

    def sale(self, client, price, ref='S1', **extra):
        return client.post('/api/sales/', {
            'reference': ref, 'payment_type': 'cash', 'amount_paid': str(price * 2),
            'items': [{'product': self.pid, 'quantity': 2, 'unit_price': str(price)}],
            **extra,
        }, format='json')

    def stock(self):
        return Product.all_objects.get(pk=self.pid).quantity

    def test_discount_is_recorded_and_reported(self):
        res = self.sale(self.admin, 800)
        self.assertEqual(res.status_code, 201, res.data)
        item = res.data['items'][0]
        self.assertEqual(float(item['list_price']), 1000)
        self.assertEqual(float(item['discount']), 400)          # 2 x 200 off
        self.assertEqual(res.data['total_discount'], 400)
        listed = self.admin.get('/api/sales/').data[0]
        self.assertEqual(listed['total_discount'], 400)

    def test_normal_price_has_no_discount(self):
        res = self.sale(self.admin, 1000)
        self.assertEqual(res.data['total_discount'], 0)

    def test_cashier_within_limit(self):
        cashier = self.staff('cashier')
        self.assertEqual(self.sale(cashier, 900).status_code, 201)   # 10% off, limit 10%

    def test_cashier_over_limit_is_refused(self):
        cashier = self.staff('cashier')
        res = self.sale(cashier, 850)                                # 15% off
        self.assertEqual(res.status_code, 400)
        self.assertIn('more than your 10% discount limit', str(res.data))
        self.assertEqual(self.stock(), 50)                           # nothing sold

    def test_limit_comes_from_business_settings(self):
        GarageSettings.all_objects.filter(tenant=self.tenant).update(max_discount_percent=20)
        cashier = self.staff('cashier')
        self.assertEqual(self.sale(cashier, 850).status_code, 201)

    def test_manager_has_no_discount_limit(self):
        manager = self.staff('manager')
        self.assertEqual(self.sale(manager, 600).status_code, 201)   # 40% off, above cost

    def test_cashier_cannot_sell_below_cost(self):
        GarageSettings.all_objects.filter(tenant=self.tenant).update(max_discount_percent=100)
        cashier = self.staff('cashier')
        res = self.sale(cashier, 400, allow_below_cost=True)         # flag doesn't help
        self.assertEqual(res.status_code, 400)
        self.assertIn('Only a manager or admin can sell below cost', str(res.data))

    def test_admin_must_confirm_below_cost(self):
        res = self.sale(self.admin, 400)
        self.assertEqual(res.status_code, 400)
        self.assertIn('below_cost', res.data)
        self.assertEqual(self.stock(), 50)

        res = self.sale(self.admin, 400, allow_below_cost=True)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.stock(), 48)
        self.assertEqual(float(res.data['items'][0]['profit']), -200)   # 2 x (400 - 500)

    def test_receipt_shows_discount(self):
        sale_id = self.sale(self.admin, 800).data['id']
        res = self.admin.get(f'/api/sales/{sale_id}/receipt/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/pdf')
