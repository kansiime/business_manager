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
Power, monthly or yearly, and pays per renewal with:

- **MTN Mobile Money** (direct, MTN Open API *Request to Pay*): they enter
  their MTN number, approve the PIN prompt on their phone, and the page waits
  for the result. MTN's callback, the page's polling and the
  `sync_pending_payments` job all just ask MTN for the request's status — only
  MTN's answer (with the right amount and currency) activates the plan.
  Unapproved requests expire after 30 minutes.
- **Flutterwave** hosted checkout (card, Airtel / other mobile money, bank),
  confirmed the same way via redirect verification and webhook.

- **Manual Mobile Money**: the owner sends the amount to the platform's
  number (Platform Settings → support phone), then reports it under
  *"I've paid"* with the number they paid from and the transaction ID from the
  SMS. It shows as *Awaiting confirmation* in their payment history, and the
  platform admin gets an email plus a **Payments to confirm** list on the
  platform dashboard. **Confirm** activates the plan; **Reject** needs a reason,
  which the owner sees. Either way the owner is emailed. A transaction ID can
  only be used once. The admin can also record a payment directly on the
  business's page.

A confirmed payment extends the plan by 30 or 365 days on top of any time
still left. Every provider sits behind one interface (`apps/billing/gateways.py`),
which is where pre-authorised recurring debits will plug in later.

**MTN MoMo setup**

1. Sandbox: sign up at <https://momodeveloper.mtn.com>, subscribe to
   **Collections**, then run
   `MTN_MOMO_SUBSCRIPTION_KEY=<primary key> python manage.py momo_sandbox_setup --callback-host <backend host>`
   and copy the printed values into `.env`. The sandbox only accepts EUR and
   test numbers (`46733123450` fails, `…451` rejected, `…452` expires,
   `…453` stays pending, anything else succeeds).
2. Production: after MTN Uganda merchant onboarding you get production
   credentials; set `MTN_MOMO_ENVIRONMENT=mtnuganda`,
   `MTN_MOMO_BASE_URL=https://proxy.momoapi.mtn.com` and leave
   `MTN_MOMO_CURRENCY` empty (plans are in UGX).

| Env var | Purpose |
|---|---|
| `MTN_MOMO_SUBSCRIPTION_KEY`, `MTN_MOMO_API_USER`, `MTN_MOMO_API_KEY` | Enable MTN Mobile Money. |
| `MTN_MOMO_ENVIRONMENT`, `MTN_MOMO_BASE_URL`, `MTN_MOMO_CURRENCY` | Sandbox vs production (see above). |
| `MTN_MOMO_CALLBACK_URL` | `<backend>/api/billing/momo/callback` — optional; polling works without it. |
| `FLUTTERWAVE_SECRET_KEY` | Enables card / other mobile money checkout. |
| `FLUTTERWAVE_WEBHOOK_HASH` | Secret hash set in Flutterwave → Webhooks. Webhook URL: `<backend>/api/billing/webhook/` |
| `FRONTEND_URL` | Where Flutterwave redirects after checkout (`/subscription/callback`). |
| `MANUAL_PAYMENT_INSTRUCTIONS` | Text shown when online payment is off. |

Plan prices (seeded at UGX 50k / 100k / 200k per month) can be changed by the
platform admin under Settings → Plans.

---

## Architecture
