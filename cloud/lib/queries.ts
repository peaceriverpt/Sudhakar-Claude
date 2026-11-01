import 'server-only';
import type { Tx } from './db';
import { addDaysKey, localToUtc, weekdayOfKey, dateKey, invoiceTotals, type InvoiceItem } from './util';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

export type Location = { id: string; name: string; address: string; phone: string; color: string; timezone: string; active: boolean };
export type Practitioner = { id: string; name: string; title: string; discipline: string; color: string; email: string; phone: string; bio: string; online: boolean; active: boolean; user_id: string | null; locationIds: string[]; treatmentIds: string[]; shifts: Shift[] };
export type Shift = { id: string; practitioner_id: string; location_id: string; weekday: number; start_min: number; end_min: number };
export type Treatment = { id: string; name: string; discipline: string; duration_min: number; price_cents: number; taxable: boolean; is_assessment: boolean; online: boolean; active: boolean };
export type Product = { id: string; name: string; price_cents: number; taxable: boolean; active: boolean };
export type Template = { id: string; name: string; discipline: string; sections: { key: string; label: string; placeholder: string }[]; active: boolean };

export async function getLocations(tx: Tx): Promise<Location[]> { return tx`select * from locations where active order by name` as any; }
export async function getTreatments(tx: Tx, all = false): Promise<Treatment[]> { return tx`select * from treatments where ${all ? tx`true` : tx`active`} order by discipline, sort_order, name` as any; }
export async function getProducts(tx: Tx, all = false): Promise<Product[]> { return tx`select * from products where ${all ? tx`true` : tx`active`} order by name` as any; }
export async function getTemplates(tx: Tx): Promise<Template[]> { return tx`select * from chart_templates where active order by discipline, name` as any; }
export async function getPractitioners(tx: Tx, includeInactive = false): Promise<Practitioner[]> {
  const prs: Row[] = await tx`select * from practitioners where ${includeInactive ? tx`true` : tx`active`} order by name`;
  const locs: Row[] = await tx`select practitioner_id, location_id from practitioner_locations`;
  const txs: Row[] = await tx`select practitioner_id, treatment_id from practitioner_treatments`;
  const shifts: Row[] = await tx`select * from shifts order by weekday, start_min`;
  return prs.map((p) => ({ ...p, locationIds: locs.filter((l) => l.practitioner_id === p.id).map((l) => l.location_id), treatmentIds: txs.filter((t) => t.practitioner_id === p.id).map((t) => t.treatment_id), shifts: shifts.filter((s) => s.practitioner_id === p.id) })) as Practitioner[];
}

/* ---------- appointments ---------- */
export type Appt = { id: string; patient_id: string; practitioner_id: string; location_id: string; treatment_id: string; starts_at: Date; ends_at: Date; status: string; notes: string; source: string; patient_name: string; patient_phone: string; patient_alerts: string; treatment_name: string; practitioner_name: string; practitioner_color: string; location_name: string; chart_id: string | null; chart_signed: boolean | null; invoice_id: string | null; invoice_number: string | null; invoice_total: number | null; invoice_paid: number | null };
const apptSelect = (tx: Tx) => tx`select a.*, p.first_name || ' ' || p.last_name as patient_name, p.phone as patient_phone, p.alerts as patient_alerts, t.name as treatment_name, pr.name as practitioner_name, pr.color as practitioner_color, l.name as location_name,
  c.id as chart_id, c.signed as chart_signed, i.id as invoice_id, i.number as invoice_number, i.total_cents as invoice_total, (select coalesce(sum(amount_cents),0) from payments where invoice_id = i.id)::int as invoice_paid
  from appointments a join patients p on p.id = a.patient_id join treatments t on t.id = a.treatment_id join practitioners pr on pr.id = a.practitioner_id join locations l on l.id = a.location_id
  left join charts c on c.appointment_id = a.id left join invoices i on i.appointment_id = a.id and not i.voided`;
