from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.reports.email_digest import (
    build_digest, digest_recipients, render_text, send_digest_for_tenant,
)
from apps.tenants.models import Tenant


class Command(BaseCommand):
    help = (
        'Email each active / trial business its daily summary: sales and profit, '
        'best sellers, stock that is not moving, expired and expiring stock, '
        'low stock and money owed.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--tenant', help='Only this business (slug).')
        parser.add_argument(
            '--to', nargs='+',
            help="Send only to these addresses instead of the business's "
                 'owner / admins / managers (for testing).',
        )
        parser.add_argument(
            '--preview', action='store_true',
            help='Print the digest instead of sending it.',
        )

    def handle(self, *args, tenant=None, to=None, preview=False, **options):
        tenants = Tenant.objects.filter(status__in=['active', 'trial'])
        if tenant:
            tenants = tenants.filter(slug=tenant)

        sent = 0
        for t in tenants:
            if preview:
                day = timezone.localtime().date() - timedelta(days=1)
                self.stdout.write(f"To: {', '.join(to or digest_recipients(t)) or '(nobody)'}")
                self.stdout.write(render_text(build_digest(t, day)) + '\n' + '=' * 60)
                continue
            if send_digest_for_tenant(t, to=to):
                sent += 1
                self.stdout.write(self.style.SUCCESS(f'✓ Sent digest to {t.name}'))
            else:
                self.stdout.write(self.style.WARNING(f'✗ Skipped {t.name} (no email or error)'))

        if not preview:
            self.stdout.write(f'\nTotal sent: {sent}/{tenants.count()}')
