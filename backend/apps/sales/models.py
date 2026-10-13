from django.db import models
from apps.tenants.base import TenantModel
from apps.inventory.models import Product


class Sale(TenantModel):
    """
    Tenant-scoped: every sale belongs to one business.
    """
    PAYMENT = [
        ('cash', 'Cash'),
        ('credit', 'Credit'),
        ('partial', 'Partial'),
    ]
    reference = models.CharField(max_length=50)
    customer_name = models.CharField(max_length=200, blank=True)
    customer_phone = models.CharField(max_length=30, blank=True)
    payment_type = models.CharField(max_length=20, choices=PAYMENT, default='cash')
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    user = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('tenant', 'reference')]

    @property
    def balance(self):
        return self.total_amount - self.amount_paid

    def __str__(self):
        return f"{self.reference} — {self.total_amount}"


class SaleItem(models.Model):
    """
    Line items on a sale. No tenant FK — inherits via `sale`.
    """
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=14, decimal_places=2)
    cost_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    @property
    def subtotal(self):
        return self.quantity * self.unit_price

    @property
    def profit(self):
        return self.quantity * (self.unit_price - self.cost_price)

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"