from django.db import models
from apps.tenants.base import TenantModel
from apps.inventory.models import Product, Supplier


class Purchase(TenantModel):
    """
    Tenant-scoped: every purchase belongs to one business.
    """
    STATUS = [
        ('pending', 'Pending'),
        ('received', 'Received'),
        ('cancelled', 'Cancelled'),
    ]
    reference = models.CharField(max_length=50)
    supplier = models.ForeignKey(
        Supplier, on_delete=models.SET_NULL, null=True, blank=True,
    )
    status = models.CharField(max_length=20, choices=STATUS, default='pending')
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


class PurchaseItem(models.Model):
    """
    Line items on a purchase. No tenant FK — inherits via `purchase`.

    Includes pharmacy/grocery fields (batch, expiry, manufacturer, unit)
    so when a drug is bought, its tracking data flows into the inventory.
    """
    purchase = models.ForeignKey(
        Purchase, on_delete=models.CASCADE, related_name='items',
    )
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.IntegerField()
    unit_cost = models.DecimalField(max_digits=14, decimal_places=2)

    # Pharmacy / grocery tracking fields
    batch_number = models.CharField(max_length=50, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    manufacturer = models.CharField(max_length=200, blank=True)
    unit = models.CharField(max_length=30, blank=True)

    @property
    def subtotal(self):
        return self.quantity * self.unit_cost

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"