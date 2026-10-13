"""
Clinic-specific reports.

Everything derives from existing models:
  Visit, Triage, LabOrder, Prescription, Appointment,
  ClinicInvoice, ClinicInvoiceItem, Patient, ClinicalStaff, Service
"""
from collections import defaultdict, Counter
from datetime import timedelta, datetime
from decimal import Decimal
from statistics import mean

from django.db.models import (
    Sum, Count, Avg, Q, F, DecimalField, ExpressionWrapper,
)
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.clinic.models import (
    Visit, Triage, LabOrder, Prescription,
    Appointment, ClinicInvoice, ClinicInvoiceItem,
    Patient, ClinicalStaff, Service,
)
from apps.accounts.models import GarageSettings
from apps.debts.models import Debt
from apps.expenses.models import Expense


def _tenant(request):
    return request.user.tenant


def _range(request):
    """
    Query: ?period=today|week|month|year|custom&start=YYYY-MM-DD&end=YYYY-MM-DD
    """
    period = request.query_params.get('period', 'month')
    today = timezone.localtime().date()

    if period == 'today':
        start = end = today
    elif period == 'week':
        start = today - timedelta(days=6)
        end = today
    elif period == 'month':
        start = today.replace(day=1)
        end = today
    elif period == 'year':
        start = today.replace(month=1, day=1)
        end = today
    elif period == 'custom':
        try:
            start = datetime.strptime(request.query_params.get('start'), '%Y-%m-%d').date()
            end = datetime.strptime(request.query_params.get('end'), '%Y-%m-%d').date()
        except Exception:
            start = end = today
    else:
        start = end = today
    return start, end, period


def _shop(request):
    return GarageSettings.all_objects.filter(tenant=_tenant(request)).first()


def _line_total_expr():
    """
    InvoiceItem has no `subtotal` column — it's computed as qty * unit_price.
    """
    return ExpressionWrapper(
        F('quantity') * F('unit_price'),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )


# ============================================================================
# 1. CLINICAL REPORT
# ============================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def clinical_report(request):
    tenant = _tenant(request)
    start, end, period = _range(request)

    visits = Visit.all_objects.filter(
        tenant=tenant,
        visit_date__gte=start,
        visit_date__lte=end,
    )

    total_visits = visits.count()
    completed = visits.filter(status='completed').count()
    cancelled = visits.filter(status='cancelled').count()

    # New vs returning patients
    patients_seen = list(visits.values_list('patient_id', flat=True).distinct())
    new_patients = Patient.all_objects.filter(
        tenant=tenant,
        id__in=patients_seen,
        created_at__date__gte=start,
        created_at__date__lte=end,
    ).count()
    returning = max(len(patients_seen) - new_patients, 0)

    # Visits by day
    by_day = defaultdict(int)
    for v in visits:
        by_day[v.visit_date.isoformat()] += 1
    visits_by_day = [{'date': k, 'count': by_day[k]} for k in sorted(by_day.keys())]

    # Doctor workload
    doctor_stats = (
        visits.filter(attending_doctor__isnull=False)
        .values('attending_doctor__user__username',
                'attending_doctor__user__first_name',
                'attending_doctor__user__last_name')
        .annotate(count=Count('id'))
        .order_by('-count')
    )
    doctors = [
        {
            'name': (f"{d['attending_doctor__user__first_name'] or ''} "
                     f"{d['attending_doctor__user__last_name'] or ''}").strip()
                     or d['attending_doctor__user__username'],
            'username': d['attending_doctor__user__username'],
            'visits': d['count'],
        }
        for d in doctor_stats
    ]

    # Diagnoses — parse from Visit.diagnosis free text
    diagnoses = (
        visits.exclude(diagnosis='')
        .values('diagnosis')
        .annotate(count=Count('id'))
        .order_by('-count')[:50]
    )
    normalized = Counter()
    for d in diagnoses:
        key = (d['diagnosis'] or '').strip()[:60]
        if key:
            normalized[key] += d['count']
    top_diagnoses = [{'diagnosis': k, 'count': v}
                     for k, v in normalized.most_common(15)]

    # Average visit duration
    completed_visits = visits.filter(status='completed', completed_at__isnull=False)
    durations = []
    for v in completed_visits[:500]:
        delta = (v.completed_at - v.created_at).total_seconds() / 60
        if 0 < delta < 24 * 60:
            durations.append(delta)
    avg_duration = round(mean(durations), 1) if durations else None

    return Response({
        'period': {'start': start.isoformat(), 'end': end.isoformat(), 'label': period},
        'summary': {
            'total_visits': total_visits,
            'completed': completed,
            'cancelled': cancelled,
            'new_patients': new_patients,
            'returning_patients': returning,
            'avg_visit_minutes': avg_duration,
        },
        'visits_by_day': visits_by_day,
        'doctors': doctors,
        'top_diagnoses': top_diagnoses,
    })


