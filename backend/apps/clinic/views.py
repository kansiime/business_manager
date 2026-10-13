from rest_framework import viewsets, status
from decimal import Decimal, InvalidOperation
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.utils import timezone
from datetime import date
from .models import (
    Patient, ClinicalStaff, ServiceCategory, Service, ServiceConsumable,
    Appointment, Visit, Triage, LabOrder, Prescription,
    ClinicInvoice, ClinicInvoiceItem, VisitSummary,
)
from .serializers import (
    PatientSerializer, ClinicalStaffSerializer,
    ServiceCategorySerializer, ServiceSerializer, ServiceConsumableSerializer,
    AppointmentSerializer, TriageSerializer,
    LabOrderSerializer, PrescriptionSerializer,
    ClinicInvoiceSerializer, ClinicInvoiceItemSerializer,
    VisitSerializer, VisitListSerializer,
    VisitSummarySerializer,
    CreateVisitSerializer, CompleteVisitSerializer,
)
from apps.accounts.permissions import RoleBasedPermission


# ============================================================================
# Base class — everyone in the clinic sees the base viewset unless overridden
# ============================================================================
class ClinicBaseViewSet(viewsets.ModelViewSet):
    """
    Base for all clinic viewsets.
    Default: authenticated users only.
    Override `allowed_roles` / `write_roles` on subclasses.
    """
    permission_classes = [IsAuthenticated, RoleBasedPermission]
    allowed_roles = None       # None → any authenticated user
    write_roles = None

    def get_permissions(self):
        return [perm() for perm in self.permission_classes]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        # Belt-and-braces tenant filter: don't rely on thread-local alone.
        if user.is_authenticated and user.tenant_id:
            return qs.filter(tenant_id=user.tenant_id)
        return qs.none()


# ============================================================================
# Patients — every clinic role can read; anyone can register
# ============================================================================
class PatientViewSet(ClinicBaseViewSet):
    queryset = Patient.objects.all().order_by('-created_at')
    serializer_class = PatientSerializer
    allowed_roles = [
        'admin', 'manager', 'super',
        'receptionist', 'nurse', 'midwife',
        'doctor', 'pharmacist', 'lab_tech', 'radiologist',
        'cashier', 'accountant',
    ]
    # Everyone above can create/update patients too (registration is their job)
    write_roles = [
        'admin', 'manager', 'super',
        'receptionist', 'nurse', 'midwife', 'doctor',
    ]

    def get_queryset(self):
        qs = super().get_queryset()
        s = self.request.query_params.get('search')
        if s:
            from django.db.models import Q
            qs = qs.filter(
                Q(first_name__icontains=s) |
                Q(last_name__icontains=s) |
                Q(patient_number__icontains=s) |
                Q(phone__icontains=s) |
                Q(national_id__icontains=s)
            )
        return qs

    @action(detail=True, methods=['get'])
    def statement(self, request, pk=None):
        """Patient billing statement."""
        patient = self.get_object()
        today = timezone.localtime().date()

        from_raw = request.query_params.get('from')
        to_raw = request.query_params.get('to')

        try:
            from_date = (
                timezone.datetime.strptime(from_raw, '%Y-%m-%d').date()
                if from_raw else today.replace(day=1)
            )
        except Exception:
            from_date = today.replace(day=1)
        try:
            to_date = (
                timezone.datetime.strptime(to_raw, '%Y-%m-%d').date()
                if to_raw else today
            )
        except Exception:
            to_date = today

        visits = patient.visits.filter(
            visit_date__gte=from_date,
            visit_date__lte=to_date,
        ).order_by('visit_date', 'created_at')

        rows = []
        total_charged = 0
        total_paid = 0
        for v in visits:
            inv = getattr(v, 'invoice', None)
            charged = float(inv.total) if inv else 0
            paid = float(inv.amount_paid) if inv else 0
            total_charged += charged
            total_paid += paid
            rows.append({
                'date': v.visit_date.isoformat(),
                'visit_number': v.visit_number,
                'doctor': (
                    v.attending_doctor.user.get_full_name()
                    if v.attending_doctor else ''
                ),
                'diagnosis': (v.diagnosis or '')[:80],
                'invoice_number': inv.invoice_number if inv else '',
                'charged': charged,
                'paid': paid,
                'balance': charged - paid,
                'status': inv.status if inv else 'unbilled',
            })

        from apps.accounts.models import GarageSettings
        shop = GarageSettings.all_objects.filter(tenant=request.user.tenant).first()

        return Response({
            'clinic': {
                'name': shop.name if shop else '',
                'address': shop.address if shop else '',
                'phone': shop.phone if shop else '',
                'email': shop.email if shop else '',
                'currency': (shop.currency_symbol if shop else 'UGX'),
            },
            'patient': {
                'id': str(patient.id),
                'name': patient.full_name,
                'number': patient.patient_number,
                'phone': patient.phone,
                'address': patient.address,
            },
            'period': {
                'from': from_date.isoformat(),
                'to': to_date.isoformat(),
                'from_display': from_date.strftime('%d %b %Y'),
                'to_display': to_date.strftime('%d %b %Y'),
            },
            'rows': rows,
            'totals': {
                'charged': total_charged,
                'paid': total_paid,
                'balance': total_charged - total_paid,
                'visit_count': len(rows),
            },
            'generated_at': timezone.localtime().isoformat(),
        })


