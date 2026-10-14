"""
Subscription billing for business owners.

How a business pays after its trial (pay per renewal):

  MTN Mobile Money (Request to Pay)
    1. Owner picks a plan + monthly/yearly and enters their MTN number.
    2. POST /billing/momo/pay/ creates a pending Payment and asks MTN to send
       a PIN prompt to that phone.
    3. The page polls GET /billing/momo/status/<ref>/ while the owner
       approves. MTN may also call POST/PUT /billing/momo/callback/<ref>/.
       Both just trigger `sync_payment`, which asks MTN for the real status
       and only then extends the subscription.
    4. `manage.py sync_pending_payments` re-checks anything left pending and
       expires MoMo requests nobody approved.

  Flutterwave (cards, other mobile money, bank)
    POST /billing/checkout/ → hosted checkout → /subscription/callback →
    POST /billing/verify/; webhook POST /billing/webhook/. Same sync path.

  Manual
    Owners send money to the platform's Mobile Money number, then report it
    with POST /billing/manual/claim/ (number paid from + transaction ID).
    The platform admin sees it in GET /billing/manual/pending/ and confirms
    or rejects it (POST /billing/manual/<id>/confirm|reject/); confirming
    activates the plan exactly like an online payment. The admin can also
    record a payment directly (POST /billing/manual-payment/).
"""
import hmac
import logging
import uuid
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.tenants.models import PlatformSetting, Tenant
from apps.tenants.permissions import IsSuperAdmin

from . import mtn_momo, notifications
from .gateways import GATEWAYS, GatewayError, get_gateway, normalize_msisdn
from .models import Payment, Plan, Subscription
from .services import mark_payment_successful, price_for, sync_payment

logger = logging.getLogger(__name__)

# A new MoMo request isn't started while another is still waiting this long
MOMO_PENDING_WINDOW = timedelta(minutes=2)

# Unconfirmed "I've paid" reports a business can have open at once
MAX_PENDING_CLAIMS = 3


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
        'payer_phone': p.payer_phone,
        'reference': p.provider_tx_id,
        'reviewed_at': p.reviewed_at.isoformat() if p.reviewed_at else None,
        'created_at': p.created_at.isoformat(),
        'paid_at': p.paid_at.isoformat() if p.paid_at else None,
        'period_end': p.period_end.isoformat() if p.period_end else None,
    }


def _payable_tenant(request):
    """(tenant, error_response) for the admin of a business that may pay."""
    user = request.user
    tenant = getattr(user, 'tenant', None)
    if user.role != 'admin' or tenant is None:
        return None, Response({'detail': 'Only the business admin can pay for a plan.'}, status=403)
    if tenant.is_locked:
        return None, Response({'detail': 'This business is suspended. Contact support.'}, status=403)
    return tenant, None


def _plan_and_cycle(data):
    """(plan, cycle, error_response) from a request body."""
    cycle = data.get('billing_cycle', 'monthly')
    if cycle not in ('monthly', 'yearly'):
        return None, None, Response({'detail': 'Invalid billing cycle.'}, status=400)
    plan = Plan.objects.filter(code=data.get('plan'), is_active=True).first()
    if plan is None:
        return None, None, Response({'detail': 'Choose a valid plan.'}, status=400)
    if price_for(plan, cycle) <= 0:
        return None, None, Response({'detail': 'This plan has no price set yet.'}, status=400)
    return plan, cycle, None


def _new_payment(request, tenant, plan, cycle, gateway, **extra):
    return Payment.objects.create(
        tenant=tenant,
        plan=plan,
        billing_cycle=cycle,
        amount=price_for(plan, cycle),
        currency=gateway.charge_currency(plan),
        provider=gateway.code,
        # MTN requires a UUID4 reference; it works for every provider
        tx_ref=str(uuid.uuid4()),
        created_by=request.user,
        **extra,
    )


def _sync_response(payment):
    """Re-check a payment with its provider and describe the outcome."""
    try:
        payment, error = sync_payment(payment)
    except GatewayError as e:
        logger.warning('Payment %s status check failed: %s', payment.tx_ref, e)
        return Response(
            {'ok': False, 'detail': 'Could not confirm the payment yet. Try again in a minute.',
             'payment': payment_data(payment)},
            status=502,
        )
    if error:
        return Response({'ok': False, 'detail': error, 'payment': payment_data(payment)}, status=400)
    return Response({'ok': payment.status == 'successful', 'payment': payment_data(payment)})


# ---------------------------------------------------------------------------
# Catalogue + status
# ---------------------------------------------------------------------------
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

    methods = [
        {'code': g.code, 'label': g.label}
        for g in GATEWAYS.values() if g.is_configured()
    ]

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
        'payment_methods': methods,
        'online_payments': bool(methods),
        'momo_sandbox': mtn_momo.is_configured() and mtn_momo.is_sandbox(),
        'default_phone': request.user.phone or tenant.owner_phone,
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


