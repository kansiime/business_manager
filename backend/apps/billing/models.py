from django.db import models
from apps.tenants.base import TenantModel


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