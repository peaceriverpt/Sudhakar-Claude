'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { sql, withTenant, audit, type Tx } from './db';
import { createSession, destroySession, getSession, requireSession, hashPassword, verifyPassword, switchOrg, can, actorOf, newToken, hashToken, type Session } from './auth';
import { availability, conflicts, nextInvoiceNumber, getAppointment, getPatient, getInvoice, getChart } from './queries';
import { localToUtc, slugify, invoiceTotals, DEFAULT_SETTINGS, type InvoiceItem, type OrgSettings, COLORS, hm } from './util';

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (error: string): Result<never> => ({ ok: false, error });
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const bool = (fd: FormData, k: string) => fd.get(k) === 'on' || fd.get(k) === 'true';
const num = (fd: FormData, k: string, d = 0) => { const n = Number(fd.get(k)); return Number.isFinite(n) ? n : d; };
const uuid = z.string().uuid();
const revalidateAll = () => revalidatePath('/app', 'layout');

/* ====================== auth ====================== */
const DEFAULT_TEMPLATES = [
  { name: 'SOAP Note', discipline: '', sections: [{ key: 'S', label: 'Subjective', placeholder: 'Patient report, pain scale, changes since last visit…' }, { key: 'O', label: 'Objective', placeholder: 'ROM, strength, special tests, palpation, observation…' }, { key: 'A', label: 'Assessment', placeholder: 'Clinical impression, progress toward goals…' }, { key: 'P', label: 'Plan', placeholder: 'Treatment provided today, home program, frequency, next visit…' }] },
  { name: 'Physiotherapy Initial Assessment', discipline: 'Physiotherapy', sections: [{ key: 'history', label: 'History of Present Condition', placeholder: 'Mechanism, onset, aggravating & easing factors…' }, { key: 'pmh', label: 'Past Medical History / Red Flags', placeholder: '' }, { key: 'objective', label: 'Objective Findings', placeholder: 'Posture, ROM, strength, neuro, special tests…' }, { key: 'diagnosis', label: 'Clinical Impression', placeholder: '' }, { key: 'goals', label: 'Goals', placeholder: '' }, { key: 'plan', label: 'Treatment Plan', placeholder: 'Frequency, duration, HEP, re-assessment date…' }] },
  { name: 'Massage Therapy Treatment', discipline: 'Massage Therapy', sections: [{ key: 'S', label: 'Subjective', placeholder: 'Areas of concern, pressure preference, contraindications…' }, { key: 'O', label: 'Findings', placeholder: '' }, { key: 'T', label: 'Treatment', placeholder: 'Techniques, areas treated…' }, { key: 'P', label: 'Plan / Self-care', placeholder: '' }] },
  { name: 'Chiropractic Visit', discipline: 'Chiropractic', sections: [{ key: 'S', label: 'Subjective', placeholder: '' }, { key: 'O', label: 'Objective', placeholder: '' }, { key: 'adj', label: 'Adjustments / Modalities', placeholder: 'Levels adjusted, technique…' }, { key: 'P', label: 'Plan', placeholder: '' }] },
];
const DEFAULT_INTAKE = { name: 'New Patient Intake', fields: [
  { key: 'reason', label: 'What brings you in today?', type: 'textarea', required: true }, { key: 'onset', label: 'When did this start?', type: 'text', required: false },
  { key: 'pain', label: 'Current pain level (0 to 10)', type: 'number', required: false }, { key: 'conditions', label: 'Medical conditions, surgeries, medications', type: 'textarea', required: false },
  { key: 'allergies', label: 'Allergies', type: 'text', required: false }, { key: 'pregnant', label: 'Are you pregnant or possibly pregnant?', type: 'yesno', required: false },
  { key: 'physician', label: 'Family physician', type: 'text', required: false }, { key: 'consent', label: 'I consent to assessment and treatment and I have read the privacy policy.', type: 'consent', required: true } ] };

export async function signup(prev: Result | null, fd: FormData): Promise<Result> {
  const parsed = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(10, 'Password must be at least 10 characters'), org: z.string().min(2), location: z.string().min(2), timezone: z.string().min(3) })
    .safeParse({ name: str(fd, 'name'), email: str(fd, 'email').toLowerCase(), password: String(fd.get('password') ?? ''), org: str(fd, 'org'), location: str(fd, 'location'), timezone: str(fd, 'timezone') || 'America/Edmonton' });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  const exists = await sql`select 1 from users where lower(email) = ${d.email}`; if (exists.length) return fail('An account with this email already exists. Sign in instead.');
  let slug = slugify(d.org) || 'clinic'; const taken = await sql`select 1 from organizations where slug = ${slug}`; if (taken.length) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const settings: OrgSettings = { ...DEFAULT_SETTINGS, timezone: d.timezone };
  const userId = await sql.begin(async (tx) => {
    const [u] = await tx`insert into users (email, name, password_hash) values (${d.email}, ${d.name}, ${await hashPassword(d.password)}) returning id`;
    const [o] = await tx`insert into organizations (name, slug, settings) values (${d.org}, ${slug}, ${tx.json(settings as never)}) returning id`;
    await tx`insert into memberships (org_id, user_id, role) values (${o.id}, ${u.id}, 'owner')`;
    await tx`select set_config('app.org_id', ${o.id}, true)`;
    await tx`insert into locations (org_id, name, timezone) values (${o.id}, ${d.location}, ${d.timezone})`;
    for (const t of DEFAULT_TEMPLATES) await tx`insert into chart_templates (org_id, name, discipline, sections) values (${o.id}, ${t.name}, ${t.discipline}, ${tx.json(t.sections as never)})`;
    await tx`insert into intake_forms (org_id, name, fields) values (${o.id}, ${DEFAULT_INTAKE.name}, ${tx.json(DEFAULT_INTAKE.fields as never)})`;
    await tx`insert into invoice_counters (org_id) values (${o.id})`;
    return u.id as string;
  });
  await createSession(userId, null);
  redirect('/app?welcome=1');
}
export async function login(prev: Result | null, fd: FormData): Promise<Result> {
  const email = str(fd, 'email').toLowerCase(), password = String(fd.get('password') ?? ''); const next = str(fd, 'next');
  const rows = await sql`select id, password_hash from users where lower(email) = ${email}`;
  // constant-ish time: still verify against a dummy hash when the user is unknown
  const ok = rows.length ? await verifyPassword(password, rows[0].password_hash) : (await verifyPassword(password, '$2a$12$C6UzMDM.H6dfI/f/IKcEeO5f1zJ9n1P2Qf5z8bD8l3k2pQ9fH7a9a'), false);
  if (!ok) return fail('Email or password is incorrect.');
  const member = await sql`select 1 from memberships where user_id = ${rows[0].id} and active limit 1`; if (!member.length) return fail('This account is not a member of any clinic.');
  await createSession(rows[0].id, null);
  redirect(next && next.startsWith('/app') ? next : '/app');
}
export async function logout() { await destroySession(); redirect('/login'); }
export async function switchOrganization(fd: FormData) { await requireSession(); await switchOrg(str(fd, 'orgId')); revalidateAll(); redirect('/app'); }

