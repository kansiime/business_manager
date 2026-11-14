"""
Explicit tenant scoping for API viewsets.

`TenantManager` already filters by a thread-local tenant set during JWT
authentication. But if that thread-local is ever unset (a code path that
skips the auth class, a background job, a future async view), the manager
returns ALL rows across every business. Every viewset over business data
uses this mixin so isolation never rests on the thread-local alone.
"""


class TenantScopedMixin:
    def get_business_id(self):
        user = self.request.user
        if user.is_authenticated:
            return user.tenant_id
        return None

    def get_queryset(self):
        qs = super().get_queryset()
        tenant_id = self.get_business_id()
        if tenant_id:
            return qs.filter(tenant_id=tenant_id)
        # No business in scope (e.g. a super admin): show nothing rather
        # than every business's rows.
        return qs.none()

    def save_with_tenant(self, serializer, **kwargs):
        """`serializer.save()` with the row pinned to the user's business."""
        tenant_id = self.get_business_id()
        if tenant_id:
            kwargs['tenant_id'] = tenant_id
        return serializer.save(**kwargs)

    def perform_create(self, serializer):
        self.save_with_tenant(serializer)
