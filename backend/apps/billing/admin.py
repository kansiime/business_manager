from django.contrib import admin

from .models import Payment, Plan, Subscription


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'monthly_price', 'yearly_price', 'currency', 'max_users', 'is_active']
    list_editable = ['is_active']


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ['tenant', 'plan', 'billing_cycle', 'current_period_end', 'is_active']
    list_filter = ['plan', 'billing_cycle', 'is_active']


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'tenant', 'plan', 'amount', 'currency', 'provider', 'status']
    list_filter = ['status', 'provider', 'plan']
    search_fields = ['tx_ref', 'provider_tx_id', 'tenant__name']
    readonly_fields = ['tx_ref', 'created_at', 'paid_at', 'period_end']