# ============================================================================
# Clinical Staff — only admin/manager can edit
# ============================================================================
class ClinicalStaffViewSet(ClinicBaseViewSet):
    queryset = ClinicalStaff.objects.all()
    serializer_class = ClinicalStaffSerializer
    allowed_roles = ['admin', 'manager', 'super', 'doctor', 'nurse',
                     'receptionist', 'pharmacist', 'lab_tech']
    write_roles = ['admin', 'manager', 'super']

    def get_queryset(self):
        qs = super().get_queryset()
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)
        return qs


# ============================================================================
# Services
# ============================================================================
class ServiceCategoryViewSet(ClinicBaseViewSet):
    queryset = ServiceCategory.objects.all()
    serializer_class = ServiceCategorySerializer
    allowed_roles = ['admin', 'manager', 'super', 'doctor', 'nurse',
                     'receptionist', 'pharmacist', 'lab_tech', 'cashier']
    write_roles = ['admin', 'manager', 'super']


class ServiceViewSet(ClinicBaseViewSet):
    queryset = Service.objects.all()
    serializer_class = ServiceSerializer
    allowed_roles = ['admin', 'manager', 'super', 'doctor', 'nurse',
                     'receptionist', 'pharmacist', 'lab_tech', 'cashier']
    write_roles = ['admin', 'manager', 'super']

    def get_queryset(self):
        qs = super().get_queryset()
        cat = self.request.query_params.get('category')
        if cat:
            qs = qs.filter(category_id=cat)
        active = self.request.query_params.get('active')
        if active == 'true':
            qs = qs.filter(is_active=True)
        return qs


class ServiceConsumableViewSet(ClinicBaseViewSet):
    queryset = ServiceConsumable.objects.all()
    serializer_class = ServiceConsumableSerializer
    allowed_roles = ['admin', 'manager', 'super', 'pharmacist', 'storekeeper']
    write_roles = ['admin', 'manager', 'super']

    def get_queryset(self):
        qs = super().get_queryset()
        s = self.request.query_params.get('service')
        if s:
            qs = qs.filter(service_id=s)
        return qs