/* ====================== helpers ====================== */
async function tenant<T>(s: Session, fn: (tx: Tx) => Promise<T>) { return withTenant(s.orgId, fn); }
const log = (tx: Tx, s: Session, e: Parameters<typeof audit>[3]) => audit(tx, s.orgId, actorOf(s), e);

/* ====================== appointments ====================== */
export async function getSlots(input: { practitionerId: string; locationId: string; date: string; treatmentId: string; ignoreId?: string | null }): Promise<Result<{ min: number }[]>> {
  const s = await requireSession();
  return tenant(s, async (tx) => {
    const [t] = await tx`select duration_min from treatments where id = ${input.treatmentId}`; if (!t) return fail('Treatment not found');
    const slots = await availability(tx, input.practitionerId, input.locationId, input.date, t.duration_min, s.settings.timezone, { ignoreId: input.ignoreId, includePast: true });
    return { ok: true, data: slots.map((x) => ({ min: x.min })) };
  });
}
const apptSchema = z.object({ id: uuid.optional().or(z.literal('')), patientId: uuid, practitionerId: uuid, locationId: uuid, treatmentId: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/), notes: z.string().max(2000).default(''), force: z.boolean().default(false) });
export async function saveAppointment(input: z.infer<typeof apptSchema>): Promise<Result<{ id: string; warning?: string }>> {
  const s = await requireSession(); const p = apptSchema.safeParse(input); if (!p.success) return fail('Please fill in all booking details.');
  const d = p.data;
  return tenant(s, async (tx) => {
    const [t] = await tx`select duration_min, name from treatments where id = ${d.treatmentId}`; if (!t) return fail('Treatment not found');
    const start = localToUtc(d.date, hm(d.time), s.settings.timezone); const end = new Date(start.getTime() + t.duration_min * 60000);
    const c = await conflicts(tx, d.practitionerId, start, end, d.id || null);
    if (c.length && !d.force) return fail(`Overlaps with ${c.map((x) => x.patient_name).join(', ')}. Pick another time or save anyway.`);
    if (d.id) {
      await tx`update appointments set practitioner_id = ${d.practitionerId}, location_id = ${d.locationId}, treatment_id = ${d.treatmentId}, starts_at = ${start}, ends_at = ${end}, notes = ${d.notes}, updated_at = now() where id = ${d.id}`;
      await log(tx, s, { action: 'appointment.update', entity: 'appointment', entityId: d.id, patientId: d.patientId });
      revalidateAll(); return { ok: true, data: { id: d.id } };
    }
    const [a] = await tx`insert into appointments (org_id, patient_id, practitioner_id, location_id, treatment_id, starts_at, ends_at, notes, source, created_by) values (${s.orgId}, ${d.patientId}, ${d.practitionerId}, ${d.locationId}, ${d.treatmentId}, ${start}, ${end}, ${d.notes}, 'staff', ${s.userId}) returning id`;
    await log(tx, s, { action: 'appointment.create', entity: 'appointment', entityId: a.id, patientId: d.patientId, details: { treatment: t.name } });
    revalidateAll(); return { ok: true, data: { id: a.id } };
  });
}
export async function setAppointmentStatus(id: string, status: string): Promise<Result> {
  const s = await requireSession(); if (!['booked', 'arrived', 'in_progress', 'completed', 'no_show', 'cancelled'].includes(status)) return fail('Bad status');
  return tenant(s, async (tx) => { const [a] = await tx`update appointments set status = ${status}::appt_status, updated_at = now() where id = ${id} returning patient_id`; if (!a) return fail('Not found'); await log(tx, s, { action: 'appointment.status', entity: 'appointment', entityId: id, patientId: a.patient_id, details: { status } }); revalidateAll(); return { ok: true }; });
}
export async function deleteAppointment(id: string): Promise<Result> {
  const s = await requireSession();
  return tenant(s, async (tx) => { const [a] = await tx`delete from appointments where id = ${id} and not exists (select 1 from invoices where appointment_id = ${id}) returning patient_id`; if (!a) return fail('Cannot delete an appointment that has an invoice. Cancel it instead.'); await log(tx, s, { action: 'appointment.delete', entity: 'appointment', entityId: id, patientId: a.patient_id }); revalidateAll(); return { ok: true }; });
}

