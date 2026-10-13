from django.core.management.base import BaseCommand
from apps.tenants.models import Tenant
from apps.reports.email_digest import send_digest_for_tenant


class Command(BaseCommand):
    help = 'Send daily summary email to all tenants'

    def add_arguments(self, parser):
        parser.add_argument('--tenant', help='Only send for this tenant slug')

    def handle(self, *args, **options):
        slug = options.get('tenant')
        tenants = Tenant.objects.filter(status__in=['active', 'trial'])
        if slug:
            tenants = tenants.filter(slug=slug)

        sent = 0
        for t in tenants:
            if send_digest_for_tenant(t):
                sent += 1
                self.stdout.write(self.style.SUCCESS(f'✓ Sent digest to {t.name}'))
            else:
                self.stdout.write(self.style.WARNING(f'✗ Skipped {t.name} (no email or error)'))

        self.stdout.write(f'\nTotal sent: {sent}/{tenants.count()}')