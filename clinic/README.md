# ClinicFlow — clinic management for multi-location wellness practices

A browser-based practice management app in the spirit of Jane App: scheduling,
patient records, charting, billing, online booking and reports, built for
clinics with several locations and many practitioners.

No install, no server, no coding: it is plain HTML, CSS and JavaScript and
runs from GitHub Pages (or by opening `index.html`).

## Open it

- **Staff app:** `clinic/index.html` → `https://<your-username>.github.io/<repo>/clinic/`
- **Patient online booking:** `clinic/book.html` → `…/clinic/book.html`

It loads with realistic demo data for five clinics so you can explore. When you
are ready to use it for real, go to **Settings → Start fresh** (keeps your
locations, staff and services; erases demo patients and visits).

## What it does

| Area | Features |
| --- | --- |
| **Schedule** | Day / week / list views, one column per practitioner, location filter, click an open slot to book, colour by practitioner, live "now" line, conflict and off-shift warnings, online bookings flagged 🌐 |
| **Appointments** | Statuses: booked → arrived → in progress → completed / no-show / cancelled, reschedule, notes, book next visit, delete |
| **Patients** | Profiles, demographics, alerts (allergies etc.), tags, insurance (coverage % and annual max with usage bar), referral source, consent on file, full history, quick filters (owing, lapsed, no-shows, unsigned charts), CSV export |
| **Charting** | Templates (SOAP, Physio initial assessment, Massage, Chiro — add your own), copy-forward from last note, save draft, sign & lock, addenda, previous notes side by side, print |
| **Billing** | Check out from the appointment, treatments + retail products, GST on taxable items, discounts, insurer direct-billing split, multiple payment methods, partial payments, insurer payments, receipts (print / email), void, outstanding A/R, CSV export |
| **Online booking** | Patient picks clinic → service → practitioner (or "first available") → real-time open slots → details → confirmation + add-to-calendar; returning patients are matched by email/phone |
| **Wait list** | Track patients wanting earlier slots and book them in one click |
| **Reports** | Revenue billed / collected / outstanding, visits, **PVA (visits ÷ assessments)**, new patients, no-show and cancellation rates, rebooking rate, average invoice, daily revenue chart, revenue by location and practitioner, visits by discipline, payments by method, referral sources, per-practitioner table. Comparison against the prior period. |
| **Staff & services** | Practitioners with disciplines, credentials, colours, locations and weekly shifts; treatments (duration, price, assessment flag, online flag); retail products; chart templates |
| **Settings** | Business name, tax, invoice numbering, clinic hours, booking window, cancellation policy, locations, backup / restore (JSON), reset to demo, start fresh |

Use the **location dropdown** in the top bar to focus any screen on one clinic
or see all five at once. `Ctrl/Cmd + K` jumps to patient search.

## Where the data lives (important)

This edition stores everything in the browser's local storage on the device
you use. That means:

- It works offline and instantly, and nothing leaves your computer.
- Staff on **other computers do not see the same data**, and the online booking
  page only shares data with the staff app when opened in the same browser.
- **Download a backup regularly** (Settings → Download backup). Clearing
  browser data will erase the app's data.

Connecting the app to a shared cloud database (so all five clinics, the front
desks and the public booking page share one live database with logins) is the
natural next step and does not require changing how the screens work.

## Files

```
clinic/
  index.html   staff application shell
  app.js       screens, dialogs and actions
  store.js     data model, demo data, availability & reporting logic
  book.html    patient booking page
  book.js      booking flow
  styles.css   styling (desktop + phone)
```