/* ====================== patients ====================== */
export async function quickCreatePatient(input: { first: string; last: string; phone?: string; email?: string; locationId?: string }): Promise<Result<{ id: string; name: string }>> {
  const s = await requireSession(); if (!input.first?.trim() || !input.last?.trim()) return fail('First and last name are required');
  return tenant(s, async (tx) => { const [p] = await tx`insert into patients (org_id, first_name, last_name, phone, email, home_location_id, created_by) values (${s.orgId}, ${input.first.trim()}, ${input.last.trim()}, ${input.phone?.trim() ?? ''}, ${input.email?.trim() ?? ''}, ${input.locationId || null}, ${s.userId}) returning id`; await log(tx, s, { action: 'patient.create', entity: 'patient', entityId: p.id, patientId: p.id }); revalidateAll(); return { ok: true, data: { id: p.id, name: `${input.first.trim()} ${input.last.trim()}` } }; });
}
export async function savePatient(prev: Result | null, fd: FormData): Promise<Result> {
  const s = await requireSession(); const id = str(fd, 'id');
  const first = str(fd, 'first_name'), last = str(fd, 'last_name'); if (!first || !last) return fail('First and last name are required.');
  const dob = str(fd, 'dob') || null; const tags = str(fd, 'tags').split(',').map((t) => t.trim()).filter(Boolean);
  const insurers = [0, 1].map((n) => ({ company: str(fd, `ins${n}_company`), policy: str(fd, `ins${n}_policy`), member: str(fd, `ins${n}_member`), pct: num(fd, `ins${n}_pct`, 80), max: Math.round(num(fd, `ins${n}_max`) * 100) })).filter((i) => i.company);
  const rec = { first_name: first, last_name: last, dob, sex: str(fd, 'sex'), email: str(fd, 'email'), phone: str(fd, 'phone'), address: str(fd, 'address'), city: str(fd, 'city'), province: str(fd, 'province'), postal: str(fd, 'postal'), health_number: str(fd, 'health_number'), home_location_id: str(fd, 'home_location_id') || null, emergency_name: str(fd, 'emergency_name'), emergency_phone: str(fd, 'emergency_phone'), notes: str(fd, 'notes'), alerts: str(fd, 'alerts'), tags, referred_by: str(fd, 'referred_by'), complaint: str(fd, 'complaint'), consent_on_file: bool(fd, 'consent_on_file'), updated_at: new Date() };
  const pid = await tenant(s, async (tx) => {
    let pid = id;
    if (id) { await tx`update patients set ${tx(rec)} where id = ${id}`; await log(tx, s, { action: 'patient.update', entity: 'patient', entityId: id, patientId: id }); }
    else { const [p] = await tx`insert into patients ${tx({ ...rec, org_id: s.orgId, created_by: s.userId })} returning id`; pid = p.id; await log(tx, s, { action: 'patient.create', entity: 'patient', entityId: pid, patientId: pid }); }
    await tx`delete from patient_insurers where patient_id = ${pid}`;
    for (const [i, ins] of insurers.entries()) await tx`insert into patient_insurers (org_id, patient_id, company, policy, member_id, coverage_pct, annual_max_cents, sort_order) values (${s.orgId}, ${pid}, ${ins.company}, ${ins.policy}, ${ins.member}, ${ins.pct}, ${ins.max}, ${i})`;
    return pid;
  });
  revalidateAll(); redirect(`/app/patients/${pid}`);
}
export async function deletePatient(id: string): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'manage_staff')) return fail('Only owners and admins can delete patients.');
  await tenant(s, async (tx) => { await log(tx, s, { action: 'patient.delete', entity: 'patient', entityId: id, patientId: id }); await tx`delete from patients where id = ${id}`; });
  revalidateAll(); redirect('/app/patients');
}

/* ====================== invoices & payments ====================== */
const invoiceSchema = z.object({ patientId: uuid, appointmentId: uuid.nullable().optional(), locationId: uuid, practitionerId: uuid.nullable().optional(), items: z.array(z.object({ id: z.string(), desc: z.string().min(1), qty: z.number().int().min(0), priceCents: z.number().int().min(0), taxable: z.boolean(), kind: z.enum(['treatment', 'product', 'custom']) })).min(1), discountCents: z.number().int().min(0).default(0), insurer: z.string().default(''), insurerPortionCents: z.number().int().min(0).default(0), payment: z.object({ method: z.string(), amountCents: z.number().int().min(1) }).nullable().optional() });
export async function createInvoice(input: z.infer<typeof invoiceSchema>): Promise<Result<{ id: string }>> {
  const s = await requireSession(); if (!can(s, 'billing')) return fail('Not allowed'); const p = invoiceSchema.safeParse(input); if (!p.success) return fail('Invoice details are incomplete.');
  const d = p.data; const tot = invoiceTotals(d.items as InvoiceItem[], d.discountCents, s.settings.taxRateBp);
  return tenant(s, async (tx) => {
    const number = await nextInvoiceNumber(tx, s.orgId, s.settings.invoicePrefix);
    const [inv] = await tx`insert into invoices (org_id, number, patient_id, appointment_id, location_id, practitioner_id, items, discount_cents, tax_rate_bp, tax_name, insurer, insurer_portion_cents, subtotal_cents, tax_cents, total_cents, created_by)
      values (${s.orgId}, ${number}, ${d.patientId}, ${d.appointmentId ?? null}, ${d.locationId}, ${d.practitionerId ?? null}, ${tx.json(d.items as never)}, ${tot.discount}, ${s.settings.taxRateBp}, ${s.settings.taxName}, ${d.insurer}, ${d.insurer ? Math.min(d.insurerPortionCents, tot.total) : 0}, ${tot.subtotal}, ${tot.tax}, ${tot.total}, ${s.userId}) returning id`;
    if (d.payment) await tx`insert into payments (org_id, invoice_id, method, amount_cents, created_by) values (${s.orgId}, ${inv.id}, ${d.payment.method}, ${Math.min(d.payment.amountCents, tot.total)}, ${s.userId})`;
    if (d.appointmentId) await tx`update appointments set status = case when status in ('completed','no_show') then status else 'completed'::appt_status end, updated_at = now() where id = ${d.appointmentId}`;
    await log(tx, s, { action: 'invoice.create', entity: 'invoice', entityId: inv.id, patientId: d.patientId, details: { number, total: tot.total } });
    revalidateAll(); return { ok: true, data: { id: inv.id } };
  });
}
export async function addPayment(prev: Result | null, fd: FormData): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'billing')) return fail('Not allowed'); const id = str(fd, 'invoiceId'); const cents = Math.round(num(fd, 'amount') * 100); if (cents <= 0) return fail('Enter an amount.');
  const r = await tenant(s, async (tx) => { const inv = await getInvoice(tx, id); if (!inv || inv.voided) return fail('Invoice not found'); if (cents > inv.balance_cents) return fail('Amount is more than the balance owing.'); await tx`insert into payments (org_id, invoice_id, method, amount_cents, note, created_by) values (${s.orgId}, ${id}, ${str(fd, 'method')}, ${cents}, ${str(fd, 'note')}, ${s.userId})`; await log(tx, s, { action: 'payment.add', entity: 'invoice', entityId: id, patientId: inv.patient_id, details: { cents, method: str(fd, 'method') } }); return { ok: true } as Result; });
  revalidateAll(); return r;
}
export async function removePayment(invoiceId: string, paymentId: string): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'manage_staff')) return fail('Only owners and admins can remove payments.');
  await tenant(s, async (tx) => { await tx`delete from payments where id = ${paymentId} and invoice_id = ${invoiceId}`; await log(tx, s, { action: 'payment.remove', entity: 'invoice', entityId: invoiceId, details: { paymentId } }); }); revalidateAll(); return { ok: true };
}
export async function voidInvoice(id: string): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'manage_staff')) return fail('Only owners and admins can void invoices.');
  await tenant(s, async (tx) => { await tx`update invoices set voided = true where id = ${id}`; await log(tx, s, { action: 'invoice.void', entity: 'invoice', entityId: id }); }); revalidateAll(); return { ok: true };
}

