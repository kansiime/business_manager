from rest_framework.permissions import BasePermission


class IsSuperAdmin(BasePermission):
    """Only the platform owner can access."""
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and getattr(request.user, 'role', None) == 'super'
        )


class IsTenantMember(BasePermission):
    """Only logged-in users with a tenant."""
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and getattr(request.user, 'tenant', None) is not None
        )


class IsTenantAdmin(BasePermission):
    """Only admins/managers of a tenant."""
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.user.role in ('admin', 'manager', 'super')


class HasFeature(BasePermission):
    """
    Usage:
        class MyView(APIView):
            feature_key = 'repairs'

    Blocks access if the tenant's business type doesn't enable this feature.
    """
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if getattr(request.user, 'role', None) == 'super':
            return True
        feature = getattr(view, 'feature_key', None)
        if not feature:
            return True
        tenant = getattr(request.user, 'tenant', None)
        if tenant is None:
            return False
        return tenant.has_feature(feature)