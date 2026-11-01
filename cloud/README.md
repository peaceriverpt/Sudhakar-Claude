# ClinicFlow Cloud

The multi-tenant, cloud-hosted edition of ClinicFlow: one shared system for every clinic, every front desk and the public booking page, with staff logins, role-based access, an audit trail and strict separation between clinics.

**Demo login after seeding:** `demo@clinicflow.app` / `demo-password-123`

## What is in this edition

| Area | Features |
| --- | --- |
| Accounts | Clinic sign-up, owner / admin / front desk / practitioner roles, invitation links, multi-clinic users, sessions with 14-day expiry |
| Schedule | Day / week / list views, per-practitioner columns, location filter, click-to-book with live open times, conflict detection, status workflow |
| Patients | Profiles, alerts, tags, insurance with coverage tracking, full history, per-patient access log |
| Charting | Templates, copy-forward, draft / sign & lock, addenda, prior notes side by side |
| Billing | Checkout from the appointment, products with tax, discounts, insurer split, payments, receipts, void, A/R, CSV export |
| Intake forms | Configurable forms sent as private links; answers and typed signature saved to the chart; consent marked on file |
| Online booking | Public page per clinic (`/book/<clinic>`), first-available or chosen practitioner, calendar file |
| Wait list, Reports | As in the static edition, including PVA and prior-period comparison |
| Open API | Key-based REST API for locations, practitioners, treatments, availability, patients and appointments, with rate limiting |
| Audit log | Append-only record of who did what, when, from where, including API calls and patient form submissions |

## How clinics are kept apart

Every record carries the clinic it belongs to, and PostgreSQL **row-level security** enforces that the application can only ever read or write rows for the clinic set on the current database transaction. The application connects with a role that does not own the tables, so the policies cannot be bypassed even by a bug that forgets a filter. `npm run test:rls` proves this with seven checks, and it runs in CI.

## Run it locally

```bash
cd cloud
npm install
cp .env.example .env.local          # fill in the two database URLs and a session secret
npm run db:migrate                  # creates the schema (uses DATABASE_OWNER_URL)
npm run db:seed                     # optional: demo clinic with five locations
npm run dev                         # http://localhost:3000
```

Other scripts: `npm run test:rls` (tenant isolation), `npm run typecheck`, `npm run build`, `npm run db:reset` (development only, drops everything).

## Deploying

See [DEPLOY.md](DEPLOY.md) for a step-by-step guide that needs no coding: Supabase (Canada region) for the database and Vercel for the app. Each Vercel deploy applies new database migrations automatically (`npm run vercel-build`), and loads the demo clinic once if `SEED_DEMO=1`.

## Layout

```
cloud/
  app/            pages and API routes (Next.js App Router)
    app/          the staff application (requires login)
    book/[slug]   public booking page
    intake/[token] public intake form
    api/v1/       Open API
  components/     React components (dialogs, forms, widgets)
  lib/            database client, auth, queries, server actions, utilities
  db/migrations/  SQL schema, applied in order by scripts/migrate.ts
  scripts/        migrate, seed, reset, RLS test
```
