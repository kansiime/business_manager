"""
Stock must always match what was sold, bought, returned and counted.

Every change goes through `apps.inventory.stock`, which updates the count
in the database (`quantity = quantity - n`) rather than saving a value
computed from a possibly stale in-memory product.
"""
from django.test import TestCase

from apps.tenants.testing import make_business, make_product, sell

from .models import Product, StockMovement
from .serializers import ProductSerializer
from .stock import InsufficientStock, add_stock, remove_stock


def qty(product_id):
    return Product.all_objects.get(pk=product_id).quantity


class StockHelperTests(TestCase):
    def setUp(self):
        self.client = make_business('Stock Shop', 'stock')
        self.pid = make_product(self.client, quantity=10)

    def test_remove_uses_database_count_not_stale_object(self):
        stale = Product.all_objects.get(pk=self.pid)           # thinks 10
        Product.all_objects.filter(pk=self.pid).update(quantity=2)

        with self.assertRaises(InsufficientStock) as ctx:
            remove_stock(stale, 5)
        self.assertEqual(ctx.exception.available, 2)
        self.assertEqual(qty(self.pid), 2)

    def test_changes_from_two_stale_copies_both_count(self):
        # Two requests that loaded the product at the same time.
        a = Product.all_objects.get(pk=self.pid)
        b = Product.all_objects.get(pk=self.pid)
        remove_stock(a, 3)
        remove_stock(b, 4)
        add_stock(a, 1)
        self.assertEqual(qty(self.pid), 4)          # 10 - 3 - 4 + 1

    def test_allow_negative(self):
        p = Product.all_objects.get(pk=self.pid)
        self.assertEqual(remove_stock(p, 12, allow_negative=True), -2)

    def test_product_edit_does_not_overwrite_stock(self):
        p = Product.all_objects.get(pk=self.pid)               # loaded at 10
        Product.all_objects.filter(pk=self.pid).update(quantity=7)  # a sale lands

        s = ProductSerializer(p, data={'name': 'Renamed', 'quantity': 99},
                              partial=True)
        s.is_valid(raise_exception=True)
        s.save()

        p.refresh_from_db()
        self.assertEqual(p.name, 'Renamed')
        self.assertEqual(p.quantity, 7)