export async function appointmentsBetween(tx: Tx, from: Date, to: Date, f: { locationId?: string | null; practitionerId?: string | null } = {}): Promise<Appt[]> {
  return tx`${apptSelect(tx)} where a.starts_at >= ${from} and a.starts_at < ${to} ${f.locationId ? tx`and a.location_id = ${f.locationId}` : tx``} ${f.practitionerId ? tx`and a.practitioner_id = ${f.practitionerId}` : tx``} order by a.starts_at` as any;
}
export async function appointmentsOnDay(tx: Tx, key: string, tz: string, f: { locationId?: string | null; practitionerId?: string | null } = {}) { return appointmentsBetween(tx, localToUtc(key, 0, tz), localToUtc(addDaysKey(key, 1), 0, tz), f); }
export async function getAppointment(tx: Tx, id: string): Promise<Appt | null> { const r: Row[] = await tx`${apptSelect(tx)} where a.id = ${id}`; return (r[0] as Appt) ?? null; }
export async function patientAppointments(tx: Tx, patientId: string): Promise<Appt[]> { return tx`${apptSelect(tx)} where a.patient_id = ${patientId} order by a.starts_at desc` as any; }
export async function conflicts(tx: Tx, practitionerId: string, start: Date, end: Date, ignoreId?: string | null): Promise<Row[]> {
  return tx`select a.id, a.starts_at, p.first_name || ' ' || p.last_name as patient_name from appointments a join patients p on p.id = a.patient_id where a.practitioner_id = ${practitionerId} and a.status <> 'cancelled' and a.starts_at < ${end} and a.ends_at > ${start} ${ignoreId ? tx`and a.id <> ${ignoreId}` : tx``}`;
}
/** Open start times (minutes of day) for a practitioner at a location on a clinic-local date. */
export async function availability(tx: Tx, practitionerId: string, locationId: string | null, key: string, durationMin: number, tz: string, opts: { step?: number; ignoreId?: string | null; includePast?: boolean } = {}) {
  const step = opts.step ?? 15; const weekday = weekdayOfKey(key);
  const shifts: Row[] = await tx`select * from shifts where practitioner_id = ${practitionerId} and weekday = ${weekday} ${locationId ? tx`and location_id = ${locationId}` : tx``}`;
  if (!shifts.length) return [] as { min: number; locationId: string }[];
  const dayStart = localToUtc(key, 0, tz), dayEnd = localToUtc(addDaysKey(key, 1), 0, tz);
  const busy: Row[] = await tx`select starts_at, ends_at from appointments where practitioner_id = ${practitionerId} and status <> 'cancelled' and starts_at < ${dayEnd} and ends_at > ${dayStart} ${opts.ignoreId ? tx`and id <> ${opts.ignoreId}` : tx``}`;
  const now = Date.now(); const out: { min: number; locationId: string }[] = [];
  for (const sh of shifts) for (let m = sh.start_min; m + durationMin <= sh.end_min; m += step) {
    const st = localToUtc(key, m, tz); const en = new Date(st.getTime() + durationMin * 60000);
    if (!opts.includePast && st.getTime() < now) continue;
    if (busy.some((b) => new Date(b.starts_at) < en && new Date(b.ends_at) > st)) continue;
    out.push({ min: m, locationId: sh.location_id });
  }
  return out;
}

/* ---------- patients ---------- */
export type Patient = Row & { insurers: Row[] };
export async function getPatient(tx: Tx, id: string): Promise<Patient | null> {
  const r: Row[] = await tx`select * from patients where id = ${id}`; if (!r.length) return null;
  const insurers: Row[] = await tx`select * from patient_insurers where patient_id = ${id} order by sort_order`;
  return { ...r[0], insurers } as Patient;
}
export async function searchPatients(tx: Tx, q: string, filter: string, locationId: string | null, limit = 300): Promise<Row[]> {
  const like = `%${q.trim()}%`;
  return tx`select p.*, 
      (select max(starts_at) from appointments a where a.patient_id = p.id and a.status = 'completed') as last_visit,
      (select min(starts_at) from appointments a where a.patient_id = p.id and a.starts_at > now() and a.status in ('booked','arrived')) as next_visit,
      (select coalesce(sum(i.total_cents),0) - coalesce(sum((select coalesce(sum(amount_cents),0) from payments where invoice_id = i.id)),0) from invoices i where i.patient_id = p.id and not i.voided)::int as balance_cents,
      (select company from patient_insurers where patient_id = p.id order by sort_order limit 1) as insurer
    from patients p
    where ${q ? tx`(p.first_name || ' ' || p.last_name ilike ${like} or p.last_name || ', ' || p.first_name ilike ${like} or p.email ilike ${like} or p.phone ilike ${like} or p.health_number ilike ${like})` : tx`true`}
      ${locationId ? tx`and (p.home_location_id = ${locationId} or exists (select 1 from appointments a where a.patient_id = p.id and a.location_id = ${locationId}))` : tx``}
      ${filter === 'balance' ? tx`and exists (select 1 from invoices i where i.patient_id = p.id and not i.voided and i.total_cents > (select coalesce(sum(amount_cents),0) from payments where invoice_id = i.id))` : tx``}
      ${filter === 'new' ? tx`and p.created_at > now() - interval '30 days'` : tx``}
      ${filter === 'noshow' ? tx`and exists (select 1 from appointments a where a.patient_id = p.id and a.status = 'no_show' and a.starts_at > now() - interval '7 days')` : tx``}
      ${filter === 'unsigned' ? tx`and exists (select 1 from charts c where c.patient_id = p.id and not c.signed)` : tx``}
      ${filter === 'inactive' ? tx`and exists (select 1 from appointments a where a.patient_id = p.id and a.status = 'completed') and not exists (select 1 from appointments a where a.patient_id = p.id and a.starts_at > now() - interval '60 days')` : tx``}
    order by p.last_name, p.first_name limit ${limit}`;
}
export async function quickSearch(tx: Tx, q: string): Promise<Row[]> { const like = `%${q.trim()}%`; return tx`select id, first_name, last_name, phone, dob, email from patients where first_name || ' ' || last_name ilike ${like} or email ilike ${like} or phone ilike ${like} order by last_name, first_name limit 10`; }
export async function patientBalance(tx: Tx, patientId: string): Promise<number> { const r: Row[] = await tx`select (coalesce(sum(i.total_cents),0) - coalesce(sum((select coalesce(sum(amount_cents),0) from payments where invoice_id = i.id)),0))::int as b from invoices i where i.patient_id = ${patientId} and not i.voided`; return r[0]?.b ?? 0; }