/* ====================== charts ====================== */
const chartSchema = z.object({ id: uuid.optional().nullable(), appointmentId: uuid.optional().nullable(), patientId: uuid, templateId: uuid, fields: z.record(z.string()), sign: z.boolean() });
export async function saveChart(input: z.infer<typeof chartSchema>): Promise<Result<{ id: string }>> {
  const s = await requireSession(); if (!can(s, 'chart')) return fail('Front desk accounts cannot write chart notes.'); const p = chartSchema.safeParse(input); if (!p.success) return fail('Chart data is invalid.');
  const d = p.data; if (d.sign && !Object.values(d.fields).some((v) => v.trim())) return fail('Write something before signing.');
  return tenant(s, async (tx) => {
    const [tpl] = await tx`select name from chart_templates where id = ${d.templateId}`; if (!tpl) return fail('Template not found');
    const signedBits = d.sign ? { signed: true, signed_at: new Date(), signed_by: s.userId } : { signed: false, signed_at: null, signed_by: null };
    if (d.id) {
      const existing = await getChart(tx, d.id); if (!existing) return fail('Not found'); if (existing.signed) return fail('Signed notes cannot be edited. Add an addendum instead.');
      await tx`update charts set ${tx({ template_id: d.templateId, template_name: tpl.name, fields: tx.json(d.fields as never), ...signedBits, updated_at: new Date() })} where id = ${d.id}`;
      await log(tx, s, { action: d.sign ? 'chart.sign' : 'chart.update', entity: 'chart', entityId: d.id, patientId: d.patientId }); revalidateAll(); return { ok: true, data: { id: d.id } };
    }
    let practitionerId = s.practitionerId, locationId: string | null = null, serviceDate = new Date();
    if (d.appointmentId) { const a = await getAppointment(tx, d.appointmentId); if (!a) return fail('Appointment not found'); practitionerId = a.practitioner_id; locationId = a.location_id; serviceDate = new Date(a.starts_at); }
    if (!practitionerId) { const [pr] = await tx`select id from practitioners where active order by name limit 1`; practitionerId = pr?.id; }
    if (!practitionerId) return fail('Add a practitioner before charting.');
    const [c] = await tx`insert into charts (org_id, appointment_id, patient_id, practitioner_id, location_id, service_date, template_id, template_name, fields, signed, signed_at, signed_by, created_by) values (${s.orgId}, ${d.appointmentId ?? null}, ${d.patientId}, ${practitionerId}, ${locationId}, ${serviceDate}, ${d.templateId}, ${tpl.name}, ${tx.json(d.fields as never)}, ${signedBits.signed}, ${signedBits.signed_at}, ${signedBits.signed_by}, ${s.userId}) returning id`;
    await log(tx, s, { action: d.sign ? 'chart.sign' : 'chart.create', entity: 'chart', entityId: c.id, patientId: d.patientId }); revalidateAll(); return { ok: true, data: { id: c.id } };
  });
}
export async function addAddendum(chartId: string, text: string): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'chart') || !text.trim()) return fail('Addendum is empty.');
  await tenant(s, async (tx) => { await tx`update charts set addenda = addenda || ${tx.json([{ at: new Date().toISOString(), by: s.name, text: text.trim() }] as never)}::jsonb where id = ${chartId}`; await log(tx, s, { action: 'chart.addendum', entity: 'chart', entityId: chartId }); }); revalidateAll(); return { ok: true };
}
export async function deleteChart(id: string): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'chart')) return fail('Not allowed');
  await tenant(s, async (tx) => { await tx`delete from charts where id = ${id} and not signed`; await log(tx, s, { action: 'chart.delete', entity: 'chart', entityId: id }); }); revalidateAll(); return { ok: true };
}

