/* ClinicFlow — patient online booking */
(function () {
  'use strict';
  const { Store: S, util: U } = window.CF;
  const { esc, dateKey, parseKey, addDays, addMinutes, startOfDay, fmtDate, fmtShortDate, fmtTime, fmtMoney, uid } = U;
  S.load();
  const s = S.state.settings;
  const $ = (q) => document.querySelector(q);
  $('#bk-name').textContent = s.clinicName;
  const st = { step: 0, locationId: null, treatmentId: null, practitionerId: null, date: null, start: null, patient: null };
  const STEPS = ['Clinic', 'Service', 'Practitioner', 'Date & time', 'Your details', 'Confirmed'];

  function render() {
    $('#bk-steps').innerHTML = STEPS.map((l, i) => `<span class="${i < st.step ? 'done' : i === st.step ? 'cur' : ''}">${i + 1}. ${l}</span>`).join('');
    const body = $('#bk-body');
    if (!s.onlineBookingEnabled) { body.innerHTML = `<div class="card pad">Online booking is currently unavailable. Please call us to book.</div>`; return; }
    const loc = S.location(st.locationId), tx = S.treatment(st.treatmentId), pr = S.practitioner(st.practitionerId);
    const summary = st.step > 0 && st.step < 5 ? `<div class="summary">${[loc && `📍 ${esc(loc.name)}`, tx && `🩺 ${esc(tx.name)} · ${tx.duration} min · ${fmtMoney(tx.price)}`, st.step > 2 && (pr ? `👤 ${esc(pr.name)}` : '👤 First available'), st.start && `🕒 ${fmtDate(st.start)} at ${fmtTime(st.start)}`].filter(Boolean).join(' &nbsp;·&nbsp; ')}</div>` : '';
    const back = st.step > 0 && st.step < 5 ? `<button class="back" data-back>‹ Back</button>` : '';
    let html = '';
    if (st.step === 0) {
      html = `<h2 class="mb">Which clinic would you like to visit?</h2><div class="choice">${S.state.locations.map((l) => `<button data-loc="${l.id}"><div class="t">${esc(l.name)}</div><div class="s">${esc(l.address)}<br>${esc(l.phone)}</div></button>`).join('')}</div>`;
    } else if (st.step === 1) {
      const prsHere = S.state.practitioners.filter((p) => p.active && p.online && p.locationIds.includes(st.locationId));
      const txs = S.state.treatments.filter((t) => t.online && prsHere.some((p) => p.discipline === t.discipline));
      const groups = {}; txs.forEach((t) => (groups[t.discipline] = groups[t.discipline] || []).push(t));
      html = `<h2 class="mb">What would you like to book?</h2>${Object.entries(groups).map(([d, list]) => `<h4 class="mb">${esc(d)}</h4><div class="choice mb">${list.map((t) => `<button data-tx="${t.id}"><div class="t">${esc(t.name)}</div><div class="s">${t.duration} minutes · ${fmtMoney(t.price)}${t.isAssessment ? ' · For new concerns / first visits' : ''}</div></button>`).join('')}</div>`).join('') || '<div class="card pad">No services are bookable online at this clinic yet.</div>'}`;
    } else if (st.step === 2) {
      const prs = S.state.practitioners.filter((p) => p.active && p.online && p.locationIds.includes(st.locationId) && p.discipline === tx.discipline);
      html = `<h2 class="mb">Who would you like to see?</h2><div class="choice"><button data-pr=""><div class="t">⚡ First available</div><div class="s">Show the soonest openings with any ${esc(tx.discipline.toLowerCase())} practitioner</div></button>${prs.map((p) => `<button data-pr="${p.id}"><div class="flex"><span class="avatar" style="background:${p.color}">${esc(U.initials(p.name))}</span><div><div class="t">${esc(p.name)}, ${esc(p.title || '')}</div><div class="s">${esc(p.discipline)}</div></div></div><div class="s mt">${esc(p.bio || '')}</div></button>`).join('')}</div>`;
    } else if (st.step === 3) {
      const prs = st.practitionerId ? [pr] : S.state.practitioners.filter((p) => p.active && p.online && p.locationIds.includes(st.locationId) && p.discipline === tx.discipline);
      const days = []; for (let i = 0; i < Math.min(s.bookingWindowDays, 60); i++) { const d = addDays(startOfDay(new Date()), i); const k = dateKey(d); const slots = prs.flatMap((p) => S.availableSlots(p.id, st.locationId, k, tx.duration, 15).map((t) => ({ t, p }))); days.push({ d, k, slots }); }
      if (!st.date) st.date = (days.find((x) => x.slots.length) || days[0]).k;
      const cur = days.find((x) => x.k === st.date);
      const slots = cur.slots.sort((a, b) => a.t - b.t);
      // for "first available" show one button per time with the practitioner noted
      html = `${st.notice ? `<div class="alert warn">${esc(st.notice)}</div>` : ''}<h2 class="mb">Pick a date and time</h2><div class="daystrip mb">${days.slice(0, 28).map((x) => `<button data-day="${x.k}" class="${x.k === st.date ? 'active' : ''}" ${x.slots.length ? '' : 'disabled'}><div class="d">${U.DAYS[x.d.getDay()]}</div><div class="n">${x.d.getDate()}</div><div class="tiny">${U.MONTHS[x.d.getMonth()]}</div></button>`).join('')}</div>
        <div class="bold mb">${fmtDate(parseKey(st.date))}</div>
        ${slots.length ? `<div class="slot-grid">${slots.map((x) => `<button class="btn" data-slot="${x.t.toISOString()}" data-slotpr="${x.p.id}">${fmtTime(x.t)}${!st.practitionerId ? ` <span class="tiny muted">· ${esc(x.p.name.split(' ')[0])}</span>` : ''}</button>`).join('')}</div>` : '<div class="card pad muted">No openings on this day — try another date.</div>'}`;
    } else if (st.step === 4) {
      html = `<h2 class="mb">Your details</h2>
        <div class="card pad"><form id="bk-form">
          <div class="field"><label>Have you visited us before? Enter the email or phone we have on file to link your booking.</label><div class="row"><input id="bk-lookup" placeholder="Email or phone"><button type="button" class="btn" id="bk-find">Find me</button></div><div id="bk-found" class="small mt"></div></div>
          <div class="grid-2"><div class="field"><label>First name</label><input name="first" required></div><div class="field"><label>Last name</label><input name="last" required></div><div class="field"><label>Email</label><input name="email" type="email" required></div><div class="field"><label>Mobile phone</label><input name="phone" required></div><div class="field"><label>Date of birth</label><input name="dob" type="date"></div><div class="field"><label>How did you hear about us?</label><select name="referredBy">${['Google', 'Word of mouth', 'Physician referral', 'Instagram', 'Facebook', 'Returning patient', 'Other'].map((x) => `<option>${x}</option>`).join('')}</select></div></div>
          <div class="field"><label>Reason for visit (optional)</label><textarea name="notes" placeholder="What would you like help with?"></textarea></div>
          <div class="field"><label class="flex" style="font-weight:500"><input type="checkbox" name="agree" required style="width:auto">I agree to the cancellation policy below.</label><div class="tiny muted">${esc(s.cancellationPolicy)}</div></div>
          <button class="btn primary" style="width:100%;padding:12px">Confirm booking</button></form></div>`;
    } else if (st.step === 5) {
      const a = st.booked; const p = S.patient(a.patientId); const pr2 = S.practitioner(a.practitionerId); const l = S.location(a.locationId); const t = S.treatment(a.treatmentId);
      html = `<div class="card pad center"><div style="font-size:44px">✅</div><h2>You're booked, ${esc(p.first)}!</h2><p class="muted">Your appointment is saved under ${esc(p.email)}. Please arrive 10 minutes early for your first visit.</p>
        <div class="summary" style="text-align:left;margin-top:16px"><div><strong>${esc(t.name)}</strong> with ${esc(pr2.name)}, ${esc(pr2.title || '')}</div><div>${fmtDate(a.start)} · ${fmtTime(a.start)} – ${fmtTime(a.end)}</div><div>${esc(l.name)} · ${esc(l.address)} · ${esc(l.phone)}</div></div>
        <div class="flex wrap" style="justify-content:center"><button class="btn" id="bk-ics">📅 Add to calendar</button><button class="btn" id="bk-again">Book another appointment</button></div>
        <p class="tiny muted mt">${esc(s.cancellationPolicy)}</p></div>`;
    }
    body.innerHTML = back + summary + html;
    wire();
  }

  function wire() {
    const body = $('#bk-body');
    body.querySelector('[data-back]')?.addEventListener('click', () => { st.step--; if (st.step <= 2) { st.start = null; st.date = null; } render(); window.scrollTo(0, 0); });
    body.querySelectorAll('[data-loc]').forEach((b) => b.addEventListener('click', () => { st.locationId = b.dataset.loc; st.step = 1; render(); }));
    body.querySelectorAll('[data-tx]').forEach((b) => b.addEventListener('click', () => { st.treatmentId = b.dataset.tx; st.step = 2; render(); }));
    body.querySelectorAll('[data-pr]').forEach((b) => b.addEventListener('click', () => { st.practitionerId = b.dataset.pr || null; st.date = null; st.step = 3; render(); }));
    body.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { st.date = b.dataset.day; render(); }));
    body.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => { st.notice = ''; st.start = new Date(b.dataset.slot); st.slotPr = b.dataset.slotpr; st.step = 4; render(); window.scrollTo(0, 0); }));
    const find = $('#bk-find'); if (find) find.addEventListener('click', () => { const q = $('#bk-lookup').value.trim().toLowerCase().replace(/[^a-z0-9@.]/g, ''); if (!q) return; const p = S.state.patients.find((x) => x.email.toLowerCase() === q || x.phone.replace(/\D/g, '') === q.replace(/\D/g, '')); const out = $('#bk-found'); if (p) { st.patient = p; const f = $('#bk-form'); f.first.value = p.first; f.last.value = p.last; f.email.value = p.email; f.phone.value = p.phone; f.dob.value = p.dob; out.innerHTML = `<span style="color:var(--ok)">✓ Welcome back, ${esc(p.first)}! We found your file.</span>`; } else { st.patient = null; out.innerHTML = '<span class="muted">We couldn\'t find a match — just fill in your details below and we\'ll create your file.</span>'; } });
    const form = $('#bk-form'); if (form) form.addEventListener('submit', (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(form));
      const tx = S.treatment(st.treatmentId); const prId = st.practitionerId || st.slotPr; const end = addMinutes(st.start, tx.duration);
      if (S.conflicts(prId, st.start, end).length) { st.step = 3; st.start = null; st.notice = 'Sorry, that time was just taken. Please pick another time.'; render(); return; }
      let p = st.patient || S.state.patients.find((x) => x.email && x.email.toLowerCase() === d.email.toLowerCase());
      if (p) { S.update('patients', p.id, { phone: d.phone || p.phone, dob: p.dob || d.dob }); }
      else { p = S.add('patients', { first: d.first, last: d.last, dob: d.dob, sex: '', email: d.email, phone: d.phone, address: '', city: '', province: '', postal: '', healthNumber: '', homeLocationId: st.locationId, emergencyName: '', emergencyPhone: '', insurers: [], notes: '', tags: [], referredBy: d.referredBy, complaint: d.notes || '', createdAt: new Date().toISOString(), consentOnFile: true, alerts: '' }); }
      const a = S.add('appointments', { patientId: p.id, practitionerId: prId, locationId: st.locationId, treatmentId: tx.id, start: st.start.toISOString(), end: end.toISOString(), status: 'booked', notes: d.notes ? 'Online: ' + d.notes : '', source: 'online', createdAt: new Date().toISOString(), chartId: null, invoiceId: null });
      S.log(`${p.first} ${p.last} booked online · ${fmtShortDate(a.start)} ${fmtTime(a.start)}`, 'online'); S.save();
      st.booked = a; st.step = 5; render(); window.scrollTo(0, 0);
    });
    const ics = $('#bk-ics'); if (ics) ics.addEventListener('click', () => { const a = st.booked; const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'; const l = S.location(a.locationId); const text = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ClinicFlow//EN\nBEGIN:VEVENT\nUID:${a.id}@clinicflow\nDTSTAMP:${f(new Date())}\nDTSTART:${f(a.start)}\nDTEND:${f(a.end)}\nSUMMARY:${S.treatment(a.treatmentId).name} - ${s.clinicName}\nLOCATION:${l.address}\nDESCRIPTION:With ${S.practitioner(a.practitionerId).name}. ${l.phone}\nEND:VEVENT\nEND:VCALENDAR`; const blob = new Blob([text], { type: 'text/calendar' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'appointment.ics'; link.click(); });
    const again = $('#bk-again'); if (again) again.addEventListener('click', () => { Object.assign(st, { step: 0, locationId: null, treatmentId: null, practitionerId: null, date: null, start: null, booked: null }); render(); });
  }
  render();
})();
