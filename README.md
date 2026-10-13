# Business Manager

A multi-tenant business management platform for small and medium businesses in
East Africa. One backend serves clinics, pharmacies, agro-supply shops,
garages, retail stores, restaurants, boutiques, and more — each tenant gets
only the modules their business type needs.

---

## Table of contents

- [What it does](#what-it-does)
- [Business types & features](#business-types--features)
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

## Architecture