class SaleStockTests(TestCase):
    def setUp(self):
        self.client = make_business('Sale Shop', 'saler')
        self.pid = make_product(self.client, quantity=10)

    def test_sale_reduces_stock_and_logs_movement(self):
        res = sell(self.client, self.pid, 4)
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(qty(self.pid), 6)
        self.assertTrue(StockMovement.all_objects.filter(
            product_id=self.pid, movement_type='out', quantity=4,
        ).exists())

    def test_cannot_sell_more_than_in_stock(self):
        res = sell(self.client, self.pid, 11)
        self.assertEqual(res.status_code, 400, res.data)
        self.assertIn('in stock', str(res.data))
        self.assertEqual(qty(self.pid), 10)
        self.assertEqual(self.client.get('/api/sales/').data, [])

    def test_failed_line_rolls_back_whole_sale(self):
        other = make_product(self.client, sku='P2', quantity=1)
        res = self.client.post('/api/sales/', {
            'reference': 'S1', 'payment_type': 'cash', 'amount_paid': '0',
            'items': [
                {'product': self.pid, 'quantity': 3, 'unit_price': '1000'},
                {'product': other, 'quantity': 5, 'unit_price': '1000'},
            ],
        }, format='json')
        self.assertEqual(res.status_code, 400, res.data)
        self.assertEqual(qty(self.pid), 10)
        self.assertEqual(qty(other), 1)

    def test_editing_items_restores_then_reapplies_stock(self):
        sale = sell(self.client, self.pid, 4).data
        res = self.client.put(f"/api/sales/{sale['id']}/", {
            'reference': 'S1', 'payment_type': 'cash', 'amount_paid': '2000',
            'items': [{'product': self.pid, 'quantity': 2, 'unit_price': '1000'}],
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(qty(self.pid), 8)

    def test_patch_without_items_keeps_items_and_stock(self):
        sale = sell(self.client, self.pid, 4).data
        res = self.client.patch(f"/api/sales/{sale['id']}/",
                                {'customer_name': 'Okello'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(len(res.data['items']), 1)
        self.assertEqual(qty(self.pid), 6)


class OtherStockPathTests(TestCase):
    def setUp(self):
        self.client = make_business('Other Shop', 'other')
        self.pid = make_product(self.client, quantity=10)

    def test_stock_out_movement_cannot_go_negative(self):
        res = self.client.post('/api/inventory/movements/', {
            'product': self.pid, 'movement_type': 'out', 'quantity': 11,
        }, format='json')
        self.assertEqual(res.status_code, 400, res.data)
        self.assertEqual(qty(self.pid), 10)
        # The movement row is rolled back along with the stock change.
        self.assertFalse(StockMovement.all_objects.filter(
            product_id=self.pid, movement_type='out').exists())

    def test_stock_in_and_adjust(self):
        self.client.post('/api/inventory/movements/', {
            'product': self.pid, 'movement_type': 'in', 'quantity': 5,
        }, format='json')
        self.assertEqual(qty(self.pid), 15)
        self.client.post('/api/inventory/movements/', {
            'product': self.pid, 'movement_type': 'adjust', 'quantity': 3,
        }, format='json')
        self.assertEqual(qty(self.pid), 3)

    def test_reconciliation_sets_physical_count(self):
        res = self.client.post('/api/inventory/reconciliations/', {
            'product': self.pid, 'physical_quantity': 8,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['system_quantity'], 10)
        self.assertEqual(res.data['difference'], -2)
        self.assertEqual(qty(self.pid), 8)

    def test_received_purchase_adds_stock_once_and_copies_batch(self):
        res = self.client.post('/api/purchases/', {
            'reference': 'PO1', 'status': 'pending', 'amount_paid': '0',
            'items': [{'product': self.pid, 'quantity': 5, 'unit_cost': '400',
                       'batch_number': 'B-77'}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(qty(self.pid), 10)

        url = f"/api/purchases/{res.data['id']}/"
        self.client.patch(url, {'status': 'received'}, format='json')
        self.client.patch(url, {'status': 'received'}, format='json')

        p = Product.all_objects.get(pk=self.pid)
        self.assertEqual(p.quantity, 15)
        self.assertEqual(p.batch_number, 'B-77')

    def _return(self, return_type, quantity):
        return self.client.post('/api/returns/', {
            'reference': f'R-{return_type}-{quantity}',
            'return_type': return_type, 'resolution': 'refund',
            'items': [{'product': self.pid, 'quantity': quantity,
                       'unit_price': '1000'}],
        }, format='json')

    def test_returns_move_stock_both_ways(self):
        self.assertEqual(self._return('sales', 2).status_code, 201)
        self.assertEqual(qty(self.pid), 12)
        self.assertEqual(self._return('purchase', 5).status_code, 201)
        self.assertEqual(qty(self.pid), 7)

    def test_cannot_return_more_to_supplier_than_in_stock(self):
        res = self._return('purchase', 11)
        self.assertEqual(res.status_code, 400, res.data)
        self.assertEqual(qty(self.pid), 10)


class ApiShapeAndSpeedTests(TestCase):
    def setUp(self):
        self.client = make_business('Speed Shop', 'speedy')

    def test_product_reports_days_to_expiry(self):
        from datetime import timedelta
        from django.utils import timezone
        today = timezone.localtime().date()
        make_product(self.client, sku='OLD', expiry_date=str(today - timedelta(days=2)))
        make_product(self.client, sku='NEW', expiry_date=str(today + timedelta(days=10)))
        make_product(self.client, sku='NONE')
        rows = {p['sku']: p for p in self.client.get('/api/inventory/products/').data}
        self.assertEqual(rows['OLD']['days_to_expiry'], -2)
        self.assertTrue(rows['OLD']['is_expired'])
        self.assertEqual(rows['NEW']['days_to_expiry'], 10)
        self.assertIsNone(rows['NONE']['days_to_expiry'])

    def test_sales_list_query_count_does_not_grow_with_sales(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        pid = make_product(self.client, quantity=100)

        def queries_for_list():
            with CaptureQueriesContext(connection) as ctx:
                res = self.client.get('/api/sales/')
            self.assertEqual(res.status_code, 200)
            return len(ctx.captured_queries), len(res.data)

        for i in range(2):
            sell(self.client, pid, 1, reference=f'A{i}')
        few, n_few = queries_for_list()
        for i in range(6):
            sell(self.client, pid, 1, reference=f'B{i}')
        many, n_many = queries_for_list()
        self.assertEqual((n_few, n_many), (2, 8))
        self.assertEqual(few, many)
