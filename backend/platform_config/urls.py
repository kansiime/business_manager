from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, include


def health(request):
    # Render health check: no DB or auth, so it stays fast and never wakes Neon.
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('api/health/', health),
    path('admin/', admin.site.urls),
    path('api/tenants/', include('apps.tenants.urls')),
    path('api/auth/', include('apps.accounts.urls')),
    path('api/inventory/', include('apps.inventory.urls')),
    path('api/sales/', include('apps.sales.urls')),
    path('api/purchases/', include('apps.purchases.urls')),
    path('api/debts/', include('apps.debts.urls')),
    path('api/expenses/', include('apps.expenses.urls')),
    path('api/returns/', include('apps.returns.urls')),
    path('api/reports/', include('apps.reports.urls')),
    path('api/clinic/', include('apps.clinic.urls')),
    path('api/billing/', include('apps.billing.urls')),
]