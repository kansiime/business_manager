"""
Seed default clinic service categories and services for one tenant.

Usage:
    python manage.py seed_clinic_services
    python manage.py seed_clinic_services --tenant nk-garage-ruti-mbarara
"""
from django.core.management.base import BaseCommand, CommandError

from apps.tenants.models import Tenant
from apps.clinic.models import ServiceCategory, Service


DEFAULTS = {
    'Consultations': [
        ('CONS-GEN',      'General Consultation',      20000),
        ('CONS-SPEC',     'Specialist Consultation',   50000),
        ('CONS-FOLLOWUP', 'Follow-up Consultation',    10000),
        ('CONS-EMERG',    'Emergency Consultation',    30000),
    ],
    'Laboratory': [
        ('LAB-MALARIA', 'Malaria Test (RDT)',     5000),
        ('LAB-CBC',     'Complete Blood Count',   15000),
        ('LAB-URINE',   'Urinalysis',              8000),
        ('LAB-STOOL',   'Stool Examination',       8000),
        ('LAB-HIV',     'HIV Test',                5000),
        ('LAB-BG',      'Blood Group',             5000),
        ('LAB-GLUC',    'Blood Glucose',           6000),
        ('LAB-PREG',    'Pregnancy Test',          6000),
        ('LAB-TYPHOID', 'Typhoid Test',           10000),
        ('LAB-LFT',     'Liver Function Test',    35000),
        ('LAB-RFT',     'Renal Function Test',    35000),
    ],
    'Radiology': [
        ('RAD-XRAY-CHEST', 'Chest X-Ray',           30000),
        ('RAD-XRAY-BONE',  'Bone X-Ray',            35000),
        ('RAD-US-ABDO',    'Abdominal Ultrasound',  40000),
        ('RAD-US-OBS',     'Obstetric Ultrasound',  35000),
        ('RAD-US-PELV',    'Pelvic Ultrasound',     35000),
    ],
    'Procedures': [
        ('PROC-DRESS',  'Wound Dressing',         10000),
        ('PROC-INJ',    'Injection Administration', 5000),
        ('PROC-SUTURE', 'Suturing',                30000),
        ('PROC-IV',     'IV Fluids',               15000),
        ('PROC-CATH',   'Catheterization',         25000),
        ('PROC-NEB',    'Nebulization',            10000),
        ('PROC-EAR',    'Ear Syringing',           10000),
    ],
    'Dental': [
        ('DENT-CONS',   'Dental Consultation',     20000),
        ('DENT-CLEAN',  'Teeth Cleaning',          30000),
        ('DENT-EXTR',   'Tooth Extraction',        40000),
        ('DENT-FILL',   'Tooth Filling',           35000),
    ],
    'Maternity': [
        ('MAT-ANC',     'Antenatal Visit',         20000),
        ('MAT-PNC',     'Postnatal Visit',         20000),
        ('MAT-DEL',     'Normal Delivery',        200000),
        ('MAT-FP',      'Family Planning',         10000),
    ],
}


class Command(BaseCommand):
    help = 'Seed default clinic service categories and services.'

    def add_arguments(self, parser):
        parser.add_argument('--tenant', help='Tenant slug (defaults to first tenant)')

    def handle(self, *args, **options):
        slug = options.get('tenant')

        if slug:
            try:
                tenant = Tenant.objects.get(slug=slug)
            except Tenant.DoesNotExist:
                raise CommandError(f"Tenant '{slug}' not found.")
        else:
            tenant = Tenant.objects.first()
            if not tenant:
                raise CommandError('No tenants exist yet. Create one first.')

        self.stdout.write(f"Seeding services for tenant: {tenant.name}")

        cat_count = 0
        svc_count = 0

        for order, (cat_name, items) in enumerate(DEFAULTS.items()):
            cat, created = ServiceCategory.all_objects.get_or_create(
                tenant=tenant, name=cat_name,
                defaults={'order': order},
            )
            if created:
                cat_count += 1

            for code, name, price in items:
                _, was_created = Service.all_objects.get_or_create(
                    tenant=tenant, code=code,
                    defaults={
                        'name': name,
                        'price': price,
                        'category': cat,
                        'is_active': True,
                    },
                )
                if was_created:
                    svc_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"✓ Seeded {cat_count} new categories and {svc_count} new services."
        ))
        self.stdout.write(f"  Total categories: {ServiceCategory.all_objects.filter(tenant=tenant).count()}")
        self.stdout.write(f"  Total services:   {Service.all_objects.filter(tenant=tenant).count()}")