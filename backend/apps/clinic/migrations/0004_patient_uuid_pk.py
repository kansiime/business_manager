"""
Switch Patient's primary key to a UUID.

The first databases got this change by hand: a `uuid` column was added to
clinic_patient before this migration ran, and the SQL below renamed it into
place. A fresh database has no such column, so it takes a second path that
converts the (empty) integer key directly. Either way the end schema is the
same, and the migration state records Patient.id as a UUIDField so later
`makemigrations` runs match the real database.
"""
import uuid

from django.db import migrations, models


ADD_UUID_PATIENT_FKS = """
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
"""


def forwards(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'clinic_patient' AND column_name = 'uuid'
            """
        )
        has_manual_uuid_column = cursor.fetchone() is not None

        # Drop the integer patient_id columns (and their FK constraints).
        # Both dependent tables are empty at this point in history.
        cursor.execute("ALTER TABLE clinic_visit DROP COLUMN patient_id;")
        cursor.execute("ALTER TABLE clinic_appointment DROP COLUMN patient_id;")

        if has_manual_uuid_column:
            # Original databases (unchanged from the first version of this
            # migration): the PK constraint follows the rename.
            cursor.execute("ALTER TABLE clinic_patient RENAME COLUMN uuid TO id;")
        else:
            # Fresh databases: clinic_patient is empty, convert in place.
            cursor.execute("ALTER TABLE clinic_patient ALTER COLUMN id DROP IDENTITY IF EXISTS;")
            cursor.execute("ALTER TABLE clinic_patient ALTER COLUMN id DROP DEFAULT;")
            cursor.execute(
                "ALTER TABLE clinic_patient ALTER COLUMN id TYPE uuid USING gen_random_uuid();"
            )

        cursor.execute(ADD_UUID_PATIENT_FKS)


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0003_clinicinvoiceitem_consumables_recorded'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(forwards, migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.AlterField(
                    model_name='patient',
                    name='id',
                    field=models.UUIDField(
                        default=uuid.uuid4, editable=False,
                        primary_key=True, serialize=False,
                    ),
                ),
            ],
        ),
    ]
