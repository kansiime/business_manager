from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Membership, User
from apps.tenants.models import BusinessType, Tenant

from .models import Payment, Plan


def signup(client, **overrides):
    data = {
        'business_name': 'Mukasa Agro',
        'business_type_slug': 'agro',
        'full_name': 'Jane Mukasa',
        'email': 'jane@example.com',
        'phone': '0700000000',
        'username': 'jane',
        'password': 'Str0ng-pass-123',
        **overrides,
    }
    return client.post('/api/auth/signup/', data, format='json')


def authed(token):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return c


class SignupAndBusinessesTests(TestCase):
    def setUp(self):
        cache.clear()   # login / sign-up throttle counters
        self.client = APIClient()

    def test_signup_creates_owner_business_and_14_day_trial(self):
        res = signup(self.client)
        self.assertEqual(res.status_code, 201, res.data)

        tenant = Tenant.objects.get(name='Mukasa Agro')
        self.assertEqual(tenant.plan, 'trial')
        self.assertEqual(tenant.status, 'trial')
        days = (tenant.trial_ends_at - timezone.now()).total_seconds() / 86400
        self.assertAlmostEqual(days, 14, delta=0.01)

        user = User.objects.get(username='jane')
        m = Membership.objects.get(user=user, tenant=tenant)
        self.assertEqual(m.role, 'admin')
        self.assertTrue(m.is_owner)
        self.assertFalse(user.is_staff)

        self.assertEqual(len(res.data['businesses']), 1)
        ctx = authed(res.data['access']).get('/api/tenants/context/')
        self.assertEqual(ctx.status_code, 200)
        self.assertEqual(ctx.data['tenant']['name'], 'Mukasa Agro')

    def test_signup_rejects_duplicate_email_and_weak_password(self):
        signup(self.client)
        res = signup(self.client, username='other')
        self.assertEqual(res.status_code, 400)
        self.assertIn('email', res.data)

        res = signup(self.client, username='x2', email='x2@example.com', password='password')
        self.assertEqual(res.status_code, 400)

    def test_login_with_email(self):
        signup(self.client)
        res = self.client.post(
            '/api/auth/login/',
            {'username': 'jane@example.com', 'password': 'Str0ng-pass-123'},
            format='json',
        )
        self.assertEqual(res.status_code, 200)

    def test_owner_can_create_and_switch_between_businesses(self):
        first = signup(self.client).data
        client = authed(first['access'])

        res = client.post(
            '/api/auth/businesses/',
            {'business_name': 'Mukasa Garage', 'business_type_slug': 'garage'},
            format='json',
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(len(res.data['businesses']), 2)

        # The new token works inside the new business only
        garage = Tenant.objects.get(name='Mukasa Garage')
        ctx = authed(res.data['access']).get('/api/tenants/context/')
        self.assertEqual(ctx.data['tenant']['id'], str(garage.id))
        self.assertIn('repairs', ctx.data['enabled_features'])

        # Switch back to the first business
        agro = Tenant.objects.get(name='Mukasa Agro')
        res = authed(res.data['access']).post(
            '/api/auth/switch-business/', {'tenant_id': str(agro.id)}, format='json'
        )
        self.assertEqual(res.status_code, 200)
        ctx = authed(res.data['access']).get('/api/tenants/context/')
        self.assertEqual(ctx.data['tenant']['id'], str(agro.id))

        # Login with 2 businesses returns both, current = last used
        res = self.client.post(
            '/api/auth/login/', {'username': 'jane', 'password': 'Str0ng-pass-123'}, format='json'
        )
        current = [b for b in res.data['businesses'] if b['is_current']]
        self.assertEqual(current[0]['id'], str(agro.id))

    def test_cannot_switch_into_someone_elses_business(self):
        jane = signup(self.client).data
        signup(self.client, username='bob', email='bob@example.com', business_name='Bob Shop')
        bob_shop = Tenant.objects.get(name='Bob Shop')
        res = authed(jane['access']).post(
            '/api/auth/switch-business/', {'tenant_id': str(bob_shop.id)}, format='json'
        )
        self.assertEqual(res.status_code, 404)

    def test_business_data_is_isolated(self):
        from apps.expenses.models import ExpenseCategory

        jane = signup(self.client).data
        bob = signup(self.client, username='bob', email='bob@example.com', business_name='Bob Shop').data
        jane_biz = Tenant.objects.get(name='Mukasa Agro')
        bob_biz = Tenant.objects.get(name='Bob Shop')

        res = authed(jane['access']).post('/api/expenses/categories/', {'name': 'Rent'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        res = authed(bob['access']).get('/api/expenses/categories/')
        self.assertNotIn('Rent', [c['name'] for c in res.data])

        # Sending another business's id can't plant rows in it
        res = authed(bob['access']).post(
            '/api/expenses/categories/',
            {'name': 'Planted', 'tenant': str(jane_biz.id)}, format='json',
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(ExpenseCategory.all_objects.get(name='Planted').tenant_id, bob_biz.id)

        # Duplicate names are a validation error, not a crash
        res = authed(jane['access']).post('/api/expenses/categories/', {'name': 'rent'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_admin_cannot_grant_super_or_exceed_seat_limit(self):
        jane = signup(self.client).data
        client = authed(jane['access'])
        res = client.post('/api/auth/users/', {
            'username': 'evil', 'password': 'whatever1', 'role': 'super',
        }, format='json')
        self.assertEqual(res.status_code, 400)

        tenant = Tenant.objects.get(name='Mukasa Agro')
        tenant.max_users = 2
        tenant.save()
        ok = client.post('/api/auth/users/', {
            'username': 'cash1', 'password': 'whatever1', 'role': 'cashier',
        }, format='json')
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertTrue(Membership.objects.filter(user__username='cash1', tenant=tenant).exists())
        full = client.post('/api/auth/users/', {
            'username': 'cash2', 'password': 'whatever1', 'role': 'cashier',
        }, format='json')
        self.assertEqual(full.status_code, 400)


class ExpiryAndPaymentTests(TestCase):
    def setUp(self):
        cache.clear()   # login / sign-up throttle counters
        self.client = APIClient()
        self.session = signup(self.client).data
        self.tenant = Tenant.objects.get(name='Mukasa Agro')
        self.starter = Plan.objects.get(code='starter')

    def expire_trial(self):
        self.tenant.trial_ends_at = timezone.now() - timedelta(hours=1)
        self.tenant.save()

    def test_expired_trial_is_read_only_but_can_pay(self):
        self.expire_trial()
        client = authed(self.session['access'])

        self.assertEqual(client.get('/api/expenses/categories/').status_code, 200)

        res = client.post('/api/expenses/categories/', {'name': 'Rent'}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data['code'], 'subscription_expired')

        self.assertEqual(client.get('/api/billing/subscription/').status_code, 200)

        # Still able to sign in so they can pay
        res = self.client.post(
            '/api/auth/login/', {'username': 'jane', 'password': 'Str0ng-pass-123'}, format='json'
        )
        self.assertEqual(res.status_code, 200)

    def test_blocked_business_cannot_sign_in(self):
        self.tenant.is_blocked = True
        self.tenant.blocked_reason = 'Fraud check'
        self.tenant.save()
        res = self.client.post(
            '/api/auth/login/', {'username': 'jane', 'password': 'Str0ng-pass-123'}, format='json'
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data['error'], 'Fraud check')

    @override_settings(FLUTTERWAVE_SECRET_KEY='FLWSECK_TEST', FLUTTERWAVE_WEBHOOK_HASH='hook-secret')
    def test_flutterwave_checkout_verify_activates_plan(self):
        self.expire_trial()
        client = authed(self.session['access'])

        with mock.patch('apps.billing.flutterwave.create_checkout', return_value='https://pay.example/x'):
            res = client.post('/api/billing/checkout/', {'plan': 'starter', 'billing_cycle': 'monthly'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        tx_ref = res.data['tx_ref']
        payment = Payment.objects.get(tx_ref=tx_ref)
        self.assertEqual(payment.amount, self.starter.monthly_price)

        verified = {
            'id': 999, 'tx_ref': tx_ref, 'status': 'successful',
            'amount': float(payment.amount), 'currency': 'UGX',
        }
        with mock.patch('apps.billing.flutterwave.verify_transaction', return_value=verified):
            res = client.post('/api/billing/verify/', {'tx_ref': tx_ref, 'transaction_id': 999}, format='json')
        self.assertEqual(res.status_code, 200, res.data)

        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.plan, 'starter')
        self.assertEqual(self.tenant.status, 'active')
        self.assertFalse(self.tenant.is_expired)
        self.assertEqual(self.tenant.max_users, self.starter.max_users)
        days = (self.tenant.subscription_ends_at - timezone.now()).total_seconds() / 86400
        self.assertAlmostEqual(days, 30, delta=0.01)

        # Writes work again
        res = client.post('/api/expenses/categories/', {'name': 'Rent'}, format='json')
        self.assertEqual(res.status_code, 201)

        # Verifying twice doesn't extend twice
        with mock.patch('apps.billing.flutterwave.verify_transaction', return_value=verified):
            client.post('/api/billing/verify/', {'tx_ref': tx_ref, 'transaction_id': 999}, format='json')
        self.tenant.refresh_from_db()
        days = (self.tenant.subscription_ends_at - timezone.now()).total_seconds() / 86400
        self.assertAlmostEqual(days, 30, delta=0.01)

    @override_settings(FLUTTERWAVE_SECRET_KEY='FLWSECK_TEST')
    def test_paying_during_trial_keeps_remaining_trial_days(self):
        client = authed(self.session['access'])
        with mock.patch('apps.billing.flutterwave.create_checkout', return_value='https://pay.example/x'):
            tx_ref = client.post('/api/billing/checkout/', {'plan': 'starter', 'billing_cycle': 'yearly'}, format='json').data['tx_ref']
        verified = {'id': 1, 'tx_ref': tx_ref, 'status': 'successful', 'amount': 500000, 'currency': 'UGX'}
        with mock.patch('apps.billing.flutterwave.verify_transaction', return_value=verified):
            client.post('/api/billing/verify/', {'tx_ref': tx_ref, 'transaction_id': 1}, format='json')
        self.tenant.refresh_from_db()
        days = (self.tenant.subscription_ends_at - timezone.now()).total_seconds() / 86400
        self.assertAlmostEqual(days, 14 + 365, delta=0.01)

    @override_settings(FLUTTERWAVE_SECRET_KEY='FLWSECK_TEST')
    def test_underpayment_is_rejected(self):
        client = authed(self.session['access'])
        with mock.patch('apps.billing.flutterwave.create_checkout', return_value='https://pay.example/x'):
            tx_ref = client.post('/api/billing/checkout/', {'plan': 'starter'}, format='json').data['tx_ref']
        verified = {'id': 1, 'tx_ref': tx_ref, 'status': 'successful', 'amount': 100, 'currency': 'UGX'}
        with mock.patch('apps.billing.flutterwave.verify_transaction', return_value=verified):
            res = client.post('/api/billing/verify/', {'tx_ref': tx_ref, 'transaction_id': 1}, format='json')
        self.assertEqual(res.status_code, 400)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.plan, 'trial')

    @override_settings(FLUTTERWAVE_SECRET_KEY='FLWSECK_TEST', FLUTTERWAVE_WEBHOOK_HASH='hook-secret')
    def test_webhook_requires_secret_and_activates(self):
        client = authed(self.session['access'])
        with mock.patch('apps.billing.flutterwave.create_checkout', return_value='https://pay.example/x'):
            tx_ref = client.post('/api/billing/checkout/', {'plan': 'growth'}, format='json').data['tx_ref']
        body = {'event': 'charge.completed', 'data': {'tx_ref': tx_ref, 'status': 'successful'}}

        res = APIClient().post('/api/billing/webhook/', body, format='json', HTTP_VERIF_HASH='wrong')
        self.assertEqual(res.status_code, 401)

        verified = {'id': 5, 'tx_ref': tx_ref, 'status': 'successful', 'amount': 100000, 'currency': 'UGX'}
        with mock.patch('apps.billing.flutterwave.verify_by_reference', return_value=verified):
            res = APIClient().post('/api/billing/webhook/', body, format='json', HTTP_VERIF_HASH='hook-secret')
        self.assertEqual(res.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.plan, 'growth')

    def test_only_admin_can_checkout(self):
        cashier = User.objects.create_user(username='c1', password='whatever1', role='cashier', tenant=self.tenant)
        Membership.objects.create(user=cashier, tenant=self.tenant, role='cashier')
        token = self.client.post('/api/auth/login/', {'username': 'c1', 'password': 'whatever1'}, format='json').data['access']
        res = authed(token).post('/api/billing/checkout/', {'plan': 'starter'}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_super_admin_records_manual_payment(self):
        User.objects.create_user(username='root', password='rootpass1', role='super')
        token = self.client.post('/api/auth/login/', {'username': 'root', 'password': 'rootpass1'}, format='json').data['access']
        self.expire_trial()
        res = authed(token).post('/api/billing/manual-payment/', {
            'tenant_id': str(self.tenant.id), 'plan': 'starter',
            'billing_cycle': 'monthly', 'reference': 'MTN 12345',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.plan, 'starter')
        self.assertFalse(self.tenant.is_expired)


class CrossBusinessIsolationTests(TestCase):
    """Every module must only ever show the signed-in business's rows."""

    def setUp(self):
        cache.clear()
        client = APIClient()
        self.jane = signup(client, business_type_slug='clinic', business_name='Jane Clinic').data
        self.bob = signup(
            client, username='bob', email='bob@example.com',
            business_type_slug='clinic', business_name='Bob Clinic',
        ).data
        self.jane_biz = Tenant.objects.get(name='Jane Clinic')

    def test_list_and_detail_are_scoped(self):
        from apps.clinic.models import Patient
        from apps.inventory.models import Category

        cat = Category.all_objects.create(tenant=self.jane_biz, name='Jane-only')
        patient = Patient.all_objects.create(
            tenant=self.jane_biz, patient_number='PT-1', first_name='Secret', last_name='Patient',
        )
        bob = authed(self.bob['access'])
        jane = authed(self.jane['access'])

        for url, obj_id in [
            ('/api/inventory/categories/', cat.id),
            ('/api/clinic/patients/', patient.id),
        ]:
            listed = bob.get(url).data
            rows = listed.get('results', listed) if isinstance(listed, dict) else listed
            self.assertEqual(rows, [], url)
            self.assertEqual(bob.get(f'{url}{obj_id}/').status_code, 404, url)
            self.assertEqual(jane.get(f'{url}{obj_id}/').status_code, 200, url)
