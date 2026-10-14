"""
Payment gateways behind one interface.

Every way of paying (MTN MoMo Request to Pay, Flutterwave checkout, ...)
implements `start_payment` and `check_status`. The rest of billing — plans,
Payment records, activation, reminders, read-only on expiry — only talks to
this interface, so adding a provider or recurring billing doesn't touch it.

Stage 2 (pre-authorised recurring debits): add `create_mandate(subscription)`
and `charge_mandate(subscription, payment)` to the gateways that support them,
store the mandate id on Subscription, and let the renewal job call
`charge_mandate` before the period ends, falling back to `start_payment` +
reminders if the charge fails.
"""
import re
from dataclasses import dataclass
from decimal import Decimal

from django.conf import settings

from . import flutterwave, mtn_momo


class GatewayError(Exception):
    """The provider couldn't be reached or refused the request."""

    def __init__(self, message, user_message=None):
        super().__init__(message)
        # Safe to show the person paying; None = use a generic message
        self.user_message = user_message


@dataclass
class GatewayStatus:
    status: str                      # 'pending' | 'successful' | 'failed'
    provider_tx_id: str = ''
    amount: Decimal | None = None
    currency: str | None = None
    reason: str = ''


class PaymentGateway:
    code = ''
    label = ''

    def is_configured(self):
        raise NotImplementedError

    def charge_currency(self, plan):
        """Currency the provider will actually charge in."""
        return plan.currency

    def start_payment(self, payment, **kwargs):
        """Begin collecting `payment`. Returns data for the frontend."""
        raise NotImplementedError

    def check_status(self, payment):
        """Ask the provider what happened. Returns a GatewayStatus."""
        raise NotImplementedError


# ---------------------------------------------------------------------------
# MTN Mobile Money — Request to Pay
# ---------------------------------------------------------------------------
def normalize_msisdn(phone):
    """'0772 123 456' / '+256772123456' / '772123456' → '256772123456'."""
    digits = re.sub(r'\D', '', phone or '')
    if digits.startswith('0') and len(digits) == 10:
        digits = '256' + digits[1:]
    elif len(digits) == 9:
        digits = '256' + digits
    return digits


class MtnMomoGateway(PaymentGateway):
    code = 'mtn_momo'
    label = 'MTN Mobile Money'

    def is_configured(self):
        return mtn_momo.is_configured()

    def charge_currency(self, plan):
        return settings.MTN_MOMO_CURRENCY or plan.currency

    def validate_phone(self, phone):
        """Returns (msisdn, error_message)."""
        msisdn = normalize_msisdn(phone)
        if mtn_momo.is_sandbox():
            # Sandbox test numbers aren't Ugandan
            return (msisdn, None) if len(msisdn) >= 9 else (None, 'Enter a phone number.')
        prefixes = [p.strip() for p in settings.MTN_MOMO_MSISDN_PREFIXES.split(',') if p.strip()]
        if len(msisdn) != 12 or not any(msisdn.startswith(p) for p in prefixes):
            return None, 'Enter an MTN Uganda number, e.g. 0772 123 456.'
        return msisdn, None

    def start_payment(self, payment, *, payer_phone, description):
        callback = None
        if settings.MTN_MOMO_CALLBACK_URL:
            callback = f"{settings.MTN_MOMO_CALLBACK_URL.rstrip('/')}/{payment.tx_ref}/"
        try:
            mtn_momo.request_to_pay(
                reference_id=payment.tx_ref,
                amount=payment.amount,
                currency=payment.currency,
                msisdn=payer_phone,
                external_id=payment.tx_ref,
                payer_message=description,
                payee_note=description,
                callback_url=callback,
            )
        except mtn_momo.MomoAuthError as e:
            raise GatewayError(
                str(e),
                user_message='MTN Mobile Money is temporarily unavailable. '
                             'Please try again later or use another payment method.',
            ) from e
        except mtn_momo.MomoError as e:
            raise GatewayError(str(e), user_message=f'MTN could not send the request: {e}') from e
        return {}

    def check_status(self, payment):
        try:
            data = mtn_momo.get_status(payment.tx_ref)
        except mtn_momo.MomoError as e:
            raise GatewayError(str(e)) from e
        status = (data.get('status') or 'PENDING').upper()
        if status == 'SUCCESSFUL':
            return GatewayStatus(
                'successful',
                provider_tx_id=str(data.get('financialTransactionId') or ''),
                amount=data.get('amount'),
                currency=data.get('currency'),
            )
        if status in ('FAILED', 'REJECTED', 'TIMEOUT'):
            return GatewayStatus('failed', reason=mtn_momo.reason_message(data.get('reason')))
        return GatewayStatus('pending')


# ---------------------------------------------------------------------------
# Flutterwave — hosted checkout (cards, mobile money, bank)
# ---------------------------------------------------------------------------
class FlutterwaveGateway(PaymentGateway):
    code = 'flutterwave'
    label = 'Card / other mobile money'

    def is_configured(self):
        return flutterwave.is_configured()

    def start_payment(self, payment, *, customer, description, redirect_url):
        try:
            link = flutterwave.create_checkout(
                tx_ref=payment.tx_ref,
                amount=payment.amount,
                currency=payment.currency,
                redirect_url=redirect_url,
                customer=customer,
                title='Business Manager',
                description=description,
            )
        except flutterwave.FlutterwaveError as e:
            raise GatewayError(str(e)) from e
        return {'payment_link': link}

    def check_status(self, payment):
        try:
            data = flutterwave.verify_by_reference(payment.tx_ref)
        except flutterwave.FlutterwaveError as e:
            raise GatewayError(str(e)) from e
        if data.get('tx_ref') != payment.tx_ref:
            raise GatewayError('Transaction does not match this payment.')
        status = data.get('status')
        if status == 'successful':
            return GatewayStatus(
                'successful',
                provider_tx_id=str(data.get('id') or ''),
                amount=data.get('amount'),
                currency=data.get('currency'),
            )
        if status == 'failed':
            return GatewayStatus('failed', reason='Payment was not completed.')
        return GatewayStatus('pending')


GATEWAYS = {g.code: g for g in (MtnMomoGateway(), FlutterwaveGateway())}


def get_gateway(code):
    return GATEWAYS.get(code)
