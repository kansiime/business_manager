"""
Create an MTN MoMo *sandbox* API user + key from your Collections
subscription key, and print the settings to add to .env.

    MTN_MOMO_SUBSCRIPTION_KEY=<primary key> python manage.py momo_sandbox_setup \
        --callback-host garage-backend.onrender.com

Production credentials come from MTN Uganda's partner portal instead.
"""
import uuid

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.billing import mtn_momo


class Command(BaseCommand):
    help = 'Provision an MTN MoMo sandbox API user and key.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--callback-host', default='localhost',
            help='Host MTN may send callbacks to (no scheme), e.g. garage-backend.onrender.com',
        )

    def handle(self, *args, **options):
        if not settings.MTN_MOMO_SUBSCRIPTION_KEY:
            raise CommandError('Set MTN_MOMO_SUBSCRIPTION_KEY (Collections primary key) first.')
        if 'sandbox' not in settings.MTN_MOMO_BASE_URL:
            raise CommandError('Only works against the sandbox base URL.')

        api_user = str(uuid.uuid4())
        try:
            api_key = mtn_momo.create_sandbox_user(api_user, options['callback_host'])
        except mtn_momo.MomoError as e:
            raise CommandError(str(e))

        self.stdout.write(self.style.SUCCESS('Sandbox API user created. Add to backend/.env:'))
        self.stdout.write('')
        self.stdout.write(f'MTN_MOMO_API_USER={api_user}')
        self.stdout.write(f'MTN_MOMO_API_KEY={api_key}')
        self.stdout.write('MTN_MOMO_ENVIRONMENT=sandbox')
        self.stdout.write('MTN_MOMO_CURRENCY=EUR')
