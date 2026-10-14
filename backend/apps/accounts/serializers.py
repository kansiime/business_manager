from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.db import transaction

from .models import User, GarageSettings, AuditLog, Membership
from apps.tenants.models import BusinessType


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    tenant_name = serializers.CharField(source='tenant.name', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'phone', 'tenant', 'tenant_name',
            'password', 'is_active',
        ]
        read_only_fields = ['id']

    def validate_role(self, value):
        request = self.context.get('request')
        actor_role = getattr(getattr(request, 'user', None), 'role', None)
        if value == 'super' and actor_role != 'super':
            raise serializers.ValidationError('You cannot assign this role.')
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        with transaction.atomic():
            user = User(**validated_data)
            if password:
                user.set_password(password)
            user.save()

            if user.tenant and user.role != 'super':
                Membership.objects.get_or_create(
                    user=user, tenant=user.tenant,
                    defaults={'role': user.role},
                )

            # Auto-create ClinicalStaff record if the role is clinical
            if user.is_clinical_role and user.tenant:
                from apps.clinic.models import ClinicalStaff
                ClinicalStaff.all_objects.get_or_create(
                    tenant=user.tenant,
                    user=user,
                    defaults={
                        'role': user.role,
                        'is_available': True,
                    },
                )
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        old_role = instance.role
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()

        # Keep the membership role for this business in step
        if instance.tenant and instance.role != 'super':
            membership, _ = Membership.objects.get_or_create(
                user=instance, tenant=instance.tenant,
                defaults={'role': instance.role},
            )
            if membership.role != instance.role:
                membership.role = instance.role
                membership.save(update_fields=['role'])

        # Sync the ClinicalStaff record if role changed
        if instance.is_clinical_role and instance.tenant:
            from apps.clinic.models import ClinicalStaff
            staff, created = ClinicalStaff.all_objects.get_or_create(
                tenant=instance.tenant,
                user=instance,
                defaults={'role': instance.role, 'is_available': True},
            )
            if not created and staff.role != instance.role:
                staff.role = instance.role
                staff.save()

        return instance


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()   # username or email
    password = serializers.CharField()


def membership_summary(membership, current_tenant_id=None):
    """One row in a person's business list / switcher."""
    t = membership.tenant
    bt = t.business_type
    ends = t.access_ends_at
    return {
        'id': str(t.id),
        'slug': t.slug,
        'name': t.name,
        'business_type': bt.slug if bt else None,
        'business_type_name': bt.name if bt else 'Business',
        'business_type_icon': bt.icon if bt else '🏪',
        'role': membership.role,
        'is_owner': membership.is_owner,
        'plan': t.plan,
        'status': t.status,
        'access_ends_at': ends.isoformat() if ends else None,
        'is_expired': t.is_expired,
        'is_locked': t.is_locked,
        'is_current': str(t.id) == str(current_tenant_id),
    }


class _BusinessFields(serializers.Serializer):
    business_name = serializers.CharField(max_length=200)
    business_type_slug = serializers.CharField(max_length=50)

    def validate_business_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Business name is required.')
        return value

    def validate_business_type_slug(self, value):
        bt = BusinessType.objects.filter(slug=value, is_active=True).first()
        if bt is None:
            raise serializers.ValidationError('Choose a valid business type.')
        return bt


class SignupSerializer(_BusinessFields):
    """Public sign-up: a new person and their first business (on trial)."""
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default='')
    username = serializers.RegexField(
        r'^[\w.@+-]{3,150}$',
        error_messages={'invalid': 'Use 3+ letters, numbers or . @ + - _ only.'},
    )
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('This username is taken.')
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                'An account with this email already exists. Sign in instead.'
            )
        return value

    def validate(self, attrs):
        validate_password(attrs['password'], User(username=attrs['username'], email=attrs['email']))
        return attrs

    def create(self, validated_data):
        from apps.tenants.services import provision_business

        first, _, last = validated_data['full_name'].strip().partition(' ')
        with transaction.atomic():
            user = User.objects.create_user(
                username=validated_data['username'],
                email=validated_data['email'],
                password=validated_data['password'],
                first_name=first[:150],
                last_name=last[:150],
                phone=validated_data['phone'],
                role='admin',
            )
            tenant = provision_business(
                owner=user,
                name=validated_data['business_name'],
                business_type=validated_data['business_type_slug'],
                owner_name=validated_data['full_name'].strip(),
                owner_email=validated_data['email'],
                owner_phone=validated_data['phone'],
            )
        return user, tenant


class CreateBusinessSerializer(_BusinessFields):
    """A signed-in person adds another business of their own (on trial)."""

    def create(self, validated_data):
        from apps.tenants.services import provision_business

        user = self.context['request'].user
        return provision_business(
            owner=user,
            name=validated_data['business_name'],
            business_type=validated_data['business_type_slug'],
            owner_name=user.get_full_name() or user.username,
            owner_email=user.email,
            owner_phone=user.phone,
        )


class GarageSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = GarageSettings
        exclude = ['tenant']


class AuditLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    role = serializers.CharField(source='user.role', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'username', 'role', 'action', 'model_name',
            'object_id', 'description', 'created_at',
        ]