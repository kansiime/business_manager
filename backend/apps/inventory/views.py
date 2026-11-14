from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q

from .models import Category, Supplier, Product, StockMovement, StockReconciliation
from .serializers import (
    CategorySerializer, SupplierSerializer, ProductSerializer,
    StockMovementSerializer, StockReconciliationSerializer,
)
from apps.accounts.permissions import RoleBasedPermission
from apps.accounts.audit import log
from apps.tenants.mixins import TenantScopedMixin
from .stock import InsufficientStock, add_stock, remove_stock, set_stock, lock_product


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
    queryset = Product.objects.select_related('category', 'supplier').order_by('-id')
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
    queryset = StockMovement.objects.select_related('product', 'user').order_by('-id')
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper']

    def perform_create(self, serializer):
        # Attach the tenant explicitly — this is a write path that builds
        # a secondary write (product.save()), so the tenant must be set
        # before the row is created.
        user = self.request.user
        tenant = getattr(user, 'tenant', None)

        with transaction.atomic():
            movement = serializer.save(
                user=user,
                tenant=tenant,
            )
            product = movement.product

            if movement.movement_type == 'in':
                add_stock(product, movement.quantity)
            elif movement.movement_type == 'out':
                try:
                    remove_stock(product, movement.quantity)
                except InsufficientStock as e:
                    raise ValidationError({'quantity': [str(e)]})
            else:
                set_stock(product, movement.quantity)

        log(
            self.request,
            f'stock_{movement.movement_type}',
            'Product',
            product.id,
            f'{movement.movement_type.upper()} {movement.quantity} of {product.name} '
            f'(now {product.quantity} in stock)',
        )


class StockReconciliationViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = StockReconciliation.objects.select_related('product', 'user').order_by('-id')
    serializer_class = StockReconciliationSerializer
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = ['admin', 'manager', 'storekeeper']

    def perform_create(self, serializer):
        user = self.request.user
        tenant = getattr(user, 'tenant', None)

        product = serializer.validated_data['product']
        with transaction.atomic():
            # Lock the product so no sale lands between reading the system
            # count and replacing it with the physical count.
            rec = serializer.save(
                user=user,
                tenant=tenant,
                system_quantity=lock_product(product),
            )

        log(
            self.request,
            'reconcile',
            'Product',
            product.id,
            f'Reconciled {product.name}: system {rec.system_quantity} → '
            f'physical {rec.physical_quantity} (difference {rec.difference})',
        )