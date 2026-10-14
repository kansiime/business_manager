"""Give every existing business user a membership in their current business."""
from django.db import migrations


def backfill(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    Membership = apps.get_model('accounts', 'Membership')
    Tenant = apps.get_model('tenants', 'Tenant')

    owner_emails = {
        t.id: (t.owner_email or '').lower()
        for t in Tenant.objects.all()
    }
    first_admin = set()
    for user in User.objects.exclude(role='super').exclude(tenant__isnull=True).order_by('id'):
        # Treat the earliest admin (or the one matching the owner email) as owner
        email_match = user.email and user.email.lower() == owner_emails.get(user.tenant_id)
        is_owner = user.role == 'admin' and (email_match or user.tenant_id not in first_admin)
        if user.role == 'admin':
            first_admin.add(user.tenant_id)
        Membership.objects.get_or_create(
            user=user, tenant_id=user.tenant_id,
            defaults={'role': user.role, 'is_owner': bool(is_owner)},
        )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_membership'),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
