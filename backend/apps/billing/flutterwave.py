"""
Minimal Flutterwave v3 client (Standard checkout + transaction verify).

Flutterwave's hosted checkout lets East African customers pay with MTN / Airtel
mobile money, card, or bank, so we never handle card or wallet details.

Docs: https://developer.flutterwave.com/docs/collecting-payments/standard
"""
import json
import urllib.error
import urllib.request

from django.conf import settings

API_BASE = 'https://api.flutterwave.com/v3'


class FlutterwaveError(Exception):
    pass


def is_configured():
    return bool(settings.FLUTTERWAVE_SECRET_KEY)


def _request(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        f'{API_BASE}{path}',
        data=data,
        method=method,
        headers={
            'Authorization': f'Bearer {settings.FLUTTERWAVE_SECRET_KEY}',
            'Content-Type': 'application/json',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
            message = body.get('message') or str(e)
        except Exception:
            message = str(e)
        raise FlutterwaveError(message) from e
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        raise FlutterwaveError(f'Could not reach Flutterwave: {e}') from e


def create_checkout(*, tx_ref, amount, currency, redirect_url, customer, title, description):
    """Returns the hosted checkout URL to send the customer to."""
    body = _request('POST', '/payments', {
        'tx_ref': tx_ref,
        'amount': str(amount),
        'currency': currency,
        'redirect_url': redirect_url,
        'payment_options': 'mobilemoneyuganda,card,banktransfer',
        'customer': customer,
        'customizations': {'title': title, 'description': description},
    })
    link = (body.get('data') or {}).get('link')
    if body.get('status') != 'success' or not link:
        raise FlutterwaveError(body.get('message') or 'Checkout could not be created.')
    return link


def verify_transaction(transaction_id):
    """Returns Flutterwave's `data` object for a transaction id."""
    body = _request('GET', f'/transactions/{int(transaction_id)}/verify')
    if body.get('status') != 'success':
        raise FlutterwaveError(body.get('message') or 'Verification failed.')
    return body.get('data') or {}


def verify_by_reference(tx_ref):
    """Look a transaction up by our own reference (used by the webhook)."""
    from urllib.parse import quote
    body = _request('GET', f'/transactions/verify_by_reference?tx_ref={quote(tx_ref)}')
    if body.get('status') != 'success':
        raise FlutterwaveError(body.get('message') or 'Verification failed.')
    return body.get('data') or {}
