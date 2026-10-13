from rest_framework import serializers
from .models import PlatformSetting
from .models import BusinessType, Tenant


class BusinessTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessType
        fields = [
            'id', 'slug', 'name', 'description', 'icon',
            'features', 'default_plan', 'order',
        ]


class TenantSerializer(serializers.ModelSerializer):
    business_type_name = serializers.CharField(
        source='business_type.name', read_only=True
    )
    business_type_slug = serializers.CharField(
        source='business_type.slug', read_only=True
    )
    business_type_icon = serializers.CharField(
        source='business_type.icon', read_only=True
    )
    enabled_features = serializers.ListField(read_only=True)

    # Aggregate counts
    user_count = serializers.SerializerMethodField()
    product_count = serializers.SerializerMethodField()
    sale_count = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            'id', 'slug', 'name',
            'business_type', 'business_type_name', 'business_type_slug',
            'business_type_icon',
            'owner_name', 'owner_email', 'owner_phone',
            'plan', 'status', 'trial_ends_at', 'subscription_ends_at',
            'max_users', 'max_branches', 'enabled_features',
            'feature_overrides',
            'user_count', 'product_count', 'sale_count',
            'created_at',
        ]
        read_only_fields = ['id', 'slug', 'created_at']

    def get_user_count(self, obj):
        return obj.users.count()

    def get_product_count(self, obj):
        from apps.inventory.models import Product
        return Product.all_objects.filter(tenant=obj).count()

    def get_sale_count(self, obj):
        from apps.sales.models import Sale
        return Sale.all_objects.filter(tenant=obj).count()


class TenantCreateSerializer(serializers.Serializer):
    """
    Used by the super-admin "Add Business" form.
    Creates a tenant + its admin user + default business settings
    in a single atomic step.
    """
    # Business
    business_name = serializers.CharField(max_length=200)
    business_type_slug = serializers.CharField(max_length=50)
    plan = serializers.ChoiceField(
        choices=['trial', 'starter', 'growth', 'power'],
        default='trial',
    )

    # Owner / contact
    owner_name = serializers.CharField(
        max_length=200, required=False, allow_blank=True, default=''
    )
    owner_email = serializers.EmailField(
        required=False, allow_blank=True, default=''
    )
    owner_phone = serializers.CharField(
        max_length=30, required=False, allow_blank=True, default=''
    )

    # Admin user credentials
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(min_length=6, write_only=True)

    def validate_username(self, value):
        from apps.accounts.models import User
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('Username already taken.')
        return value

    def validate_business_type_slug(self, value):
        if not BusinessType.objects.filter(slug=value).exists():
            raise serializers.ValidationError(
                f"Unknown business type '{value}'. "
                f"Available: {list(BusinessType.objects.values_list('slug', flat=True))}"
            )
        return value

    def create(self, validated_data):
        from django.db import transaction
        from django.utils import timezone
        from datetime import timedelta

        from apps.accounts.models import User, GarageSettings

        business_type = BusinessType.objects.get(
            slug=validated_data['business_type_slug']
        )
        plan = validated_data['plan']

        with transaction.atomic():
            # 1. Create the tenant
            now = timezone.now()
            if plan == 'trial':
                status_ = 'trial'
                trial_ends = now + timedelta(days=14)
                sub_ends = None
            else:
                status_ = 'active'
                trial_ends = None
                sub_ends = now + timedelta(days=30)   # first month

            tenant = Tenant.objects.create(
                name=validated_data['business_name'],
                business_type=business_type,
                owner_name=validated_data.get('owner_name', ''),
                owner_email=validated_data.get('owner_email', ''),
                owner_phone=validated_data.get('owner_phone', ''),
                plan=plan,
                status=status_,
                trial_ends_at=trial_ends,
                subscription_ends_at=sub_ends,
)
            # 2. Create the admin user scoped to the tenant
            User.objects.create_user(
                username=validated_data['username'],
                password=validated_data['password'],
                role='admin',
                phone=validated_data.get('owner_phone', ''),
                tenant=tenant,
                is_staff=True,
            )

            # 3. Create default business settings
            GarageSettings.all_objects.create(
                tenant=tenant,
                name=validated_data['business_name'],
                phone=validated_data.get('owner_phone', ''),
                email=validated_data.get('owner_email', ''),
                currency_code='UGX',
                currency_symbol='UGX',
            )

        return tenant


class PlatformSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformSetting
        fields = '__all__'
        read_only_fields = ['updated_at']