# ============================================================================
# Appointments
# ============================================================================
class AppointmentViewSet(ClinicBaseViewSet):
    queryset = Appointment.objects.all()
    serializer_class = AppointmentSerializer
    allowed_roles = ['admin', 'manager', 'super', 'receptionist',
                     'doctor', 'nurse', 'midwife']
    write_roles = ['admin', 'manager', 'super', 'receptionist', 'doctor', 'nurse']

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('date'):
            qs = qs.filter(appointment_date=p['date'])
        if p.get('doctor'):
            qs = qs.filter(doctor_id=p['doctor'])
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('upcoming') == 'true':
            qs = qs.filter(appointment_date__gte=date.today())
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def check_in(self, request, pk=None):
        appt = self.get_object()
        appt.status = 'checked_in'
        appt.save()
        return Response(AppointmentSerializer(appt).data)

    @action(detail=False, methods=['get'])
    def week_schedule(self, request):
        """
        Weekly schedule: doctors × 7 days.
        Query: ?week_start=YYYY-MM-DD
        """
        from datetime import timedelta
        from apps.clinic.models import ClinicalStaff

        today = timezone.localtime().date()
        week_raw = request.query_params.get('week_start')

        if week_raw:
            try:
                week_start = timezone.datetime.strptime(week_raw, '%Y-%m-%d').date()
            except Exception:
                week_start = today
        else:
            week_start = today - timedelta(days=today.weekday())

        week_days = [week_start + timedelta(days=i) for i in range(7)]

        doctors = ClinicalStaff.all_objects.filter(
            tenant=request.user.tenant, role='doctor',
        ).select_related('user')

        appts = Appointment.all_objects.filter(
            tenant=request.user.tenant,
            appointment_date__gte=week_start,
            appointment_date__lte=week_days[-1],
        ).select_related('patient', 'doctor', 'doctor__user')

        grid = []
        for d in doctors:
            days = []
            for day in week_days:
                day_appts = [
                    a for a in appts
                    if a.doctor_id == d.id and a.appointment_date == day
                ]
                days.append({
                    'date': day.isoformat(),
                    'date_display': day.strftime('%a %d'),
                    'is_today': day == today,
                    'appointments': [
                        {
                            'id': str(a.id),
                            'time': a.appointment_time.strftime('%H:%M'),
                            'patient_name': a.patient.full_name,
                            'patient_id': str(a.patient_id),
                            'status': a.status,
                            'reason': a.reason,
                        }
                        for a in sorted(day_appts, key=lambda x: x.appointment_time)
                    ],
                    'count': len(day_appts),
                })
            grid.append({
                'doctor_id': str(d.id),
                'doctor_name': d.user.get_full_name() or d.user.username,
                'specialization': d.specialization or '',
                'days': days,
                'week_total': sum(x['count'] for x in days),
            })

        return Response({
            'week_start': week_start.isoformat(),
            'week_end': week_days[-1].isoformat(),
            'week_label': (
                f"{week_start.strftime('%d %b')} – "
                f"{week_days[-1].strftime('%d %b %Y')}"
            ),
            'days': [
                {
                    'date': d.isoformat(),
                    'date_display': d.strftime('%a %d'),
                    'is_today': d == today,
                }
                for d in week_days
            ],
            'grid': grid,
        })