# ---------------------------------------------------------------------------
# MTN Mobile Money — Request to Pay
# ---------------------------------------------------------------------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def momo_pay(request):
    """Body: { plan, billing_cycle, phone }"""
    tenant, error = _payable_tenant(request)
    if error:
        return error
    gateway = get_gateway('mtn_momo')
    if not gateway.is_configured():
        return Response({'detail': 'MTN Mobile Money is not available yet.'}, status=400)
    plan, cycle, error = _plan_and_cycle(request.data)
    if error:
        return error
    msisdn, phone_error = gateway.validate_phone(request.data.get('phone'))
    if phone_error:
        return Response({'detail': phone_error}, status=400)

    waiting = Payment.objects.filter(
        tenant=tenant, provider='mtn_momo', status='pending',
        created_at__gte=timezone.now() - MOMO_PENDING_WINDOW,
    ).select_related('plan').first()
    if waiting:
        return Response(
            {'detail': 'A payment request is already waiting for approval on your phone.',
             'payment': payment_data(waiting)},
            status=409,
        )

    payment = _new_payment(request, tenant, plan, cycle, gateway, payer_phone=msisdn)
    description = f'{plan.name} plan ({cycle}) - {tenant.name}'
    try:
        gateway.start_payment(payment, payer_phone=msisdn, description=description)
    except GatewayError as e:
        payment.status = 'failed'
        payment.note = str(e)
        payment.save(update_fields=['status', 'note'])
        logger.warning('MoMo request to pay failed for %s: %s', payment.tx_ref, e)
        return Response(
            {'detail': e.user_message or 'Could not send the payment request. Please try again.'},
            status=502,
        )

    return Response({'payment': payment_data(payment)}, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def momo_status(request, tx_ref):
    payment = (
        Payment.objects.select_related('plan')
        .filter(tx_ref=tx_ref, tenant=getattr(request.user, 'tenant', None))
        .first()
    )
    if payment is None:
        return Response({'detail': 'Payment not found.'}, status=404)
    return _sync_response(payment)


@api_view(['POST', 'PUT'])
@authentication_classes([])
@permission_classes([AllowAny])
def momo_callback(request, tx_ref=None):
    """
    MTN's notification that a Request to Pay finished. It isn't signed, so
    it's only a hint: we look the payment up and ask MTN for the real status.
    """
    ref = tx_ref or (request.data or {}).get('externalId')
    payment = Payment.objects.filter(tx_ref=ref, provider='mtn_momo').first() if ref else None
    if payment is not None:
        try:
            sync_payment(payment)
        except GatewayError as e:
            logger.warning('MoMo callback re-check failed for %s: %s', ref, e)
    return Response({'ok': True})


# ---------------------------------------------------------------------------
# Flutterwave — hosted checkout
# ---------------------------------------------------------------------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checkout(request):
    tenant, error = _payable_tenant(request)
    if error:
        return error
    gateway = get_gateway('flutterwave')
    if not gateway.is_configured():
        return Response(
            {'detail': 'Card payment is not available. Use another payment method.'},
            status=400,
        )
    plan, cycle, error = _plan_and_cycle(request.data)
    if error:
        return error

    payment = _new_payment(request, tenant, plan, cycle, gateway)
    user = request.user
    try:
        result = gateway.start_payment(
            payment,
            customer={
                'email': user.email or tenant.owner_email or f'{user.username}@example.invalid',
                'name': user.get_full_name() or tenant.owner_name or user.username,
                'phonenumber': user.phone or tenant.owner_phone,
            },
            description=f'{tenant.name}: {plan.name} ({cycle})',
            redirect_url=f"{settings.FRONTEND_URL.rstrip('/')}/subscription/callback",
        )
    except GatewayError as e:
        payment.status = 'failed'
        payment.note = str(e)
        payment.save(update_fields=['status', 'note'])
        logger.warning('Flutterwave checkout failed for %s: %s', payment.tx_ref, e)
        return Response({'detail': 'Could not start payment. Please try again.'}, status=502)

    return Response({**result, 'tx_ref': payment.tx_ref})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify(request):
    """Called by the frontend after Flutterwave redirects back."""
    tenant = getattr(request.user, 'tenant', None)
    payment = (
        Payment.objects.select_related('plan')
        .filter(tx_ref=request.data.get('tx_ref'), tenant=tenant)
        .first()
    )
    if payment is None:
        return Response({'detail': 'Payment not found.'}, status=404)

    if payment.status == 'pending' and request.data.get('status') == 'cancelled':
        payment.status = 'cancelled'
        payment.save(update_fields=['status'])
        return Response({'ok': False, 'detail': 'Payment was cancelled.', 'payment': payment_data(payment)})

    return _sync_response(payment)


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
    payment = Payment.objects.filter(tx_ref=tx_ref, provider='flutterwave').first() if tx_ref else None
    if payment is None:
        return Response({'ok': True})

    try:
        _, error = sync_payment(payment)
    except GatewayError as e:
        logger.warning('Webhook verify failed for %s: %s', payment.tx_ref, e)
        return Response(status=502)   # Flutterwave retries
    if error:
        logger.info('Webhook for %s not applied: %s', payment.tx_ref, error)
    return Response({'ok': True})


# ---------------------------------------------------------------------------
# Manual payments: owner reports, platform admin confirms
# ---------------------------------------------------------------------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def manual_claim(request):
    """
    "I've paid": the business admin reports a Mobile Money payment sent to
    the platform's number. Body: { plan, billing_cycle, phone, reference }
    """
    tenant, error = _payable_tenant(request)
    if error:
        return error
    plan, cycle, error = _plan_and_cycle(request.data)
    if error:
        return error

    reference = (request.data.get('reference') or '').strip()
    if len(reference) < 4:
        return Response({'detail': 'Enter the transaction ID from your payment SMS.'}, status=400)
    phone = normalize_msisdn(request.data.get('phone'))
    if len(phone) < 9:
        return Response({'detail': 'Enter the number you paid from.'}, status=400)

    if Payment.objects.filter(
        provider_tx_id__iexact=reference, status__in=['pending', 'successful'],
    ).exists():
        return Response(
            {'detail': 'This transaction ID has already been submitted.'}, status=400,
        )
    open_claims = Payment.objects.filter(tenant=tenant, provider='manual', status='pending').count()
    if open_claims >= MAX_PENDING_CLAIMS:
        return Response(
            {'detail': 'You already have payments waiting for confirmation. We will confirm them shortly.'},
            status=400,
        )

    payment = Payment.objects.create(
        tenant=tenant,
        plan=plan,
        billing_cycle=cycle,
        amount=price_for(plan, cycle),
        currency=plan.currency,
        provider='manual',
        tx_ref=f'MAN-{uuid.uuid4().hex[:20]}',
        provider_tx_id=reference,
        payer_phone=phone,
        created_by=request.user,
    )
    notifications.claim_submitted(payment)
    return Response({'payment': payment_data(payment)}, status=201)


def _claim_row(p):
    return {
        **payment_data(p),
        'tenant_id': str(p.tenant_id),
        'tenant_name': p.tenant.name,
        'tenant_status': 'expired' if p.tenant.is_expired else p.tenant.status,
        'submitted_by': (p.created_by.get_full_name() or p.created_by.username) if p.created_by else '',
    }


@api_view(['GET'])
@permission_classes([IsSuperAdmin])
def manual_claims_pending(request):
    """Reported payments waiting for the platform admin, oldest first."""
    qs = (
        Payment.objects.filter(provider='manual', status='pending')
        .select_related('plan', 'tenant', 'created_by')
        .order_by('created_at')
    )
    return Response([_claim_row(p) for p in qs])


@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def manual_claim_review(request, pk, decision):
    """
    confirm → activate the plan (same as any confirmed payment).
    reject  → body { reason }, shown to the owner.
    """
    from django.db import transaction

    payment = Payment.objects.filter(pk=pk, provider='manual').select_related('tenant', 'plan').first()
    if payment is None:
        return Response({'detail': 'Payment not found.'}, status=404)
    if payment.status != 'pending':
        return Response({'detail': f'This payment is already {payment.status}.'}, status=400)

    if decision == 'confirm':
        payment, _ = mark_payment_successful(payment.id)
        Payment.objects.filter(pk=payment.pk).update(reviewed_by=request.user, reviewed_at=timezone.now())
        payment.refresh_from_db()
        notifications.claim_confirmed(payment)
    elif decision == 'reject':
        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response({'detail': 'Give a reason — the business will see it.'}, status=400)
        with transaction.atomic():
            locked = Payment.objects.select_for_update().get(pk=payment.pk)
            if locked.status != 'pending':
                return Response({'detail': f'This payment is already {locked.status}.'}, status=400)
            locked.status = 'rejected'
            locked.note = reason
            locked.reviewed_by = request.user
            locked.reviewed_at = timezone.now()
            locked.save(update_fields=['status', 'note', 'reviewed_by', 'reviewed_at'])
        payment = locked
        notifications.claim_rejected(payment)
    else:
        return Response({'detail': 'Unknown action.'}, status=404)

    payment = Payment.objects.select_related('plan', 'tenant', 'created_by').get(pk=payment.pk)
    return Response(_claim_row(payment))


# ---------------------------------------------------------------------------
# Platform admin
# ---------------------------------------------------------------------------
@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def manual_payment(request):
    """
    Platform admin records a payment received outside the gateways
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
