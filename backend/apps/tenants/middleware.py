"""
Extracts the tenant from the authenticated user and makes it available
to every model query via a thread-local.

Runs AFTER Django's AuthenticationMiddleware.
"""
from .base import set_current_tenant, clear_current_tenant


class TenantMiddleware:
    """
    For DRF with JWT, request.user is populated by the JWT authentication
    which happens *inside* DRF, not before this middleware. So we need two
    mechanisms:

      1. For session-based auth (Django admin) → use request.user here.
      2. For JWT (DRF API), we rely on the DRF authentication class to set
         the tenant. That's done in `apps/accounts/authentication.py`.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            # 1. Session auth (Django admin)
            user = getattr(request, 'user', None)
            if user is not None and user.is_authenticated:
                tenant = getattr(user, 'tenant', None)
                if tenant is not None:
                    set_current_tenant(tenant)

            response = self.get_response(request)
            return response
        finally:
            clear_current_tenant()