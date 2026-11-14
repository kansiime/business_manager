from rest_framework import serializers
from django.db import transaction
from decimal import Decimal

from .models import Sale, SaleItem
from apps.inventory.models import StockMovement
from apps.inventory.stock import InsufficientStock, add_stock, remove_stock


# Roles that may give any discount and (after confirming) sell below cost.
PRICE_OVERRIDE_ROLES = ('admin', 'manager', 'super')


def _take_stock(product, quantity):
    try:
        remove_stock(product, quantity)
    except InsufficientStock as e:
        raise serializers.ValidationError({'items': [str(e)]})


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    profit = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    discount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = SaleItem
        fields = ['id', 'product', 'product_name', 'quantity', 'unit_price',
                  'list_price', 'cost_price', 'subtotal', 'profit', 'discount']
        read_only_fields = ['cost_price', 'list_price']


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_discount = serializers.SerializerMethodField()
    # An admin / manager confirming they mean to sell below cost.
    allow_below_cost = serializers.BooleanField(write_only=True, required=False, default=False)

    # Live debt info (joined via reference)
    debt_balance = serializers.SerializerMethodField()
    debt_status = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            'id', 'reference', 'customer_name', 'customer_phone',
            'payment_type', 'total_amount', 'amount_paid', 'balance',
            'debt_balance', 'debt_status', 'total_discount', 'allow_below_cost',
            'notes', 'items', 'created_at',
        ]
        read_only_fields = ['user', 'created_at']

    def get_total_discount(self, obj):
        return float(sum((it.discount for it in obj.items.all()), Decimal('0')))

    def validate(self, attrs):
        """
        Price rules for bargained prices:
        - staff other than admins / managers may knock at most the business's
          `max_discount_percent` off an item's normal price;
        - nobody but an admin / manager may sell below cost, and they must
          confirm it (`allow_below_cost`).
        """
        from apps.accounts.models import GarageSettings

        items = attrs.get('items')
        if not items:
            return attrs
        request = self.context.get('request')
        role = getattr(getattr(request, 'user', None), 'role', None)
        can_override = role in PRICE_OVERRIDE_ROLES
        limit = GarageSettings.load().max_discount_percent or Decimal('0')
        allow_below_cost = attrs.get('allow_below_cost', False)

        problems, below_cost = [], []
        for item in items:
            product = item['product']
            price = Decimal(item['unit_price'])
            normal = product.selling_price or Decimal('0')
            cost = product.cost_price or Decimal('0')

            if cost > 0 and price < cost:
                msg = (f'{product.name}: {price:,.0f} is below its cost of {cost:,.0f}.')
                if can_override:
                    below_cost.append(msg)
                else:
                    problems.append(f'{msg} Only a manager or admin can sell below cost.')
                continue

            if not can_override and normal > 0 and price < normal:
                pct = (normal - price) / normal * 100
                if pct > limit + Decimal('0.005'):
                    problems.append(
                        f'{product.name}: {pct:.0f}% off is more than your {limit:.0f}% '
                        f'discount limit (lowest price {normal * (1 - limit / 100):,.0f}). '
                        'Ask a manager or admin.'
                    )

        if problems:
            raise serializers.ValidationError({'items': problems})
        if below_cost and not allow_below_cost:
            # The app asks the manager to confirm, then resends with the flag.
            raise serializers.ValidationError({'below_cost': below_cost})
        return attrs

    def _debt(self, obj):
        """
        The receivable created for this sale, if any. When listing many
        sales, all their debts are fetched in one query, not two per sale.
        """
        from apps.debts.models import Debt

        cache = self.context.get('_receivables')
        if cache is None:
            parent = getattr(self, 'parent', None)
            sales = list(parent.instance) if parent is not None and parent.instance is not None else [obj]
            cache = {}
            for d in Debt.all_objects.filter(
                tenant_id=obj.tenant_id, debt_type='receivable',
                reference__in={s.reference for s in sales},
            ).order_by('id'):
                cache.setdefault(d.reference, d)
            self.context['_receivables'] = cache
        return cache.get(obj.reference)

    def get_debt_balance(self, obj):
        debt = self._debt(obj)
        return float(debt.balance) if debt else 0

    def get_debt_status(self, obj):
        debt = self._debt(obj)
        return debt.status if debt else 'settled'

    def create(self, validated_data):
        validated_data.pop('allow_below_cost', None)
        items_data = validated_data.pop('items')
        total = sum(
            (Decimal(i['quantity']) * Decimal(i['unit_price']) for i in items_data),
            Decimal('0'),
        )
        with transaction.atomic():
            sale = Sale.objects.create(total_amount=total, **validated_data)
            for item in items_data:
                product = item['product']
                SaleItem.objects.create(
                    sale=sale,
                    cost_price=product.cost_price,
                    list_price=product.selling_price,
                    **item,
                )
                _take_stock(product, item['quantity'])
                if product.is_service:
                    continue
                StockMovement.objects.create(
                    product=product, movement_type='out',
                    quantity=item['quantity'], reference=sale.reference,
                    user=sale.user,
                )
        return sale

    def update(self, instance, validated_data):
        validated_data.pop('allow_below_cost', None)
        items_data = validated_data.pop('items', None)

        with transaction.atomic():
            for k, v in validated_data.items():
                setattr(instance, k, v)

            if items_data is not None:
                # Put the old items back into stock before taking the new ones
                for old_item in instance.items.select_related('product'):
                    add_stock(old_item.product, old_item.quantity)
                instance.items.all().delete()

                total = Decimal('0')
                for item in items_data:
                    product = item['product']
                    SaleItem.objects.create(
                        sale=instance,
                        cost_price=product.cost_price,
                        list_price=product.selling_price,
                        **item,
                    )
                    _take_stock(product, item['quantity'])
                    total += Decimal(item['quantity']) * Decimal(item['unit_price'])
                instance.total_amount = total
            instance.save()
        return instance
