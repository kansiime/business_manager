"""
Custom JWT authentication for multi-tenant.

After the token is validated, we:
  1. Grab the user from the token
  2. Read the business (`tenant_id` claim) the token was issued for and look
     up the user's membership in it
  3. Put that business and the user's role there on `request.user`
  4. Set the tenant in the thread-local for the request lifecycle
  5. Enforce the business's access state:
       - blocked / suspended  → every request is refused
       - trial or plan expired → read-only; writes are refused except the
         endpoints needed to pay or switch business

This ensures TenantManager returns correctly filtered querysets in every
DRF view.
"""
from rest_framework import exceptions
from rest_framework.permissions import SAFE_METHODS
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.settings import api_settings

from apps.tenants.base import set_current_tenant, clear_current_tenant


# Writes that stay open when a business's trial / plan has expired, so the
# owner can still pay, switch to another business, or create a new one.
EXPIRED_WRITE_ALLOWLIST = (
    '/api/billing/',
    '/api/auth/switch-business/',
    '/api/auth/businesses/',
    '/api/auth/refresh/',
)

# Reads that stay open even for blocked businesses, so the UI can explain why.
LOCKED_READ_ALLOWLIST = (
    '/api/tenants/context/',
    '/api/auth/my-pages/',
    '/api/auth/businesses/',
    '/api/auth/users/me/',
    '/api/billing/',
)


def access_denied(code, message):
    """403 whose body carries a machine-readable `code` for the frontend."""
    return exceptions.PermissionDenied({'detail': message, 'code': code})


def resolve_membership(user, tenant_id=None):
    """
    The user's active membership for `tenant_id`, falling back to their
    last-used business and then to any active membership.
    """
    from .models import Membership

    qs = (
        Membership.objects
        .filter(user=user, is_active=True)
        .select_related('tenant', 'tenant__business_type')
    )
    for candidate in (tenant_id, user.tenant_id):
        if candidate:
            m = qs.filter(tenant_id=candidate).first()
            if m:
                return m
    if tenant_id:
        # Token names a business the user no longer belongs to
        return None
    return qs.first()


class TenantJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        """
        Load the user and their membership for the token's business in one
        query (the database is a network hop away, so round trips matter).
        Falls back to the standard lookup for super admins / old tokens.
        """
        from .models import Membership

        tenant_id = validated_token.get('tenant_id')
        user_id = validated_token.get(api_settings.USER_ID_CLAIM)
        if tenant_id and user_id is not None and not getattr(api_settings, 'CHECK_REVOKE_TOKEN', False):
            membership = (
                Membership.objects
                .select_related('user', 'tenant', 'tenant__business_type')
                .filter(user_id=user_id, tenant_id=tenant_id, is_active=True)
                .first()
            )
            if membership is not None:
                user = membership.user
                if not user.is_active:
                    raise AuthenticationFailed('User is inactive', code='user_inactive')
                user._token_membership = membership
                return user
        return super().get_user(validated_token)

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, token = result

        # Super admin: no tenant in scope, sees everything
        if getattr(user, 'role', None) == 'super':
            clear_current_tenant()
            return user, token

        membership = getattr(user, '_token_membership', None)
        if membership is None:
            membership = resolve_membership(user, token.get('tenant_id'))
        if membership is None:
            raise AuthenticationFailed('You no longer have access to this business.')

        tenant = membership.tenant
        # Per-request view of the user inside this business. Not saved.
        user.tenant = tenant
        user.role = membership.role
        set_current_tenant(tenant)

        self._enforce_access(request, tenant)
        return user, token

    @staticmethod
    def _enforce_access(request, tenant):
        path = request.path
        if tenant.is_locked:
            if request.method in SAFE_METHODS and path.startswith(LOCKED_READ_ALLOWLIST):
                return
            raise access_denied(
                'business_locked',
                tenant.blocked_reason or 'This business account has been suspended. Contact support.',
            )

        if tenant.is_expired and request.method not in SAFE_METHODS:
            if not path.startswith(EXPIRED_WRITE_ALLOWLIST):
                raise access_denied(
                    'subscription_expired',
                    'Your trial or plan has expired. Choose a plan to keep adding records.',
                )
