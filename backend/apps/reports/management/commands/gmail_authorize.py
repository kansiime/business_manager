"""
One-time setup for sending email through the Gmail API.

Run on your own computer (it opens a browser):

    python manage.py gmail_authorize --client-id ID --client-secret SECRET

Sign in with the Gmail account the app should send from and allow
"Send email on your behalf". The command prints GMAIL_CLIENT_ID,
GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN to add to the backend's
environment (Render → Environment). The client ID and secret come from a
Google Cloud OAuth client of type "Desktop app"; see the README.
"""
import http.server
import json
import secrets
import ssl
import threading
import urllib.parse
import urllib.request
import webbrowser

import certifi
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from platform_config.email_backends import SCOPE, TOKEN_URL

AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'


class Command(BaseCommand):
    help = 'Authorise the app to send email from your Gmail account via the Gmail API.'

    def add_arguments(self, parser):
        parser.add_argument('--client-id', default=settings.GMAIL_CLIENT_ID)
        parser.add_argument('--client-secret', default=settings.GMAIL_CLIENT_SECRET)
        parser.add_argument('--port', type=int, default=8765)

    def handle(self, *args, client_id, client_secret, port, **options):
        if not client_id or not client_secret:
            raise CommandError('Pass --client-id and --client-secret (from Google Cloud → Credentials).')

        redirect_uri = f'http://127.0.0.1:{port}'
        state = secrets.token_urlsafe(16)
        result = {}

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                params = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(self.path).query))
                if params.get('state') != state:
                    # Not Google's reply (e.g. /favicon.ico): ignore and keep waiting.
                    self.send_response(404)
                    self.end_headers()
                    return
                result.update(params)
                ok = 'code' in params
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(
                    ('<h2>Done. You can close this tab and return to the terminal.</h2>' if ok
                     else '<h2>Authorisation failed. Check the terminal.</h2>').encode())
                threading.Thread(target=self.server.shutdown, daemon=True).start()

            def log_message(self, *a):
                pass

        server = http.server.HTTPServer(('127.0.0.1', port), Handler)
        url = AUTH_URL + '?' + urllib.parse.urlencode({
            'client_id': client_id,
            'redirect_uri': redirect_uri,
            'response_type': 'code',
            'scope': SCOPE,
            'access_type': 'offline',
            'prompt': 'consent',          # always return a refresh token
            'state': state,
        })
        self.stdout.write('Opening your browser to authorise Gmail. If it does not open, visit:\n')
        self.stdout.write(url + '\n')
        webbrowser.open(url)
        server.serve_forever()

        if 'code' not in result:
            raise CommandError(f"Authorisation failed: {result.get('error', 'no code returned')}")

        request = urllib.request.Request(
            TOKEN_URL,
            data=urllib.parse.urlencode({
                'code': result['code'],
                'client_id': client_id,
                'client_secret': client_secret,
                'redirect_uri': redirect_uri,
                'grant_type': 'authorization_code',
            }).encode(),
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            method='POST',
        )
        context = ssl.create_default_context(cafile=certifi.where())
        try:
            with urllib.request.urlopen(request, timeout=30, context=context) as response:
                tokens = json.loads(response.read())
        except urllib.error.HTTPError as e:
            raise CommandError(f'Google refused the code: {e.read().decode(errors="replace")[:300]}')

        if 'refresh_token' not in tokens:
            raise CommandError('Google returned no refresh token. Run the command again.')

        self.stdout.write(self.style.SUCCESS('\nAuthorised. Add these to the backend environment:\n'))
        self.stdout.write(f'GMAIL_CLIENT_ID={client_id}')
        self.stdout.write(f'GMAIL_CLIENT_SECRET={client_secret}')
        self.stdout.write(f"GMAIL_REFRESH_TOKEN={tokens['refresh_token']}")
        self.stdout.write(
            '\nAlso set DEFAULT_FROM_EMAIL to the Gmail address you signed in with, '
            'e.g. Business Manager <you@gmail.com>.'
        )
