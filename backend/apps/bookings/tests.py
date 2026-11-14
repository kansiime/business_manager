"""
Each business type sees its own modules (a salon is not a clinic), service
items carry no stock, and salon bookings can be charged into sales.
"""
from datetime import date

from django.test import TestCase

from apps.accounts.role_matrix import CLINIC_PAGES
from apps.debts.models import Debt
from apps.inventory.models import Product
from apps.sales.models import Sale
from apps.tenants.models import BusinessType
from apps.tenants.testing import make_business, make_product

CLINIC_ONLY = set(CLINIC_PAGES) - {'dashboard', 'ai-analytics', 'settings', 'sales-per-staff'}


def context(client):
    return client.get('/api/tenants/context/').data


class BusinessTypeVisibilityTests(TestCase):
    def test_seeded_types_use_clinic_and_bookings_features(self):
        features = {bt.slug: set(bt.features) for bt in BusinessType.objects.all()}
        self.assertIn('clinic', features['clinic'])
        self.assertIn('bookings', features['salon'])
        self.assertIn('inventory', features['salon'])
        for slug, feats in features.items():
            self.assertNotIn('appointments', feats, slug)
            if slug != 'clinic':
                self.assertNotIn('clinic', feats, slug)

    def test_salon_sees_bookings_not_clinic(self):
        ctx = context(make_business('Glam Salon', 'glam', business_type='salon'))
        pages = set(ctx['pages'])
        self.assertIn('bookings', pages)
        self.assertIn('inventory', pages)
        self.assertFalse(pages & CLINIC_ONLY, pages & CLINIC_ONLY)

    def test_clinic_sees_clinic_not_bookings(self):
        pages = set(context(make_business('Hope Clinic', 'hope', business_type='clinic'))['pages'])
        self.assertIn('patients', pages)
        self.assertIn('consultations', pages)
        self.assertNotIn('bookings', pages)

    def test_other_types_see_neither(self):
        for slug in ('garage', 'grocery', 'drugshop', 'restaurant', 'boutique', 'general'):
            with self.subTest(slug=slug):
                pages = set(context(make_business(f'{slug} biz', f'{slug}x', business_type=slug))['pages'])
                self.assertFalse(pages & (CLINIC_ONLY | {'bookings'}), pages & (CLINIC_ONLY | {'bookings'}))

    def test_clinic_api_is_closed_to_a_salon(self):
        salon = make_business('Closed Salon', 'closed', business_type='salon')
        self.assertEqual(salon.get('/api/clinic/patients/').status_code, 403)
        clinic = make_business('Open Clinic', 'openc', business_type='clinic')
        self.assertEqual(clinic.get('/api/clinic/patients/').status_code, 200)

    def test_bookings_api_is_closed_to_a_clinic(self):
        clinic = make_business('No Bookings Clinic', 'nobk', business_type='clinic')
        self.assertEqual(clinic.get('/api/bookings/').status_code, 403)

    def test_salon_cannot_be_offered_clinical_roles(self):
        salon = make_business('Roles Salon', 'roles', business_type='salon')
        keys = {r['key'] for r in salon.get('/api/auth/roles/').data}
        self.assertNotIn('doctor', keys)


class ServiceItemTests(TestCase):
    def setUp(self):
        self.client = make_business('Cut Above', 'cutabove', business_type='salon')
        self.haircut = make_product(self.client, sku='CUT', is_service=True, quantity=99)

    def test_service_has_no_stock_and_is_never_low(self):
        p = Product.all_objects.get(pk=self.haircut)
        self.assertTrue(p.is_service)
        self.assertEqual((p.quantity, p.reorder_level), (0, 0))
        data = self.client.get('/api/reports/dashboard/').data
        self.assertEqual(data['low_stock'], 0)

    def test_selling_a_service_needs_no_stock(self):
        res = self.client.post('/api/sales/', {
            'reference': 'S1', 'payment_type': 'cash', 'amount_paid': '3000',
            'items': [{'product': self.haircut, 'quantity': 3, 'unit_price': '1000'}],
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Product.all_objects.get(pk=self.haircut).quantity, 0)


class BookingTests(TestCase):
    def setUp(self):
        self.client = make_business('Fade Barbers', 'fade', business_type='salon')
        self.haircut = make_product(self.client, sku='FADE', is_service=True)   # price 1000, cost 500

    def book(self, **extra):
        res = self.client.post('/api/bookings/', {
            'customer_name': 'Brian', 'customer_phone': '0700111222',
            'service': self.haircut, 'date': str(date.today()), 'time': '10:30', **extra,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_booking_defaults_price_and_lists_by_day(self):
        b = self.book()
        self.assertEqual(float(b['price']), 1000)
        self.assertEqual(b['service_name'], 'Product FADE')
        day = self.client.get(f'/api/bookings/?date={date.today()}').data
        self.assertEqual([x['id'] for x in day], [b['id']])
        self.assertEqual(self.client.get('/api/bookings/?date=2000-01-01').data, [])

    def test_checkout_records_sale_once(self):
        b = self.book()
        res = self.client.post(f"/api/bookings/{b['id']}/checkout/", {'payment_type': 'mobile_money'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['status'], 'completed')
        sale = Sale.all_objects.get(reference=f"BK-{b['id']}")
        self.assertEqual((sale.total_amount, sale.payment_type), (1000, 'mobile_money'))
        again = self.client.post(f"/api/bookings/{b['id']}/checkout/", {}, format='json')
        self.assertEqual(again.status_code, 400)

    def test_checkout_on_credit_opens_a_debt(self):
        b = self.book()
        self.client.post(f"/api/bookings/{b['id']}/checkout/", {'payment_type': 'credit'}, format='json')
        debt = Debt.all_objects.get(reference=f"BK-{b['id']}")
        self.assertEqual((debt.debt_type, debt.balance), ('receivable', 1000))

    def test_checkout_follows_price_rules(self):
        b = self.book()
        res = self.client.post(f"/api/bookings/{b['id']}/checkout/", {'price': 200}, format='json')
        self.assertEqual(res.status_code, 400)       # below cost needs confirmation
        self.assertIn('below_cost', res.data)

    def test_dashboard_lists_todays_bookings_and_week(self):
        self.book(customer_name='Ann', time='09:00')
        self.book(customer_name='Ben', time='11:00')
        data = self.client.get('/api/reports/dashboard/').data
        self.assertEqual([b['customer_name'] for b in data['bookings_today']], ['Ann', 'Ben'])
        self.assertEqual(len(data['sales_7d']), 7)

    def test_other_business_cannot_see_bookings(self):
        self.book()
        other = make_business('Other Salon', 'othersalon', business_type='salon')
        self.assertEqual(other.get('/api/bookings/').data, [])
