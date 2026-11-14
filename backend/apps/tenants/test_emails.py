import uuid
from datetime import timedelta
from io import StringIO

from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Membership, User
from apps.billing.models import Payment, Plan
from apps.billing.services import mark_payment_failed, mark_payment_successful

from .models import PlatformSetting, Tenant
from .testing import make_business

ADMIN_EMAIL = 'admin@platform.example'


def sent_to(address):
    return [m for m in mail.outbox if address in m.to]


class AccountEmailTests(TestCase):
    def setUp(self):
        platform = PlatformSetting.load()
        platform.support_email = ADMIN_EMAIL
        platform.save()
        self.root = User.objects.create_user(
            username='root', password='rootpass1', role='super', email='root@platform.example')
        cache.clear()
        token = APIClient().post('/api/auth/login/', {
            'username': 'root', 'password': 'rootpass1'}, format='json').data['access']
        self.admin = APIClient()
        self.admin.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def new_business(self, name='Kato Shop', username='kato'):
        with self.captureOnCommitCallbacks(execute=True):
            client = make_business(name, username)
        tenant = Tenant.objects.get(name=name)
        manager = User.objects.create_user(
            username=f'{username}-mgr', password='x', email=f'{username}-mgr@example.com')
        Membership.objects.create(user=manager, tenant=tenant, role='manager')
        cashier = User.objects.create_user(
            username=f'{username}-cash', password='x', email=f'{username}-cash@example.com')
        Membership.objects.create(user=cashier, tenant=tenant, role='cashier')
        return client, tenant

    # -- sign-up ------------------------------------------------------------
    def test_signup_sends_welcome_and_tells_platform_admin(self):
        _, tenant = self.new_business()
        welcome = sent_to('kato@example.com')
        self.assertEqual(len(welcome), 1)
        self.assertIn('Welcome', welcome[0].subject)
        self.assertIn('free trial runs until', welcome[0].body)

        for address in (ADMIN_EMAIL, 'root@platform.example'):
            notice = sent_to(address)
            self.assertEqual(len(notice), 1, address)
            self.assertIn('New business registered: Kato Shop', notice[0].subject)
        # One address per message: team members don't see each other.
        self.assertTrue(all(len(m.to) == 1 for m in mail.outbox))

    def test_business_created_by_platform_admin_gets_welcome_only(self):
        with self.captureOnCommitCallbacks(execute=True):
            res = self.admin.post('/api/tenants/create-tenant/', {
                'business_name': 'Admin Made', 'business_type_slug': 'agro',
                'username': 'made', 'password': 'Str0ng-pass-123',
                'owner_email': 'made@example.com', 'plan': 'trial',
            }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(len(sent_to('made@example.com')), 1)
        self.assertEqual(sent_to(ADMIN_EMAIL), [])

    # -- subscription reminders ---------------------------------------------
    def test_reminders_before_and_after_expiry_go_to_management(self):
        _, ending = self.new_business('Ending Soon', 'ending')
        _, ended = self.new_business('Ended', 'ended')
        _, fine = self.new_business('Fine', 'fine')
        now = timezone.now()
        Tenant.objects.filter(pk=ending.pk).update(trial_ends_at=now + timedelta(days=3))
        Tenant.objects.filter(pk=ended.pk).update(trial_ends_at=now - timedelta(days=3))
        Tenant.objects.filter(pk=fine.pk).update(trial_ends_at=now + timedelta(days=12))
        mail.outbox.clear()

        call_command('send_billing_reminders', stdout=StringIO())

        for who in ('ending@example.com', 'ending-mgr@example.com'):
            self.assertIn('ends in 3 days', sent_to(who)[0].subject)
        for who in ('ended@example.com', 'ended-mgr@example.com'):
            self.assertIn('read-only', sent_to(who)[0].subject)
        self.assertEqual(sent_to('ending-cash@example.com'), [])
        self.assertEqual(sent_to('fine@example.com'), [])

        overview = sent_to(ADMIN_EMAIL)
        self.assertEqual(len(overview), 1)
        self.assertIn('1 ending soon, 1 recently ended', overview[0].subject)
        self.assertIn('Ending Soon', overview[0].body)
        self.assertNotIn('Fine', overview[0].body)

    # -- payments -----------------------------------------------------------
    def payment(self, tenant, provider='mtn_momo'):
        plan = Plan.objects.get(code='starter')
        return Payment.objects.create(
            tenant=tenant, plan=plan, billing_cycle='monthly',
            amount=plan.monthly_price, currency=plan.currency,
            provider=provider, tx_ref=f'T-{uuid.uuid4().hex[:12]}',
        )

    def test_successful_payment_sends_receipt_and_tells_platform(self):
        _, tenant = self.new_business()
        mail.outbox.clear()
        p = self.payment(tenant)
        mark_payment_successful(p.id)
        mark_payment_successful(p.id)      # duplicate callback: no second email

        receipt = sent_to('kato@example.com')
        self.assertEqual(len(receipt), 1)
        self.assertIn('Payment received', receipt[0].subject)
        self.assertIn('MTN Mobile Money', receipt[0].body)
        self.assertEqual(len(sent_to('kato-mgr@example.com')), 1)
        self.assertEqual(len(sent_to(ADMIN_EMAIL)), 1)

    def test_payment_recorded_by_platform_admin_skips_platform_email(self):
        _, tenant = self.new_business()
        mail.outbox.clear()
        res = self.admin.post('/api/billing/manual-payment/', {
            'tenant_id': str(tenant.id), 'plan': 'starter', 'billing_cycle': 'monthly',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(len(sent_to('kato@example.com')), 1)
        self.assertEqual(sent_to(ADMIN_EMAIL), [])
        self.assertEqual(sent_to('root@platform.example'), [])

    def test_failed_payment_tells_business(self):
        _, tenant = self.new_business()
        mail.outbox.clear()
        p = self.payment(tenant)
        mark_payment_failed(p.id, 'The request was not approved in time.')
        msg = sent_to('kato@example.com')
        self.assertEqual(len(msg), 1)
        self.assertIn('did not go through', msg[0].subject)
        self.assertIn('not approved in time', msg[0].body)

    # -- platform admin actions ---------------------------------------------
    def test_extend_and_suspend_tell_business(self):
        _, tenant = self.new_business()
        mail.outbox.clear()

        self.admin.post(f'/api/tenants/{tenant.id}/extend/', {'days': 5}, format='json')
        self.assertIn('has been extended', sent_to('kato@example.com')[0].subject)

        self.admin.post('/api/tenants/bulk-action/', {
            'action': 'suspend', 'ids': [str(tenant.id)]}, format='json')
        self.assertIn('has been suspended', sent_to('kato-mgr@example.com')[-1].subject)
