from datetime import timedelta

from django.db.models import Count, Sum
from django.utils import timezone

from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from .models import BusinessType, Tenant, PlatformSetting
from .serializers import (
    BusinessTypeSerializer,
    TenantSerializer,
    TenantCreateSerializer,
    PlatformSettingSerializer,
)
from .permissions import IsSuperAdmin


# ---------------------------------------------------------------------------
# Business types (public read)
# ---------------------------------------------------------------------------
class BusinessTypeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = BusinessType.objects.filter(is_active=True)
    serializer_class = BusinessTypeSerializer
    permission_classes = [AllowAny]


# ---------------------------------------------------------------------------
# Tenants
# ---------------------------------------------------------------------------
class TenantViewSet(viewsets.ModelViewSet):
    """
    - Super admin: full CRUD across all tenants.
    - Regular user: can only retrieve their own tenant.
    """
    queryset = Tenant.objects.all().order_by('name')
    serializer_class = TenantSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAuthenticated()]
        return [IsSuperAdmin()]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if getattr(user, 'role', None) == 'super':
            return qs
        return qs.filter(id=getattr(user, 'tenant_id', None))

    def perform_update(self, serializer):
        """
        When plan or status changes via Edit, ensure trial /
        subscription end dates are set sensibly.
        """
        instance = self.get_object()
        new_plan = serializer.validated_data.get('plan', instance.plan)
        old_plan = instance.plan
        now = timezone.now()

        # Switching TO trial and trial date is missing/past → set +14 days
        if new_plan == 'trial' and old_plan != 'trial':
            if not instance.trial_ends_at or instance.trial_ends_at < now:
                trial_days = PlatformSetting.load().default_trial_days
                serializer.save(
                    trial_ends_at=now + timedelta(days=trial_days),
                    subscription_ends_at=None,
                )
                return

        # Switching TO paid plan and sub date is missing/past → set +30 days
        if new_plan != 'trial' and old_plan == 'trial':
            if not instance.subscription_ends_at or instance.subscription_ends_at < now:
                serializer.save(
                    subscription_ends_at=now + timedelta(days=30),
                    trial_ends_at=None,
                )
                return

        serializer.save()

    @action(detail=False, methods=['post'], url_path='create-tenant')
    def create_tenant(self, request):
        """
        Super-admin-only: creates a tenant + its admin user + settings
        in one atomic call.
        """
        serializer = TenantCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tenant = serializer.save()
        return Response(
            TenantSerializer(tenant).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    def extend(self, request, pk=None):
        """
        Super admin extends the plan by N days.
        Body: { "days": 30 }

        Renewal logic:
          - If subscription/trial is still active → extend from that end date
          - If already expired → start fresh from now
        """
        tenant = self.get_object()
        try:
            days = int(request.data.get('days', 30))
        except (TypeError, ValueError):
            return Response({'detail': 'Invalid days.'}, status=400)

        if days <= 0:
            return Response({'detail': 'Days must be positive.'}, status=400)

        now = timezone.now()

        # Pick the base date: whichever end date is later than "now"
        # If everything is expired/past, base = now
        base = now
        if tenant.subscription_ends_at and tenant.subscription_ends_at > now:
            base = tenant.subscription_ends_at
        elif tenant.trial_ends_at and tenant.trial_ends_at > now:
            base = tenant.trial_ends_at

        new_end = base + timedelta(days=days)

        # Which field to update?
        if tenant.plan == 'trial':
            # Trial gets extended, and if requested days > 7 we convert
            # to subscription (i.e. paid plan) automatically
            if days > 7:
                tenant.plan = 'starter'
                tenant.status = 'active'
                tenant.subscription_ends_at = new_end
                tenant.trial_ends_at = None
            else:
                tenant.trial_ends_at = new_end
        else:
            tenant.subscription_ends_at = new_end

        # Auto-unblock and reactivate on extension
        if tenant.status in ('suspended', 'blocked'):
            tenant.status = 'active'
        tenant.is_blocked = False
        tenant.save()

        return Response(TenantSerializer(tenant).data)


# ---------------------------------------------------------------------------
# Current tenant (basic)
# ---------------------------------------------------------------------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_tenant(request):
    user = request.user

    if getattr(user, 'role', None) == 'super':
        return Response({
            'is_super': True,
            'tenant': None,
            'enabled_features': [
                'inventory', 'sales', 'purchases', 'debts', 'expenses',
                'returns', 'reports', 'reconciliation', 'customers',
                'repairs', 'vehicles', 'prescriptions', 'appointments',
                'menu', 'tables', 'expiry', 'barcode', 'variants',
                'batch_tracking',
            ],
        })

    tenant = getattr(user, 'tenant', None)
    if tenant is None:
        return Response({'detail': 'No tenant assigned to this user.'}, status=400)

    return Response({
        'is_super': False,
        'tenant': TenantSerializer(tenant).data,
        'enabled_features': tenant.enabled_features,
    })


# ---------------------------------------------------------------------------
# Rich tenant context (announcement + plan status)
# ---------------------------------------------------------------------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tenant_context(request):
    return Response(build_context(request.user))


def build_context(user):
    """
    Everything the app shell needs: business, features, the pages this user
    may open, announcement and plan status. Also returned by login / sign-up /
    switch-business so the app can render without waiting for this endpoint.
    """
    from apps.accounts.role_matrix import pages_for

    shell = {'role': user.role, 'pages': pages_for(user)}
    platform = PlatformSetting.load()

    announcement = None
    if platform.announcement_active and platform.announcement:
        now = timezone.now()
        started = (
            platform.announcement_starts_at is None
            or platform.announcement_starts_at <= now
        )
        not_ended = (
            platform.announcement_ends_at is None
            or platform.announcement_ends_at >= now
        )
        if started and not_ended:
            announcement = {
                'message': platform.announcement,
                'support_email': platform.support_email,
                'support_phone': platform.support_phone,
                'ends_at': (
                    platform.announcement_ends_at.isoformat()
                    if platform.announcement_ends_at else None
                ),
            }

    if getattr(user, 'role', None) == 'super':
        return {
            **shell,
            'is_super': True,
            'tenant': None,
            'enabled_features': [],
            'announcement': announcement,
            'plan_status': None,
        }

    tenant = getattr(user, 'tenant', None)
    if tenant is None:
        return {**shell, 'is_super': False, 'tenant': None, 'enabled_features': [],
                'announcement': announcement, 'plan_status': None}

    today = timezone.localtime().date()

    trial_days = None
    if tenant.trial_ends_at:
        trial_days = (tenant.trial_ends_at.date() - today).days

    sub_days = None
    if tenant.subscription_ends_at:
        sub_days = (tenant.subscription_ends_at.date() - today).days

    days_remaining = trial_days if tenant.plan == 'trial' else sub_days

    plan_status = {
        'plan': tenant.plan,
        'status': tenant.status,
        # Expired trials / plans are read-only until paid (see TenantJWTAuthentication)
        'read_only': tenant.is_expired,
        'is_locked': tenant.is_locked,
        'is_blocked': tenant.is_blocked,
        'blocked_reason': tenant.blocked_reason or '',
        'trial_ends_at': (
            tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None
        ),
        'subscription_ends_at': (
            tenant.subscription_ends_at.isoformat()
            if tenant.subscription_ends_at else None
        ),
        'days_remaining': days_remaining,
        'expired': tenant.is_expired or tenant.is_locked,
        'warning': (
            days_remaining is not None
            and 0 <= days_remaining <= 7
        ),
    }

    return {
        **shell,
        'is_super': False,
        'tenant': {
            'id': str(tenant.id),
            'slug': tenant.slug,
            'name': tenant.name,
            'plan': tenant.plan,
        },
        'enabled_features': tenant.enabled_features,
        'announcement': announcement,
        'plan_status': plan_status,
    }


# ---------------------------------------------------------------------------
# Platform stats (super admin)
# ---------------------------------------------------------------------------
@api_view(['GET'])
@permission_classes([IsSuperAdmin])
def platform_stats(request):
    from apps.accounts.models import User
    from apps.sales.models import Sale
    from apps.inventory.models import Product
    from apps.debts.models import Debt

    today = timezone.localtime().date()
    month_start = today.replace(day=1)
    week_ago = today - timedelta(days=7)
    thirty_days_ago = today - timedelta(days=30)

    total_tenants = Tenant.objects.count()
    active_tenants = Tenant.objects.filter(status='active').count()
    trial_tenants = Tenant.objects.filter(status='trial').count()
    suspended_tenants = Tenant.objects.filter(status='suspended').count()
    new_tenants_this_week = Tenant.objects.filter(
        created_at__date__gte=week_ago
    ).count()

    by_business_type = list(
        BusinessType.objects.annotate(
            tenant_count=Count('tenants')
        ).values('slug', 'name', 'icon', 'tenant_count').order_by('-tenant_count')
    )

    by_plan = list(
        Tenant.objects.values('plan').annotate(count=Count('id')).order_by('-count')
    )

    total_users = User.objects.filter(tenant__isnull=False).count()

    total_sales_all_time = Sale.all_objects.aggregate(
        t=Sum('total_amount')
    )['t'] or 0

    sales_this_month = Sale.all_objects.filter(
        created_at__date__gte=month_start
    ).aggregate(t=Sum('total_amount'))['t'] or 0

    total_products = Product.all_objects.count()

    total_debts = Debt.all_objects.exclude(status='paid').aggregate(
        t=Sum('amount')
    )['t'] or 0

    recent_tenants = list(
        Tenant.objects.select_related('business_type')
        .order_by('-created_at')[:10]
        .values(
            'id', 'name', 'slug', 'plan', 'status',
            'business_type__slug', 'business_type__name',
            'business_type__icon', 'created_at',
        )
    )

    top_tenants_raw = (
        Sale.all_objects
        .filter(created_at__date__gte=thirty_days_ago)
        .values('tenant_id')
        .annotate(total=Sum('total_amount'), count=Count('id'))
        .order_by('-total')[:10]
    )
    tenant_ids = [t['tenant_id'] for t in top_tenants_raw if t['tenant_id']]
    tenant_names = {
        str(t.id): t.name
        for t in Tenant.objects.filter(id__in=tenant_ids)
    }
    top_tenants = [
        {
            'tenant_id': str(t['tenant_id']),
            'name': tenant_names.get(str(t['tenant_id']), '—'),
            'total': float(t['total'] or 0),
            'count': t['count'],
        }
        for t in top_tenants_raw
        if t['tenant_id']
    ]

    return Response({
        'tenants': {
            'total': total_tenants,
            'active': active_tenants,
            'trial': trial_tenants,
            'suspended': suspended_tenants,
            'new_this_week': new_tenants_this_week,
        },
        'users': {'total': total_users},
        'business': {
            'total_sales_all_time': float(total_sales_all_time),
            'sales_this_month': float(sales_this_month),
            'total_products': total_products,
            'outstanding_debts': float(total_debts),
        },
        'by_business_type': by_business_type,
        'by_plan': by_plan,
        'recent_tenants': [
            {
                'id': str(t['id']),
                'name': t['name'],
                'slug': t['slug'],
                'plan': t['plan'],
                'status': t['status'],
                'business_type': t['business_type__slug'],
                'business_type_name': t['business_type__name'] or '—',
                'business_type_icon': t['business_type__icon'] or '🏪',
                'created_at': t['created_at'].strftime('%Y-%m-%d'),
            }
            for t in recent_tenants
        ],
        'top_tenants': top_tenants,
    })


# ---------------------------------------------------------------------------
# Platform settings (super admin)
# ---------------------------------------------------------------------------
@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsSuperAdmin])
def platform_settings(request):
    obj = PlatformSetting.load()
    if request.method == 'GET':
        return Response(PlatformSettingSerializer(obj).data)
    serializer = PlatformSettingSerializer(obj, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# ---------------------------------------------------------------------------
# Bulk tenant actions (super admin)
# ---------------------------------------------------------------------------
@api_view(['POST'])
@permission_classes([IsSuperAdmin])
def bulk_tenant_action(request):
    action_ = request.data.get('action')
    ids = request.data.get('ids', [])
    if not ids:
        return Response({'detail': 'No tenants selected.'}, status=400)
    if action_ not in ('activate', 'suspend', 'block', 'unblock', 'delete'):
        return Response({'detail': 'Unknown action.'}, status=400)

    qs = Tenant.objects.filter(id__in=ids)
    updated = qs.count()

    if action_ == 'activate':
        qs.update(status='active', is_blocked=False)
    elif action_ == 'suspend':
        qs.update(status='suspended')
    elif action_ == 'block':
        qs.update(is_blocked=True, status='blocked')
    elif action_ == 'unblock':
        qs.update(is_blocked=False, status='active')
    elif action_ == 'delete':
        for t in qs:
            t.delete()

    return Response({'updated': updated, 'action': action_})


# ---------------------------------------------------------------------------
# Plans (super admin)
# ---------------------------------------------------------------------------
@api_view(['GET'])
@permission_classes([IsSuperAdmin])
def platform_plans(request):
    from apps.billing.models import Plan
    plans = Plan.objects.all().order_by('order')
    return Response([
        {
            'id': p.id,
            'code': p.code,
            'name': p.name,
            'monthly_price': float(p.monthly_price),
            'yearly_price': float(p.yearly_price),
            'currency': p.currency,
            'max_users': p.max_users,
            'max_branches': p.max_branches,
            'features': p.features,
            'order': p.order,
            'is_active': p.is_active,
        }
        for p in plans
    ])


@api_view(['PATCH'])
@permission_classes([IsSuperAdmin])
def update_plan(request, plan_id):
    from apps.billing.models import Plan
    try:
        plan = Plan.objects.get(pk=plan_id)
    except Plan.DoesNotExist:
        return Response({'detail': 'Plan not found.'}, status=404)

    for field in (
        'name', 'monthly_price', 'yearly_price', 'currency',
        'max_users', 'max_branches', 'order', 'is_active',
    ):
        if field in request.data:
            setattr(plan, field, request.data[field])
    plan.save()
    return Response({'ok': True})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def plans_list(request):
    """
    Any authenticated user can read the plan catalogue.
    Used by the tenant edit form to auto-fill limits.
    """
    from apps.billing.models import Plan
    plans = Plan.objects.filter(is_active=True).order_by('order')
    return Response([
        {
            'id': p.id,
            'code': p.code,
            'name': p.name,
            'monthly_price': float(p.monthly_price),
            'yearly_price': float(p.yearly_price),
            'currency': p.currency,
            'max_users': p.max_users,
            'max_branches': p.max_branches,
            'features': p.features,
            'order': p.order,
        }
        for p in plans
    ])


@api_view(['GET'])
@permission_classes([IsSuperAdmin])
def announcement_status(request):
    platform = PlatformSetting.load()
    now = timezone.now()

    if not platform.announcement_active or not platform.announcement:
        state = 'inactive'
    elif platform.announcement_starts_at and platform.announcement_starts_at > now:
        state = 'scheduled'
    elif platform.announcement_ends_at and platform.announcement_ends_at < now:
        state = 'expired'
    else:
        state = 'active'

    return Response({
        'state': state,
        'starts_at': (
            platform.announcement_starts_at.isoformat()
            if platform.announcement_starts_at else None
        ),
        'ends_at': (
            platform.announcement_ends_at.isoformat()
            if platform.announcement_ends_at else None
        ),
    })