"""
Clinic / Health Center models.

Inherits TenantModel so every row is scoped to one tenant (one clinic).
"""
import uuid

from django.db import models
from django.utils import timezone

from apps.tenants.base import TenantModel


# ============================================================================
# Patients
# ============================================================================
class Patient(TenantModel):
    """A patient of the clinic. Separate from Customer (though linked)."""

    # UUID primary key — opaque, non-enumerable, safer for patient data.
    # Every FK pointing at Patient (Visit.patient, Appointment.patient, ...)
    # will automatically become a UUIDField on the next migration.
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    GENDER = [
        ('male', 'Male'),
        ('female', 'Female'),
        ('other', 'Other'),
    ]
    BLOOD_GROUPS = [
        ('A+', 'A+'), ('A-', 'A-'),
        ('B+', 'B+'), ('B-', 'B-'),
        ('AB+', 'AB+'), ('AB-', 'AB-'),
        ('O+', 'O+'), ('O-', 'O-'),
    ]

    # Identity
    patient_number = models.CharField(max_length=30, db_index=True)  # e.g. PT-0001
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=GENDER, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    national_id = models.CharField(max_length=50, blank=True)  # NIN

    # Medical
    blood_group = models.CharField(max_length=5, choices=BLOOD_GROUPS, blank=True)
    allergies = models.TextField(blank=True)
    chronic_conditions = models.TextField(blank=True)

    # Emergency contact
    emergency_contact_name = models.CharField(max_length=200, blank=True)
    emergency_contact_phone = models.CharField(max_length=30, blank=True)

    # Insurance
    insurance_provider = models.CharField(max_length=100, blank=True)
    insurance_number = models.CharField(max_length=50, blank=True)

    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('tenant', 'patient_number')]

    def __str__(self):
        return f"{self.patient_number} — {self.full_name}"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def age(self):
        if not self.date_of_birth:
            return None
        today = timezone.localtime().date()
        years = today.year - self.date_of_birth.year
        if (today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day):
            years -= 1
        return years


# ============================================================================
# Clinical Staff (doctors, nurses, lab techs, pharmacists)
# ============================================================================
class ClinicalStaff(TenantModel):
    """
    A staff member of the clinic.
    Every staff member is linked to a User account (accounts.User).
    """
    ROLE_CHOICES = [
        ('doctor', 'Doctor'),
        ('nurse', 'Nurse'),
        ('midwife', 'Midwife'),
        ('pharmacist', 'Pharmacist'),
        ('lab_tech', 'Lab Technician'),
        ('radiologist', 'Radiologist'),
        ('receptionist', 'Receptionist'),
        ('accountant', 'Accountant'),
    ]

    user = models.OneToOneField(
        'accounts.User', on_delete=models.CASCADE, related_name='clinical_staff',
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    specialization = models.CharField(max_length=100, blank=True)  # e.g. pediatrician
    license_number = models.CharField(max_length=50, blank=True)
    consultation_fee = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text='Default consultation fee for this doctor',
    )
    bio = models.TextField(blank=True)
    is_available = models.BooleanField(default=True)  # on duty
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['role', 'user__first_name']

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} ({self.get_role_display()})"


# ============================================================================
# Services catalog (X-ray, lab tests, injections, dressing, etc.)
# ============================================================================
class ServiceCategory(TenantModel):
    """e.g. 'Radiology', 'Laboratory', 'Minor Procedures', 'Consultations'"""
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'name']
        unique_together = [('tenant', 'name')]

    def __str__(self):
        return self.name


