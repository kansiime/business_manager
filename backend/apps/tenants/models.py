"""
Platform-level models: BusinessType and Tenant.

- BusinessType describes the KIND of business (Garage, Grocery, Clinic...)
  and which feature modules are enabled for it.

- Tenant is one BUSINESS account. Every row of business data (products, sales,
  etc.) belongs to exactly one Tenant.
"""
import uuid

from django.db import models
from django.utils.text import slugify


class BusinessType(models.Model):
    """
    A template for a category of business (Garage, Grocery, Clinic...).
    Determines which features are enabled by default for tenants of this type.
    """

    # Feature keys — used by frontend to show/hide modules
    ALL_FEATURE_KEYS = [
        'inventory',       # products, categories, suppliers
        'sales',           # point of sale
        'purchases',       # supplier orders
        'debts',           # receivables & payables
        'expenses',        # operating expenses
        'returns',         # customer/supplier returns
        'reports',         # analytics & exports
        'reconciliation',  # stock count adjustment
        'customers',       # customer directory
        'repairs',         # ← garage-specific: job cards
        'vehicles',        # ← garage-specific: customer vehicles
        'prescriptions',   # ← clinic/drugshop
        'appointments',    # ← clinic
        'menu',            # ← restaurant
        'tables',          # ← restaurant
        'expiry',          # ← grocery/drugshop: expiry dates
        'barcode',         # ← retail: barcode scanning
        'variants',        # ← retail: size/color variants
        'batch_tracking',  # ← pharmacy/grocery
    ]

    slug = models.SlugField(max_length=50, unique=True)   # 'garage', 'grocery'
    name = models.CharField(max_length=100)                # 'Garage & Auto Repair'
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=20, default='🏪')   # emoji for UI
    # Which features are on for this business type
    features = models.JSONField(default=list)
    # Default plan when a new tenant of this type signs up
    default_plan = models.CharField(max_length=20, default='trial')
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)         # for UI sorting

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return self.name

    def has_feature(self, key):
        return key in (self.features or [])


class Tenant(models.Model):
    """
    One business account.
    """
    PLAN_CHOICES = [
        ('trial', 'Free Trial'),
        ('starter', 'Starter'),
        ('growth', 'Growth'),
        ('power', 'Power'),
        ('suspended', 'Suspended'),
    ]
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('trial', 'On Trial'),
        ('suspended', 'Suspended'),
        ('blocked', 'Blocked'),
        ('cancelled', 'Cancelled'),
    ]

    is_blocked = models.BooleanField(
        default=False,
        help_text='Blocked tenants cannot log in or use the API.',
    )
    blocked_reason = models.TextField(blank=True)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=80, unique=True, db_index=True)
    name = models.CharField(max_length=200)

    business_type = models.ForeignKey(
        BusinessType, on_delete=models.PROTECT,
        related_name='tenants', null=True, blank=True,
    )

    # Owner (primary contact)
    owner_name = models.CharField(max_length=200, blank=True)
    owner_email = models.EmailField(blank=True)
    owner_phone = models.CharField(max_length=30, blank=True)

    # Billing
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default='trial')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='trial')
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    subscription_ends_at = models.DateTimeField(null=True, blank=True)

    # Limits (some plans restrict)
    max_users = models.PositiveIntegerField(default=3)
    max_branches = models.PositiveIntegerField(default=1)

    # Payment provider IDs
    flutterwave_customer_id = models.CharField(max_length=100, blank=True)
    stripe_customer_id = models.CharField(max_length=100, blank=True)

    # Feature overrides — a tenant can have MORE or FEWER features than
    # the default for their business type (for upgrade/downgrade).
    # Leave empty to inherit the business_type's features.
    feature_overrides = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} [{self.slug}]"

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:60] or 'business'
            candidate = base
            n = 1
            while Tenant.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                n += 1
                candidate = f'{base}-{n}'
            self.slug = candidate
        super().save(*args, **kwargs)

    # ------------------------------------------------------------------
    # Feature resolution
    # ------------------------------------------------------------------
    def has_feature(self, key):
        """True if this tenant currently has access to `key`."""
        overrides = self.feature_overrides or {}
        if key in overrides:
            return bool(overrides[key])
        if self.business_type:
            return self.business_type.has_feature(key)
        return False

    @property
    def enabled_features(self):
        """Full list of feature keys currently enabled for this tenant."""
        base = list(self.business_type.features or []) if self.business_type else []
        overrides = self.feature_overrides or {}
        keys = set(base)
        for k, v in overrides.items():
            if v:
                keys.add(k)
            else:
                keys.discard(k)
        return sorted(keys)

    @property
    def is_active(self):
        return self.status == 'active'

    @property
    def is_trial(self):
        return self.status == 'trial'

    # ------------------------------------------------------------------
    # Access / subscription state
    # ------------------------------------------------------------------
    @property
    def access_ends_at(self):
        """When the current trial or paid period runs out (None = no limit)."""
        if self.plan == 'trial':
            return self.trial_ends_at
        return self.subscription_ends_at

    @property
    def is_expired(self):
        """Trial or paid period has run out — the tenant must pay to keep writing."""
        from django.utils import timezone
        end = self.access_ends_at
        return end is not None and end < timezone.now()

    @property
    def is_locked(self):
        """Blocked or suspended by the platform — no access at all."""
        return self.is_blocked or self.status in ('suspended', 'blocked', 'cancelled')

class PlatformSetting(models.Model):
    """
    A single-row table for platform-wide settings.
    Access via PlatformSetting.load().
    """
    # Trial
    default_trial_days = models.PositiveIntegerField(default=14)

    # Defaults for new tenants
    default_currency = models.CharField(max_length=10, default='UGX')
    default_country = models.CharField(max_length=60, default='Uganda')
    support_email = models.EmailField(blank=True)
    support_phone = models.CharField(max_length=30, blank=True)

    # Feature toggles — global on/off for whole platform
    platform_features = models.JSONField(
        default=dict,
        blank=True,
        help_text='Global on/off switches, e.g. {"whatsapp": true, "sms": false}',
    )

    # Announcement
    announcement = models.TextField(blank=True)
    announcement_active = models.BooleanField(default=False)
    announcement_starts_at = models.DateTimeField(
        null=True, blank=True,
        help_text='Announcement will not show before this time. Leave blank to show immediately.',
    )
    announcement_ends_at = models.DateTimeField(
        null=True, blank=True,
        help_text='Announcement will not show after this time. Leave blank to run forever.',
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Platform Setting'
        verbose_name_plural = 'Platform Settings'

    def __str__(self):
        return 'Platform Settings'

    @classmethod
    def load(cls):
        """
        Return the single settings row, creating it if it doesn't exist.
        """
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj