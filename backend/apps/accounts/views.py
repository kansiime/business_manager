from rest_framework import viewsets, status
from rest_framework.decorators import (
    api_view, permission_classes, authentication_classes, throttle_classes, action,
)
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone

from .role_matrix import pages_for

from .models import User, GarageSettings, AuditLog, Membership
from .serializers import (
    UserSerializer, LoginSerializer, SignupSerializer, CreateBusinessSerializer,
    GarageSettingsSerializer, AuditLogSerializer, membership_summary,
)
from .permissions import IsAdmin
from .audit import log

# Cap on how many businesses one person can create for themselves.
MAX_OWNED_BUSINESSES = 10


class AuthRateThrottle(SimpleRateThrottle):
    """Per-IP limit on login / sign-up attempts (rate: REST_FRAMEWORK 'auth')."""
    scope = 'auth'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def issue_tokens(user, membership=None):
    """JWT pair for `user`, scoped to the business in `membership`."""
    refresh = RefreshToken.for_user(user)
    if membership is not None:
        refresh['role'] = membership.role
        refresh['tenant_id'] = str(membership.tenant_id)
    else:
        refresh['role'] = user.role
        refresh['tenant_id'] = str(user.tenant_id) if user.tenant_id else None
    refresh['username'] = user.username
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


def active_memberships(user):
    return (
        Membership.objects
        .filter(user=user, is_active=True)
        .select_related('tenant', 'tenant__business_type')
        .order_by('tenant__name')
    )


def set_current_business(user, membership):
    """Remember `membership` as the user's last-used business."""
    user.tenant = membership.tenant
    user.role = membership.role
    User.objects.filter(pk=user.pk).update(
        tenant=membership.tenant, role=membership.role,
    )


def session_payload(user, membership):
    """
    Tokens + user + business list + app-shell context, returned by login /
    sign-up / switch so the app can render straight away.
    """
    from apps.tenants.views import build_context

    if membership is not None:
        set_current_business(user, membership)
    memberships = list(active_memberships(user))
    return {
        **issue_tokens(user, membership),
        'user': UserSerializer(user).data,
        'businesses': [
            membership_summary(m, current_tenant_id=user.tenant_id)
            for m in memberships
        ],
        'context': build_context(user),
    }