# ============================================================================
# Visits — the master clinic record
# ============================================================================
class VisitViewSet(ClinicBaseViewSet):
    queryset = Visit.objects.all().order_by('-created_at')
    lookup_field = 'visit_number'
    lookup_url_kwarg = 'visit_number'
    allowed_roles = ['admin', 'manager', 'super', 'doctor', 'nurse',
                     'midwife', 'receptionist', 'lab_tech', 'radiologist',
                     'pharmacist', 'cashier', 'accountant']
    write_roles = ['admin', 'manager', 'super', 'receptionist',
                   'nurse', 'midwife', 'doctor']

    def get_serializer_class(self):
        if self.action == 'list':
            return VisitListSerializer
        return VisitSerializer

    def get_queryset(self):
        qs = super().get_queryset().select_related(
            'patient', 'attending_doctor', 'attending_doctor__user',
        ).prefetch_related(
            'lab_orders', 'prescriptions', 'lab_orders__service',
        )
        p = self.request.query_params
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('date'):
            qs = qs.filter(visit_date=p['date'])
        elif p.get('today') == 'true':
            qs = qs.filter(visit_date=date.today())
        if p.get('patient'):
            qs = qs.filter(patient_id=p['patient'])
        return qs

    @action(detail=False, methods=['post'], url_path='create-with-triage')
    def create_with_triage(self, request):
        serializer = CreateVisitSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        visit = serializer.save()
        return Response(VisitSerializer(visit).data, status=201)

    @action(detail=True, methods=['post'])
    def save_triage(self, request, visit_number=None):
        visit = self.get_object()
        data = request.data
        triage, _ = Triage.all_objects.get_or_create(
            tenant=request.user.tenant,
            visit=visit,
            defaults={'recorded_by': request.user},
        )
        for f in ['temperature_c', 'blood_pressure_systolic', 'blood_pressure_diastolic',
                  'pulse_bpm', 'respiratory_rate', 'oxygen_saturation',
                  'weight_kg', 'height_cm', 'symptoms', 'pain_scale']:
            if f in data:
                setattr(triage, f, data[f])
        triage.recorded_by = request.user
        triage.save()
        return Response(TriageSerializer(triage).data)

    @action(detail=True, methods=['post'], url_path='assign-doctor')
    def assign_doctor(self, request, visit_number=None):
        visit = self.get_object()
        visit.attending_doctor_id = request.data.get('doctor')
        visit.status = 'with_doctor'
        visit.save()
        return Response(VisitSerializer(visit).data)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, visit_number=None):
        visit = self.get_object()
        serializer = CompleteVisitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        visit.diagnosis = d['diagnosis']
        visit.treatment_plan = d.get('treatment_plan', '')
        visit.status = 'completed'
        visit.completed_at = timezone.now()
        visit.save()

        summary, _ = VisitSummary.all_objects.get_or_create(
            tenant=request.user.tenant, visit=visit,
        )
        summary.diagnosis_summary = d.get('diagnosis_summary', '') or d['diagnosis']
        summary.treatment_summary = d.get('treatment_summary', '') or d.get('treatment_plan', '')
        summary.follow_up_date = d.get('follow_up_date')
        summary.follow_up_notes = d.get('follow_up_notes', '')
        summary.referred_to = d.get('referred_to', '')
        summary.printed_by = request.user
        summary.save()

        return Response(VisitSerializer(visit).data)

    @action(detail=True, methods=['post'], url_path='send-to-lab')
    def send_to_lab(self, request, visit_number=None):
        visit = self.get_object()
        service_ids = request.data.get('service_ids', [])
        for sid in service_ids:
            LabOrder.all_objects.create(
                tenant=request.user.tenant,
                visit=visit,
                service_id=sid,
                ordered_by=request.user,
            )
        visit.status = 'waiting_lab'
        visit.save()
        return Response(VisitSerializer(visit).data)

    @action(detail=True, methods=['post'], url_path='send-to-pharmacy')
    def send_to_pharmacy(self, request, visit_number=None):
        visit = self.get_object()
        visit.status = 'waiting_pharmacy'
        visit.save()
        return Response(VisitSerializer(visit).data)

    @action(detail=True, methods=['post'], url_path='mark-ready-for-billing')
    def mark_ready_for_billing(self, request, visit_number=None):
        visit = self.get_object()
        visit.status = 'ready_for_billing'
        visit.save()
        return Response(VisitSerializer(visit).data)

@action(detail=True, methods=['post'], url_path='assign-doctor')
def assign_doctor(self, request, visit_number=None):
    visit = self.get_object()
    doctor_id = request.data.get('doctor')
    visit.attending_doctor_id = doctor_id
    visit.status = 'with_doctor'
    visit.save()

    # Add consultation fee if the doctor has one and it's not already billed
    doctor = visit.attending_doctor
    if doctor and doctor.consultation_fee and doctor.consultation_fee > 0:
        invoice = getattr(visit, 'invoice', None)
        if invoice:
            # Avoid duplicates
            exists = ClinicInvoiceItem.all_objects.filter(
                invoice=invoice,
                description__icontains='consultation',
            ).exists()
            if not exists:
                ClinicInvoiceItem.all_objects.create(
                    tenant=visit.tenant,
                    invoice=invoice,
                    description=f'Consultation — {doctor.user.get_full_name() or doctor.user.username}',
                    quantity=1,
                    unit_price=doctor.consultation_fee,
                )
                invoice.recalculate()
    return Response(VisitSerializer(visit).data)


