"""
Seed the paid plans. Prices are starting points: the platform admin can
change them under Settings → Plans without a deploy.
"""
from django.db import migrations

PLANS = [
    # code, name, monthly, yearly (≈ 2 months free), users, branches, order
    ('starter', 'Starter', 50000, 500000, 3, 1, 1),
    ('growth', 'Growth', 100000, 1000000, 10, 2, 2),
    ('power', 'Power', 200000, 2000000, 50, 5, 3),
]


def seed(apps, schema_editor):
    Plan = apps.get_model('billing', 'Plan')
    for code, name, monthly, yearly, users, branches, order in PLANS:
        Plan.objects.get_or_create(
            code=code,
            defaults={
                'name': name,
                'monthly_price': monthly,
                'yearly_price': yearly,
                'currency': 'UGX',
                'max_users': users,
                'max_branches': branches,
                'order': order,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0002_payment'),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
