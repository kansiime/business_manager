from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    BusinessTypeViewSet,
    TenantViewSet,
    current_tenant,
    platform_stats,
    platform_settings,
    bulk_tenant_action,
    platform_plans,
    update_plan,
    tenant_context,       # ← new
    plans_list,
    announcement_status,
)

router = DefaultRouter()
router.register('business-types', BusinessTypeViewSet, basename='business-types')
router.register('', TenantViewSet, basename='tenants')

urlpatterns = [
    path('current/', current_tenant),
    path('context/', tenant_context),                   # ← new
    path('platform-stats/', platform_stats),
    path('platform-settings/', platform_settings),
    path('bulk-action/', bulk_tenant_action),
    path('platform-plans/', platform_plans),
    path('platform-plans/<int:plan_id>/', update_plan),
    path('plans/', plans_list),
    path('announcement-status/', announcement_status),
    path('', include(router.urls)),
]