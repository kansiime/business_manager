"""
Every change to `Product.quantity` goes through here.

Stock is changed with a single `UPDATE ... SET quantity = quantity + n`
in the database, never by reading the product, changing it in Python and
saving it back. With read-modify-save, two cashiers selling the same item at
the same moment both read the old quantity and one sale's deduction is lost.

Never call `product.save()` to change stock, and never call it right after
these helpers without `update_fields` that leave out `quantity`: the
in-memory value could be stale and would overwrite the real one.
"""
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import Product


class InsufficientStock(Exception):
    def __init__(self, product, requested, available):
        self.product = product
        self.requested = requested
        self.available = available
        super().__init__(
            f'Only {available} of {product.name} in stock, {requested} requested.'
        )


def _products(product):
    # The product was already resolved inside the current business, so
    # look it up by primary key without the tenant filter.
    return Product.all_objects.filter(pk=product.pk)


def _sync(product):
    product.refresh_from_db(fields=['quantity', 'updated_at'])
    return product.quantity


def add_stock(product, quantity):
    """Increase stock by `quantity`. Returns the new quantity."""
    _products(product).update(
        quantity=F('quantity') + quantity, updated_at=timezone.now(),
    )
    return _sync(product)


def remove_stock(product, quantity, *, allow_negative=False):
    """
    Decrease stock by `quantity`. Returns the new quantity.

    Unless `allow_negative`, raises `InsufficientStock` when there isn't
    enough, checked in the same UPDATE so two concurrent removals can't
    both pass the check.
    """
    qs = _products(product)
    if not allow_negative:
        qs = qs.filter(quantity__gte=quantity)
    updated = qs.update(
        quantity=F('quantity') - quantity, updated_at=timezone.now(),
    )
    if not updated:
        available = _sync(product)
        raise InsufficientStock(product, quantity, available)
    return _sync(product)


def set_stock(product, quantity):
    """Set stock to an absolute count (adjustments, stock-takes)."""
    _products(product).update(quantity=quantity, updated_at=timezone.now())
    return _sync(product)


def lock_product(product):
    """
    Lock the product row until the end of the current transaction and
    return its current quantity. Use it when a value must be read and then
    acted on without another request changing it in between.
    """
    assert transaction.get_connection().in_atomic_block, \
        'lock_product() must be called inside transaction.atomic()'
    locked = _products(product).select_for_update().get()
    product.quantity = locked.quantity
    return locked.quantity