class Service(TenantModel):
    """
    A billable service the clinic offers.
    Examples: 'Chest X-Ray', 'Malaria Test', 'Full Blood Count',
              'Bandage / Dressing', 'Injection Fee', 'Ultrasound',
              'Consultation (General)', 'Consultation (Specialist)'.
    """
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=200)
    category = models.ForeignKey(
        ServiceCategory, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='services',
    )
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cost = models.DecimalField(
        max_digits=12, decimal_places=2, default=0,
        help_text='Cost to the clinic (if relevant)',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['category__order', 'name']
        unique_together = [('tenant', 'code')]

    def __str__(self):
        return f"{self.name} ({self.price})"


# ============================================================================
# Appointments
# ============================================================================
class Appointment(TenantModel):
    STATUS = [
        ('scheduled', 'Scheduled'),
        ('prescribed', 'Prescribed'),
        ('dispensed', 'Dispensed'),
        ('partially_dispensed', 'Partial'),
        ('not_available', 'Not Available'),
        ('checked_in', 'Checked In'),
        ('in_consultation', 'In Consultation'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('no_show', 'No-Show'),
    ]

    patient = models.ForeignKey(
        Patient, on_delete=models.CASCADE, related_name='appointments',
    )
    doctor = models.ForeignKey(
        ClinicalStaff, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='appointments',
        limit_choices_to={'role': 'doctor'},
    )
    appointment_date = models.DateField()
    appointment_time = models.TimeField()
    duration_minutes = models.PositiveIntegerField(default=30)
    reason = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default='scheduled')
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True,
        related_name='created_appointments',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-appointment_date', 'appointment_time']

    def __str__(self):
        return f"{self.patient.full_name} — {self.appointment_date} {self.appointment_time}"


# ============================================================================
# Visit / Consultation (one per patient visit — the master record)
# ============================================================================
class Visit(TenantModel):
    """
    A single visit by a patient. Wraps triage, consultation, lab orders,
    prescriptions, and the invoice.
    """
    STATUS = [
        ('waiting_triage', 'Waiting for Triage'),
        ('waiting_doctor', 'Waiting for Doctor'),
        ('with_doctor', 'With Doctor'),
        ('waiting_lab', 'Waiting for Lab'),
        ('waiting_pharmacy', 'Waiting for Pharmacy'),
        ('ready_for_billing', 'Ready for Billing'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    PRIORITY = [
        ('normal', 'Normal'),
        ('urgent', 'Urgent'),
        ('emergency', 'Emergency'),
    ]

    visit_number = models.CharField(max_length=30, db_index=True)  # e.g. VS-20261004-0001
    patient = models.ForeignKey(
        Patient, on_delete=models.CASCADE, related_name='visits',
    )
    appointment = models.ForeignKey(
        Appointment, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='visits',
    )
    attending_doctor = models.ForeignKey(
        ClinicalStaff, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='visits_as_doctor',
        limit_choices_to={'role': 'doctor'},
    )
    visit_date = models.DateField(default=timezone.localdate)
    status = models.CharField(max_length=30, choices=STATUS, default='waiting_triage')
    priority = models.CharField(max_length=20, choices=PRIORITY, default='normal')

    chief_complaint = models.TextField(blank=True)
    diagnosis = models.TextField(blank=True)
    treatment_plan = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True,
        related_name='created_visits',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('tenant', 'visit_number')]

    def __str__(self):
        return f"{self.visit_number} — {self.patient.full_name}"


# ============================================================================
# Triage (vitals recorded by nurse)
# ============================================================================
class Triage(TenantModel):
    visit = models.OneToOneField(
        Visit, on_delete=models.CASCADE, related_name='triage',
    )
    # Vitals
    temperature_c = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    blood_pressure_systolic = models.PositiveIntegerField(null=True, blank=True)
    blood_pressure_diastolic = models.PositiveIntegerField(null=True, blank=True)
    pulse_bpm = models.PositiveIntegerField(null=True, blank=True)
    respiratory_rate = models.PositiveIntegerField(null=True, blank=True)
    oxygen_saturation = models.PositiveIntegerField(null=True, blank=True)  # SpO2 %
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    height_cm = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    # Symptoms
    symptoms = models.TextField(blank=True)
    pain_scale = models.PositiveIntegerField(null=True, blank=True)  # 0–10

    # Nurse
    recorded_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True,
        related_name='triage_records',
    )
    recorded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Triage for {self.visit.visit_number}"

    @property
    def bmi(self):
        if not self.weight_kg or not self.height_cm:
            return None
        h = float(self.height_cm) / 100
        return round(float(self.weight_kg) / (h * h), 1)


# ============================================================================
# Lab / Radiology Orders
# ============================================================================
class LabOrder(TenantModel):
    """
    A request for a lab test or imaging study.
    Uses `Service` entries from categories 'Laboratory' or 'Radiology'.
    """
    STATUS = [
        ('ordered', 'Ordered'),
        ('collected', 'Sample Collected'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    visit = models.ForeignKey(
        Visit, on_delete=models.CASCADE, related_name='lab_orders',
    )
    service = models.ForeignKey(
        Service, on_delete=models.PROTECT, related_name='lab_orders',
    )
    status = models.CharField(max_length=20, choices=STATUS, default='ordered')
    priority = models.CharField(max_length=20, default='normal')

    # Result
    findings = models.TextField(blank=True)
    result_file = models.FileField(upload_to='lab_results/', null=True, blank=True)
    result_summary = models.TextField(blank=True)

    ordered_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True,
        related_name='lab_orders_created',
    )
    completed_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='lab_orders_completed',
    )
    ordered_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-ordered_at']

    def __str__(self):
        return f"{self.service.name} — {self.visit.visit_number}"


# ============================================================================
# Prescriptions (drugs prescribed to a visit)
# ============================================================================
class Prescription(TenantModel):
    """
    A prescribed medicine for a visit. May pull from Inventory or be an
    external/"not available" drug.
    """
    STATUS = [
        ('prescribed', 'Prescribed'),
        ('dispensed', 'Dispensed'),
        ('partially_dispensed', 'Partially Dispensed'),
        ('not_available', 'Not Available — Refer'),
        ('cancelled', 'Cancelled'),
    ]

    visit = models.ForeignKey(
        Visit, on_delete=models.CASCADE, related_name='prescriptions',
    )
    # Optional link to inventory product
    product = models.ForeignKey(
        'inventory.Product', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='prescriptions',
    )
    # Free-text name (used when there's no inventory link or drug is external)
    drug_name = models.CharField(max_length=200)

    dosage = models.CharField(max_length=100, blank=True)     # e.g. "500mg"
    frequency = models.CharField(max_length=100, blank=True)  # e.g. "3x daily"
    duration = models.CharField(max_length=100, blank=True)   # e.g. "5 days"
    instructions = models.TextField(blank=True)

    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    status = models.CharField(max_length=30, choices=STATUS, default='prescribed')
    notes = models.TextField(blank=True)

    prescribed_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True,
        related_name='prescriptions_written',
    )
    dispensed_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='prescriptions_dispensed',
    )
    prescribed_at = models.DateTimeField(auto_now_add=True)
    dispensed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-prescribed_at']

    def __str__(self):
        return f"{self.drug_name} x {self.quantity}"

    @property
    def total(self):
        return self.quantity * self.unit_price


