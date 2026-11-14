import re

from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.tenants.testing import make_business

from .models import User

STRONG = 'N3w-Strong-pass!'


class StaffAddedEmailTests(TestCase):
    def setUp(self):
        self.admin = make_business('Okello Hardware', 'okello')
        mail.outbox.clear()

    def add_user(self, **fields):
        return self.admin.post('/api/auth/users/', {
            'username': 'sarah', 'password': 'Cashier-pass-1', 'role': 'cashier',
            'first_name': 'Sarah', **fields,
        }, format='json')

    def test_new_staff_member_is_emailed_their_login(self):
        res = self.add_user(email='sarah@example.com')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.to, ['sarah@example.com'])
        self.assertIn("You've been added to Okello Hardware", msg.subject)
        self.assertIn('Your username is: sarah', msg.body)
        self.assertIn('Cashier', msg.body)
        self.assertNotIn('Cashier-pass-1', msg.body)      # never email a password

    def test_no_email_address_no_email(self):
        self.assertEqual(self.add_user().status_code, 201)
        self.assertEqual(mail.outbox, [])

    def test_admin_changing_password_tells_the_user(self):
        user_id = self.add_user(email='sarah@example.com').data['id']
        mail.outbox.clear()
        self.admin.patch(f'/api/auth/users/{user_id}/', {'password': STRONG}, format='json')
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('password was changed', mail.outbox[0].subject)
        self.assertIn('Okello Owner changed the password', mail.outbox[0].body)

        mail.outbox.clear()
        self.admin.patch(f'/api/auth/users/{user_id}/', {'phone': '0700'}, format='json')
        self.assertEqual(mail.outbox, [])


class PasswordResetTests(TestCase):
    def setUp(self):
        make_business('Reset Shop', 'resetter')
        mail.outbox.clear()
        cache.clear()
        self.client = APIClient()

    def request_reset(self, identifier):
        return self.client.post('/api/auth/password-reset/', {'identifier': identifier},
                                format='json')

    def link_params(self):
        body = mail.outbox[-1].body
        uid, token = re.search(r'reset-password\?uid=([\w-]+)&token=([\w-]+)', body).groups()
        return uid, token

    def confirm(self, uid, token, password=STRONG):
        return self.client.post('/api/auth/password-reset/confirm/', {
            'uid': uid, 'token': token, 'password': password}, format='json')

    def login(self, password):
        cache.clear()
        return self.client.post('/api/auth/login/', {
            'username': 'resetter', 'password': password}, format='json')

    def test_full_reset_by_email(self):
        res = self.request_reset('RESETTER@example.com')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Reset your', mail.outbox[0].subject)
        self.assertIn('expires in 2 hours', mail.outbox[0].body)

        uid, token = self.link_params()
        res = self.confirm(uid, token)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(self.login(STRONG).status_code, 200)
        self.assertNotEqual(self.login('Str0ng-pass-123').status_code, 200)
        self.assertIn('password was changed', mail.outbox[-1].subject)

        # The link works only once.
        self.assertEqual(self.confirm(uid, token, 'An0ther-pass!!').status_code, 400)

    def test_reset_by_username(self):
        self.request_reset('resetter')
        self.assertEqual(mail.outbox[0].to, ['resetter@example.com'])

    def test_unknown_account_gets_same_answer_and_no_email(self):
        known = self.request_reset('resetter@example.com').data
        mail.outbox.clear()
        unknown = self.request_reset('nobody@example.com').data
        self.assertEqual(known, unknown)
        self.assertEqual(mail.outbox, [])

    def test_inactive_user_gets_no_email(self):
        User.objects.filter(username='resetter').update(is_active=False)
        self.request_reset('resetter')
        self.assertEqual(mail.outbox, [])

    def test_bad_token_and_weak_password_rejected(self):
        self.request_reset('resetter')
        uid, token = self.link_params()
        self.assertEqual(self.confirm(uid, 'bad-token').status_code, 400)
        self.assertEqual(self.confirm('garbage', token).status_code, 400)
        res = self.confirm(uid, token, 'password')
        self.assertEqual(res.status_code, 400)
        self.assertIn('password', res.data)
        self.assertEqual(self.login('Str0ng-pass-123').status_code, 200)   # unchanged
