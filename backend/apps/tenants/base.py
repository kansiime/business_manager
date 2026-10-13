"""
Thread-local tenant + base model for tenant-scoped tables.

Every model that should be isolated per-tenant should inherit from TenantModel.
This gives:
  - an automatic `tenant` FK
  - automatic filtering by the current request's tenant (TenantManager)
  - automatic tenant assignment on .save()
"""
import threading

from django.db import models


# ---------------------------------------------------------------------------
# Thread-local current tenant
# ---------------------------------------------------------------------------
_thread_locals = threading.local()


def set_current_tenant(tenant):
    _thread_locals.tenant = tenant


def get_current_tenant():
    return getattr(_thread_locals, 'tenant', None)


def clear_current_tenant():
    if hasattr(_thread_locals, 'tenant'):
        del _thread_locals.tenant


# ---------------------------------------------------------------------------
# Managers
# ---------------------------------------------------------------------------
class TenantManager(models.Manager):
    """
    Filters every queryset by the current tenant set by middleware.
    If no tenant is in scope (e.g. super admin, migrations), returns all.
    """
    def get_queryset(self):
        qs = super().get_queryset()
        tenant = get_current_tenant()
        if tenant is not None:
            return qs.filter(tenant=tenant)
        return qs


class AllTenantsManager(models.Manager):
    """Bypasses tenant filtering — use for super admin / platform reports."""
    def get_queryset(self):
        return super().get_queryset()


# ---------------------------------------------------------------------------
# Abstract base model
# ---------------------------------------------------------------------------
class TenantModel(models.Model):
    """
    Inherit from this for every tenant-scoped model.
    """
    tenant = models.ForeignKey(
        'tenants.Tenant',
        on_delete=models.CASCADE,
        related_name='%(app_label)s_%(class)ss',
        null=True,       # nullable to allow super admin operations
        blank=True,
        db_index=True,
    )

    objects = TenantManager()
    all_objects = AllTenantsManager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.tenant_id:
            tenant = get_current_tenant()
            if tenant is not None:
                self.tenant = tenant
        super().save(*args, **kwargs)