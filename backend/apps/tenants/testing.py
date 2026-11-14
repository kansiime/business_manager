"""Helpers for API tests that need one or more real businesses."""
from django.core.cache import cache
from rest_framework.test import APIClient


def make_business(name, username, business_type='agro'):
    """
    Sign up a new business through the API, the way a real owner does,
    and return an APIClient logged in as its admin.
    """
    cache.clear()   # sign-up throttle counters
    res = APIClient().post('/api/auth/signup/', {
        'business_name': name,
        'business_type_slug': business_type,
        'full_name': f'{username.title()} Owner',
        'email': f'{username}@example.com',
        'phone': '0700000000',
        'username': username,
        'password': 'Str0ng-pass-123',
    }, format='json')
    assert res.status_code == 201, res.data
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
    return client


def make_product(client, sku='P1', quantity=10, **fields):
    res = client.post('/api/inventory/products/', {
        'name': f'Product {sku}', 'sku': sku,
        'cost_price': '500', 'selling_price': '1000',
        'quantity': quantity, **fields,
    }, format='json')
    assert res.status_code == 201, res.data
    return res.data['id']


def sell(client, product_id, quantity, reference='S1', unit_price='1000'):
    return client.post('/api/sales/', {
        'reference': reference, 'payment_type': 'cash',
        'amount_paid': str(int(quantity) * int(unit_price)),
        'items': [{'product': product_id, 'quantity': quantity,
                   'unit_price': unit_price}],
    }, format='json')