/* ---------- charts ---------- */
export type Chart = Row;
export async function getChart(tx: Tx, id: string): Promise<Chart | null> { const r: Row[] = await tx`select c.*, pr.name as practitioner_name, l.name as location_name from charts c join practitioners pr on pr.id = c.practitioner_id left join locations l on l.id = c.location_id where c.id = ${id}`; return r[0] ?? null; }
export async function patientCharts(tx: Tx, patientId: string): Promise<Chart[]> { return tx`select c.*, pr.name as practitioner_name, l.name as location_name from charts c join practitioners pr on pr.id = c.practitioner_id left join locations l on l.id = c.location_id where c.patient_id = ${patientId} order by c.service_date desc`; }

/* ---------- invoices ---------- */
export type Invoice = Row & { payments: Row[]; paid_cents: number; balance_cents: number; status: 'paid' | 'partial' | 'unpaid' | 'void' };
const decorate = (inv: Row, payments: Row[]): Invoice => { const paid = payments.reduce((s, p) => s + p.amount_cents, 0); const bal = inv.total_cents - paid; return { ...inv, payments, paid_cents: paid, balance_cents: bal, status: inv.voided ? 'void' : bal <= 0 ? 'paid' : bal < inv.total_cents ? 'partial' : 'unpaid' }; };
export async function getInvoice(tx: Tx, id: string): Promise<Invoice | null> {
  const r: Row[] = await tx`select i.*, p.first_name || ' ' || p.last_name as patient_name, p.email as patient_email, p.address as patient_address, p.city as patient_city, p.phone as patient_phone, pr.name as practitioner_name, pr.title as practitioner_title, l.name as location_name, l.address as location_address, l.phone as location_phone from invoices i join patients p on p.id = i.patient_id left join practitioners pr on pr.id = i.practitioner_id left join locations l on l.id = i.location_id where i.id = ${id}`;
  if (!r.length) return null;
  const payments: Row[] = await tx`select * from payments where invoice_id = ${id} order by paid_at`;
  return decorate(r[0], payments);
}
export async function listInvoices(tx: Tx, f: { from?: Date; to?: Date; locationId?: string | null; patientId?: string | null; owing?: boolean; status?: string; limit?: number }): Promise<Invoice[]> {
  const rows: Row[] = await tx`select i.*, p.first_name || ' ' || p.last_name as patient_name, pr.name as practitioner_name, l.name as location_name,
      coalesce((select json_agg(pm order by pm.paid_at) from payments pm where pm.invoice_id = i.id), '[]'::json) as payments
    from invoices i join patients p on p.id = i.patient_id left join practitioners pr on pr.id = i.practitioner_id left join locations l on l.id = i.location_id
    where true ${f.from ? tx`and i.issued_at >= ${f.from}` : tx``} ${f.to ? tx`and i.issued_at < ${f.to}` : tx``} ${f.locationId ? tx`and i.location_id = ${f.locationId}` : tx``} ${f.patientId ? tx`and i.patient_id = ${f.patientId}` : tx``}
      ${f.owing ? tx`and not i.voided and i.total_cents > (select coalesce(sum(amount_cents),0) from payments where invoice_id = i.id)` : tx``}
    order by i.issued_at desc limit ${f.limit ?? 500}`;
  const out = rows.map((r) => decorate(r, r.payments));
  return f.status && f.status !== 'all' ? out.filter((i) => i.status === f.status) : out;
}
export async function nextInvoiceNumber(tx: Tx, orgId: string, prefix: string) {
  const r: Row[] = await tx`insert into invoice_counters (org_id) values (${orgId}) on conflict (org_id) do update set next_number = invoice_counters.next_number + 1 returning next_number`;
  return prefix + (r[0].next_number);
}
export const computeInvoice = (items: InvoiceItem[], discountCents: number, taxRateBp: number) => invoiceTotals(items, discountCents, taxRateBp);

