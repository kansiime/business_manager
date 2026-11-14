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
        user = settings.EMAIL_HOST_USER
        if not user or not settings.EMAIL_HOST_PASSWORD:
            raise CommandError('EMAIL_HOST_USER and EMAIL_HOST_PASSWORD must be set.')
        if user.endswith('@example.com'):
            raise CommandError(f'EMAIL_HOST_USER is still a placeholder ({user}).')

        self.stdout.write(
            f'Sending via {settings.EMAIL_HOST}:{settings.EMAIL_PORT} as {user}, '
            f'from {settings.DEFAULT_FROM_EMAIL}'
        )
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
            if 'Username and Password not accepted' in str(e) or '535' in str(e):
                hint = (
                    '\nGmail rejected the login. Use a 16-letter App Password '
                    '(Google Account → Security → 2-Step Verification → App passwords), '
                    'not your normal password, and make sure EMAIL_HOST_USER is that '
                    'Gmail address.'
                )
            raise CommandError(f'Sending failed: {e}{hint}')
        self.stdout.write(self.style.SUCCESS(f'Sent to {sent and ", ".join(recipients)}'))
