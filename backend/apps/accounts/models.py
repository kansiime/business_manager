from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

from apps.tenants.base import TenantModel


class User(AbstractUser):
    """
    Every user belongs to exactly one tenant — EXCEPT super admins
    (role='super') who have tenant=NULL and can see everything.
    """
    ROLE_CHOICES = [
        # Platform
        ('super', 'Platform Super Admin'),

        # Generic business roles
        ('admin', 'Admin'),
        ('manager', 'Manager'),
        ('cashier', 'Cashier'),
        ('storekeeper', 'Storekeeper'),

        # Clinic roles
        ('doctor', 'Doctor'),
        ('nurse', 'Nurse'),
        ('midwife', 'Midwife'),
        ('pharmacist', 'Pharmacist'),
        ('lab_tech', 'Lab Technician'),
        ('radiologist', 'Radiologist'),
        ('receptionist', 'Receptionist'),
        ('accountant', 'Accountant'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='cashier')
    phone = models.CharField(max_length=30, blank=True)

    tenant = models.ForeignKey(
        'tenants.Tenant',
        on_delete=models.CASCADE,
        related_name='users',
        null=True, blank=True,
    )

    def __str__(self):
        return f"{self.username} ({self.role})"

    @property
    def is_super_admin(self):
        return self.role == 'super'

    @property
    def is_clinical_role(self):
        return self.role in (
            'doctor', 'nurse', 'midwife', 'pharmacist',
            'lab_tech', 'radiologist', 'receptionist', 'accountant',
        )


class GarageSettings(TenantModel):
    """
    Business settings — one row per tenant.
    Name kept as `GarageSettings` to preserve imports across the codebase,
    but it works for ANY business type.
    """
    name = models.CharField(max_length=200, default='My Business')
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    tin = models.CharField(max_length=50, blank=True, verbose_name='TIN / Tax ID')
    currency_code = models.CharField(max_length=10, default='UGX')
    currency_symbol = models.CharField(max_length=10, default='UGX')
    receipt_footer = models.TextField(blank=True, default='Thank you for your business!')
    logo = models.ImageField(upload_to='logos/', blank=True, null=True)

    # WhatsApp templates
    whatsapp_template_debt = models.TextField(
        blank=True,
        default=(
            'Hello {name}, this is a friendly reminder about your outstanding '
            'balance of {amount} at {business}. Please arrange payment at your '
            'earliest convenience. Thank you.'
        ),
    )
    whatsapp_template_promise_today = models.TextField(
        blank=True,
        default=(
            'Hello {name}, you promised to pay {amount} today at {business}. '
            'Kindly visit us or send the payment via mobile money. Thank you.'
        ),
    )
    whatsapp_template_receipt = models.TextField(
        blank=True,
        default=(
            'Hi {name}, thank you for your purchase at {business}.\n\n'
            'Receipt #: {reference}\nTotal: {amount}\nPaid: {paid}\nBalance: {balance}\n\n'
            'We appreciate your business!'
        ),
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Business Settings'
        verbose_name_plural = 'Business Settings'

    def __str__(self):
        return self.name

    @classmethod
    def load(cls):
        """
        Returns the settings row for the CURRENT tenant (from thread-local).
        If no tenant is in scope (super admin), returns the first row or a new
        blank instance.
        """
        from apps.tenants.base import get_current_tenant
        tenant = get_current_tenant()
        if tenant is not None:
            obj, _ = cls.objects.get_or_create(tenant=tenant)
            return obj
        # Super admin without an active tenant — return an ephemeral instance
        obj = cls.all_objects.first()
        if obj:
            return obj
        return cls(name='Platform')


class AuditLog(TenantModel):
    """Audit log — scoped per tenant."""
    ACTIONS = [
        ('login', 'Login'),
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('stock_in', 'Stock In'),
        ('stock_out', 'Stock Out'),
        ('stock_adjust', 'Stock Adjustment'),
        ('reconcile', 'Reconciliation'),
        ('payment', 'Payment'),
        ('expense', 'Expense'),
    ]
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='audit_logs',
    )
    action = models.CharField(max_length=30, choices=ACTIONS)
    model_name = models.CharField(max_length=60, blank=True)
    object_id = models.CharField(max_length=60, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user} {self.action} {self.model_name}#{self.object_id}"