/* ====================== staff & services ====================== */
export async function savePractitioner(prev: Result | null, fd: FormData): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'manage_staff')) return fail('Not allowed'); const id = str(fd, 'id'); const name = str(fd, 'name'); if (!name) return fail('Name is required');
  const rec = { name, title: str(fd, 'title'), discipline: str(fd, 'discipline'), color: str(fd, 'color') || COLORS[0], email: str(fd, 'email'), phone: str(fd, 'phone'), bio: str(fd, 'bio'), license_number: str(fd, 'license_number'), online: bool(fd, 'online'), active: bool(fd, 'active') };
  const locIds = (fd.getAll('locations') as string[]).filter(Boolean);
  const shifts: { weekday: number; start: number; end: number; loc: string }[] = [];
  for (const d of [0, 1, 2, 3, 4, 5, 6]) if (bool(fd, `on_${d}`)) { const st = hm(str(fd, `start_${d}`) || '09:00'), en = hm(str(fd, `end_${d}`) || '17:00'); if (en > st) shifts.push({ weekday: d, start: st, end: en, loc: str(fd, `loc_${d}`) }); }
  shifts.forEach((sh) => { if (sh.loc && !locIds.includes(sh.loc)) locIds.push(sh.loc); });
  await tenant(s, async (tx) => {
    let pid = id;
    if (id) await tx`update practitioners set ${tx(rec)} where id = ${id}`; else { const [p] = await tx`insert into practitioners ${tx({ ...rec, org_id: s.orgId })} returning id`; pid = p.id; }
    await tx`delete from practitioner_locations where practitioner_id = ${pid}`; for (const l of locIds) await tx`insert into practitioner_locations (org_id, practitioner_id, location_id) values (${s.orgId}, ${pid}, ${l})`;
    await tx`delete from shifts where practitioner_id = ${pid}`; for (const sh of shifts) await tx`insert into shifts (org_id, practitioner_id, location_id, weekday, start_min, end_min) values (${s.orgId}, ${pid}, ${sh.loc}, ${sh.weekday}, ${sh.start}, ${sh.end})`;
    await tx`delete from practitioner_treatments where practitioner_id = ${pid}`; await tx`insert into practitioner_treatments (org_id, practitioner_id, treatment_id) select ${s.orgId}, ${pid}, id from treatments where discipline = ${rec.discipline}`;
    await log(tx, s, { action: id ? 'practitioner.update' : 'practitioner.create', entity: 'practitioner', entityId: pid });
  });
  revalidateAll(); redirect('/app/staff');
}
export async function saveTreatment(prev: Result | null, fd: FormData): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'manage_staff')) return fail('Not allowed'); const id = str(fd, 'id'); if (!str(fd, 'name')) return fail('Name is required');
  const rec = { name: str(fd, 'name'), discipline: str(fd, 'discipline'), duration_min: Math.max(5, num(fd, 'duration_min', 30)), price_cents: Math.round(num(fd, 'price') * 100), taxable: bool(fd, 'taxable'), is_assessment: bool(fd, 'is_assessment'), online: bool(fd, 'online'), active: bool(fd, 'active') };
  await tenant(s, async (tx) => { if (id) await tx`update treatments set ${tx(rec)} where id = ${id}`; else { const [t] = await tx`insert into treatments ${tx({ ...rec, org_id: s.orgId })} returning id`; await tx`insert into practitioner_treatments (org_id, practitioner_id, treatment_id) select ${s.orgId}, id, ${t.id} from practitioners where discipline = ${rec.discipline}`; } });
  revalidateAll(); redirect('/app/staff/treatments');
}
export async function saveProduct(prev: Result | null, fd: FormData): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'manage_staff')) return fail('Not allowed'); const id = str(fd, 'id'); if (!str(fd, 'name')) return fail('Name is required');
  const rec = { name: str(fd, 'name'), price_cents: Math.round(num(fd, 'price') * 100), taxable: bool(fd, 'taxable'), active: bool(fd, 'active') };
  await tenant(s, async (tx) => { if (id) await tx`update products set ${tx(rec)} where id = ${id}`; else await tx`insert into products ${tx({ ...rec, org_id: s.orgId })}`; });
  revalidateAll(); redirect('/app/staff/products');
}
export async function saveTemplate(prev: Result | null, fd: FormData): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'manage_staff')) return fail('Not allowed'); const id = str(fd, 'id'); if (!str(fd, 'name')) return fail('Name is required');
  const sections = str(fd, 'sections').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [label, ph] = l.split('|').map((x) => x.trim()); return { key: label, label, placeholder: ph || '' }; }); if (!sections.length) return fail('Add at least one section.');
  await tenant(s, async (tx) => { if (id) await tx`update chart_templates set name = ${str(fd, 'name')}, discipline = ${str(fd, 'discipline')}, sections = ${tx.json(sections as never)}, active = ${bool(fd, 'active')} where id = ${id}`; else await tx`insert into chart_templates (org_id, name, discipline, sections) values (${s.orgId}, ${str(fd, 'name')}, ${str(fd, 'discipline')}, ${tx.json(sections as never)})`; });
  revalidateAll(); redirect('/app/staff/templates');
}
export async function saveLocation(prev: Result | null, fd: FormData): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'manage_org')) return fail('Only the owner can change locations.'); const id = str(fd, 'id'); if (!str(fd, 'name')) return fail('Name is required');
  const rec = { name: str(fd, 'name'), address: str(fd, 'address'), phone: str(fd, 'phone'), color: str(fd, 'color') || COLORS[1], timezone: str(fd, 'timezone') || s.settings.timezone, active: bool(fd, 'active') };
  await tenant(s, async (tx) => { if (id) await tx`update locations set ${tx(rec)} where id = ${id}`; else await tx`insert into locations ${tx({ ...rec, org_id: s.orgId })}`; });
  revalidateAll(); redirect('/app/settings');
}

