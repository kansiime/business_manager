from django.db import transaction
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.audit import log
from apps.accounts.permissions import RoleBasedPermission
from apps.tenants.mixins import TenantScopedMixin
from apps.tenants.permissions import HasFeature

from .models import Booking
from .serializers import BookingSerializer


class BookingViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    """
    Bookings, filtered by ?date=YYYY-MM-DD, or ?from= & ?to=, plus
    ?status= and ?staff=.
    """
    queryset = Booking.objects.select_related('service', 'staff', 'sale')
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated, HasFeature, RoleBasedPermission]
    feature_key = 'bookings'
    allowed_roles = ['admin', 'manager', 'cashier', 'receptionist', 'super']

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('date'):
            qs = qs.filter(date=p['date'])
        if p.get('from'):
            qs = qs.filter(date__gte=p['from'])
        if p.get('to'):
            qs = qs.filter(date__lte=p['to'])
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('staff'):
            qs = qs.filter(staff_id=p['staff'])
        return qs

    def perform_create(self, serializer):
        booking = self.save_with_tenant(serializer, created_by=self.request.user)
        log(self.request, 'create', 'Booking', booking.id,
            f'Booking for {booking.customer_name} on {booking.date} {booking.time:%H:%M}')

    @action(detail=True, methods=['post'])
    def checkout(self, request, pk=None):
        """
        Complete the booking and record the sale.
        Body: { payment_type?: 'cash' | 'mobile_money' | 'card' | 'credit',
                price?: number, allow_below_cost?: bool }
        """
        from apps.sales.serializers import SaleSerializer
        from apps.sales.views import record_unpaid_balance

        booking = self.get_object()
        if booking.sale_id:
            return Response({'detail': 'This booking has already been charged.'}, status=400)
        if not booking.service:
            return Response({'detail': 'Choose the service before charging.'}, status=400)

        price = request.data.get('price', booking.price)
        payment_type = request.data.get('payment_type', 'cash')
        sale_data = {
            'reference': f'BK-{booking.id}',
            'customer_name': booking.customer_name,
            'customer_phone': booking.customer_phone,
            'payment_type': payment_type,
            'amount_paid': 0 if payment_type == 'credit' else price,
            'notes': f'Booking on {booking.date} {booking.time:%H:%M}',
            'allow_below_cost': bool(request.data.get('allow_below_cost')),
            'items': [{'product': booking.service.id, 'quantity': 1, 'unit_price': price}],
        }
        serializer = SaleSerializer(data=sale_data, context={'request': request})
        serializer.is_valid(raise_exception=True)   # same price rules as the till
        with transaction.atomic():
            sale = serializer.save(user=request.user, tenant_id=request.user.tenant_id)
            booking.sale = sale
            booking.price = price
            booking.status = 'completed'
            booking.save(update_fields=['sale', 'price', 'status', 'updated_at'])
            record_unpaid_balance(sale, request.user)
        log(request, 'checkout', 'Booking', booking.id,
            f'Charged {booking.customer_name} {sale.total_amount}')
        return Response(BookingSerializer(booking, context={'request': request}).data)
