"""
The `appointments` feature switched on the whole clinic module (patients,
visits, lab, pharmacy...), so a salon, which has appointments too, saw
clinic pages. It is split into:

  clinic    the clinical module (clinic business type)
  bookings  simple customer bookings (salon and other appointment-based
            businesses)

Salons also get `inventory`, so they can list the services and products
they sell.
"""
from django.db import migrations


def _new_key(slug):
    return 'bookings' if slug == 'salon' else 'clinic'


def forwards(apps, schema_editor):
    BusinessType = apps.get_model('tenants', 'BusinessType')
    Tenant = apps.get_model('tenants', 'Tenant')

    for bt in BusinessType.objects.all():
        features = list(bt.features or [])
        if 'appointments' in features:
            features = [_new_key(bt.slug) if f == 'appointments' else f for f in features]
        if bt.slug == 'salon':
            for f in ('bookings', 'inventory'):
                if f not in features:
                    features.append(f)
        if features != (bt.features or []):
            bt.features = list(dict.fromkeys(features))
            bt.save(update_fields=['features'])

    for t in Tenant.objects.exclude(feature_overrides={}).select_related('business_type'):
        overrides = dict(t.feature_overrides or {})
        if 'appointments' in overrides:
            slug = t.business_type.slug if t.business_type else ''
            overrides[_new_key(slug)] = overrides.pop('appointments')
            t.feature_overrides = overrides
            t.save(update_fields=['feature_overrides'])


def backwards(apps, schema_editor):
    BusinessType = apps.get_model('tenants', 'BusinessType')
    for bt in BusinessType.objects.all():
        features = list(bt.features or [])
        if 'clinic' in features or 'bookings' in features:
            features = ['appointments' if f in ('clinic', 'bookings') else f for f in features]
            bt.features = list(dict.fromkeys(features))
            bt.save(update_fields=['features'])


class Migration(migrations.Migration):
    dependencies = [
        ('tenants', '0005_alter_platformsetting_options_and_more'),
    ]
    operations = [migrations.RunPython(forwards, backwards)]
