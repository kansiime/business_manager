from django.db import models
from django.utils import timezone

from apps.tenants.base import TenantModel


class Category(TenantModel):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    class Meta:
        unique_together = [('tenant', 'name')]
        ordering = ['name']

    def __str__(self):
        return self.name


class Supplier(TenantModel):
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Product(TenantModel):
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=50)
    barcode = models.CharField(max_length=50, blank=True, db_index=True)
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True,
    )
    supplier = models.ForeignKey(
        Supplier, on_delete=models.SET_NULL, null=True, blank=True,
    )
    cost_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    selling_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    quantity = models.IntegerField(default=0)
    reorder_level = models.IntegerField(default=5)

    # Generic fields — useful across verticals
    unit = models.CharField(max_length=30, blank=True, default='')
    expiry_date = models.DateField(null=True, blank=True)
    batch_number = models.CharField(max_length=50, blank=True)
    manufacturer = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('tenant', 'sku')]
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.sku})"

    @property
    def stock_value(self):
        return self.quantity * self.cost_price

    @property
    def is_expired(self):
        if not self.expiry_date:
            return False
        return self.expiry_date < timezone.localtime().date()

    @property
    def days_to_expiry(self):
        if not self.expiry_date:
            return None
        return (self.expiry_date - timezone.localtime().date()).days


class StockMovement(TenantModel):
    MOVEMENT_TYPES = [
        ('in', 'Stock In'),
        ('out', 'Stock Out'),
        ('adjust', 'Adjustment'),
    ]
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name='movements',
    )
    movement_type = models.CharField(max_length=10, choices=MOVEMENT_TYPES)
    quantity = models.IntegerField()
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    user = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.product.name} - {self.movement_type} {self.quantity}"


class StockReconciliation(TenantModel):
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name='reconciliations',
    )
    system_quantity = models.IntegerField()
    physical_quantity = models.IntegerField()
    difference = models.IntegerField()
    notes = models.TextField(blank=True)
    user = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        self.difference = self.physical_quantity - self.system_quantity
        super().save(*args, **kwargs)
        self.product.quantity = self.physical_quantity
        self.product.save()