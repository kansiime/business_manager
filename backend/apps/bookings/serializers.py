from rest_framework import serializers

from .models import Booking


class BookingSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source='service.name', read_only=True)
    staff_name = serializers.SerializerMethodField()
    sale_reference = serializers.CharField(source='sale.reference', read_only=True)

    class Meta:
        model = Booking
        fields = [
            'id', 'customer_name', 'customer_phone', 'service', 'service_name',
            'staff', 'staff_name', 'date', 'time', 'duration_minutes', 'price',
            'status', 'notes', 'sale', 'sale_reference', 'created_at',
        ]
        read_only_fields = ['sale', 'created_at']

    def get_staff_name(self, obj):
        if not obj.staff:
            return ''
        return obj.staff.get_full_name() or obj.staff.username

    def validate_service(self, product):
        if product and product.tenant_id != getattr(self.context['request'].user, 'tenant_id', None):
            raise serializers.ValidationError('Unknown service.')
        return product

    def validate_staff(self, user):
        from apps.accounts.models import Membership
        request = self.context['request']
        if user and not Membership.objects.filter(
            user=user, tenant_id=request.user.tenant_id, is_active=True,
        ).exists():
            raise serializers.ValidationError('That person is not on your team.')
        return user

    def validate(self, attrs):
        # Default the price to the service's normal price.
        service = attrs.get('service') or getattr(self.instance, 'service', None)
        if service and not attrs.get('price') and not getattr(self.instance, 'price', None):
            attrs['price'] = service.selling_price
        return attrs
