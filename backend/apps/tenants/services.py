"""
Business provisioning — the one place a new tenant gets created.

Used by public sign-up, "add another business" for logged-in owners, the
super-admin "Add Business" form, and the `create_tenant` command, so every
new business starts in the same state.
"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .base import tenant_scope
from .models import PlatformSetting, Tenant


def provision_business(
    *, owner, name, business_type, plan='trial',
    owner_name='', owner_email='', owner_phone='',
):
    """
    Create a tenant, make `owner` its admin, and create its business settings.

    New businesses start on a free trial of `PlatformSetting.default_trial_days`
    (14 by default). Passing a paid plan code (super admin only) starts a
    30-day paid period instead.
    """
    from apps.accounts.models import GarageSettings, Membership

    platform = PlatformSetting.load()
    now = timezone.now()

    if plan == 'trial':
        status_ = 'trial'
        trial_ends = now + timedelta(days=platform.default_trial_days)
        sub_ends = None
    else:
        status_ = 'active'
        trial_ends = None
        sub_ends = now + timedelta(days=30)

    currency = platform.default_currency or 'UGX'

    with transaction.atomic():
        tenant = Tenant.objects.create(
            name=name,
            business_type=business_type,
            owner_name=owner_name,
            owner_email=owner_email,
            owner_phone=owner_phone,
            plan=plan,
            status=status_,
            trial_ends_at=trial_ends,
            subscription_ends_at=sub_ends,
        )

        Membership.objects.create(
            user=owner, tenant=tenant, role='admin', is_owner=True,
        )

        # The owner's "current" business becomes the new one
        owner.tenant = tenant
        owner.role = 'admin'
        owner.save(update_fields=['tenant', 'role'])

        # The creator may be signed in to another business right now
        with tenant_scope(tenant):
            GarageSettings.all_objects.create(
                tenant=tenant,
                name=name,
                phone=owner_phone,
                email=owner_email,
                currency_code=currency,
                currency_symbol=currency,
            )

    return tenant