# ============================================================================
# 2. LAB REPORT
# ============================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def lab_report(request):
    tenant = _tenant(request)
    start, end, period = _range(request)

    orders = LabOrder.all_objects.filter(
        tenant=tenant,
        ordered_at__date__gte=start,
        ordered_at__date__lte=end,
    )

    total = orders.count()
    completed = orders.filter(status='completed').count()
    pending = orders.filter(status__in=['ordered', 'collected', 'in_progress']).count()

    tests = (
        orders.values('service__name')
        .annotate(count=Count('id'))
        .order_by('-count')[:15]
    )
    top_tests = [
        {'test': t['service__name'] or 'Unspecified', 'count': t['count']}
        for t in tests
    ]

    completed_orders = orders.filter(status='completed', completed_at__isnull=False)
    tats = []
    for o in completed_orders[:500]:
        delta = (o.completed_at - o.ordered_at).total_seconds() / 3600
        if 0 < delta < 72:
            tats.append(delta)
    avg_tat = round(mean(tats), 1) if tats else None

    by_doctor = (
        orders.filter(ordered_by__isnull=False)
        .values('ordered_by__username')
        .annotate(count=Count('id'))
        .order_by('-count')[:10]
    )

    return Response({
        'period': {'start': start.isoformat(), 'end': end.isoformat(), 'label': period},
        'summary': {
            'total_orders': total,
            'completed': completed,
            'pending': pending,
            'avg_turnaround_hours': avg_tat,
        },
        'top_tests': top_tests,
        'by_doctor': [
            {'doctor': d['ordered_by__username'], 'orders': d['count']}
            for d in by_doctor
        ],
    })


# ============================================================================
# 3. PHARMACY REPORT (see views.py: pharmacy_reports)
# ============================================================================


