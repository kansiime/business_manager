"""
Thread-local tenant + base model for tenant-scoped tables.

Every model that should be isolated per-tenant should inherit from TenantModel.
This gives:
  - an automatic `tenant` FK
  - automatic filtering by the current request's tenant (TenantManager)
  - automatic tenant assignment on .save()
"""
import threading
from contextlib import contextmanager

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


@contextmanager
def tenant_scope(tenant):
    """Temporarily work inside `tenant` (e.g. while provisioning a new one)."""
    previous = get_current_tenant()
    set_current_tenant(tenant)
    try:
        yield tenant
    finally:
        if previous is None:
            clear_current_tenant()
        else:
            set_current_tenant(previous)


# ---------------------------------------------------------------------------
# Managers
# ---------------------------------------------------------------------------
class TenantQuerySet(models.QuerySet):
    """
    Applies the current tenant filter when the queryset is used, not only
    when it is first built.

    Views declare `queryset = Model.objects.all()` at import time, when no
    tenant is in scope. DRF clones that queryset on every request, so the
    filter is added on clone, as soon as a tenant is in scope.
    """
    _tenant_filtered = False

    def _apply_tenant_filter(self):
        if self._tenant_filtered:
            return
        tenant = get_current_tenant()
        if tenant is not None:
            self.query.add_q(models.Q(tenant=tenant))
            self._tenant_filtered = True

    def _clone(self):
        clone = super()._clone()
        clone._tenant_filtered = self._tenant_filtered
        clone._apply_tenant_filter()
        return clone


class TenantManager(models.Manager.from_queryset(TenantQuerySet)):
    """
    Filters every queryset by the current tenant set by authentication.
    If no tenant is in scope (e.g. super admin, migrations), returns all.
    """
    def get_queryset(self):
        qs = super().get_queryset()
        qs._apply_tenant_filter()
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
        # Inside a business's request, rows always belong to that business,
        # whatever `tenant` value a client may have sent.
        tenant = get_current_tenant()
        if tenant is not None and self.tenant_id != tenant.pk:
            self.tenant = tenant
        super().save(*args, **kwargs)