"""
Subscription billing for business owners.

How a business pays after its trial:
  1. Owner opens Subscription, picks a plan + monthly/yearly.
  2. POST /billing/checkout/ creates a pending Payment and returns a
     Flutterwave hosted-checkout link (mobile money, card, bank).
  3. After paying, Flutterwave redirects to /subscription/callback, which
     calls POST /billing/verify/. We re-check the transaction with
     Flutterwave's API and extend the subscription.
  4. Flutterwave's webhook (POST /billing/webhook/) does the same in the
     background, so a closed browser tab doesn't lose a payment.

When Flutterwave isn't configured, owners see manual payment instructions
and the platform admin records the payment (POST /billing/manual-payment/).
"""
import hmac
import logging
import uuid

from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.tenants.models import PlatformSetting, Tenant
from apps.tenants.permissions import IsSuperAdmin

from . import flutterwave
from .models import Payment, Plan, Subscription
from .services import mark_payment_successful, price_for

logger = logging.getLogger(__name__)


def plan_data(p):
    return {
        'id': p.id,
        'code': p.code,
        'name': p.name,
        'monthly_price': float(p.monthly_price),
        'yearly_price': float(p.yearly_price),
        'currency': p.currency,
        'max_users': p.max_users,
        'max_branches': p.max_branches,
        'features': p.features,
    }


def payment_data(p):
    return {
        'id': p.id,
        'plan': p.plan.name,
        'plan_code': p.plan.code,
        'billing_cycle': p.billing_cycle,
        'amount': float(p.amount),
        'currency': p.currency,
        'provider': p.provider,
        'tx_ref': p.tx_ref,
        'status': p.status,
        'note': p.note,
        'created_at': p.created_at.isoformat(),
        'paid_at': p.paid_at.isoformat() if p.paid_at else None,
        'period_end': p.period_end.isoformat() if p.period_end else None,
    }


