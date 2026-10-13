"""
Management command: create a tenant + its first admin user + business settings.

Usage:
    python manage.py create_tenant \
        --name "NK Garage Ruti Mbarara" \
        --business-type garage \
        --owner-email kansiimenoel6@gmail.com \
        --owner-phone 0787671827 \
        --username Nkgarage \
        --password "YourPassword123" \
        --plan growth
"""
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from datetime import timedelta

from apps.tenants.models import Tenant, BusinessType
from apps.accounts.models import User, GarageSettings


class Command(BaseCommand):
    help = 'Create a new tenant with an owner user and business settings.'

    def add_arguments(self, parser):
        parser.add_argument('--name', required=True, help='Business name')
        parser.add_argument('--business-type', required=True,
                            help='Business type slug, e.g. garage, grocery')
        parser.add_argument('--owner-email', default='')
        parser.add_argument('--owner-phone', default='')
        parser.add_argument('--username', required=True, help='Admin username')
        parser.add_argument('--password', required=True, help='Admin password')
        parser.add_argument('--plan', default='trial',
                            choices=['trial', 'starter', 'growth', 'power'])

    def handle(self, *args, **options):
        # 1. Look up the business type
        try:
            btype = BusinessType.objects.get(slug=options['business_type'])
        except BusinessType.DoesNotExist:
            raise CommandError(
                f"Business type '{options['business_type']}' not found. "
                f"Available: {list(BusinessType.objects.values_list('slug', flat=True))}"
            )

        # 2. Refuse if the username is already taken
        if User.objects.filter(username=options['username']).exists():
            raise CommandError(f"Username '{options['username']}' is already taken.")

        # 3. Create the tenant
        tenant = Tenant.objects.create(
            name=options['name'],
            business_type=btype,
            owner_email=options['owner_email'],
            owner_phone=options['owner_phone'],
            plan=options['plan'],
            status='trial' if options['plan'] == 'trial' else 'active',
            trial_ends_at=timezone.now() + timedelta(days=14) if options['plan'] == 'trial' else None,
        )
        self.stdout.write(self.style.SUCCESS(f'✓ Tenant created: {tenant.name} [{tenant.slug}]'))

        # 4. Create the admin user (scoped to this tenant)
        user = User.objects.create_user(
            username=options['username'],
            password=options['password'],
            role='admin',
            phone=options['owner_phone'],
            tenant=tenant,
            is_staff=True,
        )
        self.stdout.write(self.style.SUCCESS(f'✓ Admin user created: {user.username}'))

        # 5. Create default business settings
        settings = GarageSettings.all_objects.create(
            tenant=tenant,
            name=options['name'],
            phone=options['owner_phone'],
            email=options['owner_email'],
            currency_code='UGX',
            currency_symbol='UGX',
        )
        self.stdout.write(self.style.SUCCESS(f'✓ Settings created for {settings.name}'))

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('✅ Tenant onboarding complete.'))
        self.stdout.write('')
        self.stdout.write(f'   Business type:  {btype.name}')
        self.stdout.write(f'   Features:       {", ".join(tenant.enabled_features)}')
        self.stdout.write(f'   Login URL:      /login')
        self.stdout.write(f'   Username:       {user.username}')
        self.stdout.write(f'   Password:       (the one you passed)')
        self.stdout.write('')
        self.stdout.write('   Next: create a super admin (see Part 3b, step 3).')