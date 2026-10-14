from django.urls import path

from .views import (
    public_plans,
    subscription_status,
    momo_pay,
    momo_status,
    momo_callback,
    checkout,
    verify,
    webhook,
    manual_payment,
    manual_claim,
    manual_claims_pending,
    manual_claim_review,
    all_payments,
)

urlpatterns = [
    path('plans/', public_plans),
    path('subscription/', subscription_status),
    # MTN Mobile Money
    path('momo/pay/', momo_pay),
    path('momo/status/<str:tx_ref>/', momo_status),
    path('momo/callback/', momo_callback),
    path('momo/callback/<str:tx_ref>/', momo_callback),
    # Flutterwave
    path('checkout/', checkout),
    path('verify/', verify),
    path('webhook/', webhook),
    # Manual: owner reports, platform admin confirms
    path('manual/claim/', manual_claim),
    path('manual/pending/', manual_claims_pending),
    path('manual/<int:pk>/<str:decision>/', manual_claim_review),
    # Platform admin
    path('manual-payment/', manual_payment),
    path('payments/', all_payments),
]
