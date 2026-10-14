"""
Email business owners before their trial / plan runs out, and on the day it
does, with a link to pay. Run once a day (see render.yaml cron).
"""
from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.tenants.models import Tenant

# Days before the end date on which to remind; 0 = the day it ends.
REMIND_ON_DAYS = (7, 3, 1, 0)


def reminder_text(tenant, days_left):
    what = 'free trial' if tenant.plan == 'trial' else 'plan'
    link = f"{settings.FRONTEND_URL.rstrip('/')}/subscription"
    if days_left > 0:
        subject = f'Your {what} for {tenant.name} ends in {days_left} day{"s" if days_left != 1 else ""}'
        body = (
            f'Hello {tenant.owner_name or "there"},\n\n'
            f'Your {what} for {tenant.name} ends on '
            f'{timezone.localtime(tenant.access_ends_at):%d %b %Y}.\n'
            f'Choose a plan and pay with mobile money or card to keep working without interruption:\n'
            f'{link}\n'
        )
    else:
        subject = f'Your {what} for {tenant.name} has ended'
        body = (
            f'Hello {tenant.owner_name or "there"},\n\n'
            f'Your {what} for {tenant.name} has ended. Your records are safe, but you '
            f"can't add or change anything until you pay:\n{link}\n"
        )
    return subject, body


class Command(BaseCommand):
    help = 'Email owners whose trial or plan is about to end.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        today = timezone.localtime().date()
        sent = 0
        tenants = (
            Tenant.objects
            .filter(is_blocked=False, status__in=['trial', 'active'])
            .exclude(owner_email='')
        )
        for tenant in tenants:
            end = tenant.access_ends_at
            if end is None:
                continue
            days_left = (timezone.localtime(end).date() - today).days
            if days_left not in REMIND_ON_DAYS:
                continue
            subject, body = reminder_text(tenant, days_left)
            if options['dry_run']:
                self.stdout.write(f'[dry-run] {tenant.owner_email}: {subject}')
                continue
            try:
                send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [tenant.owner_email])
                sent += 1
                self.stdout.write(self.style.SUCCESS(f'✓ {tenant.name}: {subject}'))
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'✗ {tenant.name}: {e}'))
        self.stdout.write(f'Reminders sent: {sent}')
