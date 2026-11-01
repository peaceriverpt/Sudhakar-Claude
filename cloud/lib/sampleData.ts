import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Tx } from './db';
import { addDaysKey, invoiceTotals, localToUtc, todayKey, weekdayOfKey, COLORS, type InvoiceItem, type OrgSettings } from './util';

/* Realistic sample data for trying the app: practitioners, services, products, patients, ~3 months of
   appointments with charts, invoices and payments. Everything is tagged so it can be removed again.
   Sample rows are identified by external_id starting with "sample:" (patients also get the tag "Sample"). */

export const SAMPLE_PREFIX = 'sample:';
function rng(a: number) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const TREATMENTS: [string, string, number, number, boolean][] = [
  ['Physiotherapy Initial Assessment', 'Physiotherapy', 45, 12000, true], ['Physiotherapy Treatment', 'Physiotherapy', 30, 8500, false], ['Physiotherapy Extended Treatment', 'Physiotherapy', 45, 11000, false],
  ['Massage Therapy 30 min', 'Massage Therapy', 30, 7000, false], ['Massage Therapy 60 min', 'Massage Therapy', 60, 11500, false], ['Massage Therapy 90 min', 'Massage Therapy', 90, 16000, false],
  ['Chiropractic Initial Assessment', 'Chiropractic', 30, 9500, true], ['Chiropractic Adjustment', 'Chiropractic', 15, 5500, false],
  ['Acupuncture Initial Visit', 'Acupuncture', 60, 11000, true], ['Acupuncture Follow-up', 'Acupuncture', 45, 8500, false],
  ['Kinesiology Assessment', 'Kinesiology', 60, 10000, true], ['Active Rehab Session', 'Kinesiology', 45, 7500, false]];
const PRODUCTS: [string, number][] = [['Resistance Band Set', 2499], ['Foam Roller', 3999], ['Reusable Ice Pack', 1850], ['Kinesiology Tape', 1600], ['Cervical Pillow', 7900]];
const STAFF: [string, string, string, number[]][] = [ // name, title, discipline, location slots
  ['Priya Sharma', 'PT', 'Physiotherapy', [0]], ['Marcus Lee', 'PT', 'Physiotherapy', [0, 1]], ['Hannah Boucher', 'RMT', 'Massage Therapy', [0]], ['Daniel Okafor', 'PT', 'Physiotherapy', [1]],
  ['Sofia Reyes', 'DC', 'Chiropractic', [1]], ['Ethan Walsh', 'PT', 'Physiotherapy', [2]], ['Mei Chen', 'R.Ac', 'Acupuncture', [2]], ['Liam Patterson', 'RMT', 'Massage Therapy', [2]],
  ['Aisha Khan', 'PT', 'Physiotherapy', [3]], ['Noah Bergström', 'CSEP-CEP', 'Kinesiology', [3]], ['Olivia Tremblay', 'PT', 'Physiotherapy', [4]], ['Ravi Venkatesh', 'DC', 'Chiropractic', [4]], ['Grace Kim', 'RMT', 'Massage Therapy', [4]]];
const FIRSTS = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Amrit', 'Harpreet', 'Wei', 'Fatima', 'Omar', 'Chloe', 'Lucas', 'Emma', 'Mateo', 'Zara', 'Liam', 'Ava', 'Noor', 'Kai', 'Isla', 'Arjun', 'Mia', 'Leo', 'Nadia', 'Theo'];
const LASTS = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Martin', 'Singh', 'Gill', 'Dhaliwal', 'Nguyen', 'Tran', 'Wong', 'Chan', 'Ali', 'Hussain', 'Roy', 'Gagnon', 'Cote', 'Fortin', 'Lavoie', 'Pelletier'];
const INSURERS = ['Alberta Blue Cross', 'Sun Life', 'Manulife', 'Canada Life', 'Green Shield', 'WCB Alberta', 'Desjardins', null, null];
const COMPLAINTS = ['low back pain', 'neck pain', 'shoulder impingement', 'knee pain post-ACL repair', 'plantar fasciitis', 'tennis elbow', 'post-MVA whiplash', 'hip osteoarthritis', 'rotator cuff strain', 'ankle sprain'];
const NOTES = { S: ['Reports pain 4/10, improved from 6/10 last visit. Sleeping better.', 'Pain 6/10 after long drive yesterday. Stiff in the morning.', 'Feeling 60% better overall. Able to return to light jogging.', 'Flare-up over the weekend after gardening. Pain 7/10.'],
  O: ['Lumbar flexion 75%, extension 50% with pain. SLR negative bilaterally.', 'Cervical rotation R 60°, L 70°. Upper trap hypertonicity R>L. Neuro intact.', 'Shoulder flexion 150°, ER 45°. Painful arc 80-110°. Empty can +.', 'Knee flexion 120°, extension full. Mild effusion.'],
  A: ['Progressing well toward goals. Mechanical LBP, improving.', 'Plateau noted; consider progressing load.', 'Good response to manual therapy and exercise.', 'Irritable today; modified plan accordingly.'],
  P: ['Manual therapy, core stabilization progression, HEP reviewed. 1x/week for 4 weeks.', 'STM upper traps, mobs grade III, postural education. Re-assess in 2 visits.', 'Strengthening progression, scapular control. Continue 2x/week.', 'Modalities for pain, gentle ROM. Re-assess next visit.'] };

