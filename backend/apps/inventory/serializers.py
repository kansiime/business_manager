from rest_framework import serializers

from .models import Category, Supplier, Product, StockMovement, StockReconciliation


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'
        read_only_fields = ['tenant']


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'
        read_only_fields = ['tenant']


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    # Negative once expired; None when the product has no expiry date.
    days_to_expiry = serializers.IntegerField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = '__all__'
        read_only_fields = ['tenant']

    def create(self, validated_data):
        """Allow 'quantity' on create, and log an initial StockMovement."""
        quantity = validated_data.pop('quantity', 0)
        if validated_data.get('is_service'):
            quantity = 0
        product = Product.objects.create(quantity=quantity, **validated_data)

        # Log the opening stock as a movement so it appears in history
        if quantity:
            request = self.context.get('request')
            StockMovement.objects.create(
                tenant=product.tenant,
                product=product,
                movement_type='in',
                quantity=quantity,
                reference='Opening stock',
                notes='Set during product creation',
                user=request.user if request and request.user.is_authenticated else None,
            )
        return product

    def update(self, instance, validated_data):
        """Prevent changing quantity via product edit — must use StockMovement."""
        validated_data.pop('quantity', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        # Save only the edited fields: a full save() would also write back
        # the quantity loaded at the start of this request, undoing any
        # sale that happened in between.
        instance.save(update_fields=list(validated_data) + ['updated_at'])
        return instance


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = StockMovement
        fields = '__all__'
        read_only_fields = ['tenant', 'user', 'created_at']


class StockReconciliationSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = StockReconciliation
        fields = '__all__'
        read_only_fields = ['tenant', 'user', 'difference', 'created_at', 'system_quantity']