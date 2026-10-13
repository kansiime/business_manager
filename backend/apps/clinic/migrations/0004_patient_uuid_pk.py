from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0003_clinicinvoiceitem_consumables_recorded'),
    ]

    operations = [
        # 1. Rename clinic_patient.uuid -> clinic_patient.id.
        #    The existing PK constraint automatically follows the rename.
        migrations.RunSQL(
            sql="""
                ALTER TABLE clinic_patient
                RENAME COLUMN uuid TO id;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),

        # 2. Drop the orphaned integer patient_id columns.
        #    Both dependent tables are empty, so this is safe.
        migrations.RunSQL(
            sql="""
                ALTER TABLE clinic_visit DROP COLUMN patient_id;
                ALTER TABLE clinic_appointment DROP COLUMN patient_id;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),

        # 3. Add the new UUID patient_id columns and FK constraints.
        migrations.RunSQL(
            sql="""
                ALTER TABLE clinic_visit
                ADD COLUMN patient_id uuid NOT NULL;

                ALTER TABLE clinic_appointment
                ADD COLUMN patient_id uuid NOT NULL;

                ALTER TABLE clinic_visit
                ADD CONSTRAINT clinic_visit_patient_id_fk
                FOREIGN KEY (patient_id) REFERENCES clinic_patient(id)
                ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

                ALTER TABLE clinic_appointment
                ADD CONSTRAINT clinic_appointment_patient_id_fk
                FOREIGN KEY (patient_id) REFERENCES clinic_patient(id)
                ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]