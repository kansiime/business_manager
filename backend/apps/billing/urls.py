from django.urls import path

from .views import (
    public_plans,
    subscription_status,
    checkout,
    verify,
    webhook,
    manual_payment,
    all_payments,
)

urlpatterns = [
    path('plans/', public_plans),
    path('subscription/', subscription_status),
    path('checkout/', checkout),
    path('verify/', verify),
    path('webhook/', webhook),
    path('manual-payment/', manual_payment),
    path('payments/', all_payments),
]
