"""
Re-check payments still marked pending with their provider, and give up on
MTN Mobile Money requests nobody approved. Safety net for closed browser tabs
and missed callbacks; run it regularly (the daily cron runs it too).
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.billing.gateways import GatewayError
from apps.billing.models import Payment
from apps.billing.services import mark_payment_failed, sync_payment

# MTN expires unapproved requests well before this
MOMO_EXPIRE_AFTER = timedelta(minutes=30)


class Command(BaseCommand):
    help = 'Re-check pending provider payments and expire stale MoMo requests.'

    def handle(self, *args, **options):
        now = timezone.now()
        pending = Payment.objects.filter(
            status='pending', provider__in=['mtn_momo', 'flutterwave'],
            created_at__lte=now - timedelta(minutes=1),
        ).select_related('plan', 'tenant')

        counts = {'successful': 0, 'failed': 0, 'pending': 0, 'error': 0}
        for payment in pending:
            try:
                payment, _ = sync_payment(payment)
            except GatewayError as e:
                counts['error'] += 1
                self.stdout.write(self.style.WARNING(f'✗ {payment.tx_ref}: {e}'))
                continue
            if (
                payment.status == 'pending'
                and payment.provider == 'mtn_momo'
                and payment.created_at < now - MOMO_EXPIRE_AFTER
            ):
                payment = mark_payment_failed(payment.id, 'The request was not approved in time.')
            counts[payment.status if payment.status in counts else 'failed'] += 1

        self.stdout.write(
            'Pending payments checked — '
            + ', '.join(f'{k}: {v}' for k, v in counts.items())
        )
