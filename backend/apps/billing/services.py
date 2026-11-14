"""
Subscription lifecycle: turning a confirmed payment into paid access.
"""
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import Payment, Subscription

CYCLE_DAYS = {'monthly': 30, 'yearly': 365}


def price_for(plan, cycle):
    return plan.yearly_price if cycle == 'yearly' else plan.monthly_price


def activate_subscription(tenant, plan, cycle):
    """
    Put `tenant` on `plan` for one billing cycle and return the new end date.

    Time already paid for is never lost: a renewal or an early payment during
    the trial is added on top of whatever access is left.
    """
    now = timezone.now()
    base = now
    current_end = tenant.access_ends_at
    if current_end and current_end > now:
        base = current_end
    period_end = base + timedelta(days=CYCLE_DAYS[cycle])

    tenant.plan = plan.code
    tenant.status = 'active'
    tenant.subscription_ends_at = period_end
    tenant.max_users = plan.max_users
    tenant.max_branches = plan.max_branches
    tenant.save(update_fields=[
        'plan', 'status', 'subscription_ends_at',
        'max_users', 'max_branches', 'updated_at',
    ])

    Subscription.objects.update_or_create(
        tenant=tenant,
        defaults={
            'plan': plan,
            'billing_cycle': cycle,
            'current_period_end': period_end,
            'cancelled_at': None,
            'is_active': True,
        },
    )
    return period_end


def mark_payment_successful(payment_id, *, provider_tx_id='', paid_amount=None,
                            paid_currency=None, notify_platform=True):
    """
    Idempotently confirm a payment and extend the subscription.

    Returns (payment, error). `error` is a message when the confirmation
    doesn't match what we charged, in which case nothing is activated.

    The first time a payment is confirmed, the business gets a receipt and,
    unless `notify_platform` is False (the platform admin confirmed or
    recorded it themselves), the platform admin is told.
    """
    payment, error, newly_paid, newly_failed = _confirm_payment(
        payment_id, provider_tx_id, paid_amount, paid_currency,
    )
    from apps.tenants import emails
    if newly_paid:
        emails.payment_received(payment, notify_platform=notify_platform)
    elif newly_failed:
        emails.payment_failed(payment)
    return payment, error


def _confirm_payment(payment_id, provider_tx_id, paid_amount, paid_currency):
    """Returns (payment, error, newly_paid, newly_failed)."""
    with transaction.atomic():
        payment = (
            Payment.objects
            .select_for_update()
            .select_related('tenant', 'plan')
            .get(pk=payment_id)
        )
        if payment.status == 'successful':
            return payment, None, False, False

        if paid_currency is not None and paid_currency != payment.currency:
            payment.status = 'failed'
            payment.note = f'Currency mismatch: paid {paid_currency}, expected {payment.currency}.'
            payment.save(update_fields=['status', 'note'])
            return payment, payment.note, False, True
        if paid_amount is not None and Decimal(str(paid_amount)) < payment.amount:
            payment.status = 'failed'
            payment.note = f'Underpaid: {paid_amount} received, {payment.amount} expected.'
            payment.save(update_fields=['status', 'note'])
            return payment, payment.note, False, True

        period_end = activate_subscription(payment.tenant, payment.plan, payment.billing_cycle)
        payment.status = 'successful'
        payment.paid_at = timezone.now()
        payment.period_end = period_end
        if provider_tx_id:
            payment.provider_tx_id = str(provider_tx_id)
        payment.save(update_fields=['status', 'paid_at', 'period_end', 'provider_tx_id'])
        return payment, None, True, False


def mark_payment_failed(payment_id, reason=''):
    """
    Mark a still-pending payment failed and tell the business. Never
    touches a paid one.
    """
    with transaction.atomic():
        payment = Payment.objects.select_for_update(of=('self',)).select_related(
            'tenant', 'plan', 'created_by').get(pk=payment_id)
        newly_failed = payment.status == 'pending'
        if newly_failed:
            payment.status = 'failed'
            payment.note = reason
            payment.save(update_fields=['status', 'note'])
    if newly_failed and payment.provider != 'manual':
        from apps.tenants import emails
        emails.payment_failed(payment)
    return payment


def sync_payment(payment):
    """
    Ask the payment's provider what happened and apply it. This is the only
    path that marks a provider payment paid; callbacks and webhooks just
    trigger it.

    Returns (payment, error). Raises gateways.GatewayError if the provider
    can't be reached (the payment stays pending and can be re-checked).
    """
    from .gateways import get_gateway

    if payment.status != 'pending':
        return payment, None
    gateway = get_gateway(payment.provider)
    if gateway is None:
        return payment, None

    result = gateway.check_status(payment)
    if result.status == 'successful':
        return mark_payment_successful(
            payment.id,
            provider_tx_id=result.provider_tx_id,
            paid_amount=result.amount,
            paid_currency=result.currency,
        )
    if result.status == 'failed':
        return mark_payment_failed(payment.id, result.reason), result.reason
    return payment, None
