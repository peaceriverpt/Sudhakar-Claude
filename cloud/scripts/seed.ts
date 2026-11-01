/* Creates a demo organization with five clinics, staff, patients, visits, charts and invoices.
   Login: demo@clinicflow.app / demo-password-123 */
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { sslFor } from '../lib/dbssl';
import { localToUtc, addDaysKey, weekdayOfKey, todayKey, invoiceTotals, DEFAULT_SETTINGS } from '../lib/util';

const owner = postgres(process.env.DATABASE_OWNER_URL!, { max: 1, ssl: sslFor(process.env.DATABASE_OWNER_URL!), transform: { undefined: null } });
const TZ = 'America/Edmonton';
function rng(a: number) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = rng(20261101); const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]; const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

async function main() {
  const existing = await owner`select id from organizations where slug = 'demo'`; if (existing.length) { await owner`delete from organizations where slug = 'demo'`; await owner`delete from users where email = 'demo@clinicflow.app'`; console.log('removed previous demo org'); }
  const [u] = await owner`insert into users (email, name, password_hash) values ('demo@clinicflow.app', 'Dr. Sudhakar (Demo)', ${await bcrypt.hash('demo-password-123', 10)}) returning id`;
  const [o] = await owner`insert into organizations (name, slug, settings) values ('Peace River Wellness Group', 'demo', ${owner.json({ ...DEFAULT_SETTINGS, timezone: TZ } as never)}) returning id`;
  const org = o.id as string;
  await owner`insert into memberships (org_id, user_id, role) values (${org}, ${u.id}, 'owner')`;
  await owner`insert into invoice_counters (org_id, next_number) values (${org}, 1001)`;
  const locs = await owner`insert into locations (org_id, name, address, phone, color, timezone) values
    (${org}, 'Grande Prairie', '10101 100 Ave, Grande Prairie, AB', '(780) 555-0101', '#0f766e', ${TZ}), (${org}, 'Peace River', '9901 100 St, Peace River, AB', '(780) 555-0102', '#2563eb', ${TZ}),
    (${org}, 'Calgary', '1200 17 Ave SW, Calgary, AB', '(403) 555-0103', '#7c3aed', ${TZ}), (${org}, 'Edmonton', '8205 104 St NW, Edmonton, AB', '(780) 555-0104', '#ea580c', ${TZ}), (${org}, 'Richmond Hill', '9350 Yonge St, Richmond Hill, ON', '(905) 555-0105', '#db2777', 'America/Toronto') returning id, name`;
  const L: Record<string, string> = Object.fromEntries(locs.map((l) => [l.name as string, l.id as string]));
  const txDefs = [['Physiotherapy Initial Assessment', 'Physiotherapy', 45, 12000, true], ['Physiotherapy Treatment', 'Physiotherapy', 30, 8500, false], ['Physiotherapy Extended Treatment', 'Physiotherapy', 45, 11000, false], ['Massage Therapy 30 min', 'Massage Therapy', 30, 7000, false], ['Massage Therapy 60 min', 'Massage Therapy', 60, 11500, false], ['Massage Therapy 90 min', 'Massage Therapy', 90, 16000, false], ['Chiropractic Initial Assessment', 'Chiropractic', 30, 9500, true], ['Chiropractic Adjustment', 'Chiropractic', 15, 5500, false], ['Acupuncture Initial Visit', 'Acupuncture', 60, 11000, true], ['Acupuncture Follow-up', 'Acupuncture', 45, 8500, false], ['Kinesiology Assessment', 'Kinesiology', 60, 10000, true], ['Active Rehab Session', 'Kinesiology', 45, 7500, false]] as const;
  const txs = await owner`insert into treatments ${owner(txDefs.map(([name, discipline, duration_min, price_cents, is_assessment], i) => ({ org_id: org, name, discipline, duration_min, price_cents, is_assessment, sort_order: i })))} returning *`;
  const products = await owner`insert into products ${owner([['Resistance Band Set', 2499], ['Foam Roller', 3999], ['Reusable Ice Pack', 1850], ['Kinesiology Tape', 1600], ['Cervical Pillow', 7900]].map(([name, price_cents]) => ({ org_id: org, name, price_cents, taxable: true })))} returning *`;
  const tpls = await owner`insert into chart_templates ${owner([
    { org_id: org, name: 'SOAP Note', discipline: '', sections: owner.json([{ key: 'S', label: 'Subjective', placeholder: 'Patient report, pain scale, changes since last visit…' }, { key: 'O', label: 'Objective', placeholder: 'ROM, strength, special tests…' }, { key: 'A', label: 'Assessment', placeholder: 'Clinical impression…' }, { key: 'P', label: 'Plan', placeholder: 'Treatment today, HEP, next visit…' }] as never) },
    { org_id: org, name: 'Physiotherapy Initial Assessment', discipline: 'Physiotherapy', sections: owner.json([{ key: 'history', label: 'History of Present Condition', placeholder: '' }, { key: 'pmh', label: 'Past Medical History / Red Flags', placeholder: '' }, { key: 'objective', label: 'Objective Findings', placeholder: '' }, { key: 'diagnosis', label: 'Clinical Impression', placeholder: '' }, { key: 'goals', label: 'Goals', placeholder: '' }, { key: 'plan', label: 'Treatment Plan', placeholder: '' }] as never) },
    { org_id: org, name: 'Massage Therapy Treatment', discipline: 'Massage Therapy', sections: owner.json([{ key: 'S', label: 'Subjective', placeholder: '' }, { key: 'O', label: 'Findings', placeholder: '' }, { key: 'T', label: 'Treatment', placeholder: '' }, { key: 'P', label: 'Plan / Self-care', placeholder: '' }] as never) },
    { org_id: org, name: 'Chiropractic Visit', discipline: 'Chiropractic', sections: owner.json([{ key: 'S', label: 'Subjective', placeholder: '' }, { key: 'O', label: 'Objective', placeholder: '' }, { key: 'adj', label: 'Adjustments / Modalities', placeholder: '' }, { key: 'P', label: 'Plan', placeholder: '' }] as never) }])} returning *`;
  await owner`insert into intake_forms (org_id, name, fields) values (${org}, 'New Patient Intake', ${owner.json([{ key: 'q1', label: 'What brings you in today?', type: 'textarea', required: true }, { key: 'q2', label: 'When did this start?', type: 'text', required: false }, { key: 'q3', label: 'Current pain level (0 to 10)', type: 'number', required: false }, { key: 'q4', label: 'Medical conditions, surgeries, medications', type: 'textarea', required: false }, { key: 'q5', label: 'Allergies', type: 'text', required: false }, { key: 'q6', label: 'I consent to assessment and treatment and I have read the privacy policy.', type: 'consent', required: true }] as never)})`;

  const staff: [string, string, string, string[]][] = [['Priya Sharma', 'PT', 'Physiotherapy', ['Grande Prairie']], ['Marcus Lee', 'PT', 'Physiotherapy', ['Grande Prairie', 'Peace River']], ['Hannah Boucher', 'RMT', 'Massage Therapy', ['Grande Prairie']], ['Daniel Okafor', 'PT', 'Physiotherapy', ['Peace River']], ['Sofia Reyes', 'DC', 'Chiropractic', ['Peace River']], ['Ethan Walsh', 'PT', 'Physiotherapy', ['Calgary']], ['Mei Chen', 'R.Ac', 'Acupuncture', ['Calgary']], ['Liam Patterson', 'RMT', 'Massage Therapy', ['Calgary']], ['Aisha Khan', 'PT', 'Physiotherapy', ['Edmonton']], ['Noah Bergström', 'CSEP-CEP', 'Kinesiology', ['Edmonton']], ['Olivia Tremblay', 'PT', 'Physiotherapy', ['Richmond Hill']], ['Ravi Venkatesh', 'DC', 'Chiropractic', ['Richmond Hill']], ['Grace Kim', 'RMT', 'Massage Therapy', ['Richmond Hill']]];
  const COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04', '#9333ea', '#dc2626', '#4f46e5', '#059669', '#0f766e'];
  const prs: { id: string; discipline: string; shifts: { weekday: number; start: number; end: number; loc: string }[] }[] = [];
  for (const [i, [name, title, discipline, locNames]] of staff.entries()) {
    const [p] = await owner`insert into practitioners (org_id, name, title, discipline, color, email, phone, bio) values (${org}, ${name}, ${title}, ${discipline}, ${COLORS[i]}, ${name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com'}, ${'(780) 555-0' + between(200, 299)}, ${`${name.split(' ')[0]} has practised ${discipline.toLowerCase()} for ${between(3, 18)} years with a focus on evidence-based care.`}) returning id`;
    for (const ln of locNames) await owner`insert into practitioner_locations (org_id, practitioner_id, location_id) values (${org}, ${p.id}, ${L[ln]})`;
    await owner`insert into practitioner_treatments (org_id, practitioner_id, treatment_id) select ${org}, ${p.id}, id from treatments where org_id = ${org} and discipline = ${discipline}`;
    const shifts: { weekday: number; start: number; end: number; loc: string }[] = []; const pattern = i % 3;
    for (const d of [1, 2, 3, 4, 5]) { if (pattern === 1 && d === 3) continue; if (pattern === 2 && d === 5) continue; const loc = locNames.length > 1 && d % 2 === 0 ? L[locNames[1]] : L[locNames[0]]; shifts.push({ weekday: d, start: pattern === 2 ? 600 : 480, end: pattern === 2 ? 1140 : 1020, loc }); }
    if (i % 4 === 0) shifts.push({ weekday: 6, start: 540, end: 840, loc: L[locNames[0]] });
    for (const sh of shifts) await owner`insert into shifts (org_id, practitioner_id, location_id, weekday, start_min, end_min) values (${org}, ${p.id}, ${sh.loc}, ${sh.weekday}, ${sh.start}, ${sh.end})`;
    prs.push({ id: p.id, discipline, shifts });
  }
  const firsts = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Amrit', 'Harpreet', 'Wei', 'Fatima', 'Omar', 'Chloe', 'Lucas', 'Emma', 'Mateo', 'Zara', 'Liam', 'Ava', 'Noor', 'Kai', 'Isla', 'Arjun', 'Mia', 'Leo', 'Nadia', 'Theo'];
  const lasts = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Martin', 'Singh', 'Gill', 'Dhaliwal', 'Nguyen', 'Tran', 'Wong', 'Chan', 'Ali', 'Hussain', 'Roy', 'Gagnon', 'Cote', 'Fortin', 'Lavoie', 'Pelletier'];
  const insurers = ['Alberta Blue Cross', 'Sun Life', 'Manulife', 'Canada Life', 'Green Shield', 'WCB Alberta', 'Desjardins', null, null];
  const complaints = ['low back pain', 'neck pain', 'shoulder impingement', 'knee pain post-ACL repair', 'plantar fasciitis', 'tennis elbow', 'post-MVA whiplash', 'hip osteoarthritis', 'rotator cuff strain', 'ankle sprain'];
  const locIds = Object.values(L); const today = todayKey(TZ);
  const patientRows = Array.from({ length: 260 }, (_, i) => { const first = pick(firsts), last = pick(lasts); const home = pick(locIds); return { org_id: org, first_name: first, last_name: last, dob: `${between(1950, 2010)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`, sex: pick(['F', 'M', 'X']), email: `${first}.${last}${i}@example.com`.toLowerCase(), phone: `(${pick(['780', '403', '905', '587'])}) 555-${String(between(1000, 9999))}`, address: `${between(100, 9999)} ${pick(['Main', 'Maple', 'Oak', 'River', 'Park'])} ${pick(['St', 'Ave', 'Rd'])}`, city: locs.find((l) => l.id === home)!.name, province: home === L['Richmond Hill'] ? 'ON' : 'AB', postal: 'T8V 1A1', health_number: String(between(100000000, 999999999)), home_location_id: home, emergency_name: pick(firsts) + ' ' + last, emergency_phone: `(780) 555-${between(1000, 9999)}`, notes: rnd() < 0.3 ? 'Prefers morning appointments.' : '', alerts: rnd() < 0.08 ? 'Allergic to latex' : '', tags: rnd() < 0.15 ? ['VIP'] : [], referred_by: pick(['Google', 'Word of mouth', 'Physician referral', 'Instagram', 'Walk-in', 'Returning']), complaint: pick(complaints), consent_on_file: rnd() < 0.9, created_at: localToUtc(addDaysKey(today, -between(0, 400)), 540, TZ) }; });
  const patients = await owner`insert into patients ${owner(patientRows)} returning id, home_location_id`;
  for (const p of patients) { const ins = pick(insurers); if (ins) await owner`insert into patient_insurers (org_id, patient_id, company, policy, member_id, coverage_pct, annual_max_cents) values (${org}, ${p.id}, ${ins}, ${'P' + between(100000, 999999)}, ${String(between(1000, 9999))}, ${ins === 'WCB Alberta' ? 100 : pick([80, 80, 100])}, ${ins === 'WCB Alberta' ? 0 : pick([50000, 75000, 100000, 150000])})`; }
  const insByPatient = Object.fromEntries((await owner`select patient_id, company, coverage_pct from patient_insurers where org_id = ${org}`).map((r) => [r.patient_id, r]));
  const S = { S: ['Reports pain 4/10, improved from 6/10 last visit. Sleeping better.', 'Pain 6/10 after long drive yesterday. Stiff in the morning.', 'Feeling 60% better overall. Able to return to light jogging.', 'Flare-up over the weekend after gardening. Pain 7/10.'], O: ['Lumbar flexion 75%, extension 50% with pain. SLR negative bilaterally.', 'Cervical rotation R 60°, L 70°. Upper trap hypertonicity R>L. Neuro intact.', 'Shoulder flexion 150°, ER 45°. Painful arc 80-110°. Empty can +.', 'Knee flexion 120°, extension full. Mild effusion.'], A: ['Progressing well toward goals. Mechanical LBP, improving.', 'Plateau noted; consider progressing load.', 'Good response to manual therapy and exercise.', 'Irritable today; modified plan accordingly.'], P: ['Manual therapy L-spine, core stabilization progression, HEP reviewed. 1x/week for 4 weeks.', 'STM upper traps, cervical mobs grade III, postural education. Re-assess in 2 visits.', 'Rotator cuff strengthening progression, scapular control. Continue 2x/week.', 'Modalities for pain, gentle ROM. Re-assess next visit.'] };
  const byDisc: Record<string, typeof txs> = {}; txs.forEach((t) => (byDisc[t.discipline] = byDisc[t.discipline] || []).push(t));
  let invoiceNo = 1001; const nowMs = Date.now(); let nAppts = 0;
  const busy: Record<string, [number, number][]> = {};
  for (let off = -70; off <= 14; off++) {
    const day = addDaysKey(today, off); const wd = weekdayOfKey(day);
    for (const pr of prs) for (const sh of pr.shifts.filter((s) => s.weekday === wd)) {
      const fill = off < -7 ? between(8, 15) : off <= 0 ? between(30, 45) : off < 7 ? between(28, 45) : between(8, 22);
      let t = sh.start;
      while (t < sh.end - 15) {
        const tx = pick(byDisc[pr.discipline]); if (t + tx.duration_min > sh.end) { t += 15; continue; }
        if (rnd() * 100 < fill) {
          const local = patients.filter((p) => p.home_location_id === sh.loc); const patient = rnd() < 0.9 && local.length ? pick(local) : pick(patients);
          const start = localToUtc(day, t, TZ); const end = new Date(start.getTime() + tx.duration_min * 60000);
          const bz = busy[pr.id] || (busy[pr.id] = []); if (!bz.some(([a, b]) => a < end.getTime() && b > start.getTime())) {
            let status = 'booked'; if (off < 0) { const r = rnd(); status = r < 0.86 ? 'completed' : r < 0.93 ? 'no_show' : 'cancelled'; } else if (off === 0) { status = end.getTime() < nowMs ? (rnd() < 0.9 ? 'completed' : 'no_show') : start.getTime() < nowMs ? 'in_progress' : rnd() < 0.3 ? 'arrived' : 'booked'; }
            const [a] = await owner`insert into appointments (org_id, patient_id, practitioner_id, location_id, treatment_id, starts_at, ends_at, status, source, created_at) values (${org}, ${patient.id}, ${pr.id}, ${sh.loc}, ${tx.id}, ${start}, ${end}, ${status}::appt_status, ${rnd() < 0.35 ? 'online' : 'staff'}::appt_source, ${new Date(start.getTime() - between(1, 20) * 86400000)}) returning id`;
            bz.push([start.getTime(), end.getTime()]); nAppts++;
            if (status === 'completed') {
              const tpl = tx.is_assessment && pr.discipline === 'Physiotherapy' ? tpls[1] : pr.discipline === 'Massage Therapy' ? tpls[2] : pr.discipline === 'Chiropractic' ? tpls[3] : tpls[0];
              const fields: Record<string, string> = {}; (tpl.sections as { key: string }[]).forEach((s, i) => { fields[s.key] = pick(S[(['S', 'O', 'A', 'P'] as const)[i % 4]]); });
              const signed = off < -2 ? rnd() < 0.985 : rnd() < 0.7;
              await owner`insert into charts (org_id, appointment_id, patient_id, practitioner_id, location_id, service_date, template_id, template_name, fields, signed, signed_at, signed_by) values (${org}, ${a.id}, ${patient.id}, ${pr.id}, ${sh.loc}, ${start}, ${tpl.id}, ${tpl.name}, ${owner.json(fields as never)}, ${signed}, ${signed ? new Date(end.getTime() + between(5, 240) * 60000) : null}, ${signed ? u.id : null})`;
              const items = [{ id: 'tx', desc: tx.name, qty: 1, priceCents: tx.price_cents, taxable: false, kind: 'treatment' }]; if (rnd() < 0.12) { const pd = pick(products); items.push({ id: 'pd', desc: pd.name, qty: 1, priceCents: pd.price_cents, taxable: true, kind: 'product' }); }
              const tot = invoiceTotals(items as never, 0, 500); const ins = insByPatient[patient.id]; const insPortion = ins ? Math.round((tx.price_cents * ins.coverage_pct) / 100) : 0;
              const [inv] = await owner`insert into invoices (org_id, number, patient_id, appointment_id, location_id, practitioner_id, issued_at, items, tax_rate_bp, tax_name, insurer, insurer_portion_cents, subtotal_cents, tax_cents, total_cents, created_by) values (${org}, ${'INV-' + invoiceNo++}, ${patient.id}, ${a.id}, ${sh.loc}, ${pr.id}, ${end}, ${owner.json(items as never)}, 500, 'GST', ${ins?.company || ''}, ${insPortion}, ${tot.subtotal}, ${tot.tax}, ${tot.total}, ${u.id}) returning id`;
              const bal = tot.total - insPortion; if (bal > 0 && rnd() < 0.9) await owner`insert into payments (org_id, invoice_id, paid_at, method, amount_cents) values (${org}, ${inv.id}, ${end}, ${pick(['Credit Card', 'Debit', 'Cash', 'E-transfer'])}, ${bal})`;
              if (insPortion > 0 && rnd() < 0.8) await owner`insert into payments (org_id, invoice_id, paid_at, method, amount_cents, note) values (${org}, ${inv.id}, ${new Date(end.getTime() + between(3, 25) * 86400000)}, 'Insurance', ${insPortion}, ${ins.company})`;
            }
            t += tx.duration_min; continue;
          }
        }
        t += 15;
      }
    }
  }
  await owner`update invoice_counters set next_number = ${invoiceNo} where org_id = ${org}`;
  for (let i = 0; i < 6; i++) await owner`insert into waitlist (org_id, patient_id, treatment_id, practitioner_id, location_id, notes) values (${org}, ${patients[i].id}, ${txs[i % txs.length].id}, ${i % 2 ? prs[i].id : null}, ${patients[i].home_location_id}, ${i % 2 ? 'Any afternoon' : 'ASAP, flexible'})`;
  console.log(`seeded demo org: ${patients.length} patients, ${nAppts} appointments, ${invoiceNo - 1001} invoices`);
  await owner.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