/* ====================== settings, team, API keys, intake ====================== */
export async function saveSettings(prev: Result | null, fd: FormData): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'manage_org')) return fail('Only the owner can change settings.');
  const settings: OrgSettings = { ...s.settings, taxName: str(fd, 'taxName') || 'GST', taxRateBp: Math.round(num(fd, 'taxRate') * 100), invoicePrefix: str(fd, 'invoicePrefix'), openHour: num(fd, 'openHour', 7), closeHour: num(fd, 'closeHour', 20), bookingWindowDays: Math.max(1, num(fd, 'bookingWindowDays', 60)), onlineBookingEnabled: bool(fd, 'onlineBookingEnabled'), cancellationPolicy: str(fd, 'cancellationPolicy'), timezone: str(fd, 'timezone') || s.settings.timezone };
  const name = str(fd, 'clinicName') || s.orgName;
  await sql`update organizations set name = ${name}, settings = ${sql.json(settings as never)} where id = ${s.orgId} and exists (select 1 from memberships where org_id = ${s.orgId} and user_id = ${s.userId} and role = 'owner')`;
  revalidateAll(); return { ok: true };
}
export async function inviteMember(prev: Result<{ link: string }> | null, fd: FormData): Promise<Result<{ link: string }>> {
  const s = await requireSession(); if (!can(s, 'manage_staff')) return fail('Not allowed');
  const email = str(fd, 'email').toLowerCase(); const role = str(fd, 'role') as 'admin' | 'front_desk' | 'practitioner'; if (!email.includes('@')) return fail('Enter an email address.'); if (!['admin', 'front_desk', 'practitioner'].includes(role)) return fail('Pick a role.');
  const token = newToken();
  await tenant(s, async (tx) => { await tx`insert into invites (org_id, email, role, practitioner_id, token_hash, expires_at) values (${s.orgId}, ${email}, ${role}::member_role, ${str(fd, 'practitionerId') || null}, ${hashToken(token)}, now() + interval '7 days')`; await log(tx, s, { action: 'member.invite', entity: 'membership', details: { email, role } }); });
  revalidateAll(); return { ok: true, data: { link: `${process.env.APP_URL || ''}/join/${token}` } };
}
export async function acceptInvite(prev: Result | null, fd: FormData): Promise<Result> {
  const token = str(fd, 'token'); const inv = (await sql`select * from invites where token_hash = ${hashToken(token)} and accepted_at is null and expires_at > now()`)[0]; if (!inv) return fail('This invitation is invalid or has expired.');
  const name = str(fd, 'name'), password = String(fd.get('password') ?? ''); const existing = (await sql`select id, password_hash from users where lower(email) = ${inv.email}`)[0];
  let userId: string;
  if (existing) { if (!(await verifyPassword(password, existing.password_hash))) return fail('An account with this email exists. Enter its password to join.'); userId = existing.id; }
  else { if (name.length < 2 || password.length < 10) return fail('Enter your name and a password of at least 10 characters.'); userId = (await sql`insert into users (email, name, password_hash) values (${inv.email}, ${name}, ${await hashPassword(password)}) returning id`)[0].id; }
  await sql.begin(async (tx) => { await tx`insert into memberships (org_id, user_id, role, practitioner_id) values (${inv.org_id}, ${userId}, ${inv.role}, ${inv.practitioner_id}) on conflict (org_id, user_id) do update set role = excluded.role, active = true, practitioner_id = excluded.practitioner_id`; if (inv.practitioner_id) await tx`update practitioners set user_id = ${userId} where id = ${inv.practitioner_id} and org_id = ${inv.org_id}`; await tx`update invites set accepted_at = now() where id = ${inv.id}`; });
  await createSession(userId, inv.org_id); redirect('/app');
}
export async function removeMember(membershipId: string): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'manage_staff')) return fail('Not allowed');
  const r = await sql`update memberships set active = false where id = ${membershipId} and org_id = ${s.orgId} and role <> 'owner' and user_id <> ${s.userId} returning id`; if (!r.length) return fail('Cannot remove this member.');
  await tenant(s, async (tx) => log(tx, s, { action: 'member.remove', entity: 'membership', entityId: membershipId })); revalidateAll(); return { ok: true };
}
export async function createApiKey(prev: Result<{ key: string }> | null, fd: FormData): Promise<Result<{ key: string }>> {
  const s = await requireSession(); if (!can(s, 'manage_org')) return fail('Only the owner can create API keys.'); const name = str(fd, 'name') || 'API key'; const scopes = (fd.getAll('scopes') as string[]).filter((x) => ['read', 'write'].includes(x)); if (!scopes.length) scopes.push('read');
  const raw = 'cfk_' + newToken(); const prefix = raw.slice(0, 12);
  await tenant(s, async (tx) => { await tx`insert into api_keys (org_id, name, prefix, key_hash, scopes, created_by) values (${s.orgId}, ${name}, ${prefix}, ${hashToken(raw)}, ${scopes}, ${s.userId})`; await log(tx, s, { action: 'apikey.create', entity: 'api_key', details: { name, scopes } }); });
  revalidateAll(); return { ok: true, data: { key: raw } };
}
export async function revokeApiKey(id: string): Promise<Result> { const s = await requireSession(); if (!can(s, 'manage_org')) return fail('Not allowed'); await tenant(s, async (tx) => { await tx`update api_keys set revoked_at = now() where id = ${id}`; await log(tx, s, { action: 'apikey.revoke', entity: 'api_key', entityId: id }); }); revalidateAll(); return { ok: true }; }

export async function saveIntakeForm(prev: Result | null, fd: FormData): Promise<Result> {
  const s = await requireSession(); if (!can(s, 'manage_staff')) return fail('Not allowed'); const id = str(fd, 'id'); const name = str(fd, 'name'); if (!name) return fail('Name is required');
  const fields = str(fd, 'fields').split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => { const [label, type, req] = l.split('|').map((x) => x.trim()); return { key: 'q' + (i + 1), label, type: ['text', 'textarea', 'number', 'yesno', 'consent', 'date'].includes(type) ? type : 'text', required: req === 'required' }; }); if (!fields.length) return fail('Add at least one question.');
  await tenant(s, async (tx) => { if (id) await tx`update intake_forms set name = ${name}, fields = ${tx.json(fields as never)}, active = ${bool(fd, 'active')} where id = ${id}`; else await tx`insert into intake_forms (org_id, name, fields) values (${s.orgId}, ${name}, ${tx.json(fields as never)})`; });
  revalidateAll(); redirect('/app/settings/intake');
}
export async function sendIntake(input: { patientId: string; formId: string; appointmentId?: string | null }): Promise<Result<{ link: string }>> {
  const s = await requireSession(); const token = newToken();
  await tenant(s, async (tx) => { await tx`insert into intake_submissions (org_id, form_id, patient_id, appointment_id, token_hash) values (${s.orgId}, ${input.formId}, ${input.patientId}, ${input.appointmentId ?? null}, ${hashToken(token)})`; await log(tx, s, { action: 'intake.send', entity: 'patient', entityId: input.patientId, patientId: input.patientId }); });
  revalidateAll(); return { ok: true, data: { link: `${process.env.APP_URL || ''}/intake/${token}` } };
}
export async function submitIntake(prev: Result | null, fd: FormData): Promise<Result> {
  const token = str(fd, 'token'); const ref = (await sql`select id, org_id from lookup_intake_token(${hashToken(token)})`)[0];
  if (!ref) return fail('This form link is invalid.');
  return withTenant(ref.org_id, async (tx) => {
    const [sub] = await tx`select id, org_id, form_id, patient_id, submitted_at from intake_submissions where id = ${ref.id}`; if (!sub) return fail('This form link is invalid.'); if (sub.submitted_at) return fail('This form was already submitted. Thank you!');
    const [form] = await tx`select fields from intake_forms where id = ${sub.form_id}`; const answers: Record<string, string> = {};
    for (const f of form.fields as { key: string; label: string; type: string; required: boolean }[]) { const v = str(fd, f.key); if (f.required && !v && f.type !== 'consent') return fail(`Please answer: ${f.label}`); if (f.type === 'consent' && f.required && !bool(fd, f.key)) return fail('Consent is required to continue.'); answers[f.key] = f.type === 'consent' ? (bool(fd, f.key) ? 'yes' : 'no') : v; }
    const signature = str(fd, 'signature'); if (!signature) return fail('Please type your full name as your signature.');
    await tx`update intake_submissions set answers = ${tx.json(answers as never)}, signature = ${signature}, submitted_at = now() where id = ${sub.id}`;
    await tx`update patients set consent_on_file = true where id = ${sub.patient_id}`;
    await audit(tx, sub.org_id, { label: 'patient (intake form)' }, { action: 'intake.submit', entity: 'patient', entityId: sub.patient_id, patientId: sub.patient_id });
    return { ok: true };
  });
}

