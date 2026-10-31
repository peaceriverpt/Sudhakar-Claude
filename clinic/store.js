/* ClinicFlow — data layer
 * All clinic data lives in the browser (localStorage) under one key.
 * Everything is plain JSON so it can be exported / imported as a backup.
 */
(function (global) {
  'use strict';

  const KEY = 'clinicflow:v1';

  /* ---------- small utilities ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const dateKey = (d) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const startOfDay = (d) => { d = new Date(d); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (d, n) => { d = new Date(d); d.setDate(d.getDate() + n); return d; };
  const addMinutes = (d, n) => new Date(new Date(d).getTime() + n * 60000);
  const startOfWeek = (d) => { d = startOfDay(d); const dow = (d.getDay() + 6) % 7; return addDays(d, -dow); }; // Monday
  const minutesOf = (d) => { d = new Date(d); return d.getHours() * 60 + d.getMinutes(); };
  const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const fmtHM = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fmtDate = (d) => { d = new Date(d); return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
  const fmtShortDate = (d) => { d = new Date(d); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
  const fmtTime = (d) => { d = new Date(d); let h = d.getHours(); const m = pad(d.getMinutes()); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${h}:${m} ${ap}`; };
  const fmtMoney = (n) => { n = Number(n) || 0; const s = Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (n < 0 ? '-$' : '$') + s; };
  const age = (dob) => { if (!dob) return ''; const b = parseKey(dob); const t = new Date(); let a = t.getFullYear() - b.getFullYear(); if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--; return a; };
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  /* ---------- seeded demo data ---------- */
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04', '#9333ea', '#dc2626', '#4f46e5', '#059669'];

  function seed() {
    const rnd = mulberry32(20261031);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

    const settings = {
      clinicName: 'Peace River Wellness Group',
      currency: 'CAD',
      taxRate: 5,
      taxName: 'GST',
      slotMinutes: 15,
      openHour: 7,
      closeHour: 20,
      bookingWindowDays: 60,
      onlineBookingEnabled: true,
      invoicePrefix: 'INV-',
      nextInvoiceNumber: 1001,
      cancellationPolicy: '24 hours notice is required for cancellations. Late cancellations and no-shows may be charged the full treatment fee.',
      reminderHours: 24,
    };

    const locations = [
      { id: 'loc_gp', name: 'Grande Prairie', address: '10101 100 Ave, Grande Prairie, AB', phone: '(780) 555-0101', color: '#0f766e' },
      { id: 'loc_pr', name: 'Peace River', address: '9901 100 St, Peace River, AB', phone: '(780) 555-0102', color: '#2563eb' },
      { id: 'loc_cal', name: 'Calgary', address: '1200 17 Ave SW, Calgary, AB', phone: '(403) 555-0103', color: '#7c3aed' },
      { id: 'loc_edm', name: 'Edmonton', address: '8205 104 St NW, Edmonton, AB', phone: '(780) 555-0104', color: '#ea580c' },
      { id: 'loc_rh', name: 'Richmond Hill', address: '9350 Yonge St, Richmond Hill, ON', phone: '(905) 555-0105', color: '#db2777' },
    ];

    const disciplines = ['Physiotherapy', 'Massage Therapy', 'Chiropractic', 'Acupuncture', 'Kinesiology'];

    const treatments = [
      { id: 'tx_pt_ia', name: 'Physiotherapy Initial Assessment', discipline: 'Physiotherapy', duration: 45, price: 120, online: true, isAssessment: true },
      { id: 'tx_pt_fu', name: 'Physiotherapy Treatment', discipline: 'Physiotherapy', duration: 30, price: 85, online: true, isAssessment: false },
      { id: 'tx_pt_ext', name: 'Physiotherapy Extended Treatment', discipline: 'Physiotherapy', duration: 45, price: 110, online: true, isAssessment: false },
      { id: 'tx_mt_30', name: 'Massage Therapy 30 min', discipline: 'Massage Therapy', duration: 30, price: 70, online: true, isAssessment: false },
      { id: 'tx_mt_60', name: 'Massage Therapy 60 min', discipline: 'Massage Therapy', duration: 60, price: 115, online: true, isAssessment: false },
      { id: 'tx_mt_90', name: 'Massage Therapy 90 min', discipline: 'Massage Therapy', duration: 90, price: 160, online: true, isAssessment: false },
      { id: 'tx_ch_ia', name: 'Chiropractic Initial Assessment', discipline: 'Chiropractic', duration: 30, price: 95, online: true, isAssessment: true },
      { id: 'tx_ch_fu', name: 'Chiropractic Adjustment', discipline: 'Chiropractic', duration: 15, price: 55, online: true, isAssessment: false },
      { id: 'tx_ac_ia', name: 'Acupuncture Initial Visit', discipline: 'Acupuncture', duration: 60, price: 110, online: true, isAssessment: true },
      { id: 'tx_ac_fu', name: 'Acupuncture Follow-up', discipline: 'Acupuncture', duration: 45, price: 85, online: true, isAssessment: false },
      { id: 'tx_kin_ia', name: 'Kinesiology Assessment', discipline: 'Kinesiology', duration: 60, price: 100, online: true, isAssessment: true },
      { id: 'tx_kin_fu', name: 'Active Rehab Session', discipline: 'Kinesiology', duration: 45, price: 75, online: true, isAssessment: false },
    ];

    const products = [
      { id: 'pr_band', name: 'Resistance Band Set', price: 24.99, taxable: true },
      { id: 'pr_roller', name: 'Foam Roller', price: 39.99, taxable: true },
      { id: 'pr_ice', name: 'Reusable Ice Pack', price: 18.5, taxable: true },
      { id: 'pr_tape', name: 'Kinesiology Tape', price: 16, taxable: true },
      { id: 'pr_pillow', name: 'Cervical Pillow', price: 79, taxable: true },
    ];

    const staffNames = [
      ['Priya Sharma', 'Physiotherapy', ['loc_gp']], ['Marcus Lee', 'Physiotherapy', ['loc_gp', 'loc_pr']], ['Hannah Boucher', 'Massage Therapy', ['loc_gp']],
      ['Daniel Okafor', 'Physiotherapy', ['loc_pr']], ['Sofia Reyes', 'Chiropractic', ['loc_pr']],
      ['Ethan Walsh', 'Physiotherapy', ['loc_cal']], ['Mei Chen', 'Acupuncture', ['loc_cal']], ['Liam Patterson', 'Massage Therapy', ['loc_cal']],
      ['Aisha Khan', 'Physiotherapy', ['loc_edm']], ['Noah Bergström', 'Kinesiology', ['loc_edm']],
      ['Olivia Tremblay', 'Physiotherapy', ['loc_rh']], ['Ravi Venkatesh', 'Chiropractic', ['loc_rh']], ['Grace Kim', 'Massage Therapy', ['loc_rh']],
    ];
    const practitioners = staffNames.map(([name, discipline, locs], i) => {
      const shifts = {};
      const pattern = i % 3; // vary schedules a little
      [1, 2, 3, 4, 5].forEach((dow) => {
        if (pattern === 1 && dow === 3) return; // Wednesdays off
        if (pattern === 2 && dow === 5) return; // Fridays off
        const loc = locs.length > 1 && dow % 2 === 0 ? locs[1] : locs[0];
        shifts[dow] = [{ start: pattern === 2 ? '10:00' : '08:00', end: pattern === 2 ? '19:00' : '17:00', locationId: loc }];
      });
      if (i % 4 === 0) shifts[6] = [{ start: '09:00', end: '14:00', locationId: locs[0] }];
      return {
        id: 'pr_' + (i + 1), name, discipline, locationIds: locs, color: COLORS[i % COLORS.length],
        title: discipline === 'Physiotherapy' ? 'PT' : discipline === 'Massage Therapy' ? 'RMT' : discipline === 'Chiropractic' ? 'DC' : discipline === 'Acupuncture' ? 'R.Ac' : 'CSEP-CEP',
        email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com', phone: `(780) 555-0${between(200, 299)}`,
        shifts, active: true, bio: `${name.split(' ')[0]} has been practising ${discipline.toLowerCase()} for ${between(3, 18)} years with a focus on evidence-based care and patient education.`,
        treatmentIds: treatments.filter((t) => t.discipline === discipline).map((t) => t.id), online: true,
      };
    });

    const firsts = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Amrit', 'Harpreet', 'Wei', 'Fatima', 'Omar', 'Chloe', 'Lucas', 'Emma', 'Mateo', 'Zara', 'Liam', 'Ava', 'Noor', 'Kai', 'Isla', 'Arjun', 'Mia', 'Leo', 'Nadia', 'Theo'];
    const lasts = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Martin', 'Singh', 'Gill', 'Dhaliwal', 'Nguyen', 'Tran', 'Wong', 'Chan', 'Ali', 'Hussain', 'Roy', 'Gagnon', 'Côté', 'Fortin', 'Lavoie', 'Pelletier'];
    const insurers = ['Alberta Blue Cross', 'Sun Life', 'Manulife', 'Canada Life', 'Green Shield', 'WCB Alberta', 'Desjardins', null, null];
    const cities = { loc_gp: ['Grande Prairie', 'AB'], loc_pr: ['Peace River', 'AB'], loc_cal: ['Calgary', 'AB'], loc_edm: ['Edmonton', 'AB'], loc_rh: ['Richmond Hill', 'ON'] };
    const complaints = ['low back pain', 'neck pain', 'shoulder impingement', 'knee pain post-ACL repair', 'plantar fasciitis', 'tennis elbow', 'post-MVA whiplash', 'hip osteoarthritis', 'rotator cuff strain', 'ankle sprain', 'chronic headaches', 'sciatica'];

    const patients = [];
    const today = startOfDay(new Date());
    for (let i = 0; i < 260; i++) {
      const first = pick(firsts), last = pick(lasts);
      const homeLoc = pick(locations).id;
      const ins = pick(insurers);
      const created = addDays(today, -between(0, 400));
      patients.push({
        id: 'pt_' + (i + 1), first, last, dob: `${between(1950, 2010)}-${pad(between(1, 12))}-${pad(between(1, 28))}`, sex: pick(['F', 'M', 'X']),
        email: `${first}.${last}${between(1, 99)}@example.com`.toLowerCase().replace(/ô|é/g, 'o'), phone: `(${pick(['780', '403', '905', '587'])}) 555-${pad(between(1000, 9999)).slice(-4)}`,
        address: `${between(100, 9999)} ${pick(['Main', 'Maple', 'Oak', 'Elm', 'River', 'Park'])} ${pick(['St', 'Ave', 'Rd', 'Dr'])}`, city: cities[homeLoc][0], province: cities[homeLoc][1], postal: 'T8V 1A1',
        healthNumber: String(between(10000, 99999)) + String(between(1000, 9999)), homeLocationId: homeLoc,
        emergencyName: pick(firsts) + ' ' + last, emergencyPhone: `(780) 555-${pad(between(1000, 9999)).slice(-4)}`,
        insurers: ins ? [{ id: uid(), company: ins, policy: 'P' + between(100000, 999999), member: String(between(1000, 9999)), coveragePct: ins === 'WCB Alberta' ? 100 : pick([80, 80, 100]), annualMax: ins === 'WCB Alberta' ? 0 : pick([500, 750, 1000, 1500]) }] : [],
        notes: rnd() < 0.3 ? 'Prefers morning appointments.' : '', tags: rnd() < 0.15 ? ['VIP'] : [],
        referredBy: pick(['Google', 'Word of mouth', 'Physician referral', 'Instagram', 'Walk-in', 'Returning']),
        complaint: pick(complaints), createdAt: created.toISOString(), consentOnFile: rnd() < 0.9, alerts: rnd() < 0.08 ? 'Allergic to latex' : '',
      });
    }

    const chartTemplates = [
      { id: 'tpl_soap', name: 'SOAP Note', discipline: '', sections: [
        { key: 'S', label: 'Subjective', placeholder: 'Patient report, pain scale, changes since last visit…' },
        { key: 'O', label: 'Objective', placeholder: 'ROM, strength, special tests, palpation, observation…' },
        { key: 'A', label: 'Assessment', placeholder: 'Clinical impression, progress toward goals…' },
        { key: 'P', label: 'Plan', placeholder: 'Treatment provided today, home program, frequency, next visit…' } ] },
      { id: 'tpl_pt_ia', name: 'Physiotherapy Initial Assessment', discipline: 'Physiotherapy', sections: [
        { key: 'history', label: 'History of Present Condition', placeholder: 'Mechanism of injury, onset, duration, aggravating & easing factors…' },
        { key: 'pmh', label: 'Past Medical History / Red Flags', placeholder: 'Surgeries, medications, imaging, red-flag screen…' },
        { key: 'objective', label: 'Objective Findings', placeholder: 'Posture, ROM, strength, neuro, special tests…' },
        { key: 'diagnosis', label: 'Clinical Impression', placeholder: 'Working diagnosis…' },
        { key: 'goals', label: 'Goals', placeholder: 'Short and long-term functional goals…' },
        { key: 'plan', label: 'Treatment Plan', placeholder: 'Frequency, duration, modalities, HEP, re-assessment date…' } ] },
      { id: 'tpl_mt', name: 'Massage Therapy Treatment', discipline: 'Massage Therapy', sections: [
        { key: 'S', label: 'Subjective', placeholder: 'Areas of concern, pressure preference, contraindications…' },
        { key: 'O', label: 'Findings', placeholder: 'Tissue texture, trigger points, restrictions…' },
        { key: 'T', label: 'Treatment', placeholder: 'Techniques, areas treated, duration…' },
        { key: 'P', label: 'Plan / Self-care', placeholder: 'Stretches, hydration, next visit…' } ] },
      { id: 'tpl_ch', name: 'Chiropractic Visit', discipline: 'Chiropractic', sections: [
        { key: 'S', label: 'Subjective', placeholder: '' }, { key: 'O', label: 'Objective', placeholder: 'Segmental findings, ortho/neuro…' },
        { key: 'adj', label: 'Adjustments / Modalities', placeholder: 'Levels adjusted, technique, soft tissue…' }, { key: 'P', label: 'Plan', placeholder: '' } ] },
    ];

    /* appointments: past 70 days + next 21 days */
    const appointments = [], charts = [], invoices = [];
    let invoiceNo = settings.nextInvoiceNumber;
    const byDisc = {}; treatments.forEach((t) => { (byDisc[t.discipline] = byDisc[t.discipline] || []).push(t); });

    function busy(prId, start, end) {
      return appointments.some((a) => a.practitionerId === prId && a.status !== 'cancelled' && new Date(a.start) < end && new Date(a.end) > start);
    }

    const samplePhrases = {
      S: ['Reports pain 4/10, improved from 6/10 last visit. Sleeping better.', 'Pain 6/10 after long drive yesterday. Stiff in the morning.', 'Feeling 60% better overall. Able to return to light jogging.', 'Flare-up over the weekend after gardening. Pain 7/10.'],
      O: ['Lumbar flexion 75%, extension 50% with pain. SLR negative bilaterally. Tender L4-5 paraspinals.', 'Cervical rotation R 60°, L 70°. Upper trap hypertonicity R>L. Neuro intact.', 'Shoulder flexion 150°, ER 45°. Painful arc 80-110°. Empty can +.', 'Knee flexion 120°, extension full. Mild effusion. Quad lag resolved.'],
      A: ['Progressing well toward goals. Mechanical LBP, improving.', 'Plateau noted; consider progressing load.', 'Good response to manual therapy and exercise.', 'Irritable today; modified plan accordingly.'],
      P: ['Manual therapy L-spine, core stabilization progression, HEP reviewed. 1x/week for 4 weeks.', 'STM upper traps, cervical mobs grade III, postural education. Re-assess in 2 visits.', 'Rotator cuff strengthening progression, scapular control. Continue 2x/week.', 'Modalities for pain, gentle ROM. Re-assess next visit.'],
    };

    for (let dayOffset = -70; dayOffset <= 14; dayOffset++) {
      const day = addDays(today, dayOffset);
      const dow = day.getDay();
      practitioners.forEach((pr) => {
        const shifts = pr.shifts[dow]; if (!shifts) return;
        shifts.forEach((sh) => {
          const startM = hm(sh.start), endM = hm(sh.end);
          const fill = dayOffset < -7 ? between(8, 15) : dayOffset <= 0 ? between(30, 45) : dayOffset < 7 ? between(28, 45) : between(8, 22);
          let t = startM;
          while (t < endM - 15) {
            const tx = pick(byDisc[pr.discipline]);
            if (t + tx.duration > endM) { t += 15; continue; }
            if (rnd() * 100 < fill) {
              const local = patients.filter((x) => x.homeLocationId === sh.locationId); const patient = rnd() < 0.9 && local.length ? pick(local) : pick(patients);
              const start = new Date(day); start.setHours(0, t, 0, 0);
              const end = addMinutes(start, tx.duration);
              if (!busy(pr.id, start, end)) {
                let status = 'booked';
                if (dayOffset < 0) { const r = rnd(); status = r < 0.86 ? 'completed' : r < 0.93 ? 'no-show' : 'cancelled'; }
                else if (dayOffset === 0) { const nowM = minutesOf(new Date()); status = t + tx.duration < nowM ? (rnd() < 0.9 ? 'completed' : 'no-show') : t < nowM ? 'in-progress' : (rnd() < 0.3 ? 'arrived' : 'booked'); }
                const appt = { id: uid(), patientId: patient.id, practitionerId: pr.id, locationId: sh.locationId, treatmentId: tx.id, start: start.toISOString(), end: end.toISOString(), status, notes: '', source: rnd() < 0.35 ? 'online' : 'staff', createdAt: addDays(start, -between(1, 20)).toISOString(), chartId: null, invoiceId: null };
                if (status === 'completed') {
                  const tpl = tx.isAssessment && pr.discipline === 'Physiotherapy' ? chartTemplates[1] : pr.discipline === 'Massage Therapy' ? chartTemplates[2] : pr.discipline === 'Chiropractic' ? chartTemplates[3] : chartTemplates[0];
                  const fields = {};
                  tpl.sections.forEach((s, idx) => { const k = ['S', 'O', 'A', 'P'][idx % 4]; fields[s.key] = pick(samplePhrases[k]); });
                  const chart = { id: uid(), appointmentId: appt.id, patientId: patient.id, practitionerId: pr.id, locationId: sh.locationId, date: start.toISOString(), templateId: tpl.id, templateName: tpl.name, fields, signed: dayOffset < -2 ? rnd() < 0.985 : rnd() < 0.7, signedAt: addMinutes(end, between(5, 240)).toISOString(), updatedAt: end.toISOString() };
                  charts.push(chart); appt.chartId = chart.id;
                  const ins = patient.insurers[0];
                  const items = [{ id: uid(), desc: tx.name, qty: 1, price: tx.price, taxable: false, kind: 'treatment' }];
                  if (rnd() < 0.12) { const p = pick(products); items.push({ id: uid(), desc: p.name, qty: 1, price: p.price, taxable: true, kind: 'product' }); }
                  const inv = makeInvoice({ number: settings.invoicePrefix + (invoiceNo++), patientId: patient.id, appointmentId: appt.id, locationId: sh.locationId, practitionerId: pr.id, date: start.toISOString(), items, taxRate: settings.taxRate, taxName: settings.taxName });
                  if (ins) { inv.insurer = ins.company; inv.insurerPortion = round2(tx.price * (ins.coveragePct / 100)); }
                  const bal = round2(inv.total - inv.insurerPortion);
                  const r = rnd();
                  if (r < 0.9 && bal > 0) inv.payments.push({ id: uid(), date: end.toISOString(), method: pick(['Credit Card', 'Debit', 'Cash', 'E-transfer']), amount: bal, note: '' });
                  if (inv.insurerPortion > 0 && rnd() < 0.8) inv.payments.push({ id: uid(), date: addDays(end, between(3, 25)).toISOString(), method: 'Insurance', amount: inv.insurerPortion, note: ins.company });
                  invoices.push(inv); appt.invoiceId = inv.id;
                }
                appointments.push(appt);
                t += tx.duration;
                continue;
              }
            }
            t += 15;
          }
        });
      });
    }
    settings.nextInvoiceNumber = invoiceNo;

    const waitlist = patients.slice(0, 6).map((p, i) => ({ id: uid(), patientId: p.id, treatmentId: treatments[i % treatments.length].id, practitionerId: i % 2 ? practitioners[i].id : null, locationId: p.homeLocationId, notes: i % 2 ? 'Any afternoon' : 'ASAP, flexible', createdAt: addDays(today, -i).toISOString() }));

    return { version: 1, settings, locations, disciplines, treatments, products, practitioners, patients, appointments, charts, chartTemplates, invoices, waitlist, activity: [] };
  }

  function makeInvoice(o) {
    const inv = { id: uid(), number: o.number, patientId: o.patientId, appointmentId: o.appointmentId || null, locationId: o.locationId, practitionerId: o.practitionerId || null, date: o.date || new Date().toISOString(), items: o.items || [], discount: o.discount || 0, taxRate: o.taxRate ?? 5, taxName: o.taxName || 'GST', insurer: o.insurer || '', insurerPortion: o.insurerPortion || 0, payments: [], note: o.note || '', void: false };
    recalc(inv);
    return inv;
  }
  function recalc(inv) {
    const sub = inv.items.reduce((s, it) => s + it.qty * it.price, 0);
    const taxable = inv.items.filter((i) => i.taxable).reduce((s, it) => s + it.qty * it.price, 0);
    inv.subtotal = round2(sub);
    inv.discountAmt = round2(Math.min(inv.discount || 0, sub));
    inv.tax = round2(taxable * (inv.taxRate / 100));
    inv.total = round2(inv.subtotal - inv.discountAmt + inv.tax);
    return inv;
  }

  /* ---------- the store ---------- */
  const Store = {
    state: null,
    listeners: [],
    load() {
      try { const raw = localStorage.getItem(KEY); if (raw) { this.state = JSON.parse(raw); return this.state; } } catch (e) { console.warn('Could not read saved data', e); }
      this.state = seed(); this.save(); return this.state;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { console.error(e); alert('Could not save data: browser storage may be full or blocked.'); } this.listeners.forEach((fn) => fn()); },
    reset() { localStorage.removeItem(KEY); this.state = seed(); this.save(); },
    blank() {
      const s = seed();
      this.state = { ...s, patients: [], appointments: [], charts: [], invoices: [], waitlist: [], activity: [] };
      this.state.settings.nextInvoiceNumber = 1001; this.save();
    },
    subscribe(fn) { this.listeners.push(fn); },
    exportJSON() { return JSON.stringify(this.state, null, 2); },
    importJSON(text) { const obj = JSON.parse(text); if (!obj || !Array.isArray(obj.patients) || !Array.isArray(obj.appointments)) throw new Error('Not a ClinicFlow backup file'); this.state = obj; this.save(); },

    get(coll, id) { return (this.state[coll] || []).find((x) => x.id === id) || null; },
    add(coll, obj) { if (!obj.id) obj.id = uid(); this.state[coll].push(obj); this.save(); return obj; },
    update(coll, id, patch) { const o = this.get(coll, id); if (!o) return null; Object.assign(o, patch); this.save(); return o; },
    remove(coll, id) { this.state[coll] = this.state[coll].filter((x) => x.id !== id); this.save(); },
    log(msg, type) { this.state.activity.unshift({ id: uid(), at: new Date().toISOString(), msg, type: type || 'info' }); this.state.activity = this.state.activity.slice(0, 200); },

    /* ----- domain helpers ----- */
    patientName(p) { if (typeof p === 'string') p = this.get('patients', p); return p ? `${p.first} ${p.last}` : 'Unknown'; },
    practitioner(id) { return this.get('practitioners', id); },
    location(id) { return this.get('locations', id); },
    treatment(id) { return this.get('treatments', id); },
    patient(id) { return this.get('patients', id); },

    shiftsFor(prId, date, locationId) {
      const pr = this.practitioner(prId); if (!pr || !pr.active) return [];
      const dayShifts = pr.shifts[new Date(date).getDay()] || [];
      return dayShifts.filter((s) => !locationId || s.locationId === locationId);
    },
    appointmentsOn(dateK, filter = {}) {
      return this.state.appointments.filter((a) => dateKey(a.start) === dateK && (!filter.locationId || a.locationId === filter.locationId) && (!filter.practitionerId || a.practitionerId === filter.practitionerId));
    },
    conflicts(prId, start, end, ignoreId) {
      start = new Date(start); end = new Date(end);
      return this.state.appointments.filter((a) => a.id !== ignoreId && a.practitionerId === prId && a.status !== 'cancelled' && new Date(a.start) < end && new Date(a.end) > start);
    },
    availableSlots(prId, locationId, dateK, duration, step) {
      step = step || this.state.settings.slotMinutes || 15;
      const day = parseKey(dateK);
      const now = new Date();
      const slots = [];
      this.shiftsFor(prId, day, locationId).forEach((sh) => {
        for (let t = hm(sh.start); t + duration <= hm(sh.end); t += step) {
          const start = new Date(day); start.setMinutes(t);
          const end = addMinutes(start, duration);
          if (start < now) continue;
          if (this.conflicts(prId, start, end).length === 0) slots.push(start);
        }
      });
      return slots;
    },
    nextInvoiceNumber() { const s = this.state.settings; const n = s.invoicePrefix + s.nextInvoiceNumber; s.nextInvoiceNumber++; return n; },
    makeInvoice(o) { return makeInvoice({ taxRate: this.state.settings.taxRate, taxName: this.state.settings.taxName, ...o }); },
    recalc,
    paid(inv) { return round2(inv.payments.reduce((s, p) => s + Number(p.amount), 0)); },
    balance(inv) { return round2(inv.total - this.paid(inv)); },
    invoiceStatus(inv) { if (inv.void) return 'void'; const b = this.balance(inv); if (b <= 0.004) return 'paid'; if (b < inv.total - 0.004) return 'partial'; return 'unpaid'; },
    patientBalance(patientId) { return round2(this.state.invoices.filter((i) => i.patientId === patientId && !i.void).reduce((s, i) => s + this.balance(i), 0)); },
    lastVisit(patientId) { const past = this.state.appointments.filter((a) => a.patientId === patientId && a.status === 'completed').sort((a, b) => b.start.localeCompare(a.start)); return past[0] || null; },
    nextVisit(patientId) { const now = new Date().toISOString(); const fut = this.state.appointments.filter((a) => a.patientId === patientId && a.start > now && (a.status === 'booked' || a.status === 'arrived')).sort((a, b) => a.start.localeCompare(b.start)); return fut[0] || null; },

    /* ----- reporting ----- */
    report(fromK, toK, locationId) {
      const from = parseKey(fromK), to = addDays(parseKey(toK), 1);
      const inRange = (iso) => { const d = new Date(iso); return d >= from && d < to; };
      const appts = this.state.appointments.filter((a) => inRange(a.start) && (!locationId || a.locationId === locationId));
      const invs = this.state.invoices.filter((i) => !i.void && inRange(i.date) && (!locationId || i.locationId === locationId));
      const completed = appts.filter((a) => a.status === 'completed');
      const noShows = appts.filter((a) => a.status === 'no-show');
      const cancelled = appts.filter((a) => a.status === 'cancelled');
      const assessments = completed.filter((a) => (this.treatment(a.treatmentId) || {}).isAssessment);
      const newPatients = this.state.patients.filter((p) => inRange(p.createdAt) && (!locationId || p.homeLocationId === locationId));
      const revenue = round2(invs.reduce((s, i) => s + i.total, 0));
      const collected = round2(invs.reduce((s, i) => s + this.paid(i), 0));
      const outstanding = round2(invs.reduce((s, i) => s + this.balance(i), 0));
      const uniquePatients = new Set(completed.map((a) => a.patientId)).size;
      // rebooking: completed visits where the patient has a later appointment booked
      let rebooked = 0;
      completed.forEach((a) => { if (this.state.appointments.some((b) => b.patientId === a.patientId && b.id !== a.id && b.start > a.start && b.start < addDays(a.start, 45).toISOString() && b.status !== 'cancelled')) rebooked++; });
      const group = (arr, keyFn, valFn) => { const m = {}; arr.forEach((x) => { const k = keyFn(x); m[k] = (m[k] || 0) + (valFn ? valFn(x) : 1); }); return m; };
      return {
        appts, invs, completed, noShows, cancelled, assessments, newPatients, revenue, collected, outstanding, uniquePatients,
        visits: completed.length, pva: assessments.length ? round2(completed.length / assessments.length) : 0,
        noShowRate: appts.length ? round2((noShows.length / appts.length) * 100) : 0,
        cancelRate: appts.length ? round2((cancelled.length / appts.length) * 100) : 0,
        rebookRate: completed.length ? round2((rebooked / completed.length) * 100) : 0,
        avgTicket: invs.length ? round2(revenue / invs.length) : 0,
        revenueByLocation: group(invs, (i) => i.locationId, (i) => i.total),
        revenueByPractitioner: group(invs, (i) => i.practitionerId, (i) => i.total),
        visitsByPractitioner: group(completed, (a) => a.practitionerId),
        assessmentsByPractitioner: group(assessments, (a) => a.practitionerId),
        visitsByDiscipline: group(completed, (a) => (this.practitioner(a.practitionerId) || {}).discipline || 'Other'),
        revenueByDay: group(invs, (i) => dateKey(i.date), (i) => i.total),
        paymentsByMethod: group(invs.flatMap((i) => i.payments), (p) => p.method, (p) => Number(p.amount)),
        referralSources: group(newPatients, (p) => p.referredBy || 'Unknown'),
      };
    },
  };

  global.CF = { Store, util: { pad, uid, clone, esc, dateKey, parseKey, startOfDay, addDays, addMinutes, startOfWeek, minutesOf, hm, fmtHM, fmtDate, fmtShortDate, fmtTime, fmtMoney, age, round2, initials, MONTHS, DAYS, COLORS } };
})(window);