# ---------------------------------------------------------------------------
# Login / sign-up
# ---------------------------------------------------------------------------
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    identifier = serializer.validated_data['username'].strip()
    password = serializer.validated_data['password']

    user = authenticate(username=identifier, password=password)
    if user is None and '@' in identifier:
        # Allow signing in with email address
        match = User.objects.filter(email__iexact=identifier).first()
        if match:
            user = authenticate(username=match.username, password=password)
    if not user:
        return Response({'error': 'Invalid credentials'}, status=401)

    if user.role == 'super':
        log(request, 'login', 'User', user.id, f'{user.username} logged in')
        return Response(session_payload(user, None))

    memberships = list(active_memberships(user))
    if not memberships:
        return Response(
            {'error': 'Your account is not linked to any business. Contact your administrator.'},
            status=403,
        )

    # Prefer the last-used business; skip ones the platform has locked.
    usable = [m for m in memberships if not m.tenant.is_locked]
    if not usable:
        reason = memberships[0].tenant.blocked_reason or 'Your account has been suspended.'
        return Response({'error': reason}, status=403)
    membership = next((m for m in usable if m.tenant_id == user.tenant_id), usable[0])

    # Expired trials / plans can still sign in: the app is read-only until
    # they pay (see TenantJWTAuthentication).
    payload = session_payload(user, membership)
    log(request, 'login', 'User', user.id, f'{user.username} logged in')
    return Response(payload)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def signup_view(request):
    """
    Public self-service sign-up: creates the person's account and their first
    business on a free trial, then signs them in.
    """
    serializer = SignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user, tenant = serializer.save()
    membership = Membership.objects.get(user=user, tenant=tenant)
    log(request, 'create', 'Tenant', tenant.id, f'{user.username} signed up {tenant.name}')
    return Response(session_payload(user, membership), status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# A person's businesses: list, create, switch
# ---------------------------------------------------------------------------
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def my_businesses(request):
    user = request.user
    if user.role == 'super':
        return Response({'detail': 'Platform admins do not own businesses.'}, status=400)

    if request.method == 'GET':
        return Response([
            membership_summary(m, current_tenant_id=user.tenant_id)
            for m in active_memberships(user)
        ])

    owned = Membership.objects.filter(user=user, is_owner=True).count()
    if owned >= MAX_OWNED_BUSINESSES:
        raise ValidationError(
            {'detail': f'You can own at most {MAX_OWNED_BUSINESSES} businesses.'}
        )

    serializer = CreateBusinessSerializer(data=request.data, context={'request': request})
    serializer.is_valid(raise_exception=True)
    tenant = serializer.save()
    membership = Membership.objects.get(user=user, tenant=tenant)
    log(request, 'create', 'Tenant', tenant.id, f'Created business {tenant.name}')
    return Response(session_payload(user, membership), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def switch_business(request):
    user = request.user
    tenant_id = request.data.get('tenant_id')
    membership = (
        active_memberships(user).filter(tenant_id=tenant_id).first()
        if tenant_id else None
    )
    if membership is None:
        return Response({'detail': 'Business not found.'}, status=404)
    if membership.tenant.is_locked:
        return Response(
            {'detail': membership.tenant.blocked_reason or 'This business is suspended.'},
            status=403,
        )
    return Response(session_payload(user, membership))


# ---------------------------------------------------------------------------
# Staff users within the current business
# ---------------------------------------------------------------------------
class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('-id')
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == 'super':
            return qs
        return qs.filter(memberships__tenant=user.tenant).distinct()

    def perform_create(self, serializer):
        if self.request.user.role == 'super':
            serializer.save()
            return

        tenant = self.request.user.tenant
        seats = Membership.objects.filter(tenant=tenant, is_active=True, user__is_active=True).count()
        if seats >= tenant.max_users:
            raise ValidationError({
                'detail': (
                    f'Your plan allows {tenant.max_users} users. '
                    'Upgrade your plan to add more.'
                ),
            })
        serializer.save(tenant=tenant)

    def perform_update(self, serializer):
        if self.request.user.role == 'super':
            serializer.save()
        else:
            # Business admins can't move users to another business
            serializer.save(tenant=self.request.user.tenant)

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise ValidationError({'detail': "You can't delete yourself."})
        if self.request.user.role != 'super':
            other = Membership.objects.filter(user=instance).exclude(
                tenant=self.request.user.tenant
            )
            if other.exists():
                # They also work elsewhere: only remove them from this business
                Membership.objects.filter(
                    user=instance, tenant=self.request.user.tenant
                ).delete()
                return
        instance.delete()

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        return Response(UserSerializer(request.user).data)

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        user = self.get_object()
        if user == request.user:
            return Response(
                {'detail': "You can't deactivate yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_active = not user.is_active
        user.save()
        log(request, 'update', 'User', user.id,
            f"{'Activated' if user.is_active else 'Deactivated'} {user.username}")
        return Response({'id': user.id, 'is_active': user.is_active})

    @action(detail=False, methods=['get'], url_path='available-for-clinic')
    def available_for_clinic(self, request):
        """Users in this tenant who are NOT yet ClinicalStaff."""
        qs = User.objects.filter(
            memberships__tenant=request.user.tenant,
            memberships__is_active=True,
            clinical_staff__isnull=True,
            is_active=True,
        ).distinct()
        return Response(UserSerializer(qs, many=True).data)


@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def garage_settings(request):
    obj = GarageSettings.load()

    if request.method == 'GET':
        data = GarageSettingsSerializer(obj).data

        # Attach tenant plan info so business owners can see their plan dates
        tenant = getattr(request.user, 'tenant', None)
        if tenant:
            from apps.billing.models import Subscription

            now = timezone.now()
            sub = Subscription.objects.filter(tenant=tenant).first()

            trial_days = None
            if tenant.trial_ends_at:
                trial_days = (tenant.trial_ends_at - now).days

            sub_days = None
            if tenant.subscription_ends_at:
                sub_days = (tenant.subscription_ends_at - now).days

            data['plan_info'] = {
                'plan': tenant.plan,
                'status': tenant.status,
                'trial_started_at': tenant.created_at.isoformat(),
                'trial_ends_at': (
                    tenant.trial_ends_at.isoformat()
                    if tenant.trial_ends_at else None
                ),
                'subscription_started_at': (
                    sub.started_at.isoformat() if sub else None
                ),
                'subscription_ends_at': (
                    tenant.subscription_ends_at.isoformat()
                    if tenant.subscription_ends_at else None
                ),
                'trial_days_remaining': trial_days,
                'subscription_days_remaining': sub_days,
                'is_trial': tenant.plan == 'trial',
                'is_expired': tenant.is_expired,
                'is_blocked': tenant.is_blocked,
            }

        return Response(data)

    # Writes require admin/manager
    if request.user.role not in ('admin', 'manager'):
        return Response({'detail': 'Not allowed'}, status=403)

    serializer = GarageSettingsSerializer(obj, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    log(request, 'update', 'GarageSettings', obj.id, 'Updated business settings')
    return Response(serializer.data)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def public_settings(request):
    """
    Public business info shown on the login page.
    Uses `?tenant=<slug>` to look up a specific business.
    """
    from apps.tenants.models import Tenant

    slug = request.query_params.get('tenant')
    if slug:
        tenant = Tenant.objects.filter(slug=slug).first()
        if tenant:
            settings = GarageSettings.all_objects.filter(tenant=tenant).first()
            bt = tenant.business_type
            return Response({
                'found': True,
                'tenant_slug': tenant.slug,
                'name': settings.name if settings else tenant.name,
                'business_type': bt.slug if bt else 'general',
                'business_type_name': bt.name if bt else 'Business',
                'business_type_icon': bt.icon if bt else '🏪',
                'currency_symbol': (settings.currency_symbol if settings else 'UGX'),
                'features': tenant.enabled_features,
            })

    return Response({
        'found': False,
        'name': 'Business Manager',
        'business_type': 'general',
        'business_type_name': 'Business',
        'business_type_icon': '🏪',
        'currency_symbol': 'UGX',
        'features': [
            'inventory', 'sales', 'purchases', 'debts', 'expenses',
            'returns', 'reports', 'customers',
        ],
    })


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related('user').all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role != 'super':
            qs = qs.filter(tenant=user.tenant)
        user_id = self.request.query_params.get('user')
        if user_id:
            qs = qs.filter(user_id=user_id)
        action_ = self.request.query_params.get('action')
        if action_:
            qs = qs.filter(action=action_)
        return qs[:500]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_pages(request):
    """
    Returns the list of page keys the current user can access.
    The frontend navbar filters by this.
    """
    return Response({
        'role': request.user.role,
        'pages': pages_for(request.user),
    })


GENERIC_ROLES = [
    {'key': 'admin',       'label': 'Admin'},
    {'key': 'manager',     'label': 'Manager'},
    {'key': 'cashier',     'label': 'Cashier'},
    {'key': 'storekeeper', 'label': 'Storekeeper'},
]
CLINIC_ROLES = [
    {'key': 'doctor',       'label': 'Doctor'},
    {'key': 'nurse',        'label': 'Nurse'},
    {'key': 'midwife',      'label': 'Midwife'},
    {'key': 'pharmacist',   'label': 'Pharmacist'},
    {'key': 'lab_tech',     'label': 'Lab Technician'},
    {'key': 'radiologist',  'label': 'Radiologist'},
    {'key': 'receptionist', 'label': 'Receptionist'},
    {'key': 'accountant',   'label': 'Accountant'},
]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def available_roles(request):
    """
    Roles the current user can assign to a new user.
    Generic roles are always available; clinic roles only for clinic tenants.
    """
    user = request.user

    if getattr(user, 'role', None) == 'super':
        return Response(GENERIC_ROLES + CLINIC_ROLES)

    tenant = getattr(user, 'tenant', None)
    if tenant is None:
        return Response(GENERIC_ROLES)

    features = tenant.enabled_features or []
    is_clinic = 'prescriptions' in features or 'appointments' in features

    return Response(GENERIC_ROLES + (CLINIC_ROLES if is_clinic else []))