def _business_admin(request):
    """The current business if the user is its admin, else None."""
    user = request.user
    if user.role not in ('admin',):
        return None
    return getattr(user, 'tenant', None)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def public_plans(request):
    """Plan catalogue for the pricing / sign-up pages."""
    platform = PlatformSetting.load()
    return Response({
        'trial_days': platform.default_trial_days,
        'plans': [plan_data(p) for p in Plan.objects.filter(is_active=True).order_by('order')],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def subscription_status(request):
    """Everything the Subscription page needs for the current business."""
    tenant = getattr(request.user, 'tenant', None)
    if tenant is None:
        return Response({'detail': 'No business selected.'}, status=400)

    platform = PlatformSetting.load()
    sub = Subscription.objects.filter(tenant=tenant).select_related('plan').first()
    ends = tenant.access_ends_at
    days_left = None
    if ends:
        days_left = (timezone.localtime(ends).date() - timezone.localtime().date()).days

    return Response({
        'business': {'id': str(tenant.id), 'name': tenant.name},
        'plan': tenant.plan,
        'status': tenant.status,
        'is_trial': tenant.plan == 'trial',
        'is_expired': tenant.is_expired,
        'is_locked': tenant.is_locked,
        'access_ends_at': ends.isoformat() if ends else None,
        'days_remaining': days_left,
        'max_users': tenant.max_users,
        'billing_cycle': sub.billing_cycle if sub else None,
        'can_pay': request.user.role == 'admin',
        'online_payments': flutterwave.is_configured(),
        'manual_payment': {
            'instructions': settings.MANUAL_PAYMENT_INSTRUCTIONS,
            'support_phone': platform.support_phone,
            'support_email': platform.support_email,
        },
        'plans': [plan_data(p) for p in Plan.objects.filter(is_active=True).order_by('order')],
        'payments': [
            payment_data(p)
            for p in Payment.objects.filter(tenant=tenant).select_related('plan')[:20]
        ],
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkout(request):
    tenant = _business_admin(request)
    if tenant is None:
        return Response({'detail': 'Only the business admin can pay for a plan.'}, status=403)
    if tenant.is_locked:
        return Response({'detail': 'This business is suspended. Contact support.'}, status=403)
    if not flutterwave.is_configured():
        return Response(
            {'detail': 'Online payment is not available. Use the manual payment instructions.'},
            status=400,
        )

    cycle = request.data.get('billing_cycle', 'monthly')
    if cycle not in ('monthly', 'yearly'):
        return Response({'detail': 'Invalid billing cycle.'}, status=400)
    plan = Plan.objects.filter(code=request.data.get('plan'), is_active=True).first()
    if plan is None:
        return Response({'detail': 'Choose a valid plan.'}, status=400)
    amount = price_for(plan, cycle)
    if amount <= 0:
        return Response({'detail': 'This plan has no price set yet.'}, status=400)

    payment = Payment.objects.create(
        tenant=tenant,
        plan=plan,
        billing_cycle=cycle,
        amount=amount,
        currency=plan.currency,
        provider='flutterwave',
        tx_ref=f'BM-{uuid.uuid4().hex[:20]}',
        created_by=request.user,
    )

    user = request.user
    try:
        link = flutterwave.create_checkout(
            tx_ref=payment.tx_ref,
            amount=payment.amount,
            currency=payment.currency,
            redirect_url=f"{settings.FRONTEND_URL.rstrip('/')}/subscription/callback",
            customer={
                'email': user.email or tenant.owner_email or f'{user.username}@example.invalid',
                'name': user.get_full_name() or tenant.owner_name or user.username,
                'phonenumber': user.phone or tenant.owner_phone,
            },
            title='Business Manager',
            description=f'{tenant.name}: {plan.name} ({cycle})',
        )
    except flutterwave.FlutterwaveError as e:
        payment.status = 'failed'
        payment.note = str(e)
        payment.save(update_fields=['status', 'note'])
        logger.warning('Flutterwave checkout failed for %s: %s', payment.tx_ref, e)
        return Response({'detail': 'Could not start payment. Please try again.'}, status=502)

    return Response({'payment_link': link, 'tx_ref': payment.tx_ref})


def _confirm_with_flutterwave(payment, data):
    """Apply a verified Flutterwave transaction to our Payment."""
    if data.get('tx_ref') != payment.tx_ref:
        return payment, 'Transaction does not match this payment.'
    if data.get('status') != 'successful':
        if payment.status == 'pending' and data.get('status') == 'failed':
            payment.status = 'failed'
            payment.save(update_fields=['status'])
        return payment, 'Payment was not completed.'
    return mark_payment_successful(
        payment.id,
        provider_tx_id=data.get('id', ''),
        paid_amount=data.get('amount'),
        paid_currency=data.get('currency'),
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify(request):
    """Called by the frontend after Flutterwave redirects back."""
    tenant = getattr(request.user, 'tenant', None)
    tx_ref = request.data.get('tx_ref')
    transaction_id = request.data.get('transaction_id')

    payment = Payment.objects.filter(tx_ref=tx_ref, tenant=tenant).first()
    if payment is None:
        return Response({'detail': 'Payment not found.'}, status=404)
    if payment.status == 'successful':
        return Response({'ok': True, 'payment': payment_data(payment)})

    if request.data.get('status') == 'cancelled':
        payment.status = 'cancelled'
        payment.save(update_fields=['status'])
        return Response({'ok': False, 'detail': 'Payment was cancelled.', 'payment': payment_data(payment)})

    try:
        if transaction_id:
            data = flutterwave.verify_transaction(transaction_id)
        else:
            data = flutterwave.verify_by_reference(payment.tx_ref)
    except (flutterwave.FlutterwaveError, ValueError) as e:
        logger.warning('Flutterwave verify failed for %s: %s', payment.tx_ref, e)
        return Response({'detail': 'Could not confirm the payment yet. Refresh in a minute.'}, status=502)

    payment, error = _confirm_with_flutterwave(payment, data)
    if error:
        return Response({'ok': False, 'detail': error, 'payment': payment_data(payment)}, status=400)
    return Response({'ok': True, 'payment': payment_data(payment)})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def webhook(request):
    """
    Flutterwave webhook. Authenticated by the secret hash configured in the
    Flutterwave dashboard (sent as the `verif-hash` header). The payload is
    only a hint: we always re-verify the transaction with Flutterwave's API.
    """
    expected = settings.FLUTTERWAVE_WEBHOOK_HASH
    received = request.headers.get('verif-hash', '')
    if not expected or not hmac.compare_digest(received, expected):
        return Response(status=401)

    data = request.data.get('data') or {}
    tx_ref = data.get('tx_ref') or data.get('txRef')
    payment = Payment.objects.filter(tx_ref=tx_ref).first() if tx_ref else None
    if payment is None or payment.status == 'successful':
        return Response({'ok': True})

    try:
        verified = flutterwave.verify_by_reference(payment.tx_ref)
    except flutterwave.FlutterwaveError as e:
        logger.warning('Webhook verify failed for %s: %s', payment.tx_ref, e)
        return Response(status=502)   # Flutterwave retries

    _, error = _confirm_with_flutterwave(payment, verified)
    if error:
        logger.info('Webhook for %s not applied: %s', payment.tx_ref, error)
    return Response({'ok': True})


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def manual_payment(request):
    """
    Platform admin records a payment received outside Flutterwave
    (e.g. mobile money to the company number) and activates the plan.
    Body: { tenant_id, plan, billing_cycle, amount?, reference? }
    """
    tenant = Tenant.objects.filter(pk=request.data.get('tenant_id')).first()
    if tenant is None:
        return Response({'detail': 'Business not found.'}, status=404)
    plan = Plan.objects.filter(code=request.data.get('plan')).first()
    if plan is None:
        return Response({'detail': 'Choose a valid plan.'}, status=400)
    cycle = request.data.get('billing_cycle', 'monthly')
    if cycle not in ('monthly', 'yearly'):
        return Response({'detail': 'Invalid billing cycle.'}, status=400)

    amount = request.data.get('amount') or price_for(plan, cycle)
    reference = (request.data.get('reference') or '').strip()

    payment = Payment.objects.create(
        tenant=tenant,
        plan=plan,
        billing_cycle=cycle,
        amount=amount,
        currency=plan.currency,
        provider='manual',
        tx_ref=f'MAN-{uuid.uuid4().hex[:20]}',
        provider_tx_id=reference,
        note=reference,
        created_by=request.user,
    )
    payment, _ = mark_payment_successful(payment.id)
    return Response(payment_data(payment), status=201)


@api_view(['GET'])
@permission_classes([IsSuperAdmin])
def all_payments(request):
    """Recent payments across the platform (super admin)."""
    qs = Payment.objects.select_related('plan', 'tenant')
    tenant_id = request.query_params.get('tenant')
    if tenant_id:
        qs = qs.filter(tenant_id=tenant_id)
    return Response([
        {**payment_data(p), 'tenant_id': str(p.tenant_id), 'tenant_name': p.tenant.name}
        for p in qs[:200]
    ])
