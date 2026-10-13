from rest_framework import serializers
from django.db import transaction

from .models import User, GarageSettings, AuditLog
from apps.tenants.serializers import TenantSerializer


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

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        with transaction.atomic():
            user = User(**validated_data)
            if password:
                user.set_password(password)
            user.save()

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
    username = serializers.CharField()
    password = serializers.CharField()


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