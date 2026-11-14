"""
Emails about manual (reported) Mobile Money payments. Sending never blocks
or fails the request: the in-app state (payment history, pending list) is
the source of truth.

A confirmed claim's receipt is sent by `services.mark_payment_successful`,
like every other payment (see apps/tenants/emails.py).
"""
from django.conf import settings
from django.utils import timezone

from apps.tenants import emails
from apps.tenants.models import PlatformSetting


def _money(payment):
    return f'{payment.currency} {payment.amount:,.0f}'


def claim_submitted(payment):
    """Tell the platform admin a business says it has paid."""
    emails.send(
        f'Payment to confirm: {payment.tenant.name} — {_money(payment)}',
        [
            f'{payment.tenant.name} says they paid for the {payment.plan.name} plan '
            f'({payment.billing_cycle}).',
            f'Amount:          {_money(payment)}\n'
            f'Paid from:       {payment.payer_phone or "—"}\n'
            f'Transaction ID:  {payment.provider_tx_id}\n'
            f'Submitted:       {timezone.localtime(payment.created_at):%d %b %Y %H:%M}',
            'Check your Mobile Money statement, then confirm or reject it.',
        ],
        emails.platform_admin_recipients(),
        button=('Review payment', f"{settings.FRONTEND_URL.rstrip('/')}/dashboard"),
    )


def claim_rejected(payment):
    platform = PlatformSetting.load()
    contact = ' or '.join(c for c in (platform.support_phone, platform.support_email) if c)
    emails.send(
        f'We could not confirm your payment — {payment.tenant.name}',
        [
            'Hello,',
            f'We could not confirm the payment you reported '
            f'(transaction {payment.provider_tx_id}, {_money(payment)}).',
            f'Reason: {payment.note or "not given"}',
            f'If you believe this is a mistake, contact us{f" on {contact}" if contact else ""}.',
        ],
        emails.business_recipients(payment.tenant) + [emails._payer(payment)],
        button=('Open subscription', f"{settings.FRONTEND_URL.rstrip('/')}/subscription"),
    )
