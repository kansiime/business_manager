from django.urls import path
from . import views
from . import ai_views
from . import clinic_views


urlpatterns = [
    # Core reports
    path('dashboard/', views.dashboard_summary),
    path('overview/', views.reports_overview),
    path('sales/', views.sales_report),
    path('purchases/', views.purchases_report),
    path('stock/', views.stock_report),
    path('debts/', views.debts_report),
    path('profit/', views.profit_report),
    path('expenses/', views.expenses_report),
    path('returns/', views.returns_report),
    path('pharmacy/', views.pharmacy_reports),
    path('product-movement/', views.product_movement),

    # Customers
    path('customers/', views.customers_list),
    path('customers/<str:key>/', views.customer_detail),

    # AI Analytics
    path('ai/summary/', ai_views.ai_summary),
    path('ai/fast-moving/', ai_views.fast_moving),
    path('ai/stock-suggestions/', ai_views.stock_suggestions),
    path('ai/seasonality/', ai_views.seasonality),
    path('ai/forecast/', ai_views.forecast),
    path('ai/anomalies/', ai_views.anomalies),
    path('ai/bundles/', ai_views.bundles),
    path('ai/sales-per-staff/', ai_views.sales_per_staff),

        # Clinic-specific
    path('clinic/clinical/', clinic_views.clinical_report),
    path('clinic/lab/', clinic_views.lab_report),
    path('clinic/financial/', clinic_views.financial_report),
    path('clinic/patients/', clinic_views.patients_report),
    path('clinic/compliance/', clinic_views.compliance_report),
    path('clinic/waiting-times/', clinic_views.waiting_times_report),
]