"""
Check that outgoing email works with the current EMAIL_* settings.

    python manage.py send_test_email someone@example.com [other@example.com ...]
"""
from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Send a test email to one or more addresses using the EMAIL_* settings.'

    def add_arguments(self, parser):
        parser.add_argument('recipients', nargs='+')

    def handle(self, *args, recipients, **options):
        sender = settings.DEFAULT_FROM_EMAIL
        if settings.GMAIL_API_ENABLED:
            via = 'Gmail API (HTTPS)'
        else:
            user = settings.EMAIL_HOST_USER
            if not user or not settings.EMAIL_HOST_PASSWORD:
                raise CommandError(
                    'Set GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN '
                    '(python manage.py gmail_authorize), or EMAIL_HOST_USER and '
                    'EMAIL_HOST_PASSWORD for SMTP.')
            if user.endswith('@example.com'):
                raise CommandError(f'EMAIL_HOST_USER is still a placeholder ({user}).')
            via = f'SMTP {settings.EMAIL_HOST}:{settings.EMAIL_PORT} as {user}'
        if 'example.com' in sender or sender.endswith('.local'):
            raise CommandError(f'DEFAULT_FROM_EMAIL is still a placeholder ({sender}).')

        self.stdout.write(f'Sending via {via}, from {sender}')
        try:
            sent = send_mail(
                'Business Manager test email',
                'If you can read this, outgoing email is working.',
                settings.DEFAULT_FROM_EMAIL,
                recipients,
                fail_silently=False,
            )
        except Exception as e:
            hint = ''
            if 'invalid_grant' in str(e):
                hint = (
                    '\nThe Gmail refresh token was revoked or has expired. Run '
                    '`python manage.py gmail_authorize` again and update GMAIL_REFRESH_TOKEN. '
                    'If it keeps expiring after 7 days, publish the OAuth consent screen '
                    '(Google Cloud → OAuth consent screen → Publish app).'
                )
            elif 'Gmail API error' in str(e):
                hint = (
                    '\nCheck that the Gmail API is enabled in your Google Cloud project and '
                    'that DEFAULT_FROM_EMAIL is the Gmail address you authorised.'
                )
            elif 'Network is unreachable' in str(e) or 'timed out' in str(e):
                hint = (
                    '\nSMTP is blocked here (Render\'s free tier blocks ports 25/465/587). '
                    'Set up the Gmail API instead: python manage.py gmail_authorize.'
                )
            elif 'Username and Password not accepted' in str(e) or '535' in str(e):
                hint = (
                    '\nGmail rejected the login. Use a 16-letter App Password '
                    '(Google Account → Security → 2-Step Verification → App passwords), '
                    'not your normal password, and make sure EMAIL_HOST_USER is that '
                    'Gmail address.'
                )
            raise CommandError(f'Sending failed: {e}{hint}')
        self.stdout.write(self.style.SUCCESS(f'Sent to {sent and ", ".join(recipients)}'))
