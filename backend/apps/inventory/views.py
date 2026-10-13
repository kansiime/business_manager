from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q

from .models import Category, Supplier, Product, StockMovement, StockReconciliation
from .serializers import (
    CategorySerializer, SupplierSerializer, ProductSerializer,
    StockMovementSerializer, StockReconciliationSerializer,
)
from apps.accounts.permissions import RoleBasedPermission
from apps.accounts.audit import log


class TenantScopedMixin:
    """
    Every inventory viewset uses this to guarantee tenant isolation.

    The `TenantManager` on the models filters by a thread-local tenant
    set by middleware. If middleware isn't running (e.g. management
    commands, tests, or a misconfigured MIDDLEWARE list), that thread-local
    is None and the manager silently returns ALL rows. This mixin bypasses
    that by filtering on the authenticated user's actual `tenant_id`.
    """
    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_authenticated and user.tenant_id:
            return qs.filter(tenant_id=user.tenant_id)
        return qs.none()

    def perform_create(self, serializer):
        # Auto-attach the tenant on create so new rows can't land in the
        # wrong tenant even if the middleware didn't set the thread-local.
        user = self.request.user
        if user.is_authenticated and user.tenant_id:
            serializer.save(tenant_id=user.tenant_id)
        else:
            serializer.save()


class CategoryViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper']


class SupplierViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper']


class ProductViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Product.objects.all().order_by('-id')
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = [
        'admin', 'manager', 'storekeeper', 'cashier',
        'pharmacist', 'doctor', 'nurse',
    ]

    def get_queryset(self):
        # Apply the tenant filter from the mixin first, then the search.
        qs = super().get_queryset()
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(name__icontains=search) |
                Q(sku__icontains=search) |
                Q(category__name__icontains=search) |
                Q(supplier__name__icontains=search)
            )
        return qs


class StockMovementViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = StockMovement.objects.all().order_by('-id')
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper']

    def perform_create(self, serializer):
        # Attach the tenant explicitly — this is a write path that builds
        # a secondary write (product.save()), so the tenant must be set
        # before the row is created.
        user = self.request.user
        tenant = getattr(user, 'tenant', None)

        movement = serializer.save(
            user=user,
            tenant=tenant,
        )
        product = movement.product

        if movement.movement_type == 'in':
            product.quantity += movement.quantity
        elif movement.movement_type == 'out':
            product.quantity -= movement.quantity
        else:
            product.quantity = movement.quantity
        product.save()

        log(
            self.request,
            f'stock_{movement.movement_type}',
            'Product',
            product.id,
            f'{movement.movement_type.upper()} {movement.quantity} of {product.name} '
            f'(now {product.quantity} in stock)',
        )


class StockReconciliationViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = StockReconciliation.objects.all().order_by('-id')
    serializer_class = StockReconciliationSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper']

    def perform_create(self, serializer):
        user = self.request.user
        tenant = getattr(user, 'tenant', None)

        product = serializer.validated_data['product']
        rec = serializer.save(
            user=user,
            tenant=tenant,
            system_quantity=product.quantity,
        )

        log(
            self.request,
            'reconcile',
            'Product',
            product.id,
            f'Reconciled {product.name}: system {rec.system_quantity} → '
            f'physical {rec.physical_quantity} (difference {rec.difference})',
        )