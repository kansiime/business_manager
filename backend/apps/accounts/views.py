from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.utils import timezone

from .role_matrix import pages_for

from .models import User, GarageSettings, AuditLog
from .serializers import (
    UserSerializer, LoginSerializer,
    GarageSettingsSerializer, AuditLogSerializer,
)
from .permissions import IsAdmin
from .audit import log


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = authenticate(
        username=serializer.validated_data['username'],
        password=serializer.validated_data['password'],
    )
    if not user:
        return Response({'error': 'Invalid credentials'}, status=401)

    # --- Plan / status enforcement ---
    tenant = getattr(user, 'tenant', None)
    if tenant and user.role != 'super':
        now = timezone.now()

        # Blocked or suspended
        if tenant.is_blocked or tenant.status in ('suspended', 'blocked', 'cancelled'):
            reason = tenant.blocked_reason or 'Your account has been suspended.'
            return Response({'error': reason}, status=403)

        # Trial / subscription expired?
        expired = False
        if tenant.plan == 'trial':
            if tenant.trial_ends_at and tenant.trial_ends_at < now:
                expired = True
        else:
            if tenant.subscription_ends_at and tenant.subscription_ends_at < now:
                expired = True

        if expired:
            return Response(
                {'error': 'Your plan has expired. Please renew to continue.'},
                status=403,
            )

    log(request, 'login', 'User', user.id, f'{user.username} logged in')

    refresh = RefreshToken.for_user(user)
    refresh['role'] = user.role
    refresh['tenant_id'] = str(user.tenant_id) if user.tenant_id else None
    refresh['username'] = user.username

    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': UserSerializer(user).data,
    })


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('-id')
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == 'super':
            return qs
        return qs.filter(tenant=user.tenant)

    def perform_create(self, serializer):
        if self.request.user.role == 'super':
            serializer.save()
        else:
            serializer.save(tenant=self.request.user.tenant)

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
            tenant=request.user.tenant,
            clinical_staff__isnull=True,
            is_active=True,
        )
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
            now = timezone.now()

            trial_days = None
            if tenant.trial_ends_at:
                trial_days = (tenant.trial_ends_at - now).days

            sub_days = None
            if tenant.subscription_ends_at:
                sub_days = (tenant.subscription_ends_at - now).days

            # Trial start = trial_ends - 14 days, Sub start = subscription_ends - 30 days
            trial_start = (
                tenant.trial_ends_at - timezone.timedelta(days=14)
                if tenant.trial_ends_at else None
            )
            sub_start = (
                tenant.subscription_ends_at - timezone.timedelta(days=30)
                if tenant.subscription_ends_at else None
            )

            data['plan_info'] = {
                'plan': tenant.plan,
                'status': tenant.status,
                'trial_started_at': trial_start.isoformat() if trial_start else None,
                'trial_ends_at': (
                    tenant.trial_ends_at.isoformat()
                    if tenant.trial_ends_at else None
                ),
                'subscription_started_at': sub_start.isoformat() if sub_start else None,
                'subscription_ends_at': (
                    tenant.subscription_ends_at.isoformat()
                    if tenant.subscription_ends_at else None
                ),
                'trial_days_remaining': trial_days,
                'subscription_days_remaining': sub_days,
                'is_trial': tenant.plan == 'trial',
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
def available_roles(request):
    """
    Returns the roles the current user can assign, based on their tenant's
    business type. A clinic offers doctor/nurse/etc. A garage offers
    cashier/storekeeper.
    """
    GENERIC = [
        {'key': 'admin',       'label': 'Admin'},
        {'key': 'manager',     'label': 'Manager'},
        {'key': 'cashier',     'label': 'Cashier'},
        {'key': 'storekeeper', 'label': 'Storekeeper'},
    ]
    CLINIC = [
        {'key': 'doctor',       'label': 'Doctor'},
        {'key': 'nurse',        'label': 'Nurse'},
        {'key': 'midwife',      'label': 'Midwife'},
        {'key': 'pharmacist',   'label': 'Pharmacist'},
        {'key': 'lab_tech',     'label': 'Lab Technician'},
        {'key': 'radiologist',  'label': 'Radiologist'},
        {'key': 'receptionist', 'label': 'Receptionist'},
        {'key': 'accountant',   'label': 'Accountant'},
    ]

    user = request.user

    if getattr(user, 'role', None) == 'super':
        return Response(GENERIC + CLINIC)

    tenant = getattr(user, 'tenant', None)
    if tenant is None:
        return Response(GENERIC)

    features = tenant.enabled_features or []
    is_clinic = 'prescriptions' in features or 'appointments' in features

    return Response(GENERIC + (CLINIC if is_clinic else []))




@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_pages(request):
    """
    Returns the list of pages the current user can access.
    Frontend uses this to build the navbar and guard routes.
    """
    return Response({
        'role': request.user.role,
        'pages': pages_for(request.user),
    })


from .role_matrix import pages_for


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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def available_roles(request):
    """
    Roles the current user can assign to a new user.
    Generic roles are always available; clinic roles only for clinic tenants.
    """
    GENERIC = [
        {'key': 'admin',       'label': 'Admin'},
        {'key': 'manager',     'label': 'Manager'},
        {'key': 'cashier',     'label': 'Cashier'},
        {'key': 'storekeeper', 'label': 'Storekeeper'},
    ]
    CLINIC = [
        {'key': 'doctor',       'label': 'Doctor'},
        {'key': 'nurse',        'label': 'Nurse'},
        {'key': 'midwife',      'label': 'Midwife'},
        {'key': 'pharmacist',   'label': 'Pharmacist'},
        {'key': 'lab_tech',     'label': 'Lab Technician'},
        {'key': 'radiologist',  'label': 'Radiologist'},
        {'key': 'receptionist', 'label': 'Receptionist'},
        {'key': 'accountant',   'label': 'Accountant'},
    ]

    user = request.user

    if getattr(user, 'role', None) == 'super':
        return Response(GENERIC + CLINIC)

    tenant = getattr(user, 'tenant', None)
    if tenant is None:
        return Response(GENERIC)

    features = tenant.enabled_features or []
    is_clinic = 'prescriptions' in features or 'appointments' in features

    return Response(GENERIC + (CLINIC if is_clinic else []))