# ============================================================================
# Lab Orders
# ============================================================================
class LabOrderViewSet(ClinicBaseViewSet):
    queryset = LabOrder.objects.all()
    serializer_class = LabOrderSerializer
    allowed_roles = ['admin', 'manager', 'super', 'doctor', 'nurse',
                     'midwife', 'lab_tech', 'radiologist', 'receptionist']
    write_roles = ['admin', 'manager', 'super', 'doctor', 'lab_tech', 'radiologist']

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('visit'):
            qs = qs.filter(visit_id=p['visit'])
        return qs

    def perform_create(self, serializer):
        serializer.save(ordered_by=self.request.user)

    @action(detail=True, methods=['post'])
    def complete_order(self, request, pk=None):
        order = self.get_object()
        order.findings = request.data.get('findings', '')
        order.result_summary = request.data.get('result_summary', '')
        order.status = 'completed'
        order.completed_by = request.user
        order.completed_at = timezone.now()
        order.save()
        return Response(LabOrderSerializer(order).data)

@action(detail=True, methods=['post'], url_path='send-to-lab')
def send_to_lab(self, request, visit_number=None):
    visit = self.get_object()
    service_ids = request.data.get('service_ids', [])
    invoice = getattr(visit, 'invoice', None)

    for sid in service_ids:
        service = Service.all_objects.filter(id=sid, tenant=request.user.tenant).first()
        if not service:
            continue

        LabOrder.all_objects.create(
            tenant=request.user.tenant,
            visit=visit,
            service=service,
            ordered_by=request.user,
        )

        if invoice and service.price and service.price > 0:
            ClinicInvoiceItem.all_objects.create(
                tenant=request.user.tenant,
                invoice=invoice,
                service=service,
                description=service.name,
                quantity=1,
                unit_price=service.price,
            )

    if invoice:
        invoice.recalculate()

    visit.status = 'waiting_lab'
    visit.save()
    return Response(VisitSerializer(visit).data)


