"""
Emails about manual payments. Sending never blocks or fails the request:
the in-app state (payment history, pending list) is the source of truth.
"""
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.tenants.models import PlatformSetting

logger = logging.getLogger(__name__)


def _send(subject, body, recipients):
    recipients = sorted({r for r in recipients if r})
    if not recipients:
        return
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, recipients, fail_silently=False)
    except Exception as e:  # SMTP not configured, network, ...
        logger.warning('Payment email "%s" not sent: %s', subject, e)


def _money(payment):
    return f'{payment.currency} {payment.amount:,.0f}'


def _owner_recipients(payment):
    creator = payment.created_by.email if payment.created_by else ''
    return [payment.tenant.owner_email, creator]


def claim_submitted(payment):
    """Tell the platform admin a business says it has paid."""
    platform = PlatformSetting.load()
    link = f"{settings.FRONTEND_URL.rstrip('/')}/dashboard"
    _send(
        f'Payment to confirm: {payment.tenant.name} — {_money(payment)}',
        (
            f'{payment.tenant.name} says they paid for the {payment.plan.name} plan '
            f'({payment.billing_cycle}).\n\n'
            f'Amount:          {_money(payment)}\n'
            f'Paid from:       {payment.payer_phone or "—"}\n'
            f'Transaction ID:  {payment.provider_tx_id}\n'
            f'Submitted:       {timezone.localtime(payment.created_at):%d %b %Y %H:%M}\n\n'
            f'Check your Mobile Money statement, then confirm or reject it here:\n{link}\n'
        ),
        [platform.support_email],
    )


def claim_confirmed(payment):
    _send(
        f'Payment confirmed — {payment.tenant.name} is on {payment.plan.name}',
        (
            f'Hello,\n\nWe have confirmed your payment of {_money(payment)} '
            f'(transaction {payment.provider_tx_id}).\n'
            f'{payment.tenant.name} is now on the {payment.plan.name} plan until '
            f'{timezone.localtime(payment.period_end):%d %b %Y}.\n\nThank you!\n'
        ),
        _owner_recipients(payment),
    )


def claim_rejected(payment):
    platform = PlatformSetting.load()
    contact = ' or '.join(c for c in (platform.support_phone, platform.support_email) if c)
    _send(
        f'We could not confirm your payment — {payment.tenant.name}',
        (
            f'Hello,\n\nWe could not confirm the payment you reported '
            f'(transaction {payment.provider_tx_id}, {_money(payment)}).\n\n'
            f'Reason: {payment.note or "not given"}\n\n'
            f'If you believe this is a mistake, contact us{f" on {contact}" if contact else ""}.\n'
        ),
        _owner_recipients(payment),
    )
