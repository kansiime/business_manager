"""
Daily subscription emails (see render.yaml cron):

- each business's owner, admins and managers: 7, 3 and 1 days before the
  trial / plan ends, on the day, and 3 and 7 days after it ended;
- the platform admin: one overview of businesses ending in the next 7 days
  or ended in the last 7 days and not renewed.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.tenants import emails
from apps.tenants.models import Tenant

# Days relative to the end date on which to remind the business.
# Positive = before, 0 = the day it ends, negative = after.
REMIND_ON_DAYS = (7, 3, 1, 0, -3, -7)


class Command(BaseCommand):
    help = 'Email businesses whose trial or plan is ending or has ended, and the platform admin.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='List what would be sent without sending.')

    def handle(self, *args, dry_run=False, **options):
        today = timezone.localtime().date()
        tenants = list(
            Tenant.objects.filter(is_blocked=False, status__in=['trial', 'active'])
        )

        sent = 0
        for tenant in tenants:
            end = tenant.access_ends_at
            if end is None:
                continue
            days_left = (timezone.localtime(end).date() - today).days
            if days_left not in REMIND_ON_DAYS:
                continue
            recipients = emails.business_recipients(tenant)
            if not recipients:
                continue
            if dry_run:
                self.stdout.write(f'[dry-run] {tenant.name} ({days_left:+d} days) → {", ".join(recipients)}')
                continue
            subject = emails.subscription_reminder(tenant, days_left)
            sent += 1
            self.stdout.write(self.style.SUCCESS(f'✓ {tenant.name}: {subject}'))
        self.stdout.write(f'Business reminders sent: {sent}')

        if dry_run:
            return
        rows = emails.subscriptions_summary(tenants, today)
        self.stdout.write(
            f'Platform admin overview: {rows} business(es)' if rows
            else 'Platform admin overview: nothing to report'
        )
