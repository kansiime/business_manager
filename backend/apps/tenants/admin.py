from django.contrib import admin
from .models import BusinessType, Tenant


@admin.register(BusinessType)
class BusinessTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'icon', 'default_plan', 'is_active']
    prepopulated_fields = {'slug': ('name',)}
    list_editable = ['is_active']


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'business_type', 'plan', 'status', 'created_at']
    list_filter = ['business_type', 'plan', 'status']
    search_fields = ['name', 'slug', 'owner_email', 'owner_phone']
    readonly_fields = ['id', 'slug', 'created_at', 'updated_at']