# ============================================================================
# 4. FINANCIAL REPORT
# ============================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def financial_report(request):
    tenant = _tenant(request)
    start, end, period = _range(request)
    shop = _shop(request)
    currency = shop.currency_symbol if shop else 'UGX'

    invoices = ClinicInvoice.all_objects.filter(
        tenant=tenant,
        created_at__date__gte=start,
        created_at__date__lte=end,
    )

    # Totals
    total_billed = float(invoices.aggregate(t=Sum('total'))['t'] or 0)
    total_collected = float(invoices.aggregate(t=Sum('amount_paid'))['t'] or 0)
    outstanding = total_billed - total_collected

    # Payment mix
    payment_mix = (
        invoices.values('payment_method')
        .annotate(total=Sum('amount_paid'), count=Count('id'))
        .order_by('-total')
    )

    # Line-item revenue — NOTE: InvoiceItem has no `subtotal` field
    line_total = _line_total_expr()
    items = ClinicInvoiceItem.all_objects.filter(invoice__in=invoices)

    service_revenue = (
        items.values('description')
        .annotate(revenue=Sum(line_total), count=Count('id'))
        .order_by('-revenue')[:15]
    )

    # Revenue by category — Python-side because it joins via `service.category`
    cat_revenue = defaultdict(float)
    for item in items.select_related('service__category'):
        cat_name = (
            item.service.category.name
            if item.service and item.service.category
            else 'Uncategorised'
        )
        # Use Python multiplication since `subtotal` doesn't exist
        line_sum = float((item.quantity or 0) * (item.unit_price or 0))
        cat_revenue[cat_name] += line_sum
    revenue_by_category = sorted(
        [{'category': k, 'revenue': v} for k, v in cat_revenue.items()],
        key=lambda x: x['revenue'], reverse=True,
    )

    # Expenses
    expenses = Expense.all_objects.filter(
        tenant=tenant,
        expense_date__gte=start,
        expense_date__lte=end,
    )
    total_expenses = float(expenses.aggregate(t=Sum('amount'))['t'] or 0)

    return Response({
        'period': {'start': start.isoformat(), 'end': end.isoformat(), 'label': period},
        'currency': currency,
        'summary': {
            'total_billed': total_billed,
            'total_collected': total_collected,
            'outstanding': outstanding,
            'total_expenses': total_expenses,
            'net': total_collected - total_expenses,
            'invoice_count': invoices.count(),
        },
        'payment_mix': [
            {'method': p['payment_method'] or 'Unspecified',
             'total': float(p['total'] or 0),
             'count': p['count']}
            for p in payment_mix
        ],
        'service_revenue': [
            {'description': s['description'] or 'Unspecified',
             'revenue': float(s['revenue'] or 0),
             'count': s['count']}
            for s in service_revenue
        ],
        'revenue_by_category': revenue_by_category,
    })


# ============================================================================
# 5. PATIENTS REPORT
# ============================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def patients_report(request):
    tenant = _tenant(request)
    start, end, period = _range(request)

    patients = Patient.all_objects.filter(tenant=tenant)

    total = patients.count()
    male = patients.filter(gender='male').count()
    female = patients.filter(gender='female').count()

    today = timezone.localtime().date()
    age_buckets = {'0-5': 0, '6-17': 0, '18-35': 0, '36-60': 0, '60+': 0}
    for p in patients:
        if not p.date_of_birth:
            continue
        age = today.year - p.date_of_birth.year
        if (today.month, today.day) < (p.date_of_birth.month, p.date_of_birth.day):
            age -= 1
        if age <= 5:
            age_buckets['0-5'] += 1
        elif age <= 17:
            age_buckets['6-17'] += 1
        elif age <= 35:
            age_buckets['18-35'] += 1
        elif age <= 60:
            age_buckets['36-60'] += 1
        else:
            age_buckets['60+'] += 1

    appts = Appointment.all_objects.filter(
        tenant=tenant,
        appointment_date__gte=start,
        appointment_date__lte=end,
    )
    attended = appts.filter(status='completed').count()
    no_show = appts.filter(status='no_show').count()
    cancelled = appts.filter(status='cancelled').count()
    booked = appts.count()
    show_rate = round(attended / booked * 100, 1) if booked else 0

    peak_hours = Counter()
    for v in Visit.all_objects.filter(
        tenant=tenant, visit_date__gte=start, visit_date__lte=end,
    ):
        peak_hours[v.created_at.hour] += 1
    hours_list = [{'hour': f'{h:02d}:00', 'visits': peak_hours[h]}
                  for h in sorted(peak_hours.keys())]

    peak_days = Counter()
    for v in Visit.all_objects.filter(
        tenant=tenant, visit_date__gte=start, visit_date__lte=end,
    ):
        peak_days[v.visit_date.strftime('%A')] += 1
    days_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday',
                  'Friday', 'Saturday', 'Sunday']
    days_list = [{'day': d, 'visits': peak_days.get(d, 0)} for d in days_order]

    return Response({
        'period': {'start': start.isoformat(), 'end': end.isoformat(), 'label': period},
        'demographics': {
            'total': total,
            'male': male,
            'female': female,
            'age_distribution': [{'range': k, 'count': v}
                                 for k, v in age_buckets.items()],
        },
        'appointments': {
            'booked': booked,
            'attended': attended,
            'no_show': no_show,
            'cancelled': cancelled,
            'show_rate_pct': show_rate,
        },
        'peak_hours': hours_list,
        'peak_days': days_list,
    })


