"""
Send email through the Gmail API (HTTPS) instead of Gmail SMTP.

Render's free web services block outbound SMTP (ports 25, 465, 587), so
smtp.gmail.com can't be reached there. The Gmail API is plain HTTPS
(port 443), which isn't blocked, and sends from the same Gmail account.

Enabled when GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN
are set (see settings.py). Get them once with:

    python manage.py gmail_authorize

Mail is sent as the Gmail account that authorised it; DEFAULT_FROM_EMAIL
should be that address (optionally with a display name).
"""
import base64
import json
import logging
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

import certifi
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

TOKEN_URL = 'https://oauth2.googleapis.com/token'
SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
SCOPE = 'https://www.googleapis.com/auth/gmail.send'

_ssl_context = ssl.create_default_context(cafile=certifi.where())

# One access token shared by every thread in the process, refreshed shortly
# before it expires (Google issues them for about an hour).
_token_lock = threading.Lock()
_token = {'value': None, 'expires_at': 0.0}


def _post(url, data, headers, timeout):
    request = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=_ssl_context) as response:
            return json.loads(response.read() or b'{}')
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors='replace')[:300]
        raise RuntimeError(f'Gmail API error {e.code}: {detail}') from e


def access_token(timeout=20, force=False):
    with _token_lock:
        if not force and _token['value'] and time.time() < _token['expires_at'] - 60:
            return _token['value']
        data = _post(
            TOKEN_URL,
            urllib.parse.urlencode({
                'client_id': settings.GMAIL_CLIENT_ID,
                'client_secret': settings.GMAIL_CLIENT_SECRET,
                'refresh_token': settings.GMAIL_REFRESH_TOKEN,
                'grant_type': 'refresh_token',
            }).encode(),
            {'Content-Type': 'application/x-www-form-urlencoded'},
            timeout,
        )
        _token['value'] = data['access_token']
        _token['expires_at'] = time.time() + int(data.get('expires_in', 3600))
        return _token['value']


class GmailAPIEmailBackend(BaseEmailBackend):
    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        self.timeout = getattr(settings, 'EMAIL_TIMEOUT', None) or 20

    def _send(self, message):
        raw = base64.urlsafe_b64encode(message.message().as_bytes()).decode()
        body = json.dumps({'raw': raw}).encode()
        for attempt in (1, 2):
            headers = {
                'Authorization': f'Bearer {access_token(self.timeout, force=attempt == 2)}',
                'Content-Type': 'application/json',
            }
            try:
                return _post(SEND_URL, body, headers, self.timeout)
            except RuntimeError as e:
                # A revoked / expired access token: get a fresh one and retry once.
                if attempt == 1 and 'error 401' in str(e):
                    continue
                raise

    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages:
            if not message.recipients():
                continue
            try:
                self._send(message)
                sent += 1
            except Exception:
                logger.exception('Gmail API: email "%s" not sent', message.subject)
                if not self.fail_silently:
                    raise
        return sent
