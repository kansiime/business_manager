"""
Custom JWT authentication for multi-tenant.

After the token is validated, we:
  1. Grab the user from the token
  2. Read the tenant slug from the token's claims
  3. Set the tenant in the thread-local for the request lifecycle

This ensures TenantManager returns correctly filtered querysets in every
DRF view.
"""
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed

from apps.tenants.models import Tenant
from apps.tenants.base import set_current_tenant, clear_current_tenant


class TenantJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, token = result

        # Super admin: no tenant in scope, sees everything
        if getattr(user, 'role', None) == 'super':
            clear_current_tenant()
            return user, token

        # Regular user: attach their tenant
        tenant = getattr(user, 'tenant', None)
        if tenant is None:
            # Try to pull from the token in case user object is stale
            tenant_id = token.get('tenant_id')
            if tenant_id:
                try:
                    tenant = Tenant.objects.get(pk=tenant_id)
                except Tenant.DoesNotExist:
                    tenant = None

        if tenant is None:
            raise AuthenticationFailed('User has no tenant assigned.')

        set_current_tenant(tenant)
        return user, token