# ============================================================================
# Prescriptions — pharmacists + doctors can dispense
# ============================================================================
class PrescriptionViewSet(ClinicBaseViewSet):
    queryset = Prescription.objects.all()
    serializer_class = PrescriptionSerializer
    allowed_roles = ['admin', 'manager', 'super', 'doctor', 'nurse',
                     'midwife', 'pharmacist', 'receptionist', 'cashier']
    write_roles = ['admin', 'manager', 'super', 'doctor', 'pharmacist']

    def get_queryset(self):
        qs = super().get_queryset().select_related(
            'product', 'visit', 'visit__patient', 'prescribed_by', 'dispensed_by',
        )
        p = self.request.query_params
        if p.get('visit'):
            qs = qs.filter(visit_id=p['visit'])
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        if p.get('pending') == 'true':
            qs = qs.filter(status__in=['prescribed', 'partially_dispensed'])
        return qs

    def perform_create(self, serializer):
        rx = serializer.save(prescribed_by=self.request.user)
        # When the doctor prescribes, move visit to waiting_pharmacy
        visit = rx.visit
        if visit.status in ('with_doctor', 'ready_for_billing'):
            visit.status = 'waiting_pharmacy'
            visit.save()

    @action(detail=True, methods=['post'])
    def dispense(self, request, pk=None):
        from apps.inventory.models import StockMovement

        rx = self.get_object()
        quantity_to_dispense = int(request.data.get('quantity', rx.quantity))

        if quantity_to_dispense <= 0:
            return Response({'detail': 'Quantity must be positive.'}, status=400)

        with transaction.atomic():
            # Not linked to inventory → external
            if not rx.product:
                rx.status = 'dispensed'
                rx.dispensed_by = request.user
                rx.dispensed_at = timezone.now()
                rx.save()
                try:
                    rx.visit.invoice.recalculate()
                except Exception:
                    pass
                return Response(PrescriptionSerializer(rx).data)

            product = rx.product
            if product.quantity < quantity_to_dispense:
                return Response(
                    {
                        'detail': f'Only {product.quantity} in stock, '
                                  f'{quantity_to_dispense} requested.',
                        'available': product.quantity,
                    },
                    status=400,
                )

            product.quantity -= quantity_to_dispense
            product.save()

            StockMovement.all_objects.create(
                tenant=request.user.tenant,
                product=product,
                movement_type='out',
                quantity=quantity_to_dispense,
                reference=f'RX {rx.id}',
                notes=f'Dispensed for visit {rx.visit.visit_number}',
                user=request.user,
            )

            if quantity_to_dispense >= rx.quantity:
                rx.status = 'dispensed'
            else:
                rx.status = 'partially_dispensed'
            rx.dispensed_by = request.user
            rx.dispensed_at = timezone.now()
            rx.save()

            try:
                rx.visit.invoice.recalculate()
            except Exception:
                pass

            visit = rx.visit
            pending = visit.prescriptions.filter(
                status__in=['prescribed', 'partially_dispensed']
            ).count()
            if pending == 0:
                visit.status = 'ready_for_billing'
                visit.save()

        return Response(PrescriptionSerializer(rx).data)

    @action(detail=True, methods=['post'], url_path='mark-not-available')
    def mark_not_available(self, request, pk=None):
        rx = self.get_object()
        rx.status = 'not_available'
        reason = request.data.get('reason', 'Not in stock')
        rx.notes = (rx.notes + '\n[Pharmacy] ' + reason).strip()
        rx.save()

        visit = rx.visit
        pending = visit.prescriptions.filter(
            status__in=['prescribed', 'partially_dispensed']
        ).count()
        if pending == 0:
            visit.status = 'ready_for_billing'
            visit.save()

        return Response(PrescriptionSerializer(rx).data)

    @action(detail=False, methods=['get'], url_path='queue')
    def queue(self, request):
        qs = self.get_queryset().filter(
            status__in=['prescribed', 'partially_dispensed']
        ).order_by('visit_id', 'prescribed_at')

        grouped = {}
        for rx in qs:
            key = str(rx.visit_id)
            if key not in grouped:
                grouped[key] = {
                    'visit_id': key,
                    'visit_number': rx.visit.visit_number,
                    'patient_id': str(rx.visit.patient_id),
                    'patient_name': rx.visit.patient.full_name,
                    'patient_number': rx.visit.patient.patient_number,
                    'doctor': (
                        rx.visit.attending_doctor.user.get_full_name()
                        if rx.visit.attending_doctor else ''
                    ),
                    'prescribed_at': rx.prescribed_at.isoformat(),
                    'prescriptions': [],
                }
            grouped[key]['prescriptions'].append(
                PrescriptionSerializer(rx).data
            )

        return Response(list(grouped.values()))

    @action(detail=True, methods=['get'], url_path='print-data')
    def print_data(self, request, pk=None):
        rx = self.get_object()
        visit = rx.visit
        patient = visit.patient
        shop = None
        try:
            from apps.accounts.models import GarageSettings
            shop = GarageSettings.all_objects.filter(tenant=request.user.tenant).first()
        except Exception:
            pass

        return Response({
            'clinic': {
                'name': shop.name if shop else '',
                'address': shop.address if shop else '',
                'phone': shop.phone if shop else '',
                'email': shop.email if shop else '',
                'tin': shop.tin if shop else '',
            },
            'patient': {
                'name': patient.full_name,
                'number': patient.patient_number,
                'age': patient.age,
                'gender': patient.gender,
                'phone': patient.phone,
                'allergies': patient.allergies,
                'chronic_conditions': patient.chronic_conditions,
            },
            'visit': {
                'visit_number': visit.visit_number,
                'visit_date': visit.visit_date.isoformat(),
                'visit_date_display': visit.visit_date.strftime('%d %b %Y'),
                'diagnosis': visit.diagnosis,
            },
            'doctor': {
                'name': (
                    visit.attending_doctor.user.get_full_name()
                    if visit.attending_doctor else ''
                ),
                'license': (
                    visit.attending_doctor.license_number
                    if visit.attending_doctor else ''
                ),
                'specialization': (
                    visit.attending_doctor.specialization
                    if visit.attending_doctor else ''
                ),
            },
            'prescription': {
                'id': rx.id,
                'drug_name': rx.drug_name,
                'dosage': rx.dosage,
                'frequency': rx.frequency,
                'duration': rx.duration,
                'instructions': rx.instructions,
                'quantity': rx.quantity,
                'status': rx.status,
                'status_display': rx.get_status_display(),
                'prescribed_at': rx.prescribed_at.isoformat(),
                'prescribed_at_display': rx.prescribed_at.strftime('%d %b %Y %H:%M'),
            },
            'today': timezone.localtime().strftime('%d %b %Y'),
        })