async function insertChunks(tx: Tx, table: string, rows: Record<string, unknown>[], size = 400) { for (let i = 0; i < rows.length; i += size) await tx`insert into ${tx(table)} ${tx(rows.slice(i, i + size) as never)}`; }

export async function hasSampleData(tx: Tx) { const [r] = await tx`select exists (select 1 from patients where external_id like ${SAMPLE_PREFIX + '%'}) or exists (select 1 from practitioners where external_id like ${SAMPLE_PREFIX + '%'}) as has`; return r.has as boolean; }

export async function loadSampleData(tx: Tx, orgId: string, userId: string, settings: OrgSettings) {
  const rnd = rng(Date.now() % 2147483647); const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]; const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const tz = settings.timezone; const today = todayKey(tz); const P = SAMPLE_PREFIX;
  const locs = (await tx`select id, name from locations where active order by created_at`) as unknown as { id: string; name: string }[];
  if (!locs.length) throw new Error('Add a location first.');
  const locFor = (slot: number) => locs[slot % locs.length].id;

  const txRows = TREATMENTS.map(([name, discipline, duration_min, price_cents, is_assessment], i) => ({ id: randomUUID(), org_id: orgId, name, discipline, duration_min, price_cents, is_assessment, online: true, active: true, sort_order: 100 + i, external_id: `${P}tx:${i}` }));
  await insertChunks(tx, 'treatments', txRows);
  await insertChunks(tx, 'products', PRODUCTS.map(([name, price_cents], i) => ({ id: randomUUID(), org_id: orgId, name, price_cents, taxable: true, active: true, external_id: `${P}pd:${i}` })));
  const products = PRODUCTS.map(([name, price]) => ({ name, price }));

  type Pr = { id: string; discipline: string; shifts: { weekday: number; start: number; end: number; loc: string }[] };
  const prs: Pr[] = []; const prRows: Record<string, unknown>[] = [], plRows: Record<string, unknown>[] = [], shRows: Record<string, unknown>[] = [], ptRows: Record<string, unknown>[] = [];
  const [{ n: existing }] = await tx`select count(*)::int as n from practitioners`;
  STAFF.forEach(([name, title, discipline, slots], i) => {
    const id = randomUUID(); const locIds = [...new Set(slots.map(locFor))];
    prRows.push({ id, org_id: orgId, name, title, discipline, color: COLORS[(existing + i) % COLORS.length], email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com', bio: `${name.split(' ')[0]} has practised ${discipline.toLowerCase()} for ${between(3, 18)} years with a focus on evidence-based care.`, online: true, active: true, external_id: `${P}pr:${i}` });
    locIds.forEach((l) => plRows.push({ org_id: orgId, practitioner_id: id, location_id: l }));
    txRows.filter((t) => t.discipline === discipline).forEach((t) => ptRows.push({ org_id: orgId, practitioner_id: id, treatment_id: t.id }));
    const shifts: Pr['shifts'] = []; const pattern = i % 3;
    for (const d of [1, 2, 3, 4, 5]) { if (pattern === 1 && d === 3) continue; if (pattern === 2 && d === 5) continue; shifts.push({ weekday: d, start: pattern === 2 ? 600 : 480, end: pattern === 2 ? 1140 : 1020, loc: locIds.length > 1 && d % 2 === 0 ? locIds[1] : locIds[0] }); }
    if (i % 4 === 0) shifts.push({ weekday: 6, start: 540, end: 840, loc: locIds[0] });
    shifts.forEach((s) => shRows.push({ org_id: orgId, practitioner_id: id, location_id: s.loc, weekday: s.weekday, start_min: s.start, end_min: s.end }));
    prs.push({ id, discipline, shifts });
  });
  await insertChunks(tx, 'practitioners', prRows); await insertChunks(tx, 'practitioner_locations', plRows); await insertChunks(tx, 'shifts', shRows); await insertChunks(tx, 'practitioner_treatments', ptRows);

  const patients: { id: string; home: string; ins: { company: string; pct: number } | null }[] = []; const patientRows: Record<string, unknown>[] = [], insRows: Record<string, unknown>[] = [];
  for (let i = 0; i < 260; i++) {
    const id = randomUUID(); const first = pick(FIRSTS), last = pick(LASTS); const home = locFor(between(0, 4)); const ins = pick(INSURERS);
    patientRows.push({ id, org_id: orgId, first_name: first, last_name: last, dob: `${between(1950, 2010)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`, sex: pick(['F', 'M', 'X']), email: `${first}.${last}.${i}@example.com`.toLowerCase(), phone: `(${pick(['780', '403', '587'])}) 555-${between(1000, 9999)}`, address: `${between(100, 9999)} ${pick(['Main', 'Maple', 'Oak', 'River', 'Park'])} ${pick(['St', 'Ave', 'Rd'])}`, city: locs.find((l) => l.id === home)!.name, province: 'AB', postal: 'T8V 1A1', health_number: String(between(100000000, 999999999)), home_location_id: home, emergency_name: `${pick(FIRSTS)} ${last}`, emergency_phone: `(780) 555-${between(1000, 9999)}`, notes: rnd() < 0.3 ? 'Prefers morning appointments.' : '', alerts: rnd() < 0.08 ? 'Allergic to latex' : '', tags: ['Sample'], referred_by: pick(['Google', 'Word of mouth', 'Physician referral', 'Instagram', 'Walk-in', 'Returning']), complaint: pick(COMPLAINTS), consent_on_file: rnd() < 0.9, created_at: localToUtc(addDaysKey(today, -between(0, 400)), 540, tz), created_by: userId, external_id: `${P}pt:${i}` });
    const pct = ins === 'WCB Alberta' ? 100 : pick([80, 80, 100]);
    if (ins) insRows.push({ org_id: orgId, patient_id: id, company: ins, policy: 'P' + between(100000, 999999), member_id: String(between(1000, 9999)), coverage_pct: pct, annual_max_cents: ins === 'WCB Alberta' ? 0 : pick([50000, 75000, 100000, 150000]) });
    patients.push({ id, home, ins: ins ? { company: ins, pct } : null });
  }
  await insertChunks(tx, 'patients', patientRows); await insertChunks(tx, 'patient_insurers', insRows);

  const templates = (await tx`select id, name, discipline, sections from chart_templates where active`) as unknown as { id: string; name: string; discipline: string; sections: { key: string }[] }[];
  const tplFor = (discipline: string, assessment: boolean) => { const own = templates.filter((t) => t.discipline === discipline); return (assessment && own.find((t) => /initial|assess/i.test(t.name))) || own.find((t) => !/initial|assess/i.test(t.name)) || templates.find((t) => !t.discipline) || templates[0]; };

  const appts: Record<string, unknown>[] = [], charts: Record<string, unknown>[] = [], invoices: Record<string, unknown>[] = [], payments: Record<string, unknown>[] = [];
  const pending: { inv: Record<string, unknown> }[] = []; const busy = new Map<string, [number, number][]>(); const now = Date.now();
  const byDisc = (d: string) => txRows.filter((t) => t.discipline === d);
  for (let off = -70; off <= 14; off++) {
    const day = addDaysKey(today, off); const wd = weekdayOfKey(day);
    for (const pr of prs) for (const sh of pr.shifts.filter((s) => s.weekday === wd)) {
      const fill = off < -7 ? between(10, 18) : off <= 0 ? between(30, 45) : off < 7 ? between(28, 45) : between(8, 22);
      let t = sh.start;
      while (t < sh.end - 15) {
        const tr = pick(byDisc(pr.discipline)); if (t + tr.duration_min > sh.end) { t += 15; continue; }
        if (rnd() * 100 >= fill) { t += 15; continue; }
        const local = patients.filter((p) => p.home === sh.loc); const patient = rnd() < 0.9 && local.length ? pick(local) : pick(patients);
        const start = localToUtc(day, t, tz), end = new Date(start.getTime() + tr.duration_min * 60000);
        const bz = busy.get(pr.id) || []; if (bz.some(([a, b]) => a < end.getTime() && b > start.getTime())) { t += 15; continue; } bz.push([start.getTime(), end.getTime()]); busy.set(pr.id, bz);
        let status = 'booked'; if (off < 0) { const r = rnd(); status = r < 0.86 ? 'completed' : r < 0.93 ? 'no_show' : 'cancelled'; } else if (off === 0) status = end.getTime() < now ? (rnd() < 0.9 ? 'completed' : 'no_show') : start.getTime() < now ? 'in_progress' : rnd() < 0.3 ? 'arrived' : 'booked';
        const apptId = randomUUID();
        appts.push({ id: apptId, org_id: orgId, patient_id: patient.id, practitioner_id: pr.id, location_id: sh.loc, treatment_id: tr.id, starts_at: start, ends_at: end, status, source: rnd() < 0.35 ? 'online' : 'staff', notes: '', created_by: userId, created_at: new Date(start.getTime() - between(1, 20) * 86400000) });
        if (status === 'completed') {
          const tpl = tplFor(pr.discipline, tr.is_assessment);
          if (tpl) { const fields: Record<string, string> = {}; tpl.sections.forEach((s, i) => { fields[s.key] = pick(NOTES[(['S', 'O', 'A', 'P'] as const)[i % 4]]); }); const signed = off < -2 ? rnd() < 0.985 : rnd() < 0.7;
            charts.push({ org_id: orgId, appointment_id: apptId, patient_id: patient.id, practitioner_id: pr.id, location_id: sh.loc, service_date: start, template_id: tpl.id, template_name: tpl.name, fields: tx.json(fields as never), signed, signed_at: signed ? new Date(end.getTime() + between(5, 240) * 60000) : null, signed_by: signed ? userId : null, created_by: userId }); }
          const items: InvoiceItem[] = [{ id: 'tx', desc: tr.name, qty: 1, priceCents: tr.price_cents, taxable: false, kind: 'treatment' }]; if (rnd() < 0.12) { const pd = pick(products); items.push({ id: 'pd', desc: pd.name, qty: 1, priceCents: pd.price, taxable: true, kind: 'product' }); }
          const tot = invoiceTotals(items, 0, settings.taxRateBp); const insPortion = patient.ins ? Math.round((tr.price_cents * patient.ins.pct) / 100) : 0; const invId = randomUUID();
          const inv = { id: invId, org_id: orgId, number: '', patient_id: patient.id, appointment_id: apptId, location_id: sh.loc, practitioner_id: pr.id, issued_at: end, items: tx.json(items as never), discount_cents: 0, tax_rate_bp: settings.taxRateBp, tax_name: settings.taxName, insurer: patient.ins?.company || '', insurer_portion_cents: insPortion, subtotal_cents: tot.subtotal, tax_cents: tot.tax, total_cents: tot.total, created_by: userId };
          invoices.push(inv); pending.push({ inv });
          const bal = tot.total - insPortion; if (bal > 0 && rnd() < 0.9) payments.push({ org_id: orgId, invoice_id: invId, paid_at: end, method: pick(['Credit Card', 'Debit', 'Cash', 'E-transfer']), amount_cents: bal, note: '', created_by: userId });
          if (insPortion > 0 && rnd() < 0.8) payments.push({ org_id: orgId, invoice_id: invId, paid_at: new Date(end.getTime() + between(3, 25) * 86400000), method: 'Insurance', amount_cents: insPortion, note: patient.ins!.company, created_by: userId });
        }
        t += tr.duration_min;
      }
    }
  }
  // reserve a block of invoice numbers, in date order
  const [{ next_number: last }] = await tx`insert into invoice_counters (org_id, next_number) values (${orgId}, ${1000 + invoices.length}) on conflict (org_id) do update set next_number = invoice_counters.next_number + ${invoices.length} returning next_number`;
  invoices.sort((a, b) => (a.issued_at as Date).getTime() - (b.issued_at as Date).getTime()).forEach((inv, i) => { inv.number = settings.invoicePrefix + (last - invoices.length + 1 + i); });
  await insertChunks(tx, 'appointments', appts); await insertChunks(tx, 'charts', charts); await insertChunks(tx, 'invoices', invoices); await insertChunks(tx, 'payments', payments);
  await insertChunks(tx, 'waitlist', patients.slice(0, 6).map((p, i) => ({ org_id: orgId, patient_id: p.id, treatment_id: txRows[i % txRows.length].id, practitioner_id: i % 2 ? prs[i].id : null, location_id: p.home, notes: i % 2 ? 'Any afternoon' : 'ASAP, flexible' })));
  void pending;
  return { practitioners: prs.length, patients: patients.length, appointments: appts.length, invoices: invoices.length, charts: charts.length };
}

export async function removeSampleData(tx: Tx) {
  const like = SAMPLE_PREFIX + '%';
  const p = await tx`delete from patients where external_id like ${like}`; // appointments, charts, invoices, payments, insurers, wait list follow
  await tx`delete from appointments where practitioner_id in (select id from practitioners where external_id like ${like}) or treatment_id in (select id from treatments where external_id like ${like})`;
  const pr = await tx`delete from practitioners where external_id like ${like}`;
  await tx`delete from treatments where external_id like ${like}`; await tx`delete from products where external_id like ${like}`;
  return { patients: p.count, practitioners: pr.count };
}
