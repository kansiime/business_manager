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
        with mock.patch('apps.billing.flutterwave.verify_by_reference', return_value=verified):
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
        with mock.patch('apps.billing.flutterwave.verify_by_reference', return_value=verified):
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
        with mock.patch('apps.billing.flutterwave.verify_by_reference', return_value=verified):
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
        with mock.patch('apps.billing.flutterwave.verify_by_reference', return_value=verified):
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


class SessionContextAndAuthTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.session = signup(self.client).data

    def test_login_includes_app_context(self):
        res = self.client.post(
            '/api/auth/login/', {'username': 'jane', 'password': 'Str0ng-pass-123'}, format='json'
        )
        ctx = res.data['context']
        self.assertEqual(ctx['tenant']['name'], 'Mukasa Agro')
        self.assertIn('sales', ctx['pages'])
        self.assertEqual(ctx['role'], 'admin')
        self.assertEqual(ctx['plan_status']['plan'], 'trial')

    def test_authenticated_request_uses_one_query_for_auth(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        client = authed(self.session['access'])
        with CaptureQueriesContext(connection) as ctx:
            res = client.get('/api/auth/my-pages/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(ctx.captured_queries), 1)

    def test_deactivated_user_is_rejected(self):
        User.objects.filter(username='jane').update(is_active=False)
        res = authed(self.session['access']).get('/api/tenants/context/')
        self.assertEqual(res.status_code, 401)

    def test_dashboard_summary_totals(self):
        from apps.debts.models import Debt
        from apps.inventory.models import Product
        from apps.sales.models import Sale, SaleItem

        tenant = Tenant.objects.get(name='Mukasa Agro')
        product = Product.all_objects.create(
            tenant=tenant, name='Seeds', sku='S1', quantity=3, reorder_level=5,
            cost_price=Decimal('100'), selling_price=Decimal('150'),
        )
        sale = Sale.all_objects.create(tenant=tenant, reference='R1', total_amount=Decimal('300'))
        SaleItem.objects.create(
            sale=sale, product=product, quantity=2,
            unit_price=Decimal('150'), cost_price=Decimal('100'),
        )
        Debt.all_objects.create(
            tenant=tenant, debt_type='receivable', party_name='Ann',
            amount=Decimal('500'), amount_paid=Decimal('200'),
        )

        res = authed(self.session['access']).get('/api/reports/dashboard/')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['today'], {'total': 300.0, 'profit': 100.0, 'count': 1})
        self.assertEqual(res.data['receivables'], 300.0)
        self.assertEqual(res.data['stock_value'], 300.0)
        self.assertEqual(res.data['low_stock'], 1)


MOMO_SETTINGS = dict(
    MTN_MOMO_SUBSCRIPTION_KEY='sub-key',
    MTN_MOMO_API_USER='6f1c3c8e-2b7a-4d7e-9a51-3c2f9b1d0e44',
    MTN_MOMO_API_KEY='api-key',
    MTN_MOMO_ENVIRONMENT='mtnuganda',
    MTN_MOMO_CURRENCY='',
    MTN_MOMO_CALLBACK_URL='https://api.example.com/api/billing/momo/callback',
)


@override_settings(**MOMO_SETTINGS)
class MtnMomoTests(TestCase):
    def setUp(self):
        cache.clear()
        self.session = signup(APIClient()).data
        self.client = authed(self.session['access'])
        self.tenant = Tenant.objects.get(name='Mukasa Agro')
        self.starter = Plan.objects.get(code='starter')

    def pay(self, phone='0772 123 456', plan='starter', cycle='monthly'):
        with mock.patch('apps.billing.mtn_momo.request_to_pay') as rtp:
            res = self.client.post(
                '/api/billing/momo/pay/',
                {'plan': plan, 'billing_cycle': cycle, 'phone': phone}, format='json',
            )
        return res, rtp

    def mtn_says(self, **status):
        return mock.patch('apps.billing.mtn_momo.get_status', return_value=status)

    def test_subscription_lists_momo(self):
        res = self.client.get('/api/billing/subscription/')
        self.assertIn('mtn_momo', [m['code'] for m in res.data['payment_methods']])

    def test_request_to_pay_sent_with_normalized_number(self):
        res, rtp = self.pay()
        self.assertEqual(res.status_code, 201, res.data)
        kwargs = rtp.call_args.kwargs
        self.assertEqual(kwargs['msisdn'], '256772123456')
        self.assertEqual(kwargs['currency'], 'UGX')
        self.assertEqual(kwargs['amount'], self.starter.monthly_price)
        ref = res.data['payment']['tx_ref']
        self.assertEqual(kwargs['reference_id'], ref)
        self.assertEqual(kwargs['callback_url'], f'https://api.example.com/api/billing/momo/callback/{ref}/')
        payment = Payment.objects.get(tx_ref=ref)
        self.assertEqual((payment.provider, payment.status, payment.payer_phone),
                         ('mtn_momo', 'pending', '256772123456'))

    def test_rejects_non_mtn_number(self):
        res, rtp = self.pay(phone='0752 123 456')   # Airtel
        self.assertEqual(res.status_code, 400)
        rtp.assert_not_called()

    def test_only_one_waiting_request_at_a_time(self):
        self.pay()
        res, rtp = self.pay()
        self.assertEqual(res.status_code, 409)
        rtp.assert_not_called()

    def test_pending_then_successful_activates_plan(self):
        ref = self.pay()[0].data['payment']['tx_ref']

        with self.mtn_says(status='PENDING'):
            res = self.client.get(f'/api/billing/momo/status/{ref}/')
        self.assertEqual(res.data['payment']['status'], 'pending')

        with self.mtn_says(status='SUCCESSFUL', amount='50000', currency='UGX',
                           financialTransactionId='987', externalId=ref):
            res = self.client.get(f'/api/billing/momo/status/{ref}/')
        self.assertTrue(res.data['ok'])
        self.tenant.refresh_from_db()
        self.assertEqual((self.tenant.plan, self.tenant.status), ('starter', 'active'))
        self.assertEqual(Payment.objects.get(tx_ref=ref).provider_tx_id, '987')

    def test_declined_payment_shows_reason(self):
        ref = self.pay()[0].data['payment']['tx_ref']
        with self.mtn_says(status='FAILED', reason='APPROVAL_REJECTED'):
            res = self.client.get(f'/api/billing/momo/status/{ref}/')
        self.assertEqual(res.status_code, 400)
        self.assertIn('declined', res.data['detail'])
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.plan, 'trial')

    def test_wrong_amount_is_not_accepted(self):
        ref = self.pay()[0].data['payment']['tx_ref']
        with self.mtn_says(status='SUCCESSFUL', amount='500', currency='UGX'):
            self.client.get(f'/api/billing/momo/status/{ref}/')
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.plan, 'trial')

    def test_callback_only_trusts_mtn_status(self):
        ref = self.pay()[0].data['payment']['tx_ref']
        anon = APIClient()

        # A forged "successful" callback does nothing while MTN says pending
        with self.mtn_says(status='PENDING'):
            anon.put(f'/api/billing/momo/callback/{ref}/', {'status': 'SUCCESSFUL'}, format='json')
        self.assertEqual(Payment.objects.get(tx_ref=ref).status, 'pending')

        with self.mtn_says(status='SUCCESSFUL', amount='50000', currency='UGX', financialTransactionId='1'):
            res = anon.put(f'/api/billing/momo/callback/{ref}/', {'status': 'SUCCESSFUL'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.plan, 'starter')

    def test_cannot_check_another_business_payment(self):
        ref = self.pay()[0].data['payment']['tx_ref']
        other = signup(APIClient(), username='bob', email='bob@example.com', business_name='Bob Shop').data
        res = authed(other['access']).get(f'/api/billing/momo/status/{ref}/')
        self.assertEqual(res.status_code, 404)

    def test_expired_trial_can_still_pay_with_momo(self):
        self.tenant.trial_ends_at = timezone.now() - timedelta(days=1)
        self.tenant.save()
        res, _ = self.pay()
        self.assertEqual(res.status_code, 201)

    def test_sync_command_completes_and_expires(self):
        from django.core.management import call_command

        paid_ref = self.pay()[0].data['payment']['tx_ref']
        Payment.objects.filter(tx_ref=paid_ref).update(created_at=timezone.now() - timedelta(minutes=5))
        with self.mtn_says(status='SUCCESSFUL', amount='50000', currency='UGX'):
            call_command('sync_pending_payments', stdout=mock.MagicMock())
        self.assertEqual(Payment.objects.get(tx_ref=paid_ref).status, 'successful')

        stale_ref = self.pay()[0].data['payment']['tx_ref']
        Payment.objects.filter(tx_ref=stale_ref).update(created_at=timezone.now() - timedelta(hours=1))
        with self.mtn_says(status='PENDING'):
            call_command('sync_pending_payments', stdout=mock.MagicMock())
        self.assertEqual(Payment.objects.get(tx_ref=stale_ref).status, 'failed')


class MtnMomoClientTests(TestCase):
    """The HTTP client itself, with MTN's responses faked."""

    @override_settings(**MOMO_SETTINGS)
    def test_token_cached_and_request_headers(self):
        from apps.billing import mtn_momo

        cache.clear()
        calls = []

        def fake_call(method, path, *, headers, payload=None):
            calls.append((method, path, headers, payload))
            if path == '/collection/token/':
                return 200, {'access_token': 'tok', 'expires_in': 3600}
            if path == '/collection/v1_0/requesttopay':
                return 202, None
            return 200, {'status': 'FAILED', 'reason': {'code': 'NOT_ENOUGH_FUNDS'}}

        with mock.patch.object(mtn_momo, '_call', side_effect=fake_call):
            mtn_momo.request_to_pay(
                reference_id='ref-1', amount=Decimal('50000.00'), currency='UGX',
                msisdn='256772123456', external_id='ref-1',
                payer_message='Starter', payee_note='Starter', callback_url=None,
            )
            status = mtn_momo.get_status('ref-1')

        token_calls = [c for c in calls if c[1] == '/collection/token/']
        self.assertEqual(len(token_calls), 1)          # cached for the 2nd call
        rtp = [c for c in calls if c[1] == '/collection/v1_0/requesttopay'][0]
        self.assertEqual(rtp[2]['X-Reference-Id'], 'ref-1')
        self.assertEqual(rtp[2]['X-Target-Environment'], 'mtnuganda')
        self.assertEqual(rtp[3]['amount'], '50000')
        self.assertEqual(rtp[3]['payer'], {'partyIdType': 'MSISDN', 'partyId': '256772123456'})
        self.assertEqual(status['reason'], 'NOT_ENOUGH_FUNDS')


class MtnMomoConfigTests(TestCase):
    def test_half_finished_setup_is_not_offered(self):
        from apps.billing import mtn_momo

        with override_settings(**{**MOMO_SETTINGS, 'MTN_MOMO_API_USER': '<printed>'}):
            self.assertFalse(mtn_momo.is_configured())
        with override_settings(**{**MOMO_SETTINGS, 'MTN_MOMO_API_KEY': ''}):
            self.assertFalse(mtn_momo.is_configured())
        with override_settings(**MOMO_SETTINGS):
            self.assertTrue(mtn_momo.is_configured())

    @override_settings(**MOMO_SETTINGS)
    def test_refused_credentials_show_setup_message_not_number_error(self):
        from apps.billing import mtn_momo

        cache.clear()
        session = signup(APIClient()).data
        with mock.patch.object(mtn_momo, '_call', return_value=(401, {'error': 'login_failed'})):
            res = authed(session['access']).post(
                '/api/billing/momo/pay/', {'plan': 'starter', 'phone': '0772123456'}, format='json',
            )
        self.assertEqual(res.status_code, 502)
        self.assertIn('temporarily unavailable', res.data['detail'])


class ManualClaimTests(TestCase):
    """Owner reports a Mobile Money payment; platform admin confirms or rejects it."""

    def setUp(self):
        from apps.tenants.models import PlatformSetting

        cache.clear()
        platform = PlatformSetting.load()
        platform.support_email = 'billing@platform.example'
        platform.save()

        self.owner = authed(signup(APIClient()).data['access'])
        self.tenant = Tenant.objects.get(name='Mukasa Agro')
        User.objects.create_user(username='root', password='rootpass1', role='super')
        token = APIClient().post(
            '/api/auth/login/', {'username': 'root', 'password': 'rootpass1'}, format='json',
        ).data['access']
        self.admin = authed(token)

    def claim(self, reference='MP2410141234', **extra):
        return self.owner.post('/api/billing/manual/claim/', {
            'plan': 'starter', 'billing_cycle': 'monthly',
            'phone': '0772 123 456', 'reference': reference, **extra,
        }, format='json')

    def test_claim_confirm_shows_in_owner_account(self):
        from django.core import mail

        self.tenant.trial_ends_at = timezone.now() - timedelta(days=1)   # expired → read-only
        self.tenant.save()

        res = self.claim()
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['payment']['status'], 'pending')
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('billing@platform.example', mail.outbox[0].to)

        pending = self.admin.get('/api/billing/manual/pending/').data
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]['tenant_name'], 'Mukasa Agro')
        self.assertEqual(pending[0]['reference'], 'MP2410141234')

        res = self.admin.post(f"/api/billing/manual/{pending[0]['id']}/confirm/", format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['status'], 'successful')

        # Owner's account reflects it
        status = self.owner.get('/api/billing/subscription/').data
        self.assertEqual(status['plan'], 'starter')
        self.assertFalse(status['is_expired'])
        row = status['payments'][0]
        self.assertEqual((row['status'], row['reference']), ('successful', 'MP2410141234'))
        self.assertIsNotNone(row['period_end'])
        self.assertEqual(
            self.owner.post('/api/expenses/categories/', {'name': 'Rent'}, format='json').status_code, 201,
        )
        self.assertEqual(len(mail.outbox), 2)          # owner told it's confirmed
        self.assertEqual(self.admin.get('/api/billing/manual/pending/').data, [])

    def test_reject_needs_reason_and_owner_sees_it(self):
        payment_id = self.claim().data['payment']['id']
        self.assertEqual(
            self.admin.post(f'/api/billing/manual/{payment_id}/reject/', {}, format='json').status_code, 400,
        )
        res = self.admin.post(
            f'/api/billing/manual/{payment_id}/reject/', {'reason': 'No such transaction'}, format='json',
        )
        self.assertEqual(res.data['status'], 'rejected')
        row = self.owner.get('/api/billing/subscription/').data['payments'][0]
        self.assertEqual((row['status'], row['note']), ('rejected', 'No such transaction'))
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.plan, 'trial')
        # Can't confirm it afterwards
        self.assertEqual(
            self.admin.post(f'/api/billing/manual/{payment_id}/confirm/').status_code, 400,
        )

    def test_same_transaction_id_cannot_be_reused(self):
        self.claim()
        other = authed(signup(APIClient(), username='bob', email='bob@example.com',
                              business_name='Bob Shop').data['access'])
        res = other.post('/api/billing/manual/claim/', {
            'plan': 'starter', 'phone': '0772000000', 'reference': 'mp2410141234',
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_requires_reference_and_admin_role(self):
        self.assertEqual(self.claim(reference='').status_code, 400)
        cashier = User.objects.create_user(username='c9', password='whatever1', role='cashier', tenant=self.tenant)
        Membership.objects.create(user=cashier, tenant=self.tenant, role='cashier')
        token = APIClient().post('/api/auth/login/', {'username': 'c9', 'password': 'whatever1'}, format='json').data['access']
        res = authed(token).post('/api/billing/manual/claim/', {
            'plan': 'starter', 'phone': '0772000000', 'reference': 'ABC12345',
        }, format='json')
        self.assertEqual(res.status_code, 403)

    def test_only_platform_admin_can_review(self):
        payment_id = self.claim().data['payment']['id']
        self.assertEqual(self.owner.get('/api/billing/manual/pending/').status_code, 403)
        self.assertEqual(self.owner.post(f'/api/billing/manual/{payment_id}/confirm/').status_code, 403)