/* ====================== wait list ====================== */
export async function addWaitlist(prev: Result | null, fd: FormData): Promise<Result> {
  const s = await requireSession(); const patientId = str(fd, 'patientId'); if (!patientId) return fail('Choose a patient.');
  await tenant(s, async (tx) => { await tx`insert into waitlist (org_id, patient_id, treatment_id, practitioner_id, location_id, notes) values (${s.orgId}, ${patientId}, ${str(fd, 'treatmentId') || null}, ${str(fd, 'practitionerId') || null}, ${str(fd, 'locationId') || null}, ${str(fd, 'notes')})`; });
  revalidateAll(); redirect('/app/waitlist');
}
export async function removeWaitlist(id: string): Promise<Result> { const s = await requireSession(); await tenant(s, async (tx) => { await tx`delete from waitlist where id = ${id}`; }); revalidateAll(); return { ok: true }; }

/* ====================== public booking (no session) ====================== */
async function publicOrg(slug: string) { const [o] = await sql`select id, name, settings from organizations where slug = ${slug}`; return o ?? null; }
export async function publicSlots(slug: string, input: { locationId: string; treatmentId: string; practitionerId: string | null; date: string }): Promise<Result<{ min: number; practitionerId: string; practitionerName: string }[]>> {
  const o = await publicOrg(slug); if (!o) return fail('Clinic not found'); const settings = { ...DEFAULT_SETTINGS, ...(o.settings || {}) } as OrgSettings; if (!settings.onlineBookingEnabled) return fail('Online booking is turned off');
  return withTenant(o.id, async (tx) => {
    const [t] = await tx`select duration_min, discipline from treatments where id = ${input.treatmentId} and active and online`; if (!t) return fail('Service not available');
    const prs = input.practitionerId ? await tx`select p.id, p.name from practitioners p where p.id = ${input.practitionerId} and p.active and p.online` : await tx`select p.id, p.name from practitioners p join practitioner_locations pl on pl.practitioner_id = p.id where pl.location_id = ${input.locationId} and p.active and p.online and p.discipline = ${t.discipline}`;
    const out: { min: number; practitionerId: string; practitionerName: string }[] = [];
    for (const p of prs) for (const sl of await availability(tx, p.id, input.locationId, input.date, t.duration_min, settings.timezone)) out.push({ min: sl.min, practitionerId: p.id, practitionerName: p.name });
    out.sort((a, b) => a.min - b.min); return { ok: true, data: out };
  });
}
const publicBookSchema = z.object({ locationId: uuid, treatmentId: uuid, practitionerId: uuid, date: z.string(), min: z.number().int(), first: z.string().min(1), last: z.string().min(1), email: z.string().email(), phone: z.string().min(7), dob: z.string().optional(), notes: z.string().max(1000).optional(), referredBy: z.string().optional(), agree: z.literal(true) });
export async function publicBook(slug: string, input: z.infer<typeof publicBookSchema>): Promise<Result<{ id: string; startsAt: string; endsAt: string; practitionerName: string; treatmentName: string; locationName: string; locationAddress: string; locationPhone: string; first: string; email: string }>> {
  const o = await publicOrg(slug); if (!o) return fail('Clinic not found'); const settings = { ...DEFAULT_SETTINGS, ...(o.settings || {}) } as OrgSettings; if (!settings.onlineBookingEnabled) return fail('Online booking is turned off');
  const p = publicBookSchema.safeParse(input); if (!p.success) return fail('Please complete all required fields.'); const d = p.data;
  return withTenant(o.id, async (tx) => {
    const [t] = await tx`select * from treatments where id = ${d.treatmentId} and active and online`; if (!t) return fail('Service not available');
    const start = localToUtc(d.date, d.min, settings.timezone); const end = new Date(start.getTime() + t.duration_min * 60000);
    if (start.getTime() < Date.now()) return fail('That time has passed.');
    const open = (await availability(tx, d.practitionerId, d.locationId, d.date, t.duration_min, settings.timezone)).some((x) => x.min === d.min); if (!open) return fail('Sorry, that time was just taken. Please pick another.');
    let [pt] = await tx`select id, first_name from patients where lower(email) = ${d.email.toLowerCase()} order by created_at limit 1`;
    if (pt) await tx`update patients set phone = case when phone = '' then ${d.phone} else phone end, dob = coalesce(dob, ${d.dob || null}), consent_on_file = true where id = ${pt.id}`;
    else [pt] = await tx`insert into patients (org_id, first_name, last_name, email, phone, dob, home_location_id, referred_by, complaint, consent_on_file) values (${o.id}, ${d.first}, ${d.last}, ${d.email}, ${d.phone}, ${d.dob || null}, ${d.locationId}, ${d.referredBy || 'Online booking'}, ${d.notes || ''}, true) returning id, first_name`;
    const [a] = await tx`insert into appointments (org_id, patient_id, practitioner_id, location_id, treatment_id, starts_at, ends_at, notes, source) values (${o.id}, ${pt.id}, ${d.practitionerId}, ${d.locationId}, ${t.id}, ${start}, ${end}, ${d.notes ? 'Online: ' + d.notes : ''}, 'online') returning id`;
    const [pr] = await tx`select name from practitioners where id = ${d.practitionerId}`; const [l] = await tx`select name, address, phone from locations where id = ${d.locationId}`;
    await audit(tx, o.id, { label: `patient ${d.email} (online booking)` }, { action: 'appointment.create', entity: 'appointment', entityId: a.id, patientId: pt.id, details: { source: 'online' } });
    revalidateAll();
    return { ok: true, data: { id: a.id, startsAt: start.toISOString(), endsAt: end.toISOString(), practitionerName: pr.name, treatmentName: t.name, locationName: l.name, locationAddress: l.address, locationPhone: l.phone, first: pt.first_name, email: d.email } };
  });
}

