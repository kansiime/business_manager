"""
MTN Mobile Money (MoMo) Open API — Collections client.

Only what pay-per-renewal needs:
  - access token (cached until shortly before it expires)
  - Request to Pay: MTN pushes a PIN prompt to the payer's phone
  - Request to Pay status: the only thing we trust to mark a payment paid

Docs: https://momodeveloper.mtn.com/api-documentation

Sandbox notes
  - Currency must be EUR (set MTN_MOMO_CURRENCY=EUR).
  - Test numbers: 46733123450 → failed, 46733123451 → rejected,
    46733123452 → timeout/expired, 46733123453 → stays pending,
    any other number → successful.
"""
import base64
import json
import re
import ssl
import time
import urllib.error
import urllib.request
from decimal import Decimal

import certifi
from django.conf import settings
from django.core.cache import cache

# Use certifi's CA bundle: python.org builds on macOS don't trust the system
# certificates, which breaks HTTPS to the provider ("CERTIFICATE_VERIFY_FAILED").
SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())

TOKEN_CACHE_KEY = 'mtn_momo:collection_token'

# MTN reason codes → message for the person paying
REASONS = {
    'APPROVAL_REJECTED': 'The payment was declined on the phone.',
    'NOT_ENOUGH_FUNDS': 'There was not enough Mobile Money balance.',
    'EXPIRED': 'The request expired before it was approved. Please try again.',
    'PAYER_NOT_FOUND': 'This number is not registered for MTN Mobile Money.',
    'PAYEE_NOT_ALLOWED_TO_RECEIVE': 'Payment could not be received. Contact support.',
    'PAYER_LIMIT_REACHED': 'This Mobile Money account has reached its limit.',
    'NOT_ALLOWED': 'This payment is not allowed for the account.',
    'INTERNAL_PROCESSING_ERROR': 'MTN could not process the payment. Please try again.',
    'SERVICE_UNAVAILABLE': 'MTN Mobile Money is temporarily unavailable. Please try again.',
}


class MomoError(Exception):
    pass


class MomoAuthError(MomoError):
    """Our MTN credentials were refused — a setup problem, not the payer's."""


_UUID = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')


def is_configured():
    """
    All three credentials present and shaped right (the API user is a UUID),
    so a half-finished setup doesn't offer MoMo to customers.
    """
    return bool(
        settings.MTN_MOMO_SUBSCRIPTION_KEY
        and settings.MTN_MOMO_API_KEY
        and _UUID.match(settings.MTN_MOMO_API_USER or '')
    )


def is_sandbox():
    return settings.MTN_MOMO_ENVIRONMENT == 'sandbox'


def _base_url():
    return settings.MTN_MOMO_BASE_URL.rstrip('/')


def _call(method, path, *, headers, payload=None):
    """Returns (status_code, parsed_json_or_None)."""
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        f'{_base_url()}{path}',
        data=data,
        method=method,
        headers={
            'Ocp-Apim-Subscription-Key': settings.MTN_MOMO_SUBSCRIPTION_KEY,
            **({'Content-Type': 'application/json'} if data is not None else {}),
            **headers,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30, context=SSL_CONTEXT) as resp:
            body = resp.read().decode()
            return resp.status, (json.loads(body) if body.strip() else None)
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode() or 'null')
        except ValueError:
            body = None
        return e.code, body
    except (urllib.error.URLError, TimeoutError) as e:
        raise MomoError(f'Could not reach MTN Mobile Money: {e}') from e


def _token():
    token = cache.get(TOKEN_CACHE_KEY)
    if token:
        return token
    basic = base64.b64encode(
        f'{settings.MTN_MOMO_API_USER}:{settings.MTN_MOMO_API_KEY}'.encode()
    ).decode()
    status, body = _call('POST', '/collection/token/', headers={'Authorization': f'Basic {basic}'})
    if status in (401, 403):
        raise MomoAuthError(f'MTN refused our API credentials ({status}).')
    if status != 200 or not body or 'access_token' not in body:
        raise MomoError(f'MTN authentication failed ({status}).')
    ttl = max(int(body.get('expires_in', 3600)) - 60, 60)
    cache.set(TOKEN_CACHE_KEY, body['access_token'], ttl)
    return body['access_token']


def _auth_headers():
    return {
        'Authorization': f'Bearer {_token()}',
        'X-Target-Environment': settings.MTN_MOMO_ENVIRONMENT,
    }


def format_amount(amount):
    """MTN wants a string; UGX has no minor units."""
    amount = Decimal(amount)
    return str(int(amount)) if amount == amount.to_integral_value() else f'{amount:.2f}'


def request_to_pay(*, reference_id, amount, currency, msisdn, external_id,
                   payer_message, payee_note, callback_url=None):
    """
    Ask MTN to prompt `msisdn` to approve a payment. `reference_id` must be a
    UUID4 string; it is how we look the request up later.
    """
    headers = {**_auth_headers(), 'X-Reference-Id': reference_id}
    if callback_url:
        headers['X-Callback-Url'] = callback_url
    status, body = _call('POST', '/collection/v1_0/requesttopay', headers=headers, payload={
        'amount': format_amount(amount),
        'currency': currency,
        'externalId': external_id,
        'payer': {'partyIdType': 'MSISDN', 'partyId': msisdn},
        'payerMessage': payer_message[:160],
        'payeeNote': payee_note[:160],
    })
    if status == 401:
        cache.delete(TOKEN_CACHE_KEY)
        raise MomoAuthError('MTN refused our access token (401).')
    if status != 202:
        message = (body or {}).get('message') if isinstance(body, dict) else None
        raise MomoError(message or f'MTN rejected the payment request ({status}).')


def get_status(reference_id):
    """
    Returns MTN's view of a Request to Pay:
        {'status': 'PENDING'|'SUCCESSFUL'|'FAILED', 'amount', 'currency',
         'financialTransactionId', 'externalId', 'reason': <code or None>}
    """
    status, body = _call(
        'GET', f'/collection/v1_0/requesttopay/{reference_id}', headers=_auth_headers(),
    )
    if status == 404:
        # Just created and not visible yet
        return {'status': 'PENDING', 'reason': None}
    if status == 401:
        cache.delete(TOKEN_CACHE_KEY)
    if status != 200 or not isinstance(body, dict):
        raise MomoError(f'Could not check the payment with MTN ({status}).')
    reason = body.get('reason')
    if isinstance(reason, dict):
        reason = reason.get('code')
    return {**body, 'reason': reason}


def reason_message(code):
    if not code:
        return 'The payment was not completed.'
    return REASONS.get(code, f'MTN declined the payment ({code}).')


# ---------------------------------------------------------------------------
# Sandbox provisioning (used by `manage.py momo_sandbox_setup`)
# ---------------------------------------------------------------------------
def create_sandbox_user(reference_id, callback_host):
    status, body = _call(
        'POST', '/v1_0/apiuser',
        headers={'X-Reference-Id': reference_id},
        payload={'providerCallbackHost': callback_host},
    )
    if status != 201:
        raise MomoError(f'Could not create sandbox API user ({status}): {body}')
    time.sleep(1)
    status, body = _call('POST', f'/v1_0/apiuser/{reference_id}/apikey', headers={}, payload={})
    if status != 201 or not body or 'apiKey' not in body:
        raise MomoError(f'Could not create sandbox API key ({status}): {body}')
    return body['apiKey']
