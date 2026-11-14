import base64
import email
import io
import json
import urllib.error
from unittest import mock

from django.core.mail import EmailMultiAlternatives
from django.test import SimpleTestCase, override_settings

from platform_config import email_backends
from platform_config.email_backends import GmailAPIEmailBackend


def response(payload):
    r = mock.MagicMock()
    r.__enter__.return_value.read.return_value = json.dumps(payload).encode()
    return r


def http_error(code, body):
    return urllib.error.HTTPError('https://x', code, 'err', {}, io.BytesIO(body.encode()))


@override_settings(
    GMAIL_CLIENT_ID='cid', GMAIL_CLIENT_SECRET='secret', GMAIL_REFRESH_TOKEN='refresh',
    DEFAULT_FROM_EMAIL='Business Manager <owner@gmail.com>',
)
class GmailApiBackendTests(SimpleTestCase):
    def setUp(self):
        email_backends._token.update(value=None, expires_at=0.0)

    def message(self):
        m = EmailMultiAlternatives('Hello', 'Plain body', None, ['Grace Kato <grace@example.com>'])
        m.attach_alternative('<p>HTML body</p>', 'text/html')
        return m

    def test_refreshes_token_then_sends_raw_message(self):
        calls = []

        def fake_urlopen(request, timeout, context):
            calls.append(request)
            if request.full_url == email_backends.TOKEN_URL:
                return response({'access_token': 'tok-1', 'expires_in': 3600})
            return response({'id': 'abc'})

        with mock.patch('urllib.request.urlopen', side_effect=fake_urlopen):
            sent = GmailAPIEmailBackend().send_messages([self.message(), self.message()])

        self.assertEqual(sent, 2)
        token_calls = [c for c in calls if c.full_url == email_backends.TOKEN_URL]
        self.assertEqual(len(token_calls), 1)                   # token reused
        self.assertIn(b'refresh_token=refresh', token_calls[0].data)

        send = calls[-1]
        self.assertEqual(send.full_url, email_backends.SEND_URL)
        self.assertEqual(send.get_header('Authorization'), 'Bearer tok-1')
        raw = base64.urlsafe_b64decode(json.loads(send.data)['raw'])
        msg = email.message_from_bytes(raw)
        self.assertEqual(msg['Subject'], 'Hello')
        self.assertEqual(msg['To'], 'Grace Kato <grace@example.com>')
        self.assertIn('owner@gmail.com', msg['From'])
        self.assertIn(b'<p>HTML body</p>', raw)

    def test_retries_once_with_new_token_on_401(self):
        tokens = iter(['old', 'new'])
        sends = []

        def fake_urlopen(request, timeout, context):
            if request.full_url == email_backends.TOKEN_URL:
                return response({'access_token': next(tokens), 'expires_in': 3600})
            sends.append(request.get_header('Authorization'))
            if len(sends) == 1:
                raise http_error(401, '{"error": "invalid token"}')
            return response({'id': 'ok'})

        with mock.patch('urllib.request.urlopen', side_effect=fake_urlopen):
            self.assertEqual(GmailAPIEmailBackend().send_messages([self.message()]), 1)
        self.assertEqual(sends, ['Bearer old', 'Bearer new'])

    def test_revoked_refresh_token_is_reported(self):
        with mock.patch('urllib.request.urlopen',
                        side_effect=http_error(400, '{"error": "invalid_grant"}')):
            with self.assertRaisesRegex(RuntimeError, 'invalid_grant'):
                GmailAPIEmailBackend().send_messages([self.message()])
            self.assertEqual(GmailAPIEmailBackend(fail_silently=True).send_messages([self.message()]), 0)