# ============================================================================
# Invoices
# ============================================================================
class ClinicInvoiceViewSet(ClinicBaseViewSet):
    queryset = ClinicInvoice.objects.all()
    serializer_class = ClinicInvoiceSerializer
    allowed_roles = ['admin', 'manager', 'super', 'cashier',
                     'accountant', 'receptionist', 'doctor']
    write_roles = ['admin', 'manager', 'super', 'cashier', 'receptionist', 'accountant']

    def get_queryset(self):
        qs = super().get_queryset().select_related('visit', 'visit__patient')
        p = self.request.query_params
        if p.get('visit'):
            qs = qs.filter(visit_id=p['visit'])
        if p.get('status'):
            qs = qs.filter(status=p['status'])
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def recalculate(self, request, pk=None):
        inv = self.get_object()
        inv.recalculate()
        return Response(ClinicInvoiceSerializer(inv).data)

    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        inv = self.get_object()

        # Coerce to Decimal — amount_paid is a DecimalField on the model
        try:
            amount = Decimal(str(request.data.get('amount', 0) or 0))
        except (InvalidOperation, TypeError, ValueError):
            return Response(
                {'amount': ['Invalid amount.']},
                status=400,
            )

        inv.amount_paid = (inv.amount_paid or Decimal('0')) + amount
        if request.data.get('payment_method'):
            inv.payment_method = request.data['payment_method']
        inv.recalculate()
        return Response(ClinicInvoiceSerializer(inv).data)


class ClinicInvoiceItemViewSet(ClinicBaseViewSet):
    queryset = ClinicInvoiceItem.objects.all()
    serializer_class = ClinicInvoiceItemSerializer
    allowed_roles = ['admin', 'manager', 'super', 'cashier',
                     'receptionist', 'doctor', 'nurse', 'accountant',]
    write_roles = ['admin', 'manager', 'super', 'cashier',
                   'receptionist', 'doctor', 'accountant']

    def get_queryset(self):
        qs = super().get_queryset()
        inv = self.request.query_params.get('invoice')
        if inv:
            qs = qs.filter(invoice_id=inv)
        return qs

    def perform_create(self, serializer):
        from apps.inventory.models import StockMovement

        with transaction.atomic():
            item = serializer.save()

            if item.service and not item.unit_price:
                item.unit_price = item.service.price
                item.description = item.service.name
                item.save()

            if item.service and not getattr(item, 'consumables_recorded', False):
                consumables = ServiceConsumable.all_objects.filter(
                    service=item.service,
                    tenant=self.request.user.tenant,
                    auto_deduct=True,
                )
                for c in consumables:
                    product = c.product
                    qty = int(float(c.quantity) * item.quantity)
                    if qty <= 0:
                        continue
                    StockMovement.all_objects.create(
                        tenant=self.request.user.tenant,
                        product=product,
                        movement_type='out',
                        quantity=qty,
                        reference=f'INV {item.invoice.invoice_number}',
                        notes=f'Auto-consumed for service: {item.service.name}',
                        user=self.request.user,
                    )
                    product.quantity -= qty
                    product.save()

                if hasattr(item, 'consumables_recorded'):
                    item.consumables_recorded = True
                    item.save()

            item.invoice.recalculate()