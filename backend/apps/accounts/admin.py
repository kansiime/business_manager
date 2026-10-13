from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, GarageSettings, AuditLog


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