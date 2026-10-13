from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    PatientViewSet, ClinicalStaffViewSet,
    ServiceCategoryViewSet, ServiceViewSet, ServiceConsumableViewSet,
    AppointmentViewSet, VisitViewSet,
    LabOrderViewSet, PrescriptionViewSet,
    ClinicInvoiceViewSet, ClinicInvoiceItemViewSet,
)

router = DefaultRouter()
router.register('patients', PatientViewSet, basename='patients')
router.register('staff', ClinicalStaffViewSet, basename='staff')
router.register('service-categories', ServiceCategoryViewSet, basename='service-categories')
router.register('services', ServiceViewSet, basename='services')
router.register('service-consumables', ServiceConsumableViewSet, basename='service-consumables')
router.register('appointments', AppointmentViewSet, basename='appointments')
router.register('visits', VisitViewSet, basename='visits')
router.register('lab-orders', LabOrderViewSet, basename='lab-orders')
router.register('prescriptions', PrescriptionViewSet, basename='prescriptions')
router.register('invoices', ClinicInvoiceViewSet, basename='invoices')
router.register('invoice-items', ClinicInvoiceItemViewSet, basename='invoice-items')

urlpatterns = router.urls