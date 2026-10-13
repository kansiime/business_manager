
- **One Django backend**, one PostgreSQL database.
- **Tenant isolation by tenant ID**, not separate databases — every
  tenant-scoped model carries a `tenant_id` FK and every query is filtered by
  the authenticated user's tenant.
- **JWT auth** with a `tenant_id` claim, so the backend can reject
  cross-tenant requests even before the DB query runs.
- **Feature flags** stored on the `BusinessType` model, overridable per tenant
  via `Tenant.feature_overrides`.

---

## Tech stack

**Backend**
- Python 3.13
- Django 5.0
- Django REST Framework
- djangorestframework-simplejwt
- PostgreSQL
- python-dotenv

**Frontend**
- Next.js 14 (App Router)
- React 18
- Tailwind CSS
- Recharts
- Axios

---

## Local development

### Prerequisites

- Python 3.13+
- Node.js 18+
- PostgreSQL 14+

### Backend

```bash
cd backend

python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# edit .env with your DB credentials and a fresh SECRET_KEY

# create the database if it doesn't exist
createdb business_db

python manage.py migrate
python manage.py createsuperuser
python manage.py runserver