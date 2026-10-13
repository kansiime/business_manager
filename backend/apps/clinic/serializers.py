from rest_framework import serializers
from django.db import transaction
from django.utils import timezone

from .models import (
    Patient, ClinicalStaff, ServiceCategory, Service, ServiceConsumable,
    Appointment, Visit, Triage, LabOrder, Prescription,
    ClinicInvoice, ClinicInvoiceItem, VisitSummary,
)


# ============================================================================
# Patient
# ============================================================================
class PatientSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    age = serializers.IntegerField(read_only=True)

    class Meta:
        model = Patient
        fields = '__all__'
        read_only_fields = [
            'tenant', 'patient_number', 'created_at', 'updated_at',
        ]

    def create(self, validated_data):
        """
        Auto-assign tenant (from request) and generate patient_number.
        """
        request = self.context.get('request')
        tenant = request.user.tenant if request and request.user else None

        # Generate the next patient number for this tenant
        from django.db.models import Max
        last = Patient.all_objects.filter(tenant=tenant).order_by('-id').first()
        if last and last.patient_number:
            try:
                last_num = int(last.patient_number.split('-')[-1])
            except (ValueError, IndexError):
                last_num = 0
        else:
            last_num = 0
        next_num = last_num + 1
        patient_number = f'PT-{next_num:05d}'

        # Ensure uniqueness (in case of gaps)
        while Patient.all_objects.filter(tenant=tenant, patient_number=patient_number).exists():
            next_num += 1
            patient_number = f'PT-{next_num:05d}'

        validated_data['patient_number'] = patient_number
        validated_data['tenant'] = tenant
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # Never allow overwriting tenant or patient_number via update
        validated_data.pop('tenant', None)
        validated_data.pop('patient_number', None)
        return super().update(instance, validated_data)


