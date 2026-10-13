from django.db import migrations


BUSINESS_TYPES = [
    {
        'slug': 'garage',
        'name': 'Garage & Auto Repair',
        'icon': '🔧',
        'description': 'Auto repair shop, spare parts dealer',
        'features': [
            'inventory', 'sales', 'purchases', 'debts', 'expenses',
            'returns', 'reports', 'reconciliation', 'customers',
            'repairs', 'vehicles',
        ],
        'order': 1,
    },
    {
        'slug': 'grocery',
        'name': 'Grocery / Mini Mart',
        'icon': '🛒',
        'description': 'Retail grocery, minimart, kiosk',
        'features': [
            'inventory', 'sales', 'purchases', 'debts', 'expenses',
            'returns', 'reports', 'customers', 'expiry', 'barcode',
        ],
        'order': 2,
    },
    {
        'slug': 'wholesale',
        'name': 'Wholesale / Distribution',
        'icon': '📦',
        'description': 'Bulk sales, distribution to retailers',
        'features': [
            'inventory', 'sales', 'purchases', 'debts', 'expenses',
            'returns', 'reports', 'customers', 'variants',
        ],
        'order': 3,
    },
    {
        'slug': 'drugshop',
        'name': 'Drug Shop / Pharmacy',
        'icon': '💊',
        'description': 'Pharmacy, drug shop, health products',
        'features': [
            'inventory', 'sales', 'purchases', 'debts', 'expenses',
            'returns', 'reports', 'customers', 'expiry', 'batch_tracking',
        ],
        'order': 4,
    },
    {
        'slug': 'clinic',
        'name': 'Clinic / Health Center',
        'icon': '🩺',
        'description': 'Health center, clinic, doctor practice',
        'features': [
            'inventory', 'sales', 'purchases', 'debts', 'expenses',
            'reports', 'customers', 'prescriptions', 'appointments',
        ],
        'order': 5,
    },
    {
        'slug': 'hardware',
        'name': 'Hardware Store',
        'icon': '🔨',
        'description': 'Hardware, building materials, tools',
        'features': [
            'inventory', 'sales', 'purchases', 'debts', 'expenses',
            'returns', 'reports', 'customers',
        ],
        'order': 6,
    },
    {
        'slug': 'restaurant',
        'name': 'Restaurant / Café',
        'icon': '🍽️',
        'description': 'Restaurant, café, bar',
        'features': [
            'inventory', 'sales', 'purchases', 'expenses',
            'reports', 'menu', 'tables',
        ],
        'order': 7,
    },
    {
        'slug': 'salon',
        'name': 'Salon / Barbershop',
        'icon': '💇',
        'description': 'Hair salon, barber, beauty',
        'features': [
            'sales', 'expenses', 'reports', 'customers', 'appointments',
        ],
        'order': 8,
    },
    {
        'slug': 'electronics',
        'name': 'Electronics / Phone Shop',
        'icon': '📱',
        'description': 'Electronics, phone accessories, repairs',
        'features': [
            'inventory', 'sales', 'purchases', 'debts', 'expenses',
            'returns', 'reports', 'customers', 'variants', 'barcode',
        ],
        'order': 9,
    },
    {
        'slug': 'agro',
        'name': 'Agro / Farm Supply',
        'icon': '🌾',
        'description': 'Agro inputs, seeds, fertilizer',
        'features': [
            'inventory', 'sales', 'purchases', 'debts', 'expenses',
            'returns', 'reports', 'customers', 'expiry',
        ],
        'order': 10,
    },
    {
        'slug': 'boutique',
        'name': 'Boutique / Fashion',
        'icon': '👗',
        'description': 'Clothing, fashion, tailoring',
        'features': [
            'inventory', 'sales', 'purchases', 'debts', 'expenses',
            'returns', 'reports', 'customers', 'variants',
        ],
        'order': 11,
    },
    {
        'slug': 'general',
        'name': 'General Retail',
        'icon': '🏪',
        'description': 'Any other retail or trading business',
        'features': [
            'inventory', 'sales', 'purchases', 'debts', 'expenses',
            'returns', 'reports', 'customers',
        ],
        'order': 99,
    },
]


PLANS = [
    {
        'code': 'starter',
        'name': 'Starter',
        'monthly_price': 40000,
        'yearly_price': 400000,
        'currency': 'UGX',
        'max_users': 2,
        'max_branches': 1,
        'features': ['inventory', 'sales', 'purchases', 'debts', 'reports'],
        'order': 1,
    },
    {
        'code': 'growth',
        'name': 'Growth',
        'monthly_price': 90000,
        'yearly_price': 900000,
        'currency': 'UGX',
        'max_users': 10,
        'max_branches': 1,
        'features': [
            'inventory', 'sales', 'purchases', 'debts', 'expenses',
            'returns', 'reports', 'reconciliation', 'customers',
        ],
        'order': 2,
    },
    {
        'code': 'power',
        'name': 'Power',
        'monthly_price': 200000,
        'yearly_price': 2000000,
        'currency': 'UGX',
        'max_users': 999,
        'max_branches': 999,
        'features': ['all'],
        'order': 3,
    },
]


def seed(apps, schema_editor):
    BusinessType = apps.get_model('tenants', 'BusinessType')
    Plan = apps.get_model('billing', 'Plan')

    for bt in BUSINESS_TYPES:
        BusinessType.objects.update_or_create(slug=bt['slug'], defaults=bt)

    for p in PLANS:
        Plan.objects.update_or_create(code=p['code'], defaults=p)


def unseed(apps, schema_editor):
    BusinessType = apps.get_model('tenants', 'BusinessType')
    Plan = apps.get_model('billing', 'Plan')
    BusinessType.objects.filter(
        slug__in=[bt['slug'] for bt in BUSINESS_TYPES]
    ).delete()
    Plan.objects.filter(code__in=[p['code'] for p in PLANS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('tenants', '0001_initial'),
        ('billing', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]