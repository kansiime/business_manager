from django.db import models

from apps.tenants.base import TenantModel


class Booking(TenantModel):
    """
    A customer booking at an appointment-based business (salon, barber,
    spa...): who, which service, with whom, and when. Completing it can
    record the sale.
    """
    STATUS = [
        ('booked', 'Booked'),
        ('arrived', 'Arrived'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('no_show', 'No-show'),
    ]

    customer_name = models.CharField(max_length=200)
    customer_phone = models.CharField(max_length=30, blank=True)
    service = models.ForeignKey(
        'inventory.Product', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='bookings',
    )
    staff = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='bookings',
    )
    date = models.DateField()
    time = models.TimeField()
    duration_minutes = models.PositiveIntegerField(default=30)
    price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS, default='booked')
    notes = models.TextField(blank=True)
    sale = models.ForeignKey(
        'sales.Sale', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='bookings',
    )
    created_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True,
        related_name='created_bookings',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['date', 'time']
        indexes = [models.Index(fields=['tenant', 'date'])]

    def __str__(self):
        return f'{self.customer_name} — {self.date} {self.time:%H:%M}'