# ============================================================================
# Clinic Invoice (one per visit)
# ============================================================================
class ClinicInvoice(TenantModel):
    STATUS = [
        ('open', 'Open'),
        ('partial', 'Partially Paid'),
        ('paid', 'Paid'),
        ('cancelled', 'Cancelled'),
    ]
    PAYMENT_METHODS = [
        ('cash', 'Cash'),
        ('mobile', 'Mobile Money'),
        ('card', 'Card'),
        ('insurance', 'Insurance'),
        ('credit', 'Credit (Unpaid)'),
    ]

    invoice_number = models.CharField(max_length=30, db_index=True)  # e.g. INV-20261004-0001
    visit = models.OneToOneField(
        Visit, on_delete=models.CASCADE, related_name='invoice',
    )
    status = models.CharField(max_length=20, choices=STATUS, default='open')
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS, default='cash')

    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    insurance_provider = models.CharField(max_length=100, blank=True)
    insurance_number = models.CharField(max_length=50, blank=True)

    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True,
        related_name='invoices_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('tenant', 'invoice_number')]

    def __str__(self):
        return f"{self.invoice_number} — {self.total}"

    @property
    def balance(self):
        return self.total - self.amount_paid

    def recalculate(self, save=True):
        """Sum items + prescriptions, subtract discount."""
        items_total = sum(i.subtotal for i in self.items.all())
        rx_total = sum(p.total for p in self.visit.prescriptions.exclude(status='cancelled'))
        self.subtotal = items_total + rx_total
        self.total = self.subtotal - self.discount
        if self.amount_paid >= self.total:
            self.status = 'paid'
        elif self.amount_paid > 0:
            self.status = 'partial'
        else:
            self.status = 'open'
        if save:
            self.save()
        return self.total


class ClinicInvoiceItem(TenantModel):
    """
    A line on a clinic invoice — usually a Service, but can also be a
    custom line (e.g. ambulance fee).
    """
    invoice = models.ForeignKey(
        ClinicInvoice, on_delete=models.CASCADE, related_name='items',
    )
    service = models.ForeignKey(
        Service, on_delete=models.SET_NULL, null=True, blank=True,
    )
    description = models.CharField(max_length=200)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.CharField(max_length=200, blank=True)

    # ─── NEW FIELD ───
    consumables_recorded = models.BooleanField(
        default=False,
        help_text='True once linked service consumables have been deducted',
    )

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.description} x {self.quantity}"

    @property
    def subtotal(self):
        return self.quantity * self.unit_price


# ============================================================================
# Discharge / Visit Summary
# ============================================================================
class VisitSummary(TenantModel):
    """
    The final printout for a visit. Generated when the doctor completes
    the visit or the patient is discharged.
    """
    visit = models.OneToOneField(
        Visit, on_delete=models.CASCADE, related_name='summary',
    )
    diagnosis_summary = models.TextField(blank=True)
    treatment_summary = models.TextField(blank=True)
    follow_up_date = models.DateField(null=True, blank=True)
    follow_up_notes = models.TextField(blank=True)
    referred_to = models.CharField(max_length=200, blank=True)  # external facility
    printed_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

class ServiceConsumable(TenantModel):
    """
    A product consumed when a service is billed.
    Example: performing a Chest X-Ray consumes 1 X-ray film + 1 pair of gloves.
    """
    service = models.ForeignKey(
        Service, on_delete=models.CASCADE, related_name='consumables',
    )
    product = models.ForeignKey(
        'inventory.Product', on_delete=models.PROTECT,
        related_name='service_consumables',
    )
    quantity = models.DecimalField(
        max_digits=10, decimal_places=2, default=1,
        help_text='How much of this product is consumed per service unit',
    )
    auto_deduct = models.BooleanField(
        default=True,
        help_text='If true, stock is deducted when the service is billed',
    )

    class Meta:
        unique_together = [('service', 'product')]
        ordering = ['service', 'product']

    def __str__(self):
        return f"{self.service.name} → {self.product.name} x{self.quantity}"