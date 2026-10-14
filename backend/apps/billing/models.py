from django.db import models


class Plan(models.Model):
    """A pricing plan — Starter, Growth, Power."""
    code = models.SlugField(max_length=30, unique=True)   # 'starter', 'growth'
    name = models.CharField(max_length=100)
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    yearly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=10, default='UGX')
    max_users = models.PositiveIntegerField(default=2)
    max_branches = models.PositiveIntegerField(default=1)
    features = models.JSONField(default=list)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order', 'monthly_price']

    def __str__(self):
        return self.name


class Subscription(models.Model):
    """
    A tenant's subscription record. Kept simple for now — hook into
    Flutterwave/Stripe later.
    """
    BILLING_CYCLE = [('monthly', 'Monthly'), ('yearly', 'Yearly')]

    tenant = models.OneToOneField(
        'tenants.Tenant', on_delete=models.CASCADE, related_name='subscription'
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT)
    billing_cycle = models.CharField(max_length=10, choices=BILLING_CYCLE, default='monthly')
    started_at = models.DateTimeField(auto_now_add=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.tenant.name} — {self.plan.name}"


class Payment(models.Model):
    """
    One attempt to pay for a plan. Created at checkout as `pending`, then
    marked `successful` once the provider confirms it (redirect verification
    or webhook), at which point the tenant's subscription is extended.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('successful', 'Successful'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
        ('rejected', 'Rejected'),        # manual claim the platform admin turned down
    ]
    PROVIDER_CHOICES = [
        ('mtn_momo', 'MTN Mobile Money'),
        ('flutterwave', 'Flutterwave'),
        ('manual', 'Manual'),
    ]

    tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE, related_name='payments'
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name='payments')
    billing_cycle = models.CharField(
        max_length=10, choices=Subscription.BILLING_CYCLE, default='monthly'
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, default='UGX')

    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    tx_ref = models.CharField(max_length=100, unique=True)
    provider_tx_id = models.CharField(max_length=100, blank=True)
    payer_phone = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    note = models.TextField(blank=True)

    created_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='payments',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    period_end = models.DateTimeField(null=True, blank=True)

    # Manual claims ("I've paid"): who confirmed / rejected it and when
    reviewed_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='reviewed_payments',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.tenant.name} — {self.plan.name} {self.amount} {self.currency} [{self.status}]"