# ============================================================================
# Clinical Staff
# ============================================================================
class ClinicalStaffSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    username = serializers.CharField(source='user.username', read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = ClinicalStaff
        fields = '__all__'
        read_only_fields = ['tenant', 'created_at']

    def get_user_name(self, obj):
        if not obj.user:
            return ''
        full = (obj.user.get_full_name() or '').strip()
        return full or obj.user.username


# ============================================================================
# Services
# ============================================================================
class ServiceCategorySerializer(serializers.ModelSerializer):
    service_count = serializers.SerializerMethodField()

    class Meta:
        model = ServiceCategory
        fields = '__all__'
        read_only_fields = ['tenant']

    def get_service_count(self, obj):
        return obj.services.count()


class ServiceConsumableSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_unit = serializers.CharField(source='product.unit', read_only=True)

    class Meta:
        model = ServiceConsumable
        fields = ['id', 'service', 'product', 'product_name', 'product_unit',
                  'quantity', 'auto_deduct', 'tenant']
        read_only_fields = ['tenant']


class ServiceSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    consumables = ServiceConsumableSerializer(many=True, read_only=True)

    class Meta:
        model = Service
        fields = '__all__'
        read_only_fields = ['tenant', 'created_at']


# ============================================================================
# Appointment
# ============================================================================
class AppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_number = serializers.CharField(source='patient.patient_number', read_only=True)
    patient_phone = serializers.CharField(source='patient.phone', read_only=True)
    doctor_name = serializers.CharField(source='doctor.user.get_full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Appointment
        fields = '__all__'
        read_only_fields = ['tenant', 'created_by', 'created_at', 'updated_at']


# ============================================================================
# Triage
# ============================================================================
class TriageSerializer(serializers.ModelSerializer):
    bmi = serializers.FloatField(read_only=True)
    recorded_by_name = serializers.CharField(source='recorded_by.get_full_name', read_only=True)

    class Meta:
        model = Triage
        fields = '__all__'
        read_only_fields = ['tenant', 'recorded_by', 'recorded_at']


# ============================================================================
# Lab Orders
# ============================================================================
class LabOrderSerializer(serializers.ModelSerializer):
    service_name = serializers.CharField(source='service.name', read_only=True)
    service_price = serializers.DecimalField(
        source='service.price', max_digits=12, decimal_places=2, read_only=True,
    )
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    ordered_by_name = serializers.CharField(source='ordered_by.get_full_name', read_only=True)

    class Meta:
        model = LabOrder
        fields = '__all__'
        read_only_fields = [
            'tenant', 'ordered_by', 'ordered_at', 'completed_by', 'completed_at',
        ]


# ============================================================================
# Prescription
# ============================================================================
class PrescriptionSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_available = serializers.SerializerMethodField()
    total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    visit = serializers.SlugRelatedField(
        slug_field='visit_number',
        queryset=Visit.objects.all(),
    )

    class Meta:
        model = Prescription
        fields = '__all__'
        read_only_fields = [
            'tenant', 'prescribed_by', 'prescribed_at',
            'dispensed_by', 'dispensed_at',
        ]

    def get_product_available(self, obj):
        if not obj.product:
            return False
        return obj.product.quantity >= obj.quantity


# ============================================================================
# Invoice
# ============================================================================
class ClinicInvoiceItemSerializer(serializers.ModelSerializer):
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)

    class Meta:
        model = ClinicInvoiceItem
        fields = '__all__'
        read_only_fields = ['tenant']


class ClinicInvoiceSerializer(serializers.ModelSerializer):
    items = ClinicInvoiceItemSerializer(many=True, read_only=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    visit_number = serializers.CharField(source='visit.visit_number', read_only=True)
    patient_name = serializers.CharField(source='visit.patient.full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = ClinicInvoice
        fields = '__all__'
        read_only_fields = ['tenant', 'created_by', 'created_at', 'updated_at']


# ============================================================================
# Visit (read)
# ============================================================================
class VisitSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_number = serializers.CharField(source='patient.patient_number', read_only=True)
    patient_phone = serializers.CharField(source='patient.phone', read_only=True)
    patient_gender = serializers.CharField(source='patient.gender', read_only=True)
    patient_age = serializers.IntegerField(source='patient.age', read_only=True)
    doctor_name = serializers.CharField(source='attending_doctor.user.get_full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    triage = TriageSerializer(read_only=True)
    lab_orders = LabOrderSerializer(many=True, read_only=True)
    prescriptions = PrescriptionSerializer(many=True, read_only=True)
    invoice = ClinicInvoiceSerializer(read_only=True)

    class Meta:
        model = Visit
        fields = '__all__'
        read_only_fields = [
            'tenant', 'created_by', 'created_at', 'updated_at', 'completed_at',
        ]


class VisitListSerializer(serializers.ModelSerializer):
    """Lightweight version for list views."""
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    patient_number = serializers.CharField(source='patient.patient_number', read_only=True)
    doctor_name = serializers.CharField(source='attending_doctor.user.get_full_name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Visit
        fields = [
            'id', 'visit_number', 'patient', 'patient_name', 'patient_number',
            'attending_doctor', 'doctor_name', 'visit_date', 'status',
            'status_display', 'priority', 'chief_complaint', 'created_at',
        ]


# ============================================================================
# Visit Summary
# ============================================================================
class VisitSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = VisitSummary
        fields = '__all__'
        read_only_fields = ['tenant', 'printed_by', 'created_at']


# ============================================================================
# Create Visit (custom — used by /api/clinic/visits/create-with-triage/)
# ============================================================================
class CreateVisitSerializer(serializers.Serializer):
    """One-shot: create a visit + optional triage + optional invoice."""
    patient = serializers.UUIDField()
    attending_doctor = serializers.UUIDField(required=False, allow_null=True)
    appointment = serializers.UUIDField(required=False, allow_null=True)
    chief_complaint = serializers.CharField(required=False, allow_blank=True)
    priority = serializers.ChoiceField(
        choices=['normal', 'urgent', 'emergency'], default='normal',
    )

    # Optional triage
    temperature_c = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    bp_systolic = serializers.IntegerField(required=False, allow_null=True)
    bp_diastolic = serializers.IntegerField(required=False, allow_null=True)
    pulse_bpm = serializers.IntegerField(required=False, allow_null=True)
    respiratory_rate = serializers.IntegerField(required=False, allow_null=True)
    oxygen_saturation = serializers.IntegerField(required=False, allow_null=True)
    weight_kg = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    height_cm = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, allow_null=True)
    symptoms = serializers.CharField(required=False, allow_blank=True)
    pain_scale = serializers.IntegerField(required=False, allow_null=True)

    @transaction.atomic
    def create(self, validated_data):
        from apps.clinic.models import Patient, Visit, Triage, ClinicInvoice
        request = self.context['request']
        user = request.user
        tenant = user.tenant

        try:
            patient = Patient.all_objects.get(pk=validated_data['patient'], tenant=tenant)
        except Patient.DoesNotExist:
            raise serializers.ValidationError('Patient not found.')

        # Generate visit number
        last = Visit.all_objects.filter(tenant=tenant).order_by('-id').first()
        n = (int(last.visit_number.split('-')[-1]) if last and last.visit_number else 0) + 1
        visit_number = f"VS-{timezone.localdate().strftime('%Y%m%d')}-{n:04d}"

        visit = Visit.all_objects.create(
            tenant=tenant,
            visit_number=visit_number,
            patient=patient,
            appointment_id=validated_data.get('appointment'),
            attending_doctor_id=validated_data.get('attending_doctor'),
            chief_complaint=validated_data.get('chief_complaint', ''),
            priority=validated_data.get('priority', 'normal'),
            status='waiting_doctor',
            created_by=user,
        )

        # Create triage if any vitals were provided
        triage_fields = ['temperature_c', 'bp_systolic', 'bp_diastolic',
                         'pulse_bpm', 'respiratory_rate', 'oxygen_saturation',
                         'weight_kg', 'height_cm', 'symptoms', 'pain_scale']
        triage_data = {k: validated_data.get(k) for k in triage_fields if validated_data.get(k) is not None}
        if triage_data:
            Triage.all_objects.create(
                tenant=tenant,
                visit=visit,
                recorded_by=user,
                blood_pressure_systolic=validated_data.get('bp_systolic'),
                blood_pressure_diastolic=validated_data.get('bp_diastolic'),
                **triage_data,
            )

        # Create an empty invoice
        last_inv = ClinicInvoice.all_objects.filter(tenant=tenant).order_by('-id').first()
        inv_n = (int(last_inv.invoice_number.split('-')[-1]) if last_inv and last_inv.invoice_number else 0) + 1
        ClinicInvoice.all_objects.create(
            tenant=tenant,
            invoice_number=f"INV-{timezone.localdate().strftime('%Y%m%d')}-{inv_n:04d}",
            visit=visit,
            created_by=user,
        )

        return visit


# ============================================================================
# Complete Visit (custom — auto-creates summary, marks complete)
# ============================================================================
class CompleteVisitSerializer(serializers.Serializer):
    diagnosis = serializers.CharField()
    treatment_plan = serializers.CharField(required=False, allow_blank=True)
    diagnosis_summary = serializers.CharField(required=False, allow_blank=True)
    treatment_summary = serializers.CharField(required=False, allow_blank=True)
    follow_up_date = serializers.DateField(required=False, allow_null=True)
    follow_up_notes = serializers.CharField(required=False, allow_blank=True)
    referred_to = serializers.CharField(required=False, allow_blank=True)