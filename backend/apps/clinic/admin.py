from django.contrib import admin
from .models import (
    Patient, ClinicalStaff, ServiceCategory, Service,
    Appointment, Visit, Triage, LabOrder, Prescription,
    ClinicInvoice, ClinicInvoiceItem, VisitSummary,
)


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ['patient_number', 'full_name', 'gender', 'phone', 'age', 'created_at']
    search_fields = ['first_name', 'last_name', 'patient_number', 'phone']
    list_filter = ['gender', 'blood_group']


@admin.register(ClinicalStaff)
class ClinicalStaffAdmin(admin.ModelAdmin):
    list_display = ['user', 'role', 'specialization', 'consultation_fee', 'is_available']
    list_filter = ['role', 'is_available']


@admin.register(ServiceCategory)
class ServiceCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'order']


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'category', 'price', 'is_active']
    list_filter = ['category', 'is_active']
    search_fields = ['code', 'name']


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ['patient', 'doctor', 'appointment_date', 'appointment_time', 'status']
    list_filter = ['status', 'appointment_date']


@admin.register(Visit)
class VisitAdmin(admin.ModelAdmin):
    list_display = ['visit_number', 'patient', 'attending_doctor', 'visit_date', 'status', 'priority']
    list_filter = ['status', 'priority', 'visit_date']
    search_fields = ['visit_number', 'patient__first_name', 'patient__last_name']


admin.site.register(Triage)
admin.site.register(LabOrder)


@admin.register(Prescription)
class PrescriptionAdmin(admin.ModelAdmin):
    list_display = ['drug_name', 'visit', 'quantity', 'status']
    list_filter = ['status']


class ClinicInvoiceItemInline(admin.TabularInline):
    model = ClinicInvoiceItem
    extra = 0


@admin.register(ClinicInvoice)
class ClinicInvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'visit', 'total', 'amount_paid', 'status']
    list_filter = ['status']
    inlines = [ClinicInvoiceItemInline]


admin.site.register(VisitSummary)