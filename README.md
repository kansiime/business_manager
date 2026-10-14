# Business Manager

A multi-tenant business management platform for small and medium businesses in
East Africa. One backend serves clinics, pharmacies, agro-supply shops,
garages, retail stores, restaurants, boutiques, and more — each tenant gets
only the modules their business type needs.

---

## Table of contents

- [What it does](#what-it-does)
- [Business types & features](#business-types--features)
- [Sign-up, trials & billing](#sign-up-trials--billing)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Multi-tenancy model](#multi-tenancy-model)
- [Roles](#roles)
- [Deployment](#deployment)
- [License](#license)

---

## What it does

Each tenant is one business. The platform gives them:

- **Point of sale** — record sales, take cash / mobile money / card / insurance.
- **Inventory** — products, batches, expiry, stock movements, reconciliation.
- **Purchases** — record supplier orders, receive stock into inventory.
- **Customers & debts** — customer directory, receivables, payment promises.
- **Expenses** — operating costs by category.
- **Returns** — customer and supplier returns.
- **Reports** — dashboards, financial summaries, exportable reports.
- **Clinic module** — patients, appointments, consultations, triage, lab orders,
  prescriptions, invoicing, waiting times.
- **AI analytics** — top movers, restocking suggestions, business insights.

Every feature is gated by a **feature flag** on the tenant's business type, so
a garage never sees a "New Visit" button and a clinic never sees a
"Job Cards" tab.

---

## Business types & features

The platform currently ships with these business types:

| Business type | Features enabled |
|---|---|
| **Clinic / Health Center** | inventory, sales, purchases, debts, expenses, returns, reports, customers, prescriptions, appointments, expiry, batch_tracking |
| **Drug Shop / Pharmacy** | inventory, sales, purchases, debts, expenses, returns, reports, customers, prescriptions, expiry, batch_tracking |
| **Agro / Farm Supply** | inventory, sales, purchases, debts, expenses, returns, reports, customers, expiry |
| **Grocery / Mini Mart** | inventory, sales, purchases, debts, expenses, returns, reports, customers, expiry, barcode |
| **Garage & Auto Repair** | inventory, sales, purchases, debts, expenses, returns, reports, customers, repairs, vehicles |
| **Wholesale / Distribution** | inventory, sales, purchases, debts, expenses, returns, reports, customers |
| **Hardware Store** | inventory, sales, purchases, debts, expenses, returns, reports, customers |
| **Restaurant / Café** | inventory, sales, purchases, debts, expenses, returns, reports, customers, menu, tables |
| **Salon / Barbershop** | inventory, sales, purchases, debts, expenses, returns, reports, customers, appointments |
| **Electronics / Phone Shop** | inventory, sales, purchases, debts, expenses, returns, reports, customers, barcode |
| **Boutique / Fashion** | inventory, sales, purchases, debts, expenses, returns, reports, customers, variants, barcode |
| **General Retail** | inventory, sales, purchases, debts, expenses, returns, reports, customers, barcode |

The frontend renders every page, sidebar item, dashboard widget, and
quick-action button based on the tenant's enabled features — never on a
hardcoded assumption about the business type.

---

## Sign-up, trials & billing

**Sign-up.** Anyone can create an account at `/signup`: they pick a business
type, name their business, and land in it as its admin. A person can own or
work in several businesses — `/businesses` (and the switcher at the top of the
sidebar) lists them, opens one, or creates another. Each business's data is
fully separate; the JWT carries the business the user is working in, and their
role comes from their `Membership` in that business.

**Trial.** Every new business gets a free trial of `default_trial_days`
(14 by default, editable in platform settings) with every feature its
business type includes. Owners get reminder emails 7, 3 and 1 day(s) before it
ends and on the day it ends (`manage.py send_billing_reminders`, run daily).

**After the trial.** When a trial or paid period ends, the business becomes
**read-only**: users can still sign in, view and export their records, but any
change returns `403 {code: "subscription_expired"}` and the app sends them to
`/subscription`. Nothing is deleted.

**Paying.** On `/subscription` the business admin picks Starter / Growth /
Power, monthly or yearly, and pays through Flutterwave's hosted checkout
(MTN / Airtel mobile money, card, or bank). Payment is confirmed server-side
(redirect verification and webhook, both re-checked with Flutterwave's API),
then the plan is extended by 30 or 365 days on top of any time still left.
Without Flutterwave keys, owners see manual payment instructions and the
platform admin records the payment on the business's page, which activates the
plan the same way.

| Env var | Purpose |
|---|---|
| `FLUTTERWAVE_SECRET_KEY` | Enables online payment. Leave empty for manual payments only. |
| `FLUTTERWAVE_WEBHOOK_HASH` | Secret hash set in Flutterwave → Webhooks. Webhook URL: `<backend>/api/billing/webhook/` |
| `FRONTEND_URL` | Where Flutterwave redirects after checkout (`/subscription/callback`). |
| `MANUAL_PAYMENT_INSTRUCTIONS` | Text shown when online payment is off. |

Plan prices (seeded at UGX 50k / 100k / 200k per month) can be changed by the
platform admin under Settings → Plans.

---

## Architecture