# ============================================================================
# 6. COMPLIANCE / REGISTERS
# ============================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def compliance_report(request):
    tenant = _tenant(request)
    start, end, period = _range(request)
    shop = _shop(request)

    visits = (
        Visit.all_objects
        .filter(tenant=tenant, visit_date__gte=start, visit_date__lte=end)
        .select_related('patient', 'attending_doctor', 'attending_doctor__user')
    )

    visit_register = [
        {
            'visit_number': v.visit_number,
            'date': v.visit_date.isoformat(),
            'patient_number': v.patient.patient_number if v.patient else '',
            'patient_name': v.patient.full_name if v.patient else '',
            'age': v.patient.age if v.patient else None,
            'gender': v.patient.gender if v.patient else '',
            'doctor': (
                v.attending_doctor.user.get_full_name()
                if v.attending_doctor and v.attending_doctor.user
                else ''
            ),
            'diagnosis': (v.diagnosis or '')[:120],
            'status': v.status,
        }
        for v in visits[:500]
    ]

    prescriptions = (
        Prescription.all_objects
        .filter(tenant=tenant,
                prescribed_at__date__gte=start,
                prescribed_at__date__lte=end)
        .select_related('visit__patient', 'prescribed_by')
    )

    prescription_register = [
        {
            'date': p.prescribed_at.date().isoformat(),
            'patient': p.visit.patient.full_name if p.visit and p.visit.patient else '',
            'drug': p.drug_name,
            'quantity': p.quantity,
            'prescribed_by': p.prescribed_by.username if p.prescribed_by else '',
            'status': p.status,
        }
        for p in prescriptions[:500]
    ]

    NOTIFIABLE = [
        'cholera', 'measles', 'polio', 'tetanus', 'rabies', 'yellow fever',
        'plague', 'meningitis', 'hepatitis', 'typhoid', 'diphtheria',
        'whooping cough', 'pertussis', 'malaria', 'tb', 'tuberculosis',
        'covid', 'ebola', 'mpox', 'anthrax', 'brucellosis',
    ]

    notifiable_hits = Counter()
    for v in visits:
        dx = (v.diagnosis or '').lower()
        for disease in NOTIFIABLE:
            if disease in dx:
                notifiable_hits[disease.title()] += 1

    return Response({
        'period': {'start': start.isoformat(), 'end': end.isoformat(), 'label': period},
        'business_name': shop.name if shop else '',
        'visit_register': visit_register,
        'prescription_register': prescription_register,
        'notifiable_diseases': [
            {'disease': k, 'cases': v}
            for k, v in notifiable_hits.most_common()
        ],
    })


# ============================================================================
# 7. WAITING TIMES
# ============================================================================
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def waiting_times_report(request):
    tenant = _tenant(request)
    start, end, period = _range(request)

    visits = (
        Visit.all_objects
        .filter(tenant=tenant, visit_date__gte=start, visit_date__lte=end)
        .select_related('triage', 'invoice')
    )

    wait_checkin_to_triage = []
    wait_triage_to_doctor = []
    wait_doctor_to_complete = []
    total_journey = []

    for v in visits:
        triage = getattr(v, 'triage', None)
        if triage:
            delta = (triage.recorded_at - v.created_at).total_seconds() / 60
            if 0 < delta < 24 * 60:
                wait_checkin_to_triage.append(delta)

        if v.completed_at:
            delta = (v.completed_at - v.created_at).total_seconds() / 60
            if 0 < delta < 24 * 60:
                total_journey.append(delta)

    def safe_mean(arr):
        return round(mean(arr), 1) if arr else None

    return Response({
        'period': {'start': start.isoformat(), 'end': end.isoformat(), 'label': period},
        'samples': visits.count(),
        'avg_checkin_to_triage_min': safe_mean(wait_checkin_to_triage),
        'avg_total_journey_min': safe_mean(total_journey),
    })