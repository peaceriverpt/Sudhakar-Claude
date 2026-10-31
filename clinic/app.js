/* ClinicFlow — application (staff side) */
(function () {
  'use strict';
  const { Store: S, util: U } = window.CF;
  const { esc, dateKey, parseKey, addDays, addMinutes, startOfDay, startOfWeek, fmtDate, fmtShortDate, fmtTime, fmtMoney, fmtHM, hm, minutesOf, age, round2, initials, uid, DAYS, MONTHS, COLORS } = U;
  S.load();

  /* =========================================================
     Core helpers: DOM, modals, toasts, routing
     ========================================================= */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const main = $('#main');
  const todayK = () => dateKey(new Date());
  const STATUS_LABEL = { booked: 'Booked', arrived: 'Arrived', 'in-progress': 'In progress', completed: 'Completed', 'no-show': 'No show', cancelled: 'Cancelled' };
  const PAY_METHODS = ['Credit Card', 'Debit', 'Cash', 'E-transfer', 'Insurance', 'Gift Card', 'Other'];

  const ui = { loc: localStorage.getItem('clinicflow:loc') || '', route: 'dashboard', params: {}, query: {} };

  function toast(msg, err) {
    const el = document.createElement('div'); el.className = 'toast' + (err ? ' err' : ''); el.textContent = msg;
    $('#toast-root').appendChild(el); setTimeout(() => el.remove(), 2600);
  }

  const modalStack = [];
  function openModal({ title, body, foot = '', size = '', onMount }) {
    const root = $('#modal-root');
    const wrap = document.createElement('div'); wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true"><div class="modal-head"><h2>${title}</h2><button class="close" data-close>×</button></div><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closeModal(wrap); });
    wrap.querySelector('[data-close]').addEventListener('click', () => closeModal(wrap));
    root.appendChild(wrap); modalStack.push(wrap);
    const m = { el: wrap, close: () => closeModal(wrap), body: wrap.querySelector('.modal-body') };
    if (onMount) onMount(m);
    const first = wrap.querySelector('input:not([type=hidden]), select, textarea'); if (first && window.innerWidth > 900) first.focus();
    return m;
  }
  function closeModal(wrap) { wrap = wrap || modalStack[modalStack.length - 1]; if (!wrap) return; wrap.remove(); const i = modalStack.indexOf(wrap); if (i >= 0) modalStack.splice(i, 1); }
  function closeAllModals() { while (modalStack.length) closeModal(); }
  function confirmDialog(msg, okLabel = 'Confirm', danger = false) {
    return new Promise((res) => {
      const m = openModal({ title: 'Please confirm', size: 'narrow', body: `<p>${msg}</p>`, foot: `<button class="btn" data-no>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${okLabel}</button>` });
      m.el.querySelector('[data-no]').onclick = () => { m.close(); res(false); };
      m.el.querySelector('[data-yes]').onclick = () => { m.close(); res(true); };
    });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalStack.length) closeModal(); });

  function formData(form) { const o = {}; new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; }); $$('input[type=checkbox]', form).forEach((c) => { o[c.name] = c.checked; }); return o; }
  const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(label)}</option>`;
  const badge = (st) => `<span class="badge ${st}">${esc(STATUS_LABEL[st] || st)}</span>`;
  const avatar = (name, color, lg) => `<span class="avatar ${lg ? 'lg' : ''}" style="background:${color || '#64748b'}">${esc(initials(name || '?'))}</span>`;
  const locName = (id) => (S.location(id) || {}).name || '—';
  const prName = (id) => (S.practitioner(id) || {}).name || '—';
  const txName = (id) => (S.treatment(id) || {}).name || '—';
  const activeLocations = () => S.state.locations;
  const visibleLocationIds = () => (ui.loc ? [ui.loc] : S.state.locations.map((l) => l.id));
  const inLoc = (locationId) => !ui.loc || locationId === ui.loc;

  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function parseHash() {
    const raw = (location.hash || '#/dashboard').slice(2);
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const query = {}; if (qs) qs.split('&').forEach((kv) => { const [k, v] = kv.split('='); query[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
    ui.route = parts[0] || 'dashboard'; ui.params = { id: parts[1], sub: parts[2] }; ui.query = query;
  }
  function render() {
    parseHash();
    const views = { dashboard: viewDashboard, schedule: viewSchedule, patients: viewPatients, billing: viewBilling, waitlist: viewWaitlist, reports: viewReports, staff: viewStaff, settings: viewSettings };
    const fn = views[ui.route] || viewDashboard;
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === ui.route));
    $('#sidebar').classList.remove('open');
    try { main.innerHTML = fn(); } catch (e) { console.error(e); main.innerHTML = `<div class="alert danger">Something went wrong rendering this page: ${esc(e.message)}</div>`; }
    $('#page-title').textContent = $('h1', main)?.textContent || 'ClinicFlow';
    $('#brand-name').textContent = S.state.settings.clinicName.split(' ')[0] === 'ClinicFlow' ? 'ClinicFlow' : 'ClinicFlow';
    document.title = `${$('#page-title').textContent} · ClinicFlow`;
    if (ui.route === 'schedule') afterScheduleRender();
    if (ui.route === 'reports') afterReportsRender();
    main.scrollTop = 0;
  }
  window.addEventListener('hashchange', render);
  S.subscribe(() => { /* re-render on data change, but keep modal state */ render(); });

  /* =========================================================
     Dashboard
     ========================================================= */
  function viewDashboard() {
    const tk = todayK();
    const appts = S.appointmentsOn(tk).filter((a) => inLoc(a.locationId)).sort((a, b) => a.start.localeCompare(b.start));
    const active = appts.filter((a) => a.status !== 'cancelled');
    const r = S.report(tk, tk, ui.loc);
    const week = S.report(dateKey(addDays(new Date(), -6)), tk, ui.loc);
    const outstanding = S.state.invoices.filter((i) => !i.void && inLoc(i.locationId) && S.balance(i) > 0.004);
    const outstandingTotal = round2(outstanding.reduce((s, i) => s + S.balance(i), 0));
    const unsigned = S.state.charts.filter((c) => !c.signed && inLoc(c.locationId));
    const uncharted = S.state.appointments.filter((a) => a.status === 'completed' && !a.chartId && inLoc(a.locationId) && a.start >= addDays(new Date(), -14).toISOString());
    const upcoming = active.filter((a) => new Date(a.end) >= new Date());
    const waiting = active.filter((a) => a.status === 'arrived');
    const now = new Date();
    const next7 = [0, 1, 2, 3, 4, 5, 6].map((i) => { const d = addDays(startOfDay(now), i); const k = dateKey(d); const n = S.appointmentsOn(k).filter((a) => inLoc(a.locationId) && a.status !== 'cancelled').length; return { d, k, n }; });
    const maxN = Math.max(1, ...next7.map((x) => x.n));
    const birthdays = S.state.patients.filter((p) => p.dob && p.dob.slice(5) === tk.slice(5));

    return `
      <div class="page-head"><div><h1>Dashboard</h1><div class="muted">${fmtDate(now)} · ${ui.loc ? esc(locName(ui.loc)) : 'All locations'}</div></div>
        <div class="actions"><button class="btn" data-action="nav" data-to="#/schedule?date=${tk}">Open today's schedule</button><button class="btn primary" data-action="new-appointment">+ Book appointment</button></div></div>
      <div class="stats">
        <div class="stat accent"><div class="label">Today's visits</div><div class="value">${active.length}</div><div class="sub">${r.completed.length} done · ${waiting.length} in waiting room</div></div>
        <div class="stat"><div class="label">Today's billings</div><div class="value">${fmtMoney(r.revenue)}</div><div class="sub">${fmtMoney(r.collected)} collected</div></div>
        <div class="stat"><div class="label">Last 7 days</div><div class="value">${fmtMoney(week.revenue)}</div><div class="sub">${week.visits} visits · PVA ${week.pva}</div></div>
        <div class="stat"><div class="label">Outstanding A/R</div><div class="value">${fmtMoney(outstandingTotal)}</div><div class="sub">${outstanding.length} open invoices</div></div>
        <div class="stat"><div class="label">No-show rate (7d)</div><div class="value">${week.noShowRate}%</div><div class="sub">${week.noShows.length} no-shows</div></div>
        <div class="stat"><div class="label">Charts to finish</div><div class="value">${unsigned.length + uncharted.length}</div><div class="sub">${unsigned.length} unsigned · ${uncharted.length} not started</div></div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2>Today's appointments</h2><span class="muted small">${upcoming.length} remaining</span></div>
          <div class="card-body" style="padding:0 16px">
            ${active.length ? `<div class="list">${active.map((a) => dashRow(a)).join('')}</div>` : '<div class="empty">No appointments today.</div>'}
          </div>
        </div>
        <div>
          <div class="card mb">
            <div class="card-head"><h2>Next 7 days</h2></div>
            <div class="card-body">
              <div class="spark" style="height:90px">${next7.map((x) => `<i style="height:${(x.n / maxN) * 100}%" data-tip="${x.n} visits" data-action="nav" data-to="#/schedule?date=${x.k}" title="${fmtDate(x.d)}: ${x.n}"></i>`).join('')}</div>
              <div class="flex between tiny muted" style="margin-top:4px">${next7.map((x) => `<span style="flex:1;text-align:center">${DAYS[x.d.getDay()]}<br>${x.n}</span>`).join('')}</div>
            </div>
          </div>
          <div class="card mb">
            <div class="card-head"><h2>Needs attention</h2></div>
            <div class="card-body" style="padding:4px 16px">
              <div class="list">
                <div class="list-item click" data-action="nav" data-to="#/billing?status=unpaid"><span class="grow">Invoices with a balance owing</span><span class="badge unpaid">${outstanding.length}</span></div>
                <div class="list-item click" data-action="nav" data-to="#/patients?filter=unsigned"><span class="grow">Unsigned chart notes</span><span class="badge arrived">${unsigned.length}</span></div>
                <div class="list-item click" data-action="nav" data-to="#/waitlist"><span class="grow">Patients on the wait list</span><span class="badge">${S.state.waitlist.filter((w) => inLoc(w.locationId)).length}</span></div>
                <div class="list-item click" data-action="nav" data-to="#/patients?filter=noshow"><span class="grow">No-shows in the last 7 days to follow up</span><span class="badge no-show">${week.noShows.length}</span></div>
                ${birthdays.length ? `<div class="list-item"><span class="grow">🎂 Birthdays today: ${birthdays.map((p) => `<a href="#/patients/${p.id}">${esc(S.patientName(p))}</a>`).join(', ')}</span></div>` : ''}
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h2>Recent activity</h2></div>
            <div class="card-body" style="padding:4px 16px">
              ${S.state.activity.length ? `<div class="list">${S.state.activity.slice(0, 8).map((a) => `<div class="list-item small"><span class="muted nowrap">${fmtTime(a.at)}</span><span>${esc(a.msg)}</span></div>`).join('')}</div>` : '<div class="empty small">Actions you take will show up here.</div>'}
            </div>
          </div>
        </div>
      </div>`;
  }
  function dashRow(a) {
    const p = S.patient(a.patientId), pr = S.practitioner(a.practitionerId);
    return `<div class="list-item click" data-action="open-appointment" data-id="${a.id}">
      <div class="nowrap" style="width:72px;font-variant-numeric:tabular-nums">${fmtTime(a.start)}</div>
      ${avatar(pr?.name, pr?.color)}
      <div class="grow" style="min-width:0"><div class="bold">${esc(S.patientName(p))}</div><div class="small muted">${esc(txName(a.treatmentId))} · ${esc(pr?.name || '')} · ${esc(locName(a.locationId))}</div></div>
      ${badge(a.status)}</div>`;
  }

  /* =========================================================
     Schedule
     ========================================================= */
  function viewSchedule() {
    const dk = ui.query.date || todayK();
    const view = ui.query.view || 'day';
    const prFilter = ui.query.pr || '';
    const date = parseKey(dk);
    const q = (over) => { const o = { date: dk, view, pr: prFilter, ...over }; return '#/schedule?' + Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'); };
    const prs = S.state.practitioners.filter((p) => p.active && (!ui.loc || p.locationIds.includes(ui.loc)) && (!prFilter || p.id === prFilter));

    const toolbar = `
      <div class="page-head"><h1>Schedule</h1>
        <div class="actions"><button class="btn" data-action="open-waitlist">Wait list</button><button class="btn primary" data-action="new-appointment" data-date="${dk}">+ Book</button></div></div>
      <div class="sched-toolbar">
        <div class="btn-group"><button class="btn" data-action="nav" data-to="${q({ date: dateKey(addDays(date, view === 'week' ? -7 : -1)) })}">‹</button><button class="btn" data-action="nav" data-to="${q({ date: todayK() })}">Today</button><button class="btn" data-action="nav" data-to="${q({ date: dateKey(addDays(date, view === 'week' ? 7 : 1)) })}">›</button></div>
        <input type="date" value="${dk}" data-change="sched-date" />
        <strong style="font-size:15px">${view === 'week' ? `Week of ${fmtShortDate(startOfWeek(date))}` : fmtDate(date)}</strong>
        <span class="grow"></span>
        <select data-change="sched-pr" style="width:auto"><option value="">All practitioners</option>${S.state.practitioners.filter((p) => p.active && (!ui.loc || p.locationIds.includes(ui.loc))).map((p) => opt(p.id, p.name, prFilter)).join('')}</select>
        <div class="btn-group"><button class="btn ${view === 'day' ? 'active' : ''}" data-action="nav" data-to="${q({ view: 'day' })}">Day</button><button class="btn ${view === 'week' ? 'active' : ''}" data-action="nav" data-to="${q({ view: 'week' })}">Week</button><button class="btn ${view === 'list' ? 'active' : ''}" data-action="nav" data-to="${q({ view: 'list' })}">List</button></div>
      </div>`;

    if (view === 'list') return toolbar + scheduleList(dk, prs);
    if (view === 'week') return toolbar + scheduleGrid(prs, [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(startOfWeek(date), i)), true);
    return toolbar + scheduleGrid(prs, [date], false) + `<div class="legend"><span style="--c:#eff6ff">Booked</span><span style="--c:#fffbeb">Arrived</span><span style="--c:#f5f3ff">In progress</span><span style="--c:#f0fdf4">Completed</span><span style="--c:#fef2f2">No show</span><span style="--c:#f1f5f9">Cancelled / off shift</span></div>`;
  }

  function scheduleGrid(prs, days, isWeek) {
    const s = S.state.settings; const open = s.openHour * 60, close = s.closeHour * 60; const slotMin = 15; const nSlots = (close - open) / slotMin;
    const columns = [];
    if (isWeek) {
      // week view: one column per day; if several practitioners, show all of them stacked within the day column
      days.forEach((d) => columns.push({ day: d, prIds: prs.map((p) => p.id), label: `${DAYS[d.getDay()]} ${d.getDate()}`, sub: MONTHS[d.getMonth()] }));
    } else {
      const d0 = days[0]; const dk0 = dateKey(d0);
      let working = prs.filter((p) => S.shiftsFor(p.id, d0, ui.loc).length || S.state.appointments.some((a) => a.practitionerId === p.id && dateKey(a.start) === dk0 && inLoc(a.locationId)));
      if (!working.length) working = prs;
      working.forEach((p) => columns.push({ day: d0, prIds: [p.id], pr: p, label: p.name, sub: p.discipline }));
    }
    if (!columns.length) return '<div class="card empty">No practitioners work at this location. Add staff under Staff &amp; Services.</div>';
    const times = []; for (let m = open; m < close; m += 60) { const h = m / 60; times.push(`<div class="t">${h % 12 || 12}${h >= 12 ? 'p' : 'a'}</div>`); }
    const now = new Date();
    const cols = columns.map((c) => {
      const dk = dateKey(c.day);
      const isToday = dk === todayK();
      // open slots: union of shifts for all prIds in this column (filtered by location)
      const openMask = new Array(nSlots).fill(false);
      c.prIds.forEach((pid) => S.shiftsFor(pid, c.day, ui.loc).forEach((sh) => { for (let m = hm(sh.start); m < hm(sh.end); m += slotMin) { const i = (m - open) / slotMin; if (i >= 0 && i < nSlots) openMask[i] = true; } }));
      const slots = []; for (let i = 0; i < nSlots; i++) { const m = open + i * slotMin; slots.push(`<div class="slot ${openMask[i] ? 'open' : ''} ${m % 60 === 45 ? 'hour' : ''}" data-action="slot-click" data-date="${dk}" data-min="${m}" data-pr="${c.pr ? c.pr.id : ''}" title="${fmtHM(m)}"></div>`); }
      const appts = S.state.appointments.filter((a) => dateKey(a.start) === dk && c.prIds.includes(a.practitionerId) && inLoc(a.locationId));
      // simple overlap layout: assign lanes
      appts.sort((a, b) => a.start.localeCompare(b.start));
      const lanes = []; appts.forEach((a) => { let lane = 0; while (lanes[lane] && lanes[lane] > a.start) lane++; lanes[lane] = a.end; a._lane = lane; });
      const nLanes = Math.max(1, lanes.length);
      const blocks = appts.map((a) => {
        const st = minutesOf(a.start), en = minutesOf(a.end); const top = ((st - open) / slotMin) * 22; const height = Math.max(20, ((en - st) / slotMin) * 22 - 2);
        const p = S.patient(a.patientId); const pr = S.practitioner(a.practitionerId);
        const w = 100 / nLanes; const left = a._lane * w;
        return `<div class="appt ${a.status}" style="top:${top}px;height:${height}px;border-left-color:${pr?.color || '#999'};left:calc(${left}% + 3px);width:calc(${w}% - 6px)" data-action="open-appointment" data-id="${a.id}" title="${esc(S.patientName(p))} · ${esc(txName(a.treatmentId))}">
          <div class="nm">${esc(S.patientName(p))}${a.source === 'online' ? ' <span title="Booked online">🌐</span>' : ''}</div>
          ${height > 30 ? `<div class="tx">${isWeek ? esc(pr?.name.split(' ')[0] + ' · ') : ''}${esc(txName(a.treatmentId))}</div>` : ''}
          ${height > 48 ? `<div class="st" style="color:${pr?.color}">${fmtTime(a.start)} · ${STATUS_LABEL[a.status]}</div>` : ''}</div>`;
      }).join('');
      const nowM = minutesOf(now); const nowline = isToday && nowM >= open && nowM <= close ? `<div class="nowline" style="top:${((nowM - open) / slotMin) * 22}px"></div>` : '';
      return `<div class="col"><div class="hdr ${isToday ? 'today' : ''}">${c.pr ? avatar(c.pr.name, c.pr.color) : ''}<div style="min-width:0"><div class="name">${esc(c.label)}</div><div class="sub">${esc(c.sub)}${!isWeek && c.pr ? ` · ${appts.filter((a) => a.status !== 'cancelled').length} appts` : ''}</div></div></div><div class="body">${slots.join('')}${blocks}${nowline}</div></div>`;
    }).join('');
    return `<div class="sched" id="sched"><div class="times"><div class="hdr"></div>${times.join('')}</div><div class="cols" style="grid-template-columns:repeat(${columns.length}, minmax(${isWeek ? 150 : 180}px, 1fr))">${cols}</div></div>`;
  }
  function afterScheduleRender() {
    const sched = $('#sched'); if (!sched) return;
    const nowM = minutesOf(new Date()); const open = S.state.settings.openHour * 60;
    const y = Math.max(0, ((nowM - open) / 15) * 22 - 200);
    if ((ui.query.date || todayK()) === todayK()) main.scrollTop = y;
  }
  function scheduleList(dk, prs) {
    const ids = prs.map((p) => p.id);
    const appts = S.appointmentsOn(dk).filter((a) => ids.includes(a.practitionerId) && inLoc(a.locationId)).sort((a, b) => a.start.localeCompare(b.start));
    return `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Time</th><th>Patient</th><th>Service</th><th>Practitioner</th><th>Location</th><th>Status</th><th>Invoice</th><th></th></tr></thead><tbody>
      ${appts.length ? appts.map((a) => { const inv = a.invoiceId && S.get('invoices', a.invoiceId); return `<tr class="click" data-action="open-appointment" data-id="${a.id}"><td class="nowrap">${fmtTime(a.start)}–${fmtTime(a.end)}</td><td class="bold">${esc(S.patientName(a.patientId))}</td><td>${esc(txName(a.treatmentId))}</td><td>${esc(prName(a.practitionerId))}</td><td>${esc(locName(a.locationId))}</td><td>${badge(a.status)}</td><td>${inv ? `<span class="badge ${S.invoiceStatus(inv)}">${esc(inv.number)}</span>` : '—'}</td><td class="right"><button class="btn xs" data-action="open-appointment" data-id="${a.id}">Open</button></td></tr>`; }).join('') : '<tr><td colspan="8" class="empty">No appointments.</td></tr>'}
    </tbody></table></div></div>`;
  }

  /* =========================================================
     Patients
     ========================================================= */
  function viewPatients() {
    if (ui.params.id) return viewPatient(ui.params.id);
    const qtext = (ui.query.q || '').toLowerCase();
    const filter = ui.query.filter || '';
    let list = S.state.patients.slice();
    if (ui.loc) list = list.filter((p) => p.homeLocationId === ui.loc || S.state.appointments.some((a) => a.patientId === p.id && a.locationId === ui.loc));
    if (qtext) list = list.filter((p) => `${p.first} ${p.last} ${p.email} ${p.phone} ${p.healthNumber}`.toLowerCase().includes(qtext));
    if (filter === 'balance') list = list.filter((p) => S.patientBalance(p.id) > 0.004);
    if (filter === 'unsigned') { const ids = new Set(S.state.charts.filter((c) => !c.signed).map((c) => c.patientId)); list = list.filter((p) => ids.has(p.id)); }
    if (filter === 'noshow') { const since = addDays(new Date(), -7).toISOString(); const ids = new Set(S.state.appointments.filter((a) => a.status === 'no-show' && a.start >= since).map((a) => a.patientId)); list = list.filter((p) => ids.has(p.id)); }
    if (filter === 'new') { const since = addDays(new Date(), -30).toISOString(); list = list.filter((p) => p.createdAt >= since); }
    if (filter === 'inactive') { const since = addDays(new Date(), -60).toISOString(); list = list.filter((p) => { const lv = S.lastVisit(p.id); return lv && lv.start < since && !S.nextVisit(p.id); }); }
    list.sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first));
    const fq = (f) => `#/patients?filter=${f}${qtext ? '&q=' + encodeURIComponent(qtext) : ''}`;
    return `
      <div class="page-head"><h1>Patients</h1><div class="actions"><button class="btn primary" data-action="new-patient">+ New patient</button></div></div>
      <div class="sched-toolbar">
        <input type="search" placeholder="Search name, phone, email, health #" value="${esc(ui.query.q || '')}" data-input="patient-search" style="max-width:320px" />
        <div class="btn-group">
          <a class="btn ${!filter ? 'active' : ''}" href="${fq('')}">All</a><a class="btn ${filter === 'new' ? 'active' : ''}" href="${fq('new')}">New (30d)</a><a class="btn ${filter === 'balance' ? 'active' : ''}" href="${fq('balance')}">Owing</a><a class="btn ${filter === 'unsigned' ? 'active' : ''}" href="${fq('unsigned')}">Unsigned charts</a><a class="btn ${filter === 'noshow' ? 'active' : ''}" href="${fq('noshow')}">Recent no-shows</a><a class="btn ${filter === 'inactive' ? 'active' : ''}" href="${fq('inactive')}">Lapsed (60d+)</a>
        </div><span class="muted small">${list.length} patients</span></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Age</th><th>Phone</th><th>Email</th><th>Insurance</th><th>Last visit</th><th>Next visit</th><th class="num">Balance</th></tr></thead><tbody>
        ${list.slice(0, 300).map((p) => { const lv = S.lastVisit(p.id), nv = S.nextVisit(p.id), bal = S.patientBalance(p.id); return `<tr class="click" data-action="nav" data-to="#/patients/${p.id}"><td><div class="flex">${avatar(S.patientName(p), '#475569')}<div><div class="bold">${esc(p.last)}, ${esc(p.first)}</div><div class="tiny muted">${esc(locName(p.homeLocationId))}${p.alerts ? ' · <span style="color:var(--danger)">⚠ ' + esc(p.alerts) + '</span>' : ''}</div></div></div></td><td>${age(p.dob)}</td><td class="nowrap">${esc(p.phone)}</td><td>${esc(p.email)}</td><td>${p.insurers[0] ? esc(p.insurers[0].company) : '<span class="muted">—</span>'}</td><td class="nowrap">${lv ? fmtShortDate(lv.start) : '<span class="muted">—</span>'}</td><td class="nowrap">${nv ? fmtShortDate(nv.start) : '<span class="muted">—</span>'}</td><td class="num ${bal > 0 ? 'bold' : 'muted'}" style="${bal > 0 ? 'color:var(--danger)' : ''}">${fmtMoney(bal)}</td></tr>`; }).join('')}
        ${!list.length ? '<tr><td colspan="8" class="empty">No patients match.</td></tr>' : ''}
      </tbody></table></div></div>`;
  }

  function viewPatient(id) {
    const p = S.patient(id); if (!p) return '<div class="alert danger">Patient not found.</div>';
    const tab = ui.params.sub || 'overview';
    const appts = S.state.appointments.filter((a) => a.patientId === id).sort((a, b) => b.start.localeCompare(a.start));
    const charts = S.state.charts.filter((c) => c.patientId === id).sort((a, b) => b.date.localeCompare(a.date));
    const invs = S.state.invoices.filter((i) => i.patientId === id).sort((a, b) => b.date.localeCompare(a.date));
    const bal = S.patientBalance(id); const nv = S.nextVisit(id); const lv = S.lastVisit(id);
    const completed = appts.filter((a) => a.status === 'completed').length, noshows = appts.filter((a) => a.status === 'no-show').length;
    const tabs = [['overview', 'Overview'], ['appointments', `Appointments (${appts.length})`], ['charts', `Charts (${charts.length})`], ['billing', `Billing (${invs.length})`], ['insurance', 'Insurance & details']];
    let body = '';
    if (tab === 'overview') {
      body = `<div class="grid-2">
        <div class="card"><div class="card-head"><h2>Upcoming</h2><button class="btn sm primary" data-action="new-appointment" data-patient="${id}">+ Book</button></div><div class="card-body" style="padding:0 16px">
          ${appts.filter((a) => a.start >= new Date().toISOString() && a.status !== 'cancelled').length ? `<div class="list">${appts.filter((a) => a.start >= new Date().toISOString() && a.status !== 'cancelled').reverse().map((a) => apptRow(a)).join('')}</div>` : '<div class="empty">Nothing booked. <a href="#" data-action="new-appointment" data-patient="' + id + '">Book now</a> or <a href="#" data-action="add-waitlist" data-patient="' + id + '">add to wait list</a>.</div>'}</div></div>
        <div class="card"><div class="card-head"><h2>Notes & alerts</h2><button class="btn sm" data-action="edit-patient" data-id="${id}">Edit</button></div><div class="card-body">
          ${p.alerts ? `<div class="alert danger">⚠ ${esc(p.alerts)}</div>` : ''}
          ${!p.consentOnFile ? '<div class="alert warn">Consent / intake form not on file.</div>' : '<div class="alert ok">Consent &amp; intake on file.</div>'}
          <p><strong>Primary complaint:</strong> ${esc(p.complaint || '—')}</p>
          <p><strong>Referred by:</strong> ${esc(p.referredBy || '—')}</p>
          <p><strong>Notes:</strong> ${esc(p.notes || '—')}</p>
          <p class="small muted">Patient since ${fmtShortDate(p.createdAt)} · ${completed} visits · ${noshows} no-shows</p></div></div>
        <div class="card"><div class="card-head"><h2>Recent chart notes</h2></div><div class="card-body" style="padding:0 16px">${charts.length ? `<div class="list">${charts.slice(0, 4).map((c) => chartRow(c)).join('')}</div>` : '<div class="empty">No chart notes yet.</div>'}</div></div>
        <div class="card"><div class="card-head"><h2>Recent invoices</h2><button class="btn sm" data-action="new-invoice" data-patient="${id}">+ New sale</button></div><div class="card-body" style="padding:0 16px">${invs.length ? `<div class="list">${invs.slice(0, 4).map((i) => invRow(i)).join('')}</div>` : '<div class="empty">No invoices yet.</div>'}</div></div>
      </div>`;
    } else if (tab === 'appointments') {
      body = `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Service</th><th>Practitioner</th><th>Location</th><th>Status</th><th>Chart</th><th>Invoice</th></tr></thead><tbody>${appts.map((a) => { const inv = a.invoiceId && S.get('invoices', a.invoiceId); const ch = a.chartId && S.get('charts', a.chartId); return `<tr class="click" data-action="open-appointment" data-id="${a.id}"><td class="nowrap">${fmtShortDate(a.start)} ${fmtTime(a.start)}</td><td>${esc(txName(a.treatmentId))}</td><td>${esc(prName(a.practitionerId))}</td><td>${esc(locName(a.locationId))}</td><td>${badge(a.status)}</td><td>${ch ? (ch.signed ? '<span class="badge completed">Signed</span>' : '<span class="badge arrived">Draft</span>') : '—'}</td><td>${inv ? `<span class="badge ${S.invoiceStatus(inv)}">${esc(inv.number)}</span>` : '—'}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">No appointments.</td></tr>'}</tbody></table></div></div>`;
    } else if (tab === 'charts') {
      body = `<div class="card"><div class="card-body" style="padding:0 16px">${charts.length ? `<div class="list">${charts.map((c) => chartRow(c, true)).join('')}</div>` : '<div class="empty">No chart notes yet. Open a completed appointment to chart.</div>'}</div></div>`;
    } else if (tab === 'billing') {
      body = `<div class="stats"><div class="stat ${bal > 0 ? 'accent' : ''}"><div class="label">Balance owing</div><div class="value" style="${bal > 0 ? 'color:var(--danger)' : ''}">${fmtMoney(bal)}</div></div><div class="stat"><div class="label">Lifetime billed</div><div class="value">${fmtMoney(invs.filter((i) => !i.void).reduce((s, i) => s + i.total, 0))}</div></div><div class="stat"><div class="label">Invoices</div><div class="value">${invs.length}</div></div></div>
        ${invoiceTable(invs)}`;
    } else if (tab === 'insurance') {
      body = `<div class="grid-2"><div class="card"><div class="card-head"><h2>Insurance</h2><button class="btn sm" data-action="edit-patient" data-id="${id}">Edit</button></div><div class="card-body">${p.insurers.length ? p.insurers.map((ins) => { const used = round2(S.state.invoices.filter((i) => i.patientId === id && !i.void && i.insurer === ins.company && new Date(i.date).getFullYear() === new Date().getFullYear()).reduce((s, i) => s + i.insurerPortion, 0)); const pct = ins.annualMax ? Math.min(100, (used / ins.annualMax) * 100) : 0; return `<div class="mb"><div class="bold">${esc(ins.company)}</div><div class="small muted">Policy ${esc(ins.policy)} · Member ${esc(ins.member)} · Covers ${ins.coveragePct}%</div>${ins.annualMax ? `<div class="small mt" style="margin-top:6px">Used ${fmtMoney(used)} of ${fmtMoney(ins.annualMax)} this year</div><div class="bar"><i style="width:${pct}%"></i></div>` : '<div class="small muted">No annual maximum</div>'}</div>`; }).join('') : '<div class="empty">No insurance on file.</div>'}</div></div>
        <div class="card"><div class="card-head"><h2>Details</h2></div><div class="card-body small"><table class="tbl"><tr><td class="muted">Date of birth</td><td>${esc(p.dob)} (${age(p.dob)})</td></tr><tr><td class="muted">Sex</td><td>${esc(p.sex)}</td></tr><tr><td class="muted">Phone</td><td>${esc(p.phone)}</td></tr><tr><td class="muted">Email</td><td>${esc(p.email)}</td></tr><tr><td class="muted">Address</td><td>${esc(p.address)}, ${esc(p.city)} ${esc(p.province)} ${esc(p.postal)}</td></tr><tr><td class="muted">Health #</td><td>${esc(p.healthNumber)}</td></tr><tr><td class="muted">Emergency contact</td><td>${esc(p.emergencyName)} ${esc(p.emergencyPhone)}</td></tr><tr><td class="muted">Home clinic</td><td>${esc(locName(p.homeLocationId))}</td></tr></table></div></div></div>`;
    }
    return `
      <div class="page-head"><div class="flex" style="gap:14px">${avatar(S.patientName(p), '#475569', true)}<div><h1>${esc(p.first)} ${esc(p.last)} ${p.tags?.map((t) => `<span class="badge online">${esc(t)}</span>`).join('') || ''}</h1><div class="muted">${age(p.dob)} y · ${esc(p.sex)} · ${esc(p.phone)} · ${esc(p.email)}${bal > 0 ? ` · <span style="color:var(--danger);font-weight:600">Owes ${fmtMoney(bal)}</span>` : ''}</div><div class="small muted">Last visit ${lv ? fmtShortDate(lv.start) : '—'} · Next ${nv ? fmtShortDate(nv.start) + ' ' + fmtTime(nv.start) : '—'}</div></div></div>
        <div class="actions"><a class="btn" href="#/patients">‹ All patients</a><button class="btn" data-action="edit-patient" data-id="${id}">Edit</button><button class="btn" data-action="new-invoice" data-patient="${id}">New sale</button><button class="btn primary" data-action="new-appointment" data-patient="${id}">+ Book</button></div></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-action="nav" data-to="#/patients/${id}/${k}">${l}</button>`).join('')}</div>${body}`;
  }
  function apptRow(a) { const pr = S.practitioner(a.practitionerId); return `<div class="list-item click" data-action="open-appointment" data-id="${a.id}">${avatar(pr?.name, pr?.color)}<div class="grow"><div class="bold">${fmtDate(a.start)} · ${fmtTime(a.start)}</div><div class="small muted">${esc(txName(a.treatmentId))} with ${esc(pr?.name)} · ${esc(locName(a.locationId))}</div></div>${badge(a.status)}</div>`; }
  function chartRow(c, full) { const first = Object.values(c.fields).find((v) => v); return `<div class="list-item click" data-action="open-chart" data-id="${c.id}"><div class="grow" style="min-width:0"><div class="bold">${fmtShortDate(c.date)} · ${esc(c.templateName)}</div><div class="small muted">${esc(prName(c.practitionerId))} · ${esc(locName(c.locationId))}</div>${full ? `<div class="small" style="margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(first || '')}</div>` : ''}</div>${c.signed ? '<span class="badge completed">Signed</span>' : '<span class="badge arrived">Draft</span>'}</div>`; }
  function invRow(i) { return `<div class="list-item click" data-action="open-invoice" data-id="${i.id}"><div class="grow"><div class="bold">${esc(i.number)} · ${fmtShortDate(i.date)}</div><div class="small muted">${esc(i.items.map((it) => it.desc).join(', '))}</div></div><div class="right"><div class="bold">${fmtMoney(i.total)}</div><span class="badge ${S.invoiceStatus(i)}">${S.invoiceStatus(i)}</span></div></div>`; }

  /* =========================================================
     Billing
     ========================================================= */
  function viewBilling() {
    const status = ui.query.status || '';
    const from = ui.query.from || dateKey(addDays(new Date(), -30)), to = ui.query.to || todayK();
    let invs = S.state.invoices.filter((i) => inLoc(i.locationId));
    if (status === 'unpaid') invs = invs.filter((i) => !i.void && S.balance(i) > 0.004);
    else invs = invs.filter((i) => dateKey(i.date) >= from && dateKey(i.date) <= to && (!status || S.invoiceStatus(i) === status));
    invs.sort((a, b) => b.date.localeCompare(a.date));
    const total = round2(invs.filter((i) => !i.void).reduce((s, i) => s + i.total, 0)), collected = round2(invs.reduce((s, i) => s + S.paid(i), 0)), owing = round2(invs.filter((i) => !i.void).reduce((s, i) => s + S.balance(i), 0));
    const insOwing = round2(invs.filter((i) => !i.void && S.balance(i) > 0.004).reduce((s, i) => s + Math.min(S.balance(i), i.insurerPortion || 0), 0));
    const q = (o) => '#/billing?' + Object.entries({ status, from, to, ...o }).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
    return `
      <div class="page-head"><h1>Billing</h1><div class="actions"><button class="btn" data-action="export-invoices">Export CSV</button><button class="btn primary" data-action="new-invoice">+ New sale</button></div></div>
      <div class="sched-toolbar">
        <div class="btn-group"><a class="btn ${!status ? 'active' : ''}" href="${q({ status: '' })}">All</a><a class="btn ${status === 'unpaid' ? 'active' : ''}" href="${q({ status: 'unpaid' })}">Owing (all time)</a><a class="btn ${status === 'partial' ? 'active' : ''}" href="${q({ status: 'partial' })}">Partial</a><a class="btn ${status === 'paid' ? 'active' : ''}" href="${q({ status: 'paid' })}">Paid</a></div>
        ${status !== 'unpaid' ? `<label style="margin:0" class="flex">From <input type="date" value="${from}" data-change="billing-from" style="width:auto"></label><label style="margin:0" class="flex">To <input type="date" value="${to}" data-change="billing-to" style="width:auto"></label>` : ''}
      </div>
      <div class="stats"><div class="stat"><div class="label">Billed</div><div class="value">${fmtMoney(total)}</div></div><div class="stat"><div class="label">Collected</div><div class="value">${fmtMoney(collected)}</div></div><div class="stat accent"><div class="label">Balance owing</div><div class="value" style="${owing > 0 ? 'color:var(--danger)' : ''}">${fmtMoney(owing)}</div><div class="sub">${fmtMoney(insOwing)} expected from insurers</div></div><div class="stat"><div class="label">Invoices</div><div class="value">${invs.length}</div></div></div>
      ${invoiceTable(invs.slice(0, 400))}`;
  }
  function invoiceTable(invs) {
    return `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Invoice</th><th>Date</th><th>Patient</th><th>Items</th><th>Practitioner</th><th>Location</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Owing</th><th>Status</th></tr></thead><tbody>
      ${invs.map((i) => `<tr class="click" data-action="open-invoice" data-id="${i.id}"><td class="bold nowrap">${esc(i.number)}</td><td class="nowrap">${fmtShortDate(i.date)}</td><td>${esc(S.patientName(i.patientId))}</td><td class="small">${esc(i.items.map((it) => it.desc).join(', '))}${i.insurer ? `<div class="tiny muted">Insurer: ${esc(i.insurer)} ${fmtMoney(i.insurerPortion)}</div>` : ''}</td><td>${esc(prName(i.practitionerId))}</td><td>${esc(locName(i.locationId))}</td><td class="num">${fmtMoney(i.total)}</td><td class="num">${fmtMoney(S.paid(i))}</td><td class="num ${S.balance(i) > 0.004 ? 'bold' : ''}">${fmtMoney(S.balance(i))}</td><td><span class="badge ${S.invoiceStatus(i)}">${S.invoiceStatus(i)}</span></td></tr>`).join('') || '<tr><td colspan="10" class="empty">No invoices.</td></tr>'}
    </tbody></table></div></div>`;
  }

  /* =========================================================
     Wait list
     ========================================================= */
  function viewWaitlist() {
    const wl = S.state.waitlist.filter((w) => inLoc(w.locationId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return `<div class="page-head"><h1>Wait list</h1><div class="actions"><button class="btn primary" data-action="add-waitlist">+ Add to wait list</button></div></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Added</th><th>Patient</th><th>Phone</th><th>Service</th><th>Practitioner</th><th>Location</th><th>Notes</th><th></th></tr></thead><tbody>
      ${wl.map((w) => { const p = S.patient(w.patientId); return `<tr><td class="nowrap">${fmtShortDate(w.createdAt)}</td><td class="bold"><a href="#/patients/${w.patientId}">${esc(S.patientName(p))}</a></td><td class="nowrap">${esc(p?.phone || '')}</td><td>${esc(txName(w.treatmentId))}</td><td>${w.practitionerId ? esc(prName(w.practitionerId)) : '<span class="muted">Any</span>'}</td><td>${esc(locName(w.locationId))}</td><td>${esc(w.notes)}</td><td class="right nowrap"><button class="btn xs primary" data-action="book-from-waitlist" data-id="${w.id}">Book</button> <button class="btn xs" data-action="remove-waitlist" data-id="${w.id}">Remove</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">Wait list is empty.</td></tr>'}</tbody></table></div></div>`;
  }

  /* =========================================================
     Reports
     ========================================================= */
  function viewReports() {
    const preset = ui.query.range || '30';
    let from = ui.query.from, to = ui.query.to || todayK();
    if (!from) { if (preset === 'mtd') from = todayK().slice(0, 8) + '01'; else if (preset === 'ytd') from = todayK().slice(0, 4) + '-01-01'; else from = dateKey(addDays(new Date(), -(Number(preset) || 30) + 1)); }
    const r = S.report(from, to, ui.loc);
    const days = Math.max(1, Math.round((parseKey(to) - parseKey(from)) / 86400000) + 1);
    const prevFrom = dateKey(addDays(parseKey(from), -days)), prevTo = dateKey(addDays(parseKey(from), -1));
    const prev = S.report(prevFrom, prevTo, ui.loc);
    const delta = (a, b, money) => { if (!b) return '<span class="muted">—</span>'; const d = ((a - b) / b) * 100; return `<span style="color:${d >= 0 ? 'var(--ok)' : 'var(--danger)'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}%</span> <span class="muted">vs prior ${days}d</span>`; };
    const hbars = (obj, nameFn, money, colorFn) => { const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]); const max = Math.max(1, ...entries.map((e) => e[1])); return entries.length ? entries.map(([k, v]) => `<div class="hbar"><span class="nowrap" style="overflow:hidden;text-overflow:ellipsis" title="${esc(nameFn(k))}">${esc(nameFn(k))}</span><div class="bar"><i style="width:${(v / max) * 100}%;${colorFn ? 'background:' + colorFn(k) : ''}"></i></div><span class="right bold">${money ? fmtMoney(v) : v}</span></div>`).join('') : '<div class="empty small">No data</div>'; };
    const q = (o) => '#/reports?' + Object.entries({ range: preset, from: ui.query.from, to: ui.query.to, ...o }).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
    // daily revenue series
    const series = []; for (let i = 0; i < Math.min(days, 92); i++) { const k = dateKey(addDays(parseKey(from), i)); series.push({ k, v: r.revenueByDay[k] || 0 }); }
    const maxV = Math.max(1, ...series.map((s) => s.v));
    const prRows = S.state.practitioners.filter((p) => r.visitsByPractitioner[p.id] || r.revenueByPractitioner[p.id]).map((p) => { const v = r.visitsByPractitioner[p.id] || 0, a = r.assessmentsByPractitioner[p.id] || 0, rev = r.revenueByPractitioner[p.id] || 0; return { p, v, a, rev, pva: a ? round2(v / a) : 0, perVisit: v ? round2(rev / v) : 0 }; }).sort((a, b) => b.rev - a.rev);
    return `
      <div class="page-head"><div><h1>Reports</h1><div class="muted">${fmtShortDate(parseKey(from))} – ${fmtShortDate(parseKey(to))} · ${ui.loc ? esc(locName(ui.loc)) : 'All locations'}</div></div>
        <div class="actions"><div class="btn-group">${[['7', '7d'], ['30', '30d'], ['90', '90d'], ['mtd', 'Month to date'], ['ytd', 'Year to date']].map(([k, l]) => `<a class="btn ${preset === k && !ui.query.from ? 'active' : ''}" href="${q({ range: k, from: '', to: '' })}">${l}</a>`).join('')}</div>
        <input type="date" value="${from}" data-change="rep-from" style="width:auto"><input type="date" value="${to}" data-change="rep-to" style="width:auto"><button class="btn" data-action="print-report">Print</button></div></div>
      <div class="stats">
        <div class="stat accent"><div class="label">Revenue billed</div><div class="value">${fmtMoney(r.revenue)}</div><div class="sub">${delta(r.revenue, prev.revenue)}</div></div>
        <div class="stat"><div class="label">Collected</div><div class="value">${fmtMoney(r.collected)}</div><div class="sub">${fmtMoney(r.outstanding)} outstanding</div></div>
        <div class="stat"><div class="label">Visits</div><div class="value">${r.visits}</div><div class="sub">${delta(r.visits, prev.visits)}</div></div>
        <div class="stat"><div class="label">PVA</div><div class="value">${r.pva}</div><div class="sub">${r.visits} visits ÷ ${r.assessments.length} assessments</div></div>
        <div class="stat"><div class="label">New patients</div><div class="value">${r.newPatients.length}</div><div class="sub">${delta(r.newPatients.length, prev.newPatients.length)}</div></div>
        <div class="stat"><div class="label">Avg. invoice</div><div class="value">${fmtMoney(r.avgTicket)}</div><div class="sub">${r.uniquePatients} unique patients</div></div>
        <div class="stat"><div class="label">No-show rate</div><div class="value">${r.noShowRate}%</div><div class="sub">${r.noShows.length} no-shows · ${r.cancelRate}% cancelled</div></div>
        <div class="stat"><div class="label">Rebooking rate</div><div class="value">${r.rebookRate}%</div><div class="sub">visits with a next appointment</div></div>
      </div>
      <div class="card mb"><div class="card-head"><h2>Daily revenue</h2><span class="muted small">${fmtMoney(round2(r.revenue / days))} / day average</span></div><div class="card-body"><div class="spark">${series.map((s) => `<i style="height:${(s.v / maxV) * 100}%" data-tip="${fmtShortDate(parseKey(s.k))}: ${fmtMoney(s.v)}"></i>`).join('')}</div></div></div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>Revenue by location</h2></div><div class="card-body">${hbars(r.revenueByLocation, locName, true, (k) => (S.location(k) || {}).color)}</div></div>
        <div class="card"><div class="card-head"><h2>Visits by discipline</h2></div><div class="card-body">${hbars(r.visitsByDiscipline, (k) => k, false)}</div></div>
        <div class="card"><div class="card-head"><h2>Payments by method</h2></div><div class="card-body">${hbars(r.paymentsByMethod, (k) => k, true)}</div></div>
        <div class="card"><div class="card-head"><h2>New patient sources</h2></div><div class="card-body">${hbars(r.referralSources, (k) => k, false)}</div></div>
      </div>
      <div class="card mt"><div class="card-head"><h2>Practitioner performance</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Practitioner</th><th>Discipline</th><th class="num">Visits</th><th class="num">Assessments</th><th class="num">PVA</th><th class="num">Revenue</th><th class="num">Per visit</th></tr></thead><tbody>
        ${prRows.map((x) => `<tr><td class="bold"><div class="flex">${avatar(x.p.name, x.p.color)}${esc(x.p.name)}</div></td><td>${esc(x.p.discipline)}</td><td class="num">${x.v}</td><td class="num">${x.a}</td><td class="num">${x.pva || '—'}</td><td class="num">${fmtMoney(x.rev)}</td><td class="num">${fmtMoney(x.perVisit)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No data</td></tr>'}
      </tbody></table></div></div>`;
  }
  function afterReportsRender() {}

  /* =========================================================
     Staff & services
     ========================================================= */
  function viewStaff() {
    const tab = ui.params.id || 'practitioners';
    const tabs = [['practitioners', 'Practitioners'], ['treatments', 'Treatments'], ['products', 'Products'], ['templates', 'Chart templates']];
    let body = '';
    if (tab === 'practitioners') {
      const prs = S.state.practitioners.filter((p) => !ui.loc || p.locationIds.includes(ui.loc));
      body = `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Discipline</th><th>Locations</th><th>Weekly hours</th><th>Online booking</th><th>Status</th><th></th></tr></thead><tbody>${prs.map((p) => { const hrs = Object.values(p.shifts).flat().reduce((s, sh) => s + (hm(sh.end) - hm(sh.start)) / 60, 0); return `<tr><td><div class="flex">${avatar(p.name, p.color)}<div><div class="bold">${esc(p.name)}, ${esc(p.title || '')}</div><div class="tiny muted">${esc(p.email)}</div></div></div></td><td>${esc(p.discipline)}</td><td>${p.locationIds.map(locName).map(esc).join(', ')}</td><td>${hrs}h · ${Object.keys(p.shifts).length} days</td><td>${p.online ? '<span class="badge completed">Yes</span>' : '<span class="badge">No</span>'}</td><td>${p.active ? '<span class="badge booked">Active</span>' : '<span class="badge">Inactive</span>'}</td><td class="right"><button class="btn xs" data-action="edit-practitioner" data-id="${p.id}">Edit</button></td></tr>`; }).join('')}</tbody></table></div></div>`;
    } else if (tab === 'treatments') {
      body = `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Treatment</th><th>Discipline</th><th class="num">Duration</th><th class="num">Price</th><th>Type</th><th>Online</th><th></th></tr></thead><tbody>${S.state.treatments.map((t) => `<tr><td class="bold">${esc(t.name)}</td><td>${esc(t.discipline)}</td><td class="num">${t.duration} min</td><td class="num">${fmtMoney(t.price)}</td><td>${t.isAssessment ? '<span class="badge online">Assessment</span>' : 'Treatment'}</td><td>${t.online ? '✓' : '—'}</td><td class="right"><button class="btn xs" data-action="edit-treatment" data-id="${t.id}">Edit</button></td></tr>`).join('')}</tbody></table></div></div>`;
    } else if (tab === 'products') {
      body = `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Product</th><th class="num">Price</th><th>Taxable</th><th></th></tr></thead><tbody>${S.state.products.map((t) => `<tr><td class="bold">${esc(t.name)}</td><td class="num">${fmtMoney(t.price)}</td><td>${t.taxable ? 'Yes' : 'No'}</td><td class="right"><button class="btn xs" data-action="edit-product" data-id="${t.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No products.</td></tr>'}</tbody></table></div></div>`;
    } else if (tab === 'templates') {
      body = `<div class="grid-2">${S.state.chartTemplates.map((t) => `<div class="card"><div class="card-head"><div><h2>${esc(t.name)}</h2><div class="small muted">${esc(t.discipline || 'All disciplines')}</div></div><button class="btn xs" data-action="edit-template" data-id="${t.id}">Edit</button></div><div class="card-body small">${t.sections.map((s) => `<div class="mb"><strong>${esc(s.label)}</strong><div class="muted">${esc(s.placeholder || '')}</div></div>`).join('')}</div></div>`).join('')}</div>`;
    }
    const addBtn = { practitioners: ['edit-practitioner', '+ Add practitioner'], treatments: ['edit-treatment', '+ Add treatment'], products: ['edit-product', '+ Add product'], templates: ['edit-template', '+ Add template'] }[tab];
    return `<div class="page-head"><h1>Staff &amp; Services</h1><div class="actions"><button class="btn primary" data-action="${addBtn[0]}">${addBtn[1]}</button></div></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-action="nav" data-to="#/staff/${k}">${l}</button>`).join('')}</div>${body}`;
  }

  /* =========================================================
     Settings
     ========================================================= */
  function viewSettings() {
    const s = S.state.settings;
    const size = Math.round(JSON.stringify(S.state).length / 1024);
    return `<div class="page-head"><h1>Settings</h1></div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>Clinic</h2></div><div class="card-body"><form data-form="settings">
          <div class="field"><label>Business name</label><input name="clinicName" value="${esc(s.clinicName)}" required></div>
          <div class="grid-3"><div class="field"><label>Tax name</label><input name="taxName" value="${esc(s.taxName)}"></div><div class="field"><label>Tax rate %</label><input name="taxRate" type="number" step="0.01" value="${s.taxRate}"></div><div class="field"><label>Invoice prefix</label><input name="invoicePrefix" value="${esc(s.invoicePrefix)}"></div></div>
          <div class="grid-3"><div class="field"><label>Schedule opens</label><select name="openHour">${Array.from({ length: 13 }, (_, i) => opt(i + 5, fmtHM((i + 5) * 60), s.openHour)).join('')}</select></div><div class="field"><label>Schedule closes</label><select name="closeHour">${Array.from({ length: 12 }, (_, i) => opt(i + 12, fmtHM((i + 12) * 60), s.closeHour)).join('')}</select></div><div class="field"><label>Online booking window (days)</label><input name="bookingWindowDays" type="number" value="${s.bookingWindowDays}"></div></div>
          <div class="field"><label><input type="checkbox" name="onlineBookingEnabled" ${s.onlineBookingEnabled ? 'checked' : ''} style="width:auto;margin-right:6px">Online booking enabled</label></div>
          <div class="field"><label>Cancellation policy (shown on booking page &amp; receipts)</label><textarea name="cancellationPolicy">${esc(s.cancellationPolicy)}</textarea></div>
          <button class="btn primary">Save settings</button></form></div></div>
        <div>
          <div class="card mb"><div class="card-head"><h2>Locations</h2><button class="btn xs" data-action="edit-location">+ Add</button></div><div class="card-body" style="padding:4px 16px"><div class="list">${S.state.locations.map((l) => `<div class="list-item"><span class="dot" style="background:${l.color}"></span><div class="grow"><div class="bold">${esc(l.name)}</div><div class="small muted">${esc(l.address)} · ${esc(l.phone)}</div></div><button class="btn xs" data-action="edit-location" data-id="${l.id}">Edit</button></div>`).join('')}</div></div></div>
          <div class="card mb"><div class="card-head"><h2>Online booking</h2></div><div class="card-body small">
            <p>Your patient-facing booking page: <a href="book.html" target="_blank" rel="noopener"><strong>book.html</strong> ↗</a></p>
            <p class="muted">Bookings made there appear on the schedule instantly, marked with 🌐. Because this edition stores data in the browser, the booking page shares data only when opened in this same browser. Connecting it to a shared cloud database is the next step for live, multi-device use.</p>
          </div></div>
          <div class="card"><div class="card-head"><h2>Data &amp; backup</h2></div><div class="card-body small">
            <p>Database size: <strong>${size} KB</strong> · ${S.state.patients.length} patients · ${S.state.appointments.length} appointments · ${S.state.invoices.length} invoices · ${S.state.charts.length} charts</p>
            <div class="flex wrap mt"><button class="btn" data-action="export-data">⬇ Download backup (JSON)</button><label class="btn" style="margin:0">⬆ Restore backup<input type="file" accept="application/json" data-change="import-data" class="hidden"></label><button class="btn" data-action="export-patients">Patients CSV</button></div>
            <div class="flex wrap mt"><button class="btn danger" data-action="reset-demo">Reset to demo data</button><button class="btn danger" data-action="start-blank">Start fresh (erase all patients &amp; visits)</button></div>
            <p class="muted mt">All data lives in this browser's storage. Download a backup regularly and before clearing browser data.</p>
          </div></div>
        </div>
      </div>`;
  }

  /* =========================================================
     Shared widgets
     ========================================================= */
  function patientPickerHTML(name, selectedId, allowNew = true) {
    const p = selectedId && S.patient(selectedId);
    return `<div class="patient-picker" data-picker="${name}">
      <input type="hidden" name="${name}" value="${selectedId || ''}">
      <div class="pp-selected ${p ? '' : 'hidden'}">${p ? avatar(S.patientName(p), '#475569') : ''}<div class="grow pp-label">${p ? `<div class="bold">${esc(S.patientName(p))}</div><div class="tiny muted">${esc(p.phone)} · ${esc(p.email)}</div>` : ''}</div><button type="button" class="btn xs" data-pp-clear>Change</button></div>
      <div class="pp-search ${p ? 'hidden' : ''}"><input type="text" placeholder="Type a patient's name, phone or email…" autocomplete="off" data-pp-input><div class="pp-results hidden"></div>
        ${allowNew ? `<div class="small mt"><a href="#" data-pp-new>+ New patient</a></div><div class="pp-newform hidden mt"><div class="grid-2"><div class="field"><label>First name</label><input data-new="first"></div><div class="field"><label>Last name</label><input data-new="last"></div><div class="field"><label>Phone</label><input data-new="phone"></div><div class="field"><label>Email</label><input data-new="email" type="email"></div></div></div>` : ''}
      </div></div>`;
  }
  function wirePatientPicker(root) {
    $$('.patient-picker', root).forEach((pp) => {
      const hidden = pp.querySelector('input[type=hidden]'), input = pp.querySelector('[data-pp-input]'), results = pp.querySelector('.pp-results'), sel = pp.querySelector('.pp-selected'), search = pp.querySelector('.pp-search');
      const select = (p) => { hidden.value = p.id; sel.classList.remove('hidden'); search.classList.add('hidden'); sel.querySelector('.pp-label').innerHTML = `<div class="bold">${esc(S.patientName(p))}</div><div class="tiny muted">${esc(p.phone)} · ${esc(p.email)}</div>`; pp.dispatchEvent(new CustomEvent('patient', { bubbles: true, detail: p })); };
      input.addEventListener('input', () => { const q = input.value.toLowerCase().trim(); if (q.length < 2) { results.classList.add('hidden'); return; } const hits = S.state.patients.filter((p) => `${p.first} ${p.last} ${p.phone} ${p.email}`.toLowerCase().includes(q)).slice(0, 8); results.innerHTML = hits.map((p) => `<div data-id="${p.id}"><strong>${esc(S.patientName(p))}</strong> <span class="muted small">${esc(p.phone)} · ${age(p.dob)}y · ${esc(locName(p.homeLocationId))}</span></div>`).join('') || '<div class="muted">No matches — use “New patient” below</div>'; results.classList.remove('hidden'); });
      results.addEventListener('mousedown', (e) => { const row = e.target.closest('[data-id]'); if (row) { select(S.patient(row.dataset.id)); results.classList.add('hidden'); } });
      input.addEventListener('blur', () => setTimeout(() => results.classList.add('hidden'), 150));
      pp.querySelector('[data-pp-clear]').addEventListener('click', () => { hidden.value = ''; sel.classList.add('hidden'); search.classList.remove('hidden'); input.value = ''; input.focus(); });
      const nw = pp.querySelector('[data-pp-new]'); if (nw) nw.addEventListener('click', (e) => { e.preventDefault(); pp.querySelector('.pp-newform').classList.toggle('hidden'); pp.querySelector('[data-new=first]').focus(); });
    });
  }
  /* returns patient id from a picker, creating the inline new patient if needed */
  function resolvePicker(root, name, locationId) {
    const pp = $(`.patient-picker[data-picker="${name}"]`, root); const id = pp.querySelector('input[type=hidden]').value; if (id) return id;
    const nf = pp.querySelector('.pp-newform'); if (!nf || nf.classList.contains('hidden')) return null;
    const g = (k) => (pp.querySelector(`[data-new=${k}]`).value || '').trim();
    if (!g('first') || !g('last')) return null;
    const p = S.add('patients', { first: g('first'), last: g('last'), phone: g('phone'), email: g('email'), dob: '', sex: '', address: '', city: '', province: '', postal: '', healthNumber: '', homeLocationId: locationId || ui.loc || S.state.locations[0].id, emergencyName: '', emergencyPhone: '', insurers: [], notes: '', tags: [], referredBy: '', complaint: '', createdAt: new Date().toISOString(), consentOnFile: false, alerts: '' });
    S.log(`New patient ${S.patientName(p)} created`); return p.id;
  }

  /* =========================================================
     Appointment modal (book / edit / status / reschedule)
     ========================================================= */
  function apptModal(apptId, prefill = {}) {
    const a = apptId ? S.get('appointments', apptId) : null;
    const isNew = !a;
    const d = { patientId: a?.patientId || prefill.patientId || '', locationId: a?.locationId || prefill.locationId || ui.loc || S.state.locations[0].id, practitionerId: a?.practitionerId || prefill.practitionerId || '', treatmentId: a?.treatmentId || prefill.treatmentId || '', date: a ? dateKey(a.start) : prefill.date || todayK(), time: a ? fmtHM(minutesOf(a.start)) : prefill.time || '', notes: a?.notes || '' };
    const p = d.patientId && S.patient(d.patientId);
    const body = `
      ${a ? `<div class="flex between mb wrap"><div class="flex">${avatar(S.patientName(p), '#475569', true)}<div><div class="bold" style="font-size:16px"><a href="#/patients/${p.id}" data-action="close-and-go">${esc(S.patientName(p))}</a></div><div class="small muted">${esc(p.phone)} · ${esc(p.email)}${S.patientBalance(p.id) > 0 ? ` · <span style="color:var(--danger)">Owes ${fmtMoney(S.patientBalance(p.id))}</span>` : ''}</div>${p.alerts ? `<div class="small" style="color:var(--danger)">⚠ ${esc(p.alerts)}</div>` : ''}</div></div>${a.source === 'online' ? '<span class="badge online">Booked online</span>' : ''}</div>
        <div class="field"><label>Status</label><div class="status-bar">${Object.keys(STATUS_LABEL).map((st) => `<button type="button" class="btn sm ${a.status === st ? 'active' : ''}" data-action="set-status" data-id="${a.id}" data-status="${st}">${STATUS_LABEL[st]}</button>`).join('')}</div></div>
        <div class="flex wrap mb" style="gap:8px">
          <button type="button" class="btn" data-action="open-chart-for-appt" data-id="${a.id}">📝 ${a.chartId ? (S.get('charts', a.chartId)?.signed ? 'View chart' : 'Continue chart') : 'Chart'}</button>
          ${a.invoiceId ? `<button type="button" class="btn" data-action="open-invoice" data-id="${a.invoiceId}">🧾 Invoice ${esc(S.get('invoices', a.invoiceId)?.number || '')} <span class="badge ${S.invoiceStatus(S.get('invoices', a.invoiceId))}">${S.invoiceStatus(S.get('invoices', a.invoiceId))}</span></button>` : `<button type="button" class="btn primary" data-action="checkout" data-id="${a.id}">💳 Check out &amp; pay</button>`}
          <button type="button" class="btn" data-action="rebook" data-id="${a.id}">↻ Book next visit</button>
        </div><hr style="border:0;border-top:1px solid var(--border);margin:4px 0 14px">` : ''}
      <form data-form="appointment" data-id="${a?.id || ''}">
        ${isNew ? `<div class="field"><label>Patient</label>${patientPickerHTML('patientId', d.patientId)}</div>` : ''}
        <div class="grid-2">
          <div class="field"><label>Location</label><select name="locationId" data-appt="loc">${S.state.locations.map((l) => opt(l.id, l.name, d.locationId)).join('')}</select></div>
          <div class="field"><label>Practitioner</label><select name="practitionerId" data-appt="pr"></select></div>
          <div class="field"><label>Treatment</label><select name="treatmentId" data-appt="tx"></select></div>
          <div class="field"><label>Date</label><input type="date" name="date" value="${d.date}" data-appt="date" required></div>
        </div>
        <div class="field"><label>Time <span class="muted" style="font-weight:400">(open times for this practitioner)</span></label><div class="slot-grid" data-appt="slots"></div>
          <div class="flex mt small"><span class="muted">Or exact time:</span><input type="time" name="time" value="${d.time}" step="300" style="width:auto" data-appt="time"></div>
          <div data-appt="conflict" class="alert warn hidden" style="margin-top:8px"></div></div>
        <div class="field"><label>Appointment notes</label><input name="notes" value="${esc(d.notes)}" placeholder="e.g. bring MRI report, prefers firm pressure"></div>
      </form>`;
    const foot = `${a ? `<div class="left"><button class="btn danger" data-action="delete-appointment" data-id="${a.id}">Delete</button></div>` : ''}<button class="btn" data-close2>Close</button><button class="btn primary" data-submit>${isNew ? 'Book appointment' : 'Save changes'}</button>`;
    const m = openModal({ title: isNew ? 'Book appointment' : `Appointment · ${fmtDate(a.start)} ${fmtTime(a.start)}`, body, foot, size: 'wide', onMount: (m) => {
      const form = $('form[data-form=appointment]', m.el);
      const locSel = $('[data-appt=loc]', form), prSel = $('[data-appt=pr]', form), txSel = $('[data-appt=tx]', form), dateIn = $('[data-appt=date]', form), timeIn = $('[data-appt=time]', form), slots = $('[data-appt=slots]', form), conflict = $('[data-appt=conflict]', form);
      wirePatientPicker(form);
      const fillPr = () => { const loc = locSel.value; const prs = S.state.practitioners.filter((x) => x.active && x.locationIds.includes(loc)); const cur = prSel.value || d.practitionerId; prSel.innerHTML = prs.map((x) => opt(x.id, `${x.name} · ${x.discipline}`, cur)).join('') || '<option value="">No staff at this location</option>'; if (!prs.some((x) => x.id === prSel.value) && prs[0]) prSel.value = prs.find((x) => x.id === cur)?.id || prs[0].id; fillTx(); };
      const fillTx = () => { const pr = S.practitioner(prSel.value); const txs = pr ? S.state.treatments.filter((t) => pr.treatmentIds.includes(t.id) || t.discipline === pr.discipline) : S.state.treatments; const cur = txSel.value || d.treatmentId; txSel.innerHTML = txs.map((t) => opt(t.id, `${t.name} · ${t.duration} min · ${fmtMoney(t.price)}`, cur)).join(''); if (!txs.some((t) => t.id === txSel.value) && txs[0]) txSel.value = txs[0].id; fillSlots(); };
      const fillSlots = () => { const tx = S.treatment(txSel.value); const dur = tx ? tx.duration : 30; const dk = dateIn.value; if (!dk || !prSel.value) { slots.innerHTML = ''; return; }
        const day = parseKey(dk); const list = []; S.shiftsFor(prSel.value, day, locSel.value).forEach((sh) => { for (let t = hm(sh.start); t + dur <= hm(sh.end); t += 15) { const st = new Date(day); st.setMinutes(t); const en = addMinutes(st, dur); if (!S.conflicts(prSel.value, st, en, a?.id).length) list.push(t); } });
        slots.innerHTML = list.length ? list.map((t) => `<button type="button" class="btn xs ${timeIn.value === fmtHM(t) ? 'active' : ''}" data-slot="${fmtHM(t)}">${fmtTime(new Date(day.getTime() + t * 60000))}</button>`).join('') : `<span class="muted small">No open times for ${esc(prName(prSel.value))} at ${esc(locName(locSel.value))} on ${fmtDate(day)}. You can still enter an exact time below.</span>`;
        checkConflict(); };
      const checkConflict = () => { const tx = S.treatment(txSel.value); if (!timeIn.value || !dateIn.value || !tx) { conflict.classList.add('hidden'); return; } const st = parseKey(dateIn.value); st.setMinutes(hm(timeIn.value)); const en = addMinutes(st, tx.duration); const c = S.conflicts(prSel.value, st, en, a?.id); const onShift = S.shiftsFor(prSel.value, st, locSel.value).some((sh) => hm(sh.start) <= minutesOf(st) && hm(sh.end) >= minutesOf(en)); let msg = ''; if (c.length) msg = `⚠ Overlaps with ${c.map((x) => `${S.patientName(x.patientId)} at ${fmtTime(x.start)}`).join(', ')}.`; else if (!onShift) msg = `⚠ ${prName(prSel.value)} is not scheduled to work at ${locName(locSel.value)} at this time. You can still book it.`; conflict.textContent = msg; conflict.classList.toggle('hidden', !msg); };
      locSel.addEventListener('change', fillPr); prSel.addEventListener('change', fillTx); txSel.addEventListener('change', fillSlots); dateIn.addEventListener('change', fillSlots); timeIn.addEventListener('change', () => { $$('[data-slot]', slots).forEach((b) => b.classList.toggle('active', b.dataset.slot === timeIn.value)); checkConflict(); });
      slots.addEventListener('click', (e) => { const b = e.target.closest('[data-slot]'); if (!b) return; timeIn.value = b.dataset.slot; $$('[data-slot]', slots).forEach((x) => x.classList.toggle('active', x === b)); checkConflict(); });
      fillPr();
      if (d.practitionerId) prSel.value = d.practitionerId, fillTx(); if (d.treatmentId) txSel.value = d.treatmentId, fillSlots();
      $('[data-close2]', m.el).onclick = m.close;
      $('[data-submit]', m.el).onclick = () => {
        const f = formData(form); const tx = S.treatment(f.treatmentId);
        if (!f.time) return toast('Pick a time first.', true); if (!tx) return toast('Pick a treatment.', true);
        const patientId = isNew ? resolvePicker(form, 'patientId', f.locationId) : a.patientId;
        if (!patientId) return toast('Choose a patient, or fill in first and last name for a new patient.', true);
        const start = parseKey(f.date); start.setMinutes(hm(f.time)); const end = addMinutes(start, tx.duration);
        if (isNew) { const appt = S.add('appointments', { patientId, practitionerId: f.practitionerId, locationId: f.locationId, treatmentId: f.treatmentId, start: start.toISOString(), end: end.toISOString(), status: 'booked', notes: f.notes, source: 'staff', createdAt: new Date().toISOString(), chartId: null, invoiceId: null }); S.log(`Booked ${S.patientName(patientId)} with ${prName(f.practitionerId)} on ${fmtShortDate(start)} ${fmtTime(start)}`); S.save(); toast('Appointment booked'); m.close(); if (ui.route !== 'schedule') go(`#/schedule?date=${f.date}`); }
        else { S.update('appointments', a.id, { practitionerId: f.practitionerId, locationId: f.locationId, treatmentId: f.treatmentId, start: start.toISOString(), end: end.toISOString(), notes: f.notes }); S.log(`Updated appointment for ${S.patientName(a.patientId)}`); S.save(); toast('Saved'); m.close(); }
      };
    } });
    return m;
  }

  /* =========================================================
     Checkout / invoices / payments
     ========================================================= */
  function checkoutModal(apptId) {
    const a = S.get('appointments', apptId); const p = S.patient(a.patientId); const tx = S.treatment(a.treatmentId);
    const items = [{ id: uid(), desc: tx.name, qty: 1, price: tx.price, taxable: false, kind: 'treatment' }];
    const ins = p.insurers[0];
    invoiceEditor({ title: `Check out · ${S.patientName(p)}`, patientId: p.id, locationId: a.locationId, practitionerId: a.practitionerId, appointmentId: a.id, items, insurer: ins ? ins.company : '', insurerPortion: ins ? round2(tx.price * ins.coveragePct / 100) : 0, onDone: (inv) => { S.update('appointments', a.id, { invoiceId: inv.id, status: a.status === 'completed' || a.status === 'no-show' ? a.status : 'completed' }); } });
  }
  function newSaleModal(patientId) {
    const p = patientId && S.patient(patientId);
    invoiceEditor({ title: 'New sale', patientId: patientId || '', locationId: ui.loc || S.state.locations[0].id, practitionerId: '', appointmentId: null, items: [], insurer: p?.insurers[0]?.company || '', insurerPortion: 0 });
  }
  function invoiceEditor(o) {
    const s = S.state.settings; let items = o.items.slice(); let discount = 0; let insurerPortion = o.insurerPortion || 0; let insurer = o.insurer || '';
    const catalogue = [...S.state.treatments.map((t) => ({ id: 't:' + t.id, name: t.name, price: t.price, taxable: false, kind: 'treatment' })), ...S.state.products.map((pr) => ({ id: 'p:' + pr.id, name: pr.name, price: pr.price, taxable: pr.taxable, kind: 'product' }))];
    const totals = () => { const inv = S.makeInvoice({ number: 'draft', patientId: o.patientId, locationId: o.locationId, items, discount, insurer, insurerPortion }); return inv; };
    const body = `
      ${!o.patientId ? `<div class="field"><label>Patient</label>${patientPickerHTML('patientId', '')}</div>` : ''}
      <div class="grid-2"><div class="field"><label>Location</label><select name="locationId" data-inv="loc">${S.state.locations.map((l) => opt(l.id, l.name, o.locationId)).join('')}</select></div><div class="field"><label>Practitioner (for commission / reports)</label><select name="practitionerId" data-inv="pr"><option value="">—</option>${S.state.practitioners.map((x) => opt(x.id, x.name, o.practitionerId)).join('')}</select></div></div>
      <table class="tbl line-items"><thead><tr><th>Item</th><th class="num" style="width:76px">Qty</th><th class="num" style="width:110px">Price</th><th class="num" style="width:100px">Amount</th><th style="width:30px"></th></tr></thead><tbody data-inv="rows"></tbody></table>
      <div class="flex mt wrap"><select data-inv="add" style="max-width:360px"><option value="">+ Add treatment or product…</option><optgroup label="Treatments">${catalogue.filter((c) => c.kind === 'treatment').map((c) => `<option value="${c.id}">${esc(c.name)} · ${fmtMoney(c.price)}</option>`).join('')}</optgroup><optgroup label="Products">${catalogue.filter((c) => c.kind === 'product').map((c) => `<option value="${c.id}">${esc(c.name)} · ${fmtMoney(c.price)}</option>`).join('')}</optgroup></select><button type="button" class="btn sm" data-inv="custom">+ Custom line</button></div>
      <div class="grid-2 mt">
        <div>
          <div class="field"><label>Discount ($)</label><input type="number" min="0" step="0.01" value="0" data-inv="discount"></div>
          <div class="field"><label>Insurer (direct billing)</label><select data-inv="insurer"><option value="">None — patient pays</option>${(S.patient(o.patientId)?.insurers || []).map((i) => opt(i.company, `${i.company} · ${i.coveragePct}%`, insurer)).join('')}${['Alberta Blue Cross', 'Sun Life', 'Manulife', 'Canada Life', 'Green Shield', 'WCB Alberta', 'Desjardins', 'Other'].filter((n) => !(S.patient(o.patientId)?.insurers || []).some((i) => i.company === n)).map((n) => opt(n, n, insurer)).join('')}</select></div>
          <div class="field"><label>Insurer portion ($)</label><input type="number" min="0" step="0.01" value="${insurerPortion}" data-inv="insportion"></div>
        </div>
        <div class="card pad" style="background:var(--surface-2)">
          <div class="flex between"><span>Subtotal</span><strong data-inv="sub"></strong></div>
          <div class="flex between" data-inv="discrow"><span>Discount</span><strong data-inv="disc"></strong></div>
          <div class="flex between"><span>${esc(s.taxName)} ${s.taxRate}% (products)</span><strong data-inv="tax"></strong></div>
          <div class="flex between" style="font-size:16px;margin-top:6px;border-top:1px solid var(--border);padding-top:6px"><span>Total</span><strong data-inv="total"></strong></div>
          <div class="flex between small muted" data-inv="insrow"><span>Insurer pays</span><span data-inv="insamt"></span></div>
          <div class="flex between" style="color:var(--primary)"><span>Patient pays today</span><strong data-inv="due"></strong></div>
        </div>
      </div>
      <div class="field mt"><label>Payment</label><div class="row"><select data-inv="method">${PAY_METHODS.filter((x) => x !== 'Insurance').map((x) => opt(x, x, 'Credit Card')).join('')}</select><input type="number" step="0.01" min="0" data-inv="payamt" placeholder="Amount"><button type="button" class="btn sm" data-inv="payfull">Full balance</button></div><div class="tiny muted mt">Leave the amount blank to save the invoice unpaid (e.g. patient will pay later or insurer pays the full amount).</div></div>`;
    const m = openModal({ title: o.title, body, size: 'wide', foot: `<button class="btn" data-close2>Cancel</button><button class="btn primary" data-submit>Complete sale</button>`, onMount: (m) => {
      const el = m.el; const q = (k) => $(`[data-inv=${k}]`, el);
      wirePatientPicker(el);
      el.addEventListener('patient', (e) => { const pt = e.detail; const sel = q('insurer'); if (pt.insurers[0] && !sel.value) { sel.value = pt.insurers[0].company; } });
      const draw = () => {
        q('rows').innerHTML = items.map((it, i) => `<tr><td><input value="${esc(it.desc)}" data-row="${i}" data-k="desc"></td><td><input type="number" min="0" step="1" value="${it.qty}" data-row="${i}" data-k="qty" class="right"></td><td><input type="number" min="0" step="0.01" value="${it.price}" data-row="${i}" data-k="price" class="right"></td><td class="num">${fmtMoney(it.qty * it.price)}</td><td><button type="button" class="close" data-del="${i}" title="Remove">×</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty small">No items yet — add a treatment or product.</td></tr>';
        const t = totals(); q('sub').textContent = fmtMoney(t.subtotal); q('disc').textContent = '-' + fmtMoney(t.discountAmt); q('discrow').style.display = t.discountAmt ? '' : 'none'; q('tax').textContent = fmtMoney(t.tax); q('total').textContent = fmtMoney(t.total);
        const insAmt = Math.min(insurerPortion, t.total); q('insrow').style.display = insurer ? '' : 'none'; q('insamt').textContent = fmtMoney(insAmt); const due = round2(t.total - (insurer ? insAmt : 0)); q('due').textContent = fmtMoney(due); q('payamt').placeholder = fmtMoney(due); q('payamt').dataset.due = due;
      };
      q('rows').addEventListener('input', (e) => { const r = e.target.dataset.row, k = e.target.dataset.k; if (r == null) return; items[r][k] = k === 'desc' ? e.target.value : Number(e.target.value); const t = totals(); q('sub').textContent = fmtMoney(t.subtotal); q('tax').textContent = fmtMoney(t.tax); q('total').textContent = fmtMoney(t.total); const due = round2(t.total - (insurer ? Math.min(insurerPortion, t.total) : 0)); q('due').textContent = fmtMoney(due); q('payamt').dataset.due = due; e.target.closest('tr').children[3].textContent = fmtMoney(items[r].qty * items[r].price); });
      q('rows').addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) { items.splice(Number(b.dataset.del), 1); draw(); } });
      q('add').addEventListener('change', () => { const c = catalogue.find((x) => x.id === q('add').value); if (c) { items.push({ id: uid(), desc: c.name, qty: 1, price: c.price, taxable: c.taxable, kind: c.kind }); q('add').value = ''; draw(); } });
      q('custom').addEventListener('click', () => { items.push({ id: uid(), desc: 'Custom item', qty: 1, price: 0, taxable: false, kind: 'custom' }); draw(); });
      q('discount').addEventListener('input', () => { discount = Number(q('discount').value) || 0; draw(); });
      q('insurer').addEventListener('change', () => { insurer = q('insurer').value; const pid = o.patientId || $('input[name=patientId]', el)?.value; const pt = pid && S.patient(pid); const rec = pt?.insurers.find((i) => i.company === insurer); if (insurer && rec) { const txTotal = items.filter((i) => i.kind === 'treatment').reduce((s, i) => s + i.qty * i.price, 0); insurerPortion = round2(txTotal * rec.coveragePct / 100); q('insportion').value = insurerPortion; } if (!insurer) { insurerPortion = 0; q('insportion').value = 0; } draw(); });
      q('insportion').addEventListener('input', () => { insurerPortion = Number(q('insportion').value) || 0; draw(); });
      q('payfull').addEventListener('click', () => { q('payamt').value = q('payamt').dataset.due; });
      draw();
      $('[data-close2]', el).onclick = m.close;
      $('[data-submit]', el).onclick = () => {
        const patientId = o.patientId || resolvePicker(el, 'patientId', q('loc').value); if (!patientId) return toast('Choose a patient first.', true);
        if (!items.length) return toast('Add at least one item.', true);
        const inv = S.makeInvoice({ number: S.nextInvoiceNumber(), patientId, appointmentId: o.appointmentId, locationId: q('loc').value, practitionerId: q('pr').value || null, date: new Date().toISOString(), items, discount, insurer, insurerPortion: insurer ? insurerPortion : 0 });
        const amt = Number(q('payamt').value); if (amt > 0) inv.payments.push({ id: uid(), date: new Date().toISOString(), method: q('method').value, amount: round2(amt), note: '' });
        S.state.invoices.push(inv); if (o.onDone) o.onDone(inv); S.log(`Invoice ${inv.number} for ${S.patientName(patientId)} · ${fmtMoney(inv.total)}`); S.save(); m.close(); toast(`Invoice ${inv.number} saved`); invoiceModal(inv.id);
      };
    } });
    return m;
  }

  function receiptHTML(inv) {
    const s = S.state.settings; const p = S.patient(inv.patientId); const loc = S.location(inv.locationId); const pr = S.practitioner(inv.practitionerId);
    return `<div class="receipt">
      <div class="flex between" style="align-items:flex-start"><div><div style="font-size:18px;font-weight:700">${esc(s.clinicName)}</div><div class="small muted">${esc(loc?.name || '')}<br>${esc(loc?.address || '')}<br>${esc(loc?.phone || '')}</div></div><div class="right"><div style="font-size:16px;font-weight:700">${inv.void ? 'VOID · ' : ''}Receipt ${esc(inv.number)}</div><div class="small muted">${fmtDate(inv.date)}</div></div></div>
      <div class="grid-2 mt"><div><div class="tiny muted">BILL TO</div><div class="bold">${esc(S.patientName(p))}</div><div class="small">${esc(p?.address || '')} ${esc(p?.city || '')}<br>${esc(p?.email || '')} · ${esc(p?.phone || '')}</div></div><div><div class="tiny muted">PRACTITIONER</div><div class="bold">${pr ? esc(pr.name) + ', ' + esc(pr.title || '') : '—'}</div>${inv.insurer ? `<div class="tiny muted mt">INSURER</div><div>${esc(inv.insurer)}${p?.insurers.find((i) => i.company === inv.insurer) ? ` · Policy ${esc(p.insurers.find((i) => i.company === inv.insurer).policy)}` : ''}</div>` : ''}</div></div>
      <table class="mt"><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>${inv.items.map((it) => `<tr><td>${esc(it.desc)}</td><td class="num">${it.qty}</td><td class="num">${fmtMoney(it.price)}</td><td class="num">${fmtMoney(it.qty * it.price)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3" class="num">Subtotal</td><td class="num">${fmtMoney(inv.subtotal)}</td></tr>${inv.discountAmt ? `<tr><td colspan="3" class="num">Discount</td><td class="num">-${fmtMoney(inv.discountAmt)}</td></tr>` : ''}<tr><td colspan="3" class="num">${esc(inv.taxName)} ${inv.taxRate}%</td><td class="num">${fmtMoney(inv.tax)}</td></tr><tr><td colspan="3" class="num bold">Total</td><td class="num bold">${fmtMoney(inv.total)}</td></tr>${inv.insurer ? `<tr><td colspan="3" class="num">Billed to ${esc(inv.insurer)}</td><td class="num">${fmtMoney(inv.insurerPortion)}</td></tr>` : ''}${inv.payments.map((pm) => `<tr><td colspan="3" class="num">Paid · ${esc(pm.method)} · ${fmtShortDate(pm.date)}</td><td class="num">-${fmtMoney(pm.amount)}</td></tr>`).join('')}<tr><td colspan="3" class="num bold">Balance due</td><td class="num bold">${fmtMoney(S.balance(inv))}</td></tr></tfoot></table>
      <p class="tiny muted mt">${esc(s.cancellationPolicy)}</p></div>`;
  }
  function invoiceModal(id) {
    const inv = S.get('invoices', id); if (!inv) return;
    const st = S.invoiceStatus(inv); const bal = S.balance(inv);
    const body = `${receiptHTML(inv)}
      ${!inv.void && bal > 0.004 ? `<div class="card pad mt" style="background:var(--surface-2)"><div class="bold mb">Record a payment</div><form data-form="payment" data-id="${inv.id}" class="row"><select name="method">${PAY_METHODS.map((x) => opt(x, x, inv.insurer && bal <= inv.insurerPortion + 0.004 ? 'Insurance' : 'Credit Card')).join('')}</select><input type="number" step="0.01" min="0.01" max="${bal}" name="amount" value="${bal}" required><input name="note" placeholder="Reference / note"><button class="btn primary">Add payment</button></form></div>` : ''}
      ${inv.payments.length ? `<div class="mt small"><strong>Payments</strong><div class="list">${inv.payments.map((pm) => `<div class="list-item"><span class="grow">${fmtShortDate(pm.date)} · ${esc(pm.method)}${pm.note ? ' · ' + esc(pm.note) : ''}</span><span class="bold">${fmtMoney(pm.amount)}</span><button class="btn xs" data-action="remove-payment" data-id="${inv.id}" data-pid="${pm.id}" title="Remove payment">×</button></div>`).join('')}</div></div>` : ''}`;
    openModal({ title: `Invoice ${inv.number} · <span class="badge ${st}">${st}</span>`, body, size: 'wide', foot: `<div class="left">${!inv.void ? `<button class="btn danger" data-action="void-invoice" data-id="${inv.id}">Void</button>` : ''}<a class="btn" href="#/patients/${inv.patientId}/billing" data-action="close-and-go">Patient billing</a></div><a class="btn" href="mailto:${esc(S.patient(inv.patientId)?.email || '')}?subject=${encodeURIComponent('Receipt ' + inv.number)}&body=${encodeURIComponent(`Hi ${S.patient(inv.patientId)?.first},\n\nThank you for your visit. Your receipt ${inv.number} for ${fmtMoney(inv.total)} is attached.\n\n${S.state.settings.clinicName}`)}">✉ Email</a><button class="btn" data-action="print-invoice" data-id="${inv.id}">🖨 Print</button><button class="btn primary" data-close2>Done</button>`, onMount: (m) => { $('[data-close2]', m.el).onclick = m.close; } });
  }

  /* =========================================================
     Charting
     ========================================================= */
  function chartModal({ chartId, apptId }) {
    let c = chartId ? S.get('charts', chartId) : null;
    const a = c ? S.get('appointments', c.appointmentId) : S.get('appointments', apptId);
    if (!c && a?.chartId) c = S.get('charts', a.chartId);
    const p = S.patient(c ? c.patientId : a.patientId); const pr = S.practitioner(c ? c.practitionerId : a.practitionerId); const tx = a && S.treatment(a.treatmentId);
    const prior = S.state.charts.filter((x) => x.patientId === p.id && x.id !== c?.id && x.date < (c?.date || new Date().toISOString())).sort((x, y) => y.date.localeCompare(x.date));
    const defaultTpl = () => { const byDisc = S.state.chartTemplates.filter((t) => t.discipline === pr?.discipline); if (tx?.isAssessment && byDisc.length) return byDisc[0]; return byDisc[0] || S.state.chartTemplates[0]; };
    const tpl = c ? S.state.chartTemplates.find((t) => t.id === c.templateId) || { id: c.templateId, name: c.templateName, sections: Object.keys(c.fields).map((k) => ({ key: k, label: k, placeholder: '' })) } : defaultTpl();
    const locked = !!c?.signed;
    const sectionsHTML = (tpl, fields) => tpl.sections.map((s) => `<div class="chart-section"><div class="lbl">${esc(s.label)}</div>${locked ? `<div class="chart-locked">${esc(fields[s.key] || '—')}</div>` : `<textarea name="f_${esc(s.key)}" placeholder="${esc(s.placeholder || '')}">${esc(fields[s.key] || '')}</textarea>`}</div>`).join('');
    const body = `
      <div class="flex between mb wrap"><div class="flex">${avatar(S.patientName(p), '#475569')}<div><div class="bold"><a href="#/patients/${p.id}/charts" data-action="close-and-go">${esc(S.patientName(p))}</a> · ${age(p.dob)}y</div><div class="small muted">${a ? `${fmtDate(a.start)} · ${esc(txName(a.treatmentId))} · ` : ''}${esc(pr?.name || '')} · ${esc(locName(c?.locationId || a?.locationId))}</div></div></div>
        ${locked ? `<span class="badge completed">Signed ${fmtShortDate(c.signedAt)} ${fmtTime(c.signedAt)}</span>` : c ? '<span class="badge arrived">Draft</span>' : '<span class="badge">New note</span>'}</div>
      ${p.alerts ? `<div class="alert danger">⚠ ${esc(p.alerts)}</div>` : ''}
      <form data-form="chart">
        ${!locked ? `<div class="flex between mb wrap"><div class="flex"><label style="margin:0">Template</label><select name="templateId" data-chart="tpl" style="width:auto">${S.state.chartTemplates.map((t) => opt(t.id, t.name, tpl.id)).join('')}</select></div>${prior.length ? `<button type="button" class="btn sm" data-chart="copy">⎘ Copy forward from ${fmtShortDate(prior[0].date)}</button>` : ''}</div>` : ''}
        <div data-chart="sections">${sectionsHTML(tpl, c?.fields || {})}</div>
        ${locked ? `<div class="field mt"><label>Add addendum (signed notes can't be edited; addenda are appended with a timestamp)</label><textarea name="addendum" placeholder="Addendum…"></textarea></div>` : ''}
        ${c?.addenda?.length ? `<div class="mt small"><strong>Addenda</strong>${c.addenda.map((ad) => `<div class="chart-locked mt" style="margin-top:6px"><span class="tiny muted">${fmtShortDate(ad.at)} ${fmtTime(ad.at)} · ${esc(prName(ad.by))}</span><br>${esc(ad.text)}</div>`).join('')}</div>` : ''}
      </form>
      ${prior.length ? `<details class="mt"><summary class="bold small" style="cursor:pointer">Previous notes (${prior.length})</summary>${prior.slice(0, 5).map((x) => `<div class="card pad mt small"><div class="bold">${fmtShortDate(x.date)} · ${esc(x.templateName)} · ${esc(prName(x.practitionerId))}</div>${Object.entries(x.fields).map(([k, v]) => v ? `<div class="mt" style="margin-top:6px"><span class="muted">${esc(k)}:</span> ${esc(v)}</div>` : '').join('')}</div>`).join('')}</details>` : ''}`;
    openModal({ title: c ? `Chart note · ${fmtShortDate(c.date)}` : 'New chart note', body, size: 'wide', foot: locked ? `<button class="btn" data-action="print-chart" data-id="${c.id}">🖨 Print</button><button class="btn" data-close2>Close</button><button class="btn primary" data-chart="addendum">Save addendum</button>` : `<div class="left">${c ? `<button class="btn danger" data-action="delete-chart" data-id="${c.id}">Delete draft</button>` : ''}</div><button class="btn" data-close2>Close</button><button class="btn" data-chart="save">Save draft</button><button class="btn primary" data-chart="sign">✔ Sign &amp; lock</button>`, onMount: (m) => {
      const form = $('form[data-form=chart]', m.el); const secs = $('[data-chart=sections]', form);
      $('[data-close2]', m.el).onclick = m.close;
      const tplSel = $('[data-chart=tpl]', form); if (tplSel) tplSel.addEventListener('change', () => { const t = S.state.chartTemplates.find((x) => x.id === tplSel.value); secs.innerHTML = sectionsHTML(t, {}); });
      const copy = $('[data-chart=copy]', form); if (copy) copy.addEventListener('click', () => { const last = prior[0]; const t = S.state.chartTemplates.find((x) => x.id === last.templateId); if (t && tplSel) { tplSel.value = t.id; secs.innerHTML = sectionsHTML(t, last.fields); } else { $$('textarea', secs).forEach((ta) => { const k = ta.name.slice(2); if (last.fields[k]) ta.value = last.fields[k]; }); } toast('Copied previous note — edit before signing'); });
      const collect = () => { const t = S.state.chartTemplates.find((x) => x.id === (tplSel ? tplSel.value : tpl.id)) || tpl; const fields = {}; t.sections.forEach((s) => { fields[s.key] = (form.elements['f_' + s.key]?.value || '').trim(); }); return { t, fields }; };
      const persist = (sign) => { const { t, fields } = collect(); if (sign && !Object.values(fields).some((v) => v)) return toast('Write something before signing.', true);
        if (c) { S.update('charts', c.id, { fields, templateId: t.id, templateName: t.name, signed: sign, signedAt: sign ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }); }
        else { c = S.add('charts', { appointmentId: a.id, patientId: p.id, practitionerId: a.practitionerId, locationId: a.locationId, date: a.start, templateId: t.id, templateName: t.name, fields, signed: sign, signedAt: sign ? new Date().toISOString() : null, updatedAt: new Date().toISOString(), addenda: [] }); S.update('appointments', a.id, { chartId: c.id }); }
        S.log(`${sign ? 'Signed' : 'Saved'} chart note for ${S.patientName(p)}`); S.save(); toast(sign ? 'Chart signed and locked' : 'Draft saved'); m.close(); };
      const sv = $('[data-chart=save]', m.el); if (sv) sv.onclick = () => persist(false);
      const sg = $('[data-chart=sign]', m.el); if (sg) sg.onclick = () => persist(true);
      const ad = $('[data-chart=addendum]', m.el); if (ad) ad.onclick = () => { const text = form.elements.addendum.value.trim(); if (!text) return toast('Addendum is empty.', true); c.addenda = c.addenda || []; c.addenda.push({ at: new Date().toISOString(), by: c.practitionerId, text }); S.save(); toast('Addendum added'); m.close(); };
    } });
  }
  function chartPrintHTML(c) { const p = S.patient(c.patientId); return `<div class="receipt"><div style="font-size:18px;font-weight:700">${esc(S.state.settings.clinicName)} · Clinical note</div><div class="small muted">${esc(locName(c.locationId))}</div><div class="mt"><strong>${esc(S.patientName(p))}</strong> · DOB ${esc(p.dob)} · ${esc(p.healthNumber)}<br>Date of service: ${fmtDate(c.date)} · Practitioner: ${esc(prName(c.practitionerId))} · ${esc(c.templateName)}</div>${Object.entries(c.fields).map(([k, v]) => `<div class="mt"><strong>${esc(k)}</strong><div style="white-space:pre-wrap">${esc(v || '—')}</div></div>`).join('')}${(c.addenda || []).map((ad) => `<div class="mt"><strong>Addendum ${fmtShortDate(ad.at)}</strong><div>${esc(ad.text)}</div></div>`).join('')}<p class="small muted mt">${c.signed ? `Electronically signed by ${esc(prName(c.practitionerId))} on ${fmtDate(c.signedAt)} ${fmtTime(c.signedAt)}` : 'DRAFT — not signed'}</p></div>`; }
  function printHTML(html) { $('#print-root').innerHTML = html; setTimeout(() => window.print(), 50); }

  /* =========================================================
     Record editors: patient, practitioner, treatment, product, template, location, waitlist
     ========================================================= */
  function patientForm(id) {
    const p = id ? S.patient(id) : { first: '', last: '', dob: '', sex: '', email: '', phone: '', address: '', city: '', province: 'AB', postal: '', healthNumber: '', homeLocationId: ui.loc || S.state.locations[0].id, emergencyName: '', emergencyPhone: '', insurers: [], notes: '', tags: [], referredBy: '', complaint: '', consentOnFile: false, alerts: '' };
    const ins = [p.insurers[0] || {}, p.insurers[1] || {}];
    const body = `<form data-form="patient" data-id="${id || ''}">
      <div class="grid-3"><div class="field"><label>First name</label><input name="first" value="${esc(p.first)}" required></div><div class="field"><label>Last name</label><input name="last" value="${esc(p.last)}" required></div><div class="field"><label>Date of birth</label><input name="dob" type="date" value="${esc(p.dob)}"></div>
        <div class="field"><label>Sex</label><select name="sex">${['', 'F', 'M', 'X'].map((s) => opt(s, s || '—', p.sex)).join('')}</select></div><div class="field"><label>Phone</label><input name="phone" value="${esc(p.phone)}"></div><div class="field"><label>Email</label><input name="email" type="email" value="${esc(p.email)}"></div></div>
      <div class="grid-4"><div class="field" style="grid-column:span 2"><label>Address</label><input name="address" value="${esc(p.address)}"></div><div class="field"><label>City</label><input name="city" value="${esc(p.city)}"></div><div class="field"><label>Province / Postal</label><div class="flex"><input name="province" value="${esc(p.province)}" style="width:60px"><input name="postal" value="${esc(p.postal)}"></div></div></div>
      <div class="grid-3"><div class="field"><label>Health card #</label><input name="healthNumber" value="${esc(p.healthNumber)}"></div><div class="field"><label>Home clinic</label><select name="homeLocationId">${S.state.locations.map((l) => opt(l.id, l.name, p.homeLocationId)).join('')}</select></div><div class="field"><label>Referred by</label><input name="referredBy" value="${esc(p.referredBy)}" list="ref-src"><datalist id="ref-src">${['Google', 'Word of mouth', 'Physician referral', 'Instagram', 'Facebook', 'Walk-in', 'Returning', 'Insurance / WCB'].map((x) => `<option value="${x}">`).join('')}</datalist></div></div>
      <div class="grid-2"><div class="field"><label>Emergency contact</label><input name="emergencyName" value="${esc(p.emergencyName)}"></div><div class="field"><label>Emergency phone</label><input name="emergencyPhone" value="${esc(p.emergencyPhone)}"></div></div>
      <div class="field"><label>Primary complaint</label><input name="complaint" value="${esc(p.complaint)}"></div>
      <div class="grid-2"><div class="field"><label>Alerts (allergies, precautions — shown in red everywhere)</label><input name="alerts" value="${esc(p.alerts)}"></div><div class="field"><label>Tags (comma separated)</label><input name="tags" value="${esc((p.tags || []).join(', '))}" placeholder="VIP, Athlete, WCB"></div></div>
      <div class="field"><label>Notes</label><textarea name="notes">${esc(p.notes)}</textarea></div>
      <div class="field"><label><input type="checkbox" name="consentOnFile" ${p.consentOnFile ? 'checked' : ''} style="width:auto;margin-right:6px">Consent &amp; intake form on file</label></div>
      <h3 class="mt">Insurance</h3>
      ${ins.map((i, n) => `<div class="grid-4 mt" style="gap:8px"><div class="field"><label>${n === 0 ? 'Primary' : 'Secondary'} insurer</label><input name="ins${n}_company" value="${esc(i.company || '')}" list="ins-list"></div><div class="field"><label>Policy #</label><input name="ins${n}_policy" value="${esc(i.policy || '')}"></div><div class="field"><label>Member ID</label><input name="ins${n}_member" value="${esc(i.member || '')}"></div><div class="field"><label>Coverage % / Annual max</label><div class="flex"><input name="ins${n}_pct" type="number" value="${i.coveragePct ?? 80}" style="width:70px"><input name="ins${n}_max" type="number" value="${i.annualMax ?? ''}" placeholder="$ max"></div></div></div>`).join('')}
      <datalist id="ins-list">${['Alberta Blue Cross', 'Sun Life', 'Manulife', 'Canada Life', 'Green Shield', 'WCB Alberta', 'Desjardins', 'Equitable Life', 'Medavie'].map((x) => `<option value="${x}">`).join('')}</datalist>
    </form>`;
    openModal({ title: id ? 'Edit patient' : 'New patient', body, size: 'wide', foot: `${id ? `<div class="left"><button class="btn danger" data-action="delete-patient" data-id="${id}">Delete patient</button></div>` : ''}<button class="btn" data-close2>Cancel</button><button class="btn primary" data-submit-form="patient">Save patient</button>`, onMount: (m) => { $('[data-close2]', m.el).onclick = m.close; } });
  }
  function practitionerForm(id) {
    const p = id ? S.practitioner(id) : { name: '', title: '', discipline: S.state.disciplines[0], color: COLORS[S.state.practitioners.length % COLORS.length], email: '', phone: '', locationIds: [ui.loc || S.state.locations[0].id], shifts: { 1: [{ start: '09:00', end: '17:00', locationId: ui.loc || S.state.locations[0].id }], 2: [{ start: '09:00', end: '17:00', locationId: ui.loc || S.state.locations[0].id }], 3: [{ start: '09:00', end: '17:00', locationId: ui.loc || S.state.locations[0].id }], 4: [{ start: '09:00', end: '17:00', locationId: ui.loc || S.state.locations[0].id }], 5: [{ start: '09:00', end: '17:00', locationId: ui.loc || S.state.locations[0].id }] }, active: true, online: true, bio: '', treatmentIds: [] };
    const body = `<form data-form="practitioner" data-id="${id || ''}">
      <div class="grid-3"><div class="field"><label>Full name</label><input name="name" value="${esc(p.name)}" required></div><div class="field"><label>Credentials</label><input name="title" value="${esc(p.title)}" placeholder="PT, RMT, DC…"></div><div class="field"><label>Discipline</label><select name="discipline">${S.state.disciplines.map((d) => opt(d, d, p.discipline)).join('')}</select></div>
        <div class="field"><label>Email</label><input name="email" value="${esc(p.email)}"></div><div class="field"><label>Phone</label><input name="phone" value="${esc(p.phone)}"></div><div class="field"><label>Calendar colour</label><input name="color" type="color" value="${p.color}" style="height:38px;padding:2px"></div></div>
      <div class="field"><label>Works at</label><div class="flex wrap">${S.state.locations.map((l) => `<label class="flex" style="margin:0;font-weight:500"><input type="checkbox" name="loc_${l.id}" ${p.locationIds.includes(l.id) ? 'checked' : ''} style="width:auto">${esc(l.name)}</label>`).join('')}</div></div>
      <div class="field"><label>Weekly schedule</label><div class="shift-grid">${[1, 2, 3, 4, 5, 6, 0].map((d) => { const sh = (p.shifts[d] || [])[0]; return `<label class="flex" style="margin:0"><input type="checkbox" name="on_${d}" ${sh ? 'checked' : ''} style="width:auto">${DAYS[d]}</label><div class="flex"><input type="time" name="start_${d}" value="${sh ? sh.start : '09:00'}" style="width:110px"><span class="muted">to</span><input type="time" name="end_${d}" value="${sh ? sh.end : '17:00'}" style="width:110px"><span class="muted">at</span><select name="shloc_${d}" style="width:auto">${S.state.locations.map((l) => opt(l.id, l.name, sh ? sh.locationId : p.locationIds[0])).join('')}</select></div>`; }).join('')}</div></div>
      <div class="field"><label>Bio (shown on online booking)</label><textarea name="bio">${esc(p.bio)}</textarea></div>
      <div class="flex wrap"><label class="flex" style="margin:0"><input type="checkbox" name="online" ${p.online ? 'checked' : ''} style="width:auto">Bookable online</label><label class="flex" style="margin:0"><input type="checkbox" name="active" ${p.active ? 'checked' : ''} style="width:auto">Active</label></div></form>`;
    openModal({ title: id ? 'Edit practitioner' : 'Add practitioner', body, size: 'wide', foot: `<button class="btn" data-close2>Cancel</button><button class="btn primary" data-submit-form="practitioner">Save</button>`, onMount: (m) => { $('[data-close2]', m.el).onclick = m.close; } });
  }
  function treatmentForm(id) {
    const t = id ? S.treatment(id) : { name: '', discipline: S.state.disciplines[0], duration: 30, price: 0, online: true, isAssessment: false };
    openModal({ title: id ? 'Edit treatment' : 'Add treatment', body: `<form data-form="treatment" data-id="${id || ''}"><div class="field"><label>Name</label><input name="name" value="${esc(t.name)}" required></div><div class="grid-3"><div class="field"><label>Discipline</label><select name="discipline">${S.state.disciplines.map((d) => opt(d, d, t.discipline)).join('')}</select></div><div class="field"><label>Duration (min)</label><input name="duration" type="number" min="5" step="5" value="${t.duration}"></div><div class="field"><label>Price ($)</label><input name="price" type="number" min="0" step="0.01" value="${t.price}"></div></div><div class="flex wrap"><label class="flex" style="margin:0"><input type="checkbox" name="isAssessment" ${t.isAssessment ? 'checked' : ''} style="width:auto">Initial assessment (counts for PVA)</label><label class="flex" style="margin:0"><input type="checkbox" name="online" ${t.online ? 'checked' : ''} style="width:auto">Bookable online</label></div></form>`, foot: `${id ? `<div class="left"><button class="btn danger" data-action="delete-record" data-coll="treatments" data-id="${id}">Delete</button></div>` : ''}<button class="btn" data-close2>Cancel</button><button class="btn primary" data-submit-form="treatment">Save</button>`, onMount: (m) => { $('[data-close2]', m.el).onclick = m.close; } });
  }
  function productForm(id) {
    const t = id ? S.get('products', id) : { name: '', price: 0, taxable: true };
    openModal({ title: id ? 'Edit product' : 'Add product', size: 'narrow', body: `<form data-form="product" data-id="${id || ''}"><div class="field"><label>Name</label><input name="name" value="${esc(t.name)}" required></div><div class="field"><label>Price ($)</label><input name="price" type="number" min="0" step="0.01" value="${t.price}"></div><label class="flex" style="margin:0"><input type="checkbox" name="taxable" ${t.taxable ? 'checked' : ''} style="width:auto">Taxable</label></form>`, foot: `${id ? `<div class="left"><button class="btn danger" data-action="delete-record" data-coll="products" data-id="${id}">Delete</button></div>` : ''}<button class="btn" data-close2>Cancel</button><button class="btn primary" data-submit-form="product">Save</button>`, onMount: (m) => { $('[data-close2]', m.el).onclick = m.close; } });
  }
  function templateForm(id) {
    const t = id ? S.get('chartTemplates', id) : { name: '', discipline: '', sections: [{ label: 'Subjective', placeholder: '' }, { label: 'Objective', placeholder: '' }, { label: 'Assessment', placeholder: '' }, { label: 'Plan', placeholder: '' }] };
    openModal({ title: id ? 'Edit chart template' : 'New chart template', body: `<form data-form="template" data-id="${id || ''}"><div class="grid-2"><div class="field"><label>Name</label><input name="name" value="${esc(t.name)}" required></div><div class="field"><label>Discipline (optional)</label><select name="discipline"><option value="">All</option>${S.state.disciplines.map((d) => opt(d, d, t.discipline)).join('')}</select></div></div><div class="field"><label>Sections — one per line as <span class="kbd">Label | hint text</span></label><textarea name="sections" style="min-height:160px">${esc(t.sections.map((s) => s.label + (s.placeholder ? ' | ' + s.placeholder : '')).join('\n'))}</textarea></div></form>`, foot: `${id ? `<div class="left"><button class="btn danger" data-action="delete-record" data-coll="chartTemplates" data-id="${id}">Delete</button></div>` : ''}<button class="btn" data-close2>Cancel</button><button class="btn primary" data-submit-form="template">Save</button>`, onMount: (m) => { $('[data-close2]', m.el).onclick = m.close; } });
  }
  function locationForm(id) {
    const l = id ? S.location(id) : { name: '', address: '', phone: '', color: COLORS[S.state.locations.length % COLORS.length] };
    openModal({ title: id ? 'Edit location' : 'Add location', size: 'narrow', body: `<form data-form="location" data-id="${id || ''}"><div class="field"><label>Name</label><input name="name" value="${esc(l.name)}" required></div><div class="field"><label>Address</label><input name="address" value="${esc(l.address)}"></div><div class="grid-2"><div class="field"><label>Phone</label><input name="phone" value="${esc(l.phone)}"></div><div class="field"><label>Colour</label><input name="color" type="color" value="${l.color}" style="height:38px;padding:2px"></div></div></form>`, foot: `${id && S.state.locations.length > 1 ? `<div class="left"><button class="btn danger" data-action="delete-record" data-coll="locations" data-id="${id}">Delete</button></div>` : ''}<button class="btn" data-close2>Cancel</button><button class="btn primary" data-submit-form="location">Save</button>`, onMount: (m) => { $('[data-close2]', m.el).onclick = m.close; } });
  }
  function waitlistForm(patientId) {
    openModal({ title: 'Add to wait list', body: `<form data-form="waitlist"><div class="field"><label>Patient</label>${patientPickerHTML('patientId', patientId || '')}</div><div class="grid-3"><div class="field"><label>Service</label><select name="treatmentId">${S.state.treatments.map((t) => opt(t.id, t.name)).join('')}</select></div><div class="field"><label>Practitioner</label><select name="practitionerId"><option value="">Any</option>${S.state.practitioners.filter((p) => p.active).map((p) => opt(p.id, p.name)).join('')}</select></div><div class="field"><label>Location</label><select name="locationId">${S.state.locations.map((l) => opt(l.id, l.name, ui.loc)).join('')}</select></div></div><div class="field"><label>Availability notes</label><input name="notes" placeholder="e.g. weekday mornings, ASAP"></div></form>`, foot: `<button class="btn" data-close2>Cancel</button><button class="btn primary" data-submit-form="waitlist">Add</button>`, onMount: (m) => { wirePatientPicker(m.el); $('[data-close2]', m.el).onclick = m.close; } });
  }

  /* form submit handlers */
  const forms = {
    settings(f, d) { const s = S.state.settings; Object.assign(s, { clinicName: d.clinicName, taxName: d.taxName, taxRate: Number(d.taxRate) || 0, invoicePrefix: d.invoicePrefix, openHour: Number(d.openHour), closeHour: Number(d.closeHour), bookingWindowDays: Number(d.bookingWindowDays) || 60, onlineBookingEnabled: !!d.onlineBookingEnabled, cancellationPolicy: d.cancellationPolicy }); S.save(); toast('Settings saved'); },
    patient(f, d) {
      const id = f.dataset.id; const insurers = [0, 1].map((n) => d[`ins${n}_company`] ? { id: uid(), company: d[`ins${n}_company`], policy: d[`ins${n}_policy`], member: d[`ins${n}_member`], coveragePct: Number(d[`ins${n}_pct`]) || 0, annualMax: Number(d[`ins${n}_max`]) || 0 } : null).filter(Boolean);
      const rec = { first: d.first, last: d.last, dob: d.dob, sex: d.sex, email: d.email, phone: d.phone, address: d.address, city: d.city, province: d.province, postal: d.postal, healthNumber: d.healthNumber, homeLocationId: d.homeLocationId, referredBy: d.referredBy, emergencyName: d.emergencyName, emergencyPhone: d.emergencyPhone, complaint: d.complaint, alerts: d.alerts, tags: d.tags.split(',').map((x) => x.trim()).filter(Boolean), notes: d.notes, consentOnFile: !!d.consentOnFile, insurers };
      if (id) { S.update('patients', id, rec); toast('Patient saved'); closeModal(); } else { const p = S.add('patients', { ...rec, createdAt: new Date().toISOString() }); S.log(`New patient ${S.patientName(p)}`); S.save(); closeModal(); toast('Patient created'); go(`#/patients/${p.id}`); }
    },
    practitioner(f, d) {
      const id = f.dataset.id; const shifts = {}; [0, 1, 2, 3, 4, 5, 6].forEach((n) => { if (d[`on_${n}`]) shifts[n] = [{ start: d[`start_${n}`], end: d[`end_${n}`], locationId: d[`shloc_${n}`] }]; });
      const locationIds = S.state.locations.filter((l) => d[`loc_${l.id}`]).map((l) => l.id); Object.values(shifts).flat().forEach((sh) => { if (!locationIds.includes(sh.locationId)) locationIds.push(sh.locationId); });
      const rec = { name: d.name, title: d.title, discipline: d.discipline, email: d.email, phone: d.phone, color: d.color, locationIds, shifts, bio: d.bio, online: !!d.online, active: !!d.active, treatmentIds: S.state.treatments.filter((t) => t.discipline === d.discipline).map((t) => t.id) };
      if (id) S.update('practitioners', id, rec); else S.add('practitioners', rec); toast('Practitioner saved'); closeModal();
    },
    treatment(f, d) { const id = f.dataset.id; const rec = { name: d.name, discipline: d.discipline, duration: Number(d.duration) || 30, price: Number(d.price) || 0, online: !!d.online, isAssessment: !!d.isAssessment }; if (id) S.update('treatments', id, rec); else { const t = S.add('treatments', rec); S.state.practitioners.forEach((p) => { if (p.discipline === t.discipline) p.treatmentIds.push(t.id); }); S.save(); } toast('Treatment saved'); closeModal(); },
    product(f, d) { const id = f.dataset.id; const rec = { name: d.name, price: Number(d.price) || 0, taxable: !!d.taxable }; if (id) S.update('products', id, rec); else S.add('products', rec); toast('Product saved'); closeModal(); },
    template(f, d) { const id = f.dataset.id; const sections = d.sections.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [label, ph] = l.split('|').map((x) => x.trim()); return { key: label, label, placeholder: ph || '' }; }); if (!sections.length) return toast('Add at least one section.', true); const rec = { name: d.name, discipline: d.discipline, sections }; if (id) S.update('chartTemplates', id, rec); else S.add('chartTemplates', rec); toast('Template saved'); closeModal(); },
    location(f, d) { const id = f.dataset.id; const rec = { name: d.name, address: d.address, phone: d.phone, color: d.color }; if (id) S.update('locations', id, rec); else S.add('locations', rec); toast('Location saved'); closeModal(); },
    waitlist(f, d) { const pid = resolvePicker(f, 'patientId', d.locationId); if (!pid) return toast('Choose a patient.', true); S.add('waitlist', { patientId: pid, treatmentId: d.treatmentId, practitionerId: d.practitionerId || null, locationId: d.locationId, notes: d.notes, createdAt: new Date().toISOString() }); toast('Added to wait list'); closeModal(); },
    payment(f, d) { const inv = S.get('invoices', f.dataset.id); const amt = round2(Number(d.amount)); if (!(amt > 0)) return toast('Enter an amount.', true); inv.payments.push({ id: uid(), date: new Date().toISOString(), method: d.method, amount: amt, note: d.note }); S.log(`Payment ${fmtMoney(amt)} (${d.method}) on ${inv.number}`); S.save(); closeModal(); toast('Payment recorded'); invoiceModal(inv.id); },
  };

  /* =========================================================
     Actions (click handlers by data-action)
     ========================================================= */
  const actions = {
    nav(el) { go(el.dataset.to); },
    'close-and-go'(el, e) { e.preventDefault(); closeAllModals(); go(el.getAttribute('href')); },
    'new-appointment'(el) { apptModal(null, { patientId: el.dataset.patient, date: el.dataset.date }); },
    'slot-click'(el) { apptModal(null, { date: el.dataset.date, time: fmtHM(Number(el.dataset.min)), practitionerId: el.dataset.pr, locationId: ui.loc || undefined }); },
    'open-appointment'(el) { apptModal(el.dataset.id); },
    'set-status'(el) { const a = S.get('appointments', el.dataset.id); const st = el.dataset.status; S.update('appointments', a.id, { status: st }); S.log(`${S.patientName(a.patientId)} marked ${STATUS_LABEL[st]}`); closeAllModals(); toast(`Marked ${STATUS_LABEL[st]}`); if (st === 'completed' && !a.invoiceId) checkoutModal(a.id); else apptModal(a.id); },
    async 'delete-appointment'(el) { const a = S.get('appointments', el.dataset.id); if (!(await confirmDialog(`Delete this appointment for ${esc(S.patientName(a.patientId))}? Use “Cancelled” instead if you want to keep a record.`, 'Delete', true))) return; S.remove('appointments', a.id); closeAllModals(); toast('Appointment deleted'); },
    rebook(el) { const a = S.get('appointments', el.dataset.id); closeAllModals(); apptModal(null, { patientId: a.patientId, practitionerId: a.practitionerId, locationId: a.locationId, treatmentId: S.state.treatments.find((t) => t.discipline === S.practitioner(a.practitionerId)?.discipline && !t.isAssessment)?.id || a.treatmentId, date: dateKey(addDays(a.start, 7)), time: fmtHM(minutesOf(a.start)) }); },
    checkout(el) { closeAllModals(); checkoutModal(el.dataset.id); },
    'new-invoice'(el) { newSaleModal(el.dataset.patient); },
    'open-invoice'(el) { closeAllModals(); invoiceModal(el.dataset.id); },
    async 'void-invoice'(el) { if (!(await confirmDialog('Void this invoice? It will be excluded from revenue reports.', 'Void invoice', true))) return; const inv = S.get('invoices', el.dataset.id); inv.void = true; S.log(`Voided ${inv.number}`); S.save(); closeAllModals(); toast('Invoice voided'); },
    async 'remove-payment'(el) { if (!(await confirmDialog('Remove this payment?', 'Remove', true))) return; const inv = S.get('invoices', el.dataset.id); inv.payments = inv.payments.filter((p) => p.id !== el.dataset.pid); S.save(); closeAllModals(); invoiceModal(inv.id); },
    'print-invoice'(el) { printHTML(receiptHTML(S.get('invoices', el.dataset.id))); },
    'print-chart'(el) { printHTML(chartPrintHTML(S.get('charts', el.dataset.id))); },
    'print-report'() { window.print(); },
    'open-chart'(el) { closeAllModals(); chartModal({ chartId: el.dataset.id }); },
    'open-chart-for-appt'(el) { closeAllModals(); chartModal({ apptId: el.dataset.id }); },
    async 'delete-chart'(el) { if (!(await confirmDialog('Delete this draft chart note?', 'Delete', true))) return; const c = S.get('charts', el.dataset.id); const a = S.get('appointments', c.appointmentId); if (a) a.chartId = null; S.remove('charts', c.id); closeAllModals(); toast('Draft deleted'); },
    'new-patient'() { patientForm(null); },
    'edit-patient'(el) { patientForm(el.dataset.id); },
    async 'delete-patient'(el) { const p = S.patient(el.dataset.id); const n = S.state.appointments.filter((a) => a.patientId === p.id).length; if (!(await confirmDialog(`Permanently delete ${esc(S.patientName(p))} and their ${n} appointments, charts and invoices? This cannot be undone.`, 'Delete everything', true))) return; ['appointments', 'charts', 'invoices', 'waitlist'].forEach((c) => { S.state[c] = S.state[c].filter((x) => x.patientId !== p.id); }); S.remove('patients', p.id); closeAllModals(); toast('Patient deleted'); go('#/patients'); },
    'edit-practitioner'(el) { practitionerForm(el.dataset.id); },
    'edit-treatment'(el) { treatmentForm(el.dataset.id); },
    'edit-product'(el) { productForm(el.dataset.id); },
    'edit-template'(el) { templateForm(el.dataset.id); },
    'edit-location'(el) { locationForm(el.dataset.id); },
    async 'delete-record'(el) { if (!(await confirmDialog('Delete this record? Existing appointments and invoices that reference it are kept.', 'Delete', true))) return; S.remove(el.dataset.coll, el.dataset.id); if (el.dataset.coll === 'locations' && ui.loc === el.dataset.id) { ui.loc = ''; localStorage.setItem('clinicflow:loc', ''); fillLocFilter(); } closeAllModals(); toast('Deleted'); },
    'add-waitlist'(el, e) { e.preventDefault(); waitlistForm(el.dataset.patient); },
    'open-waitlist'() { go('#/waitlist'); },
    'remove-waitlist'(el) { S.remove('waitlist', el.dataset.id); toast('Removed from wait list'); },
    'book-from-waitlist'(el) { const w = S.get('waitlist', el.dataset.id); const m = apptModal(null, { patientId: w.patientId, treatmentId: w.treatmentId, practitionerId: w.practitionerId || undefined, locationId: w.locationId }); const orig = $('[data-submit]', m.el).onclick; $('[data-submit]', m.el).onclick = () => { const before = S.state.appointments.length; orig(); if (S.state.appointments.length > before) S.remove('waitlist', w.id); }; },
    'export-data'() { download(`clinicflow-backup-${todayK()}.json`, S.exportJSON(), 'application/json'); },
    'export-patients'() { const rows = [['First', 'Last', 'DOB', 'Phone', 'Email', 'Address', 'City', 'Province', 'Postal', 'Health #', 'Home clinic', 'Insurer', 'Created']]; S.state.patients.forEach((p) => rows.push([p.first, p.last, p.dob, p.phone, p.email, p.address, p.city, p.province, p.postal, p.healthNumber, locName(p.homeLocationId), p.insurers[0]?.company || '', p.createdAt.slice(0, 10)])); download(`patients-${todayK()}.csv`, csv(rows), 'text/csv'); },
    'export-invoices'() { const rows = [['Invoice', 'Date', 'Patient', 'Location', 'Practitioner', 'Items', 'Subtotal', 'Tax', 'Total', 'Insurer', 'Insurer portion', 'Paid', 'Balance', 'Status']]; S.state.invoices.filter((i) => inLoc(i.locationId)).forEach((i) => rows.push([i.number, i.date.slice(0, 10), S.patientName(i.patientId), locName(i.locationId), prName(i.practitionerId), i.items.map((x) => x.desc).join('; '), i.subtotal, i.tax, i.total, i.insurer, i.insurerPortion, S.paid(i), S.balance(i), S.invoiceStatus(i)])); download(`invoices-${todayK()}.csv`, csv(rows), 'text/csv'); },
    async 'reset-demo'() { if (!(await confirmDialog('Replace ALL current data with fresh demo data? Download a backup first if you need it.', 'Reset to demo', true))) return; S.reset(); toast('Demo data restored'); go('#/dashboard'); },
    async 'start-blank'() { if (!(await confirmDialog('Erase all patients, appointments, charts and invoices? Locations, staff and treatments are kept. Download a backup first if you need it.', 'Erase everything', true))) return; S.blank(); toast('Fresh start — add your first patient'); go('#/dashboard'); },
  };
  function csv(rows) { return rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); }
  function download(name, text, type) { const blob = new Blob([text], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]'); if (el) { const fn = actions[el.dataset.action]; if (fn) { if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault(); fn(el, e); } return; }
    const sub = e.target.closest('[data-submit-form]'); if (sub) { const form = $(`form[data-form="${sub.dataset.submitForm}"]`, sub.closest('.modal')); if (form) { if (!form.reportValidity()) return; forms[sub.dataset.submitForm](form, formData(form)); } }
  });
  document.addEventListener('submit', (e) => { const form = e.target.closest('form[data-form]'); if (!form) return; e.preventDefault(); const fn = forms[form.dataset.form]; if (fn) fn(form, formData(form)); });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]'); if (!el) return; const v = el.value;
    const setQ = (k, val) => { const q = { ...ui.query, [k]: val }; go(`#/${ui.route}?` + Object.entries(q).filter(([, x]) => x).map(([a, b]) => `${a}=${encodeURIComponent(b)}`).join('&')); };
    ({ 'sched-date': () => setQ('date', v), 'sched-pr': () => setQ('pr', v), 'billing-from': () => setQ('from', v), 'billing-to': () => setQ('to', v), 'rep-from': () => setQ('from', v), 'rep-to': () => setQ('to', v),
      'import-data': () => { const file = el.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => { try { S.importJSON(r.result); toast('Backup restored'); go('#/dashboard'); } catch (err) { toast('Could not restore: ' + err.message, true); } }; r.readAsText(file); } })[el.dataset.change]?.();
  });
  let searchTimer; document.addEventListener('input', (e) => { const el = e.target.closest('[data-input=patient-search]'); if (!el) return; clearTimeout(searchTimer); searchTimer = setTimeout(() => { const q = { ...ui.query, q: el.value }; location.hash = '#/patients?' + Object.entries(q).filter(([, x]) => x).map(([a, b]) => `${a}=${encodeURIComponent(b)}`).join('&'); setTimeout(() => { const i = $('[data-input=patient-search]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 250); });

  /* topbar: location filter, global search, mobile menu */
  function fillLocFilter() { const sel = $('#loc-filter'); sel.innerHTML = `<option value="">All locations</option>` + S.state.locations.map((l) => opt(l.id, l.name, ui.loc)).join(''); }
  $('#loc-filter').addEventListener('change', (e) => { ui.loc = e.target.value; localStorage.setItem('clinicflow:loc', ui.loc); render(); });
  S.subscribe(fillLocFilter);
  const gs = $('#global-search'), gsr = $('#search-results');
  gs.addEventListener('input', () => { const q = gs.value.toLowerCase().trim(); if (q.length < 2) { gsr.classList.add('hidden'); return; } const hits = S.state.patients.filter((p) => `${p.first} ${p.last} ${p.phone} ${p.email}`.toLowerCase().includes(q)).slice(0, 10); gsr.innerHTML = hits.map((p) => `<a href="#/patients/${p.id}"><strong>${esc(S.patientName(p))}</strong> <span class="muted small">· ${age(p.dob)}y · ${esc(p.phone)} · ${esc(locName(p.homeLocationId))}</span></a>`).join('') || '<div class="empty small">No patients found</div>'; gsr.classList.remove('hidden'); });
  gs.addEventListener('blur', () => setTimeout(() => gsr.classList.add('hidden'), 200)); gs.addEventListener('keydown', (e) => { if (e.key === 'Enter') { go('#/patients?q=' + encodeURIComponent(gs.value)); gsr.classList.add('hidden'); gs.blur(); } });
  $('#menu-btn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); gs.focus(); } });

  fillLocFilter();
  render();
  setInterval(() => { if (ui.route === 'schedule' || ui.route === 'dashboard') { if (!modalStack.length) render(); } }, 60000);
})();
