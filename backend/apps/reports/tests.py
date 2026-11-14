from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Membership, User
from apps.inventory.models import Product
from apps.tenants.models import Tenant
from apps.tenants.testing import make_business, make_product, sell

from .email_digest import build_digest, digest_recipients, send_digest_for_tenant


class DailyDigestTests(TestCase):
    def setUp(self):
        self.client = make_business('Digest Pharmacy', 'digest', business_type='drugshop')
        self.tenant = Tenant.objects.get(name='Digest Pharmacy')
        self.today = timezone.localtime().date()
        self.yesterday = self.today - timedelta(days=1)
        long_ago = timezone.now() - timedelta(days=60)

        def product(sku, quantity=10, expiry_days=None, old=True):
            pid = make_product(
                self.client, sku=sku, quantity=quantity,
                expiry_date=str(self.today + timedelta(days=expiry_days))
                if expiry_days is not None else None,
            )
            if old:
                Product.all_objects.filter(pk=pid).update(created_at=long_ago)
            return pid

        self.expired = product('EXP', expiry_days=-3)
        self.urgent = product('URG', expiry_days=5)
        self.later = product('LTR', expiry_days=25)
        self.far = product('FAR', expiry_days=200)
        self.idle = product('IDLE')
        self.new = product('NEW', old=False)
        self.seller = product('SELL', quantity=50)
        self.empty_expired = product('GONE', quantity=0, expiry_days=-10)

        # Yesterday's sale of SELL.
        sale_id = sell(self.client, self.seller, 4, unit_price='1000').data['id']
        from apps.sales.models import Sale
        Sale.all_objects.filter(pk=sale_id).update(
            created_at=timezone.now() - timedelta(days=1))

    def names(self, products):
        return {p.sku for p in products}

    def test_expired_and_expiring_stock(self):
        d = build_digest(self.tenant, self.yesterday)
        self.assertEqual(self.names(d['expired']), {'EXP'})          # GONE has no stock
        self.assertEqual(self.names(d['expiring']), {'URG', 'LTR'})  # FAR is > 30 days
        self.assertEqual(d['expiring'][0].sku, 'URG')                # soonest first
        self.assertEqual(d['expired'][0].days_left, -3)

    def test_not_moving_stock(self):
        d = build_digest(self.tenant, self.yesterday)
        not_moving = self.names(d['not_moving'])
        self.assertIn('IDLE', not_moving)
        self.assertNotIn('SELL', not_moving)     # sold yesterday
        self.assertNotIn('NEW', not_moving)      # only just added
        self.assertNotIn('GONE', not_moving)     # nothing in stock

    def test_sales_profit_and_best_sellers(self):
        d = build_digest(self.tenant, self.yesterday)
        self.assertEqual(d['yesterday']['sales'], 4000)
        self.assertEqual(d['yesterday']['gross_profit'], 2000)       # cost 500 each
        self.assertEqual(d['best_day'][0]['product__name'], 'Product SELL')
        self.assertEqual(d['best_day'][0]['qty'], 4)

    def test_recipients_are_owner_admins_and_managers(self):
        def member(username, role, email):
            u = User.objects.create_user(username=username, password='x', email=email)
            Membership.objects.create(user=u, tenant=self.tenant, role=role)

        member('mgr', 'manager', 'mgr@example.com')
        member('cash', 'cashier', 'cash@example.com')
        member('dup', 'admin', 'DIGEST@example.com')      # same as owner
        self.assertEqual(
            digest_recipients(self.tenant), ['digest@example.com', 'mgr@example.com'])

    def test_email_sent_with_urgent_subject_and_sections(self):
        self.assertTrue(send_digest_for_tenant(self.tenant))
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertIn('1 expired', msg.subject)
        self.assertIn('1 expiring this week', msg.subject)
        for text in ('EXPIRED', 'EXPIRING WITHIN 30 DAYS', 'NOT MOVING',
                     'BEST SELLERS YESTERDAY', 'Product IDLE: 10 in stock, never sold'):
            self.assertIn(text, msg.body)
        html = msg.alternatives[0][0]
        self.assertIn('Expired — still in stock', html)

    def test_to_overrides_recipients(self):
        send_digest_for_tenant(self.tenant, to=['test@example.com'])
        self.assertEqual(mail.outbox[0].to, ['test@example.com'])

    def test_product_names_are_escaped_in_html(self):
        Product.all_objects.filter(pk=self.idle).update(name='<script>x</script>')
        send_digest_for_tenant(self.tenant)
        html = mail.outbox[0].alternatives[0][0]
        self.assertNotIn('<script>', html)
        self.assertIn('&lt;script&gt;', html)
