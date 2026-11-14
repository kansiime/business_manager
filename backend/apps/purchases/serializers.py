from rest_framework import serializers
from django.db import transaction
from decimal import Decimal

from .models import Purchase, PurchaseItem
from apps.inventory.models import StockMovement
from apps.inventory.stock import add_stock


class PurchaseItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    subtotal = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True,
    )

    class Meta:
        model = PurchaseItem
        fields = [
            'id', 'product', 'product_name', 'quantity', 'unit_cost',
            'subtotal',
            # Pharmacy fields
            'batch_number', 'expiry_date', 'manufacturer', 'unit',
        ]


class PurchaseSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(many=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    balance = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True,
    )

    class Meta:
        model = Purchase
        fields = [
            'id', 'reference', 'supplier', 'supplier_name', 'status',
            'total_amount', 'amount_paid', 'balance', 'notes',
            'items', 'created_at',
        ]
        read_only_fields = ['user', 'created_at']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        total = sum(
            (Decimal(i['quantity']) * Decimal(i['unit_cost']) for i in items_data),
            Decimal('0'),
        )
        with transaction.atomic():
            purchase = Purchase.objects.create(total_amount=total, **validated_data)

            for item in items_data:
                PurchaseItem.objects.create(purchase=purchase, **item)

            # Auto stock-in if received
            if purchase.status == 'received':
                self._apply_to_inventory(purchase)

        return purchase

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)

        with transaction.atomic():
            # Lock the purchase so two requests can't both see it as
            # not-yet-received and add its stock twice.
            old_status = (
                Purchase.all_objects.select_for_update()
                .values_list('status', flat=True).get(pk=instance.pk)
            )

            for k, v in validated_data.items():
                setattr(instance, k, v)

            if items_data is not None:
                instance.items.all().delete()
                total = Decimal('0')
                for item in items_data:
                    PurchaseItem.objects.create(purchase=instance, **item)
                    total += Decimal(item['quantity']) * Decimal(item['unit_cost'])
                instance.total_amount = total

            instance.save()

            # If status just flipped to 'received', apply to inventory
            if old_status != 'received' and instance.status == 'received':
                self._apply_to_inventory(instance)

        return instance

    def _apply_to_inventory(self, purchase):
        """Add stock, record stock movements, and update product tracking fields."""
        for item in purchase.items.all():
            product = item.product

            # Copy pharmacy/grocery tracking fields into the product.
            # Save only those fields: `quantity` is changed by add_stock().
            tracked = []
            for field in ('batch_number', 'expiry_date', 'manufacturer', 'unit'):
                value = getattr(item, field)
                if value:
                    setattr(product, field, value)
                    tracked.append(field)
            if tracked:
                product.save(update_fields=tracked + ['updated_at'])

            add_stock(product, item.quantity)

            StockMovement.objects.create(
                product=product,
                movement_type='in',
                quantity=item.quantity,
                reference=purchase.reference,
                notes=(
                    f'Received via purchase {purchase.reference}'
                    + (f' — batch {item.batch_number}' if item.batch_number else '')
                ),
                user=purchase.user,
            )