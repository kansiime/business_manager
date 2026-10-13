from django.db import models
from apps.tenants.base import TenantModel


class ExpenseCategory(TenantModel):
    """
    Tenant-scoped: every tenant has its own set of expense categories.
    """
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = 'Expense Categories'
        ordering = ['name']
        unique_together = [('tenant', 'name')]

    def __str__(self):
        return self.name


class Expense(TenantModel):
    """
    Tenant-scoped: operating expenses for one business.
    """
    PAYMENT_METHODS = [
        ('cash', 'Cash'),
        ('bank', 'Bank Transfer'),
        ('mobile', 'Mobile Money'),
        ('card', 'Card'),
        ('credit', 'Credit (unpaid)'),
    ]
    category = models.ForeignKey(
        ExpenseCategory, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='expenses',
    )
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    payment_method = models.CharField(
        max_length=20, choices=PAYMENT_METHODS, default='cash'
    )
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    expense_date = models.DateField()
    user = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-expense_date', '-id']

    def __str__(self):
        return f"{self.description} — {self.amount}"