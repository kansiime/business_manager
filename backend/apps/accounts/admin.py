from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, GarageSettings, AuditLog, Membership


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Extra', {'fields': ('role', 'phone', 'tenant')}),
    )
    list_display = ['username', 'email', 'role', 'tenant', 'is_staff']
    list_filter = ['role', 'is_staff', 'tenant']


@admin.register(GarageSettings)
class GarageSettingsAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant', 'currency_symbol', 'phone']


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'user', 'action', 'model_name', 'tenant']
    list_filter = ['action', 'tenant']

@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ['user', 'tenant', 'role', 'is_owner', 'is_active', 'created_at']
    list_filter = ['role', 'is_owner', 'is_active']
    search_fields = ['user__username', 'user__email', 'tenant__name']