/* ====================== misc client helpers ====================== */
export async function searchPatientsAction(q: string): Promise<{ id: string; name: string; phone: string; email: string; dob: string | null }[]> {
  const s = await getSession(); if (!s || q.trim().length < 2) return [];
  return tenant(s, async (tx) => { const like = `%${q.trim()}%`; const rows = await tx`select id, first_name || ' ' || last_name as name, phone, email, dob::text as dob from patients where first_name || ' ' || last_name ilike ${like} or email ilike ${like} or phone ilike ${like} order by last_name, first_name limit 10`; return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, email: r.email, dob: r.dob })); });
}
export async function setLocationFilter(locationId: string) { const { cookies } = await import('next/headers'); (await cookies()).set('cf_loc', locationId, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 }); revalidateAll(); }

/* ====================== import from a previous system ====================== */
import { csvObjects, detectKind, mapProviders, mapFees, mapAttendance } from './importers';
export type ImportSummary = { practitioners: { added: number; updated: number }; treatments: { added: number; updated: number }; products: { added: number; updated: number }; patients: { added: number; updated: number; linked: number } };
export async function importData(input: { locationId: string; providersText?: string; feesText?: string; attendanceText?: string; disciplineOverrides?: Record<string, string>; sourceName?: string }): Promise<Result<ImportSummary>> {
  const s = await requireSession(); if (!can(s, 'manage_org')) return fail('Only the clinic owner can import data.');
  if (!uuid.safeParse(input.locationId).success) return fail('Choose the location these records belong to.');
  const providers = input.providersText ? (detectKind(input.providersText) === 'providers' ? mapProviders(csvObjects(input.providersText)) : null) : [];
  const fees = input.feesText ? (detectKind(input.feesText) === 'fees' ? mapFees(csvObjects(input.feesText)) : null) : { treatments: [], products: [], skipped: [] };
  const att = input.attendanceText ? (detectKind(input.attendanceText) === 'attendance' ? mapAttendance(csvObjects(input.attendanceText)) : null) : { patients: [], duplicates: 0, missingLast: 0 };
  if (!providers || !fees || !att) return fail('One of the files is not in a format this importer recognizes.');
  const source = (input.sourceName || 'previous system').slice(0, 80); const overrides = input.disciplineOverrides || {};
  const tz = s.settings.timezone; const sum: ImportSummary = { practitioners: { added: 0, updated: 0 }, treatments: { added: 0, updated: 0 }, products: { added: 0, updated: 0 }, patients: { added: 0, updated: 0, linked: 0 } };
  const tally = (bucket: { added: number; updated: number }, inserted: boolean) => { if (inserted) bucket.added++; else bucket.updated++; };
  return tenant(s, async (tx) => {
    const [loc] = await tx`select id from locations where id = ${input.locationId}`; if (!loc) return fail('Location not found.');
    const [{ n: existingPr }] = await tx`select count(*)::int as n from practitioners`;
    for (const [i, p] of providers.entries()) {
      const discipline = overrides[p.externalId] || p.discipline;
      const [row] = await tx`insert into practitioners (org_id, name, title, discipline, color, email, license_number, external_id, online, active)
        values (${s.orgId}, ${p.name}, ${p.title}, ${discipline}, ${COLORS[(existingPr + i) % COLORS.length]}, ${p.email}, ${p.license}, ${p.externalId}, false, true)
        on conflict (org_id, external_id) where external_id is not null do update set name = excluded.name, title = excluded.title, discipline = excluded.discipline, license_number = excluded.license_number
        returning id, (xmax = 0) as inserted`;
      tally(sum.practitioners, row.inserted);
      await tx`insert into practitioner_locations (org_id, practitioner_id, location_id) values (${s.orgId}, ${row.id}, ${input.locationId}) on conflict do nothing`;
    }
    for (const t of fees.treatments) {
      const [row] = await tx`insert into treatments (org_id, name, discipline, duration_min, price_cents, is_assessment, online, active, code, external_id)
        values (${s.orgId}, ${t.name}, ${t.discipline}, ${t.durationMin}, ${t.priceCents}, ${t.isAssessment}, false, ${t.active}, ${t.code}, ${t.externalId})
        on conflict (org_id, external_id) where external_id is not null do update set name = excluded.name, price_cents = excluded.price_cents, duration_min = excluded.duration_min, discipline = excluded.discipline, is_assessment = excluded.is_assessment, active = excluded.active, code = excluded.code
        returning (xmax = 0) as inserted`;
      tally(sum.treatments, row.inserted);
    }
    for (const p of fees.products) {
      const [row] = await tx`insert into products (org_id, name, price_cents, taxable, active, code, external_id) values (${s.orgId}, ${p.name}, ${p.priceCents}, ${p.taxable}, ${p.active}, ${p.code}, ${p.externalId})
        on conflict (org_id, external_id) where external_id is not null do update set name = excluded.name, price_cents = excluded.price_cents, active = excluded.active, code = excluded.code
        returning (xmax = 0) as inserted`;
      tally(sum.products, row.inserted);
    }
    // every practitioner can offer the services of their discipline
    await tx`insert into practitioner_treatments (org_id, practitioner_id, treatment_id) select ${s.orgId}, p.id, t.id from practitioners p join treatments t on t.discipline = p.discipline on conflict do nothing`;
    const prIds = new Map((await tx`select id, external_id from practitioners where external_id is not null`).map((r) => [r.external_id as string, r.id as string]));
    for (let i = 0; i < att.patients.length; i += 500) {
      const chunk = att.patients.slice(i, i + 500).map((p) => {
        const prId = p.providerKey ? prIds.get(p.providerKey) || null : null; if (prId) sum.patients.linked++;
        return { org_id: s.orgId, first_name: p.first, last_name: p.last, home_location_id: input.locationId, referred_by: `Imported from ${source}`, created_at: p.firstVisit ? localToUtc(p.firstVisit, 9 * 60, tz) : new Date(), created_by: s.userId, external_id: p.externalId,
          legacy: tx.json({ source, firstVisit: p.firstVisit, lastVisit: p.lastVisit, completed: p.completed, cancelled: p.cancelled, noShow: p.noShow, rebook: p.rebook, managingProvider: p.providerLabel, managingProviderId: prId } as never) };
      });
      const rows = await tx`insert into patients ${tx(chunk)} on conflict (org_id, external_id) where external_id is not null do update set legacy = excluded.legacy returning (xmax = 0) as inserted`;
      rows.forEach((r) => tally(sum.patients, r.inserted));
    }
    await log(tx, s, { action: 'data.import', entity: 'organization', details: { source, location: input.locationId, ...sum } });
    revalidateAll(); return { ok: true, data: sum };
  });
}
