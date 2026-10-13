"""
Role → page permission matrix.

The frontend uses this to:
  - filter the navbar
  - guard routes via ProtectedRoute

A page is available to a user only if BOTH:
  - the role's allowlist includes it, AND
  - the tenant's enabled_features include the required feature for that page.
"""

GENERIC_PAGES = [
    'dashboard',
    'inventory',
    'sales',
    'purchases',
    'debts',
    'customers',
    'expenses',
    'returns',
    'reconciliation',
    'reports',
    'product-movement',
    'suppliers',
    'ai-analytics',
    'settings',
    'sales-per-staff',
]

CLINIC_PAGES = [
    'dashboard',
    'patients',
    'appointments',
    'prescriptions',
    'consultations',
    'schedule',
    'services',
    'pharmacy',
    'lab',
    'billing',
    'reception',
    'doctors',
    'ai-analytics',
    'settings',
    'sales-per-staff',
]


ROLE_PAGES = {
    # Platform owner
    'super': ['dashboard', 'tenants', 'settings', 'ai-analytics'],

    # Full access within the tenant
    'admin': sorted(set(GENERIC_PAGES + CLINIC_PAGES + ['users'])),

    'manager': sorted(set(GENERIC_PAGES + CLINIC_PAGES)),

    # Generic business roles
    'cashier': [
        'dashboard', 'billing', 'sales', 'debts', 'customers',
        'reports', 'ai-analytics', 'settings',
    ],

    'storekeeper': [
        'dashboard', 'inventory', 'purchases', 'returns',
        'reconciliation', 'suppliers', 'reports', 'ai-analytics', 'settings',
    ],

    # Clinical roles
    'doctor': [
        'dashboard', 'patients', 'appointments', 'consultations',
        'prescriptions', 'lab', 'schedule', 'services', 'reports',
        'ai-analytics', 'settings',
    ],

    'nurse': [
        'dashboard', 'reception', 'patients', 'appointments',
        'consultations', 'schedule', 'settings',
    ],

    'midwife': [
        'dashboard', 'reception', 'patients', 'appointments',
        'consultations', 'schedule', 'settings',
    ],

    'pharmacist': [
        'dashboard', 'pharmacy', 'prescriptions', 'inventory',
        'purchases', 'ai-analytics', 'settings',
    ],

    'lab_tech': [
        'dashboard', 'lab', 'patients', 'consultations',
        'inventory', 'settings',
    ],

    'radiologist': [
        'dashboard', 'lab', 'patients', 'consultations',
        'inventory', 'settings',
    ],

    'receptionist': [
        'dashboard', 'reception', 'patients', 'appointments',
        'consultations', 'schedule',
        'billing', 'sales', 'debts', 'customers', 'settings',
    ],

    'accountant': [
        'dashboard', 'sales', 'purchases', 'debts', 'expenses',
        'reports', 'ai-analytics', 'settings', 'billing', 'customers',
        'sales-per-staff',
    ],
}


# Which tenant feature each page requires.
# `None` means the page is allowed for the role regardless of features
# (used for truly universal pages like dashboard / settings).
PAGE_FEATURE = {
    # Universal
    'dashboard':         None,
    'settings':          None,
    'users':             None,

    # Generic pages
    'inventory':         'inventory',
    'sales':             'sales',
    'purchases':         'purchases',
    'debts':             'debts',
    'customers':         'customers',
    'expenses':          'expenses',
    'returns':           'returns',
    'reconciliation':    'reconciliation',
    'reports':           'reports',
    'product-movement':  'inventory',
    'suppliers':         'inventory',
    'ai-analytics':      'inventory',
    'sales-per-staff':   'sales',

    # Clinic pages
    'patients':          'appointments',
    'appointments':      'appointments',
    'consultations':     'appointments',
    'schedule':          'appointments',
    'services':          'appointments',
    'lab':               'appointments',
    'billing':           'appointments',
    'reception':         'appointments',
    'doctors':           'appointments',
    'prescriptions':     'prescriptions',
    'pharmacy':          'prescriptions',
}


def pages_for(user):
    """
    Pages the given user can access.

    Filters the role's allowlist by the tenant's enabled features.
    A page requires a matching feature unless its PAGE_FEATURE entry is None.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return []

    role = getattr(user, 'role', None)

    # Super user is not tenant-scoped
    if role == 'super':
        return sorted(set(ROLE_PAGES.get('super', [])))

    role_pages = ROLE_PAGES.get(role, [])

    tenant = getattr(user, 'tenant', None)
    enabled = set(tenant.enabled_features) if tenant else set()

    allowed = []
    for page in role_pages:
        feature = PAGE_FEATURE.get(page)
        if feature is None or feature in enabled:
            allowed.append(page)

    return sorted(set(allowed))