/* ---------- reports ---------- */
export async function report(tx: Tx, fromKey: string, toKey: string, tz: string, locationId: string | null) {
  const from = localToUtc(fromKey, 0, tz), to = localToUtc(addDaysKey(toKey, 1), 0, tz);
  const loc = locationId ? tx`and location_id = ${locationId}` : tx``;
  const appts: Row[] = await tx`select a.*, t.is_assessment, pr.discipline from appointments a join treatments t on t.id = a.treatment_id join practitioners pr on pr.id = a.practitioner_id where a.starts_at >= ${from} and a.starts_at < ${to} ${locationId ? tx`and a.location_id = ${locationId}` : tx``}`;
  const invs: Row[] = await tx`select i.*, (select coalesce(sum(amount_cents),0) from payments where invoice_id = i.id)::int as paid_cents from invoices i where not i.voided and i.issued_at >= ${from} and i.issued_at < ${to} ${locationId ? tx`and i.location_id = ${locationId}` : tx``}`;
  const pays: Row[] = await tx`select pm.method, sum(pm.amount_cents)::int as cents from payments pm join invoices i on i.id = pm.invoice_id where not i.voided and pm.paid_at >= ${from} and pm.paid_at < ${to} ${locationId ? tx`and i.location_id = ${locationId}` : tx``} group by pm.method`;
  const newPatients: Row[] = await tx`select referred_by from patients where created_at >= ${from} and created_at < ${to} ${locationId ? tx`and home_location_id = ${locationId}` : tx``}`;
  const completed = appts.filter((a) => a.status === 'completed'); const noShows = appts.filter((a) => a.status === 'no_show'); const cancelled = appts.filter((a) => a.status === 'cancelled');
  const assessments = completed.filter((a) => a.is_assessment);
  const rebookedIds = completed.length ? await tx`select distinct a.id from appointments a where a.id in ${tx(completed.map((c) => c.id))} and exists (select 1 from appointments b where b.patient_id = a.patient_id and b.id <> a.id and b.starts_at > a.starts_at and b.starts_at < a.starts_at + interval '45 days' and b.status <> 'cancelled')` : [];
  const group = (arr: Row[], key: (r: Row) => string, val?: (r: Row) => number) => { const m: Record<string, number> = {}; arr.forEach((r) => { const k = key(r); m[k] = (m[k] || 0) + (val ? val(r) : 1); }); return m; };
  const revenue = invs.reduce((s, i) => s + i.total_cents, 0), collected = invs.reduce((s, i) => s + Math.min(i.paid_cents, i.total_cents), 0);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    visits: completed.length, noShows: noShows.length, cancelled: cancelled.length, assessments: assessments.length, newPatients: newPatients.length, invoices: invs.length,
    revenue, collected, outstanding: revenue - collected, uniquePatients: new Set(completed.map((a) => a.patient_id)).size,
    pva: assessments.length ? Math.round((completed.length / assessments.length) * 100) / 100 : 0,
    noShowRate: pct(noShows.length, appts.length), cancelRate: pct(cancelled.length, appts.length), rebookRate: pct(rebookedIds.length, completed.length), avgTicket: invs.length ? Math.round(revenue / invs.length) : 0,
    revenueByLocation: group(invs, (i) => i.location_id, (i) => i.total_cents), revenueByPractitioner: group(invs, (i) => i.practitioner_id, (i) => i.total_cents),
    visitsByPractitioner: group(completed, (a) => a.practitioner_id), assessmentsByPractitioner: group(assessments, (a) => a.practitioner_id), visitsByDiscipline: group(completed, (a) => a.discipline),
    revenueByDay: group(invs, (i) => dateKey(i.issued_at, tz), (i) => i.total_cents), paymentsByMethod: Object.fromEntries(pays.map((p) => [p.method, p.cents])), referralSources: group(newPatients, (p) => p.referred_by || 'Unknown'),
  };
}
