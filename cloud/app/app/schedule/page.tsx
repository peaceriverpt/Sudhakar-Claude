import Link from 'next/link';
import { pageCtx, one, type SP } from '@/lib/page';
import { appointmentsBetween, getPractitioners, type Appt, type Practitioner } from '@/lib/queries';
import { addDaysKey, fmtKey, fmtKeyShort, fmtTime, localToUtc, startOfWeekKey, todayKey, weekdayOfKey, zoned, DAYS, MONTHS, parseKey, STATUS_LABEL } from '@/lib/util';
import { Avatar, StatusBadge, InvBadge } from '@/components/ui';
import Dialogs from '@/components/dialogs/Dialogs';
import { ScheduleDatePicker } from '@/components/ScheduleControls';

export const metadata = { title: 'Schedule' };
const SLOT = 22, STEP = 15;
export default async function Schedule({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const { s, loc, run, tz } = await pageCtx();
  const dk = one(sp.date) || todayKey(tz); const view = one(sp.view) || 'day'; const prFilter = one(sp.pr) || '';
  const q = (over: Record<string, string>) => { const o: Record<string, string> = { date: dk, view, pr: prFilter, ...over }; return '/app/schedule?' + Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'); };
  const days = view === 'week' ? [0, 1, 2, 3, 4, 5, 6].map((i) => addDaysKey(startOfWeekKey(dk), i)) : [dk];
  const { prs, appts } = await run(async (tx) => {
    const all = await getPractitioners(tx); const prs = all.filter((p) => (!loc || p.locationIds.includes(loc)) && (!prFilter || p.id === prFilter));
    const appts = await appointmentsBetween(tx, localToUtc(days[0], 0, tz), localToUtc(addDaysKey(days[days.length - 1], 1), 0, tz), { locationId: loc, practitionerId: prFilter || null });
    return { prs, appts };
  });
  const allPrs = await run(async (tx) => (await getPractitioners(tx)).filter((p) => !loc || p.locationIds.includes(loc)));
  const open = s.settings.openHour * 60, close = s.settings.closeHour * 60, nSlots = (close - open) / STEP;
  const nowZ = zoned(new Date(), tz);

  const toolbar = <>
    <div className="page-head"><h1>Schedule</h1><div className="actions"><Link className="btn" href="/app/waitlist">Wait list</Link><Link className="btn primary" href={q({ new: '1', date2: dk })}>+ Book</Link></div></div>
    <div className="sched-toolbar">
      <div className="btn-group"><Link className="btn" href={q({ date: addDaysKey(dk, view === 'week' ? -7 : -1) })}>‹</Link><Link className="btn" href={q({ date: todayKey(tz) })}>Today</Link><Link className="btn" href={q({ date: addDaysKey(dk, view === 'week' ? 7 : 1) })}>›</Link></div>
      <ScheduleDatePicker date={dk} view={view} pr={prFilter} practitioners={allPrs.map((p) => ({ id: p.id, name: p.name }))} />
      <strong style={{ fontSize: 15 }}>{view === 'week' ? `Week of ${fmtKeyShort(startOfWeekKey(dk))}` : fmtKey(dk)}</strong><span className="grow" />
      <div className="btn-group">{['day', 'week', 'list'].map((v) => <Link key={v} className={`btn ${view === v ? 'active' : ''}`} href={q({ view: v })}>{v[0].toUpperCase() + v.slice(1)}</Link>)}</div>
    </div></>;

  if (view === 'list') return <>{toolbar}<div className="card"><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Time</th><th>Patient</th><th>Service</th><th>Practitioner</th><th>Location</th><th>Status</th><th>Invoice</th></tr></thead><tbody>
    {appts.length ? appts.map((a) => <tr key={a.id}><td className="nowrap"><Link href={q({ appt: a.id })}>{fmtTime(a.starts_at, tz)}–{fmtTime(a.ends_at, tz)}</Link></td><td className="bold">{a.patient_name}</td><td>{a.treatment_name}</td><td>{a.practitioner_name}</td><td>{a.location_name}</td><td><StatusBadge status={a.status} /></td><td>{a.invoice_number ? <Link href={`/app/invoices/${a.invoice_id}`}><InvBadge status={(a.invoice_paid ?? 0) >= (a.invoice_total ?? 0) ? 'paid' : (a.invoice_paid ?? 0) > 0 ? 'partial' : 'unpaid'} /></Link> : '—'}</td></tr>) : <tr><td colSpan={7} className="empty">No appointments.</td></tr>}</tbody></table></div></div><Dialogs sp={sp} s={s} /></>;

  type Col = { day: string; prIds: string[]; pr?: Practitioner; label: string; sub: string };
  let columns: Col[] = [];
  if (view === 'week') columns = days.map((d) => ({ day: d, prIds: prs.map((p) => p.id), label: `${DAYS[weekdayOfKey(d)]} ${parseKey(d).d}`, sub: MONTHS[parseKey(d).m - 1] }));
  else { let working = prs.filter((p) => p.shifts.some((sh) => sh.weekday === weekdayOfKey(dk) && (!loc || sh.location_id === loc)) || appts.some((a) => a.practitioner_id === p.id)); if (!working.length) working = prs; columns = working.map((p) => ({ day: dk, prIds: [p.id], pr: p, label: p.name, sub: p.discipline })); }
  const times: React.ReactNode[] = []; for (let m = open; m < close; m += 60) { const h = m / 60; times.push(<div className="t" key={m}>{h % 12 || 12}{h >= 12 ? 'p' : 'a'}</div>); }

  return <>{toolbar}
    {columns.length ? <div className="sched" id="sched"><div className="times"><div className="hdr" /> {times}</div>
      <div className="cols" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(${view === 'week' ? 150 : 180}px, 1fr))` }}>
        {columns.map((c, ci) => {
          const isToday = c.day === todayKey(tz); const wd = weekdayOfKey(c.day);
          const mask = new Array(nSlots).fill(false); c.prIds.forEach((pid) => prs.find((p) => p.id === pid)?.shifts.filter((sh) => sh.weekday === wd && (!loc || sh.location_id === loc)).forEach((sh) => { for (let m = sh.start_min; m < sh.end_min; m += STEP) { const i = (m - open) / STEP; if (i >= 0 && i < nSlots) mask[i] = true; } }));
          const colAppts = appts.filter((a) => zoned(a.starts_at, tz).dateKey === c.day && c.prIds.includes(a.practitioner_id));
          const lanes: string[] = []; const laneOf = new Map<string, number>(); colAppts.forEach((a) => { let lane = 0; while (lanes[lane] && lanes[lane] > new Date(a.starts_at).toISOString()) lane++; lanes[lane] = new Date(a.ends_at).toISOString(); laneOf.set(a.id, lane); }); const nLanes = Math.max(1, lanes.length);
          return <div className="col" key={ci}><div className={`hdr ${isToday ? 'today' : ''}`}>{c.pr ? <Avatar name={c.pr.name} color={c.pr.color} /> : null}<div style={{ minWidth: 0 }}><div className="name">{c.label}</div><div className="sub">{c.sub}{c.pr ? ` · ${colAppts.filter((a) => a.status !== 'cancelled').length} appts` : ''}</div></div></div>
            <div className="body">
              {Array.from({ length: nSlots }, (_, i) => { const m = open + i * STEP; const shiftLoc = c.pr?.shifts.find((sh) => sh.weekday === wd && sh.start_min <= m && m < sh.end_min)?.location_id; return <div key={i} className={`slot ${mask[i] ? 'open' : ''} ${m % 60 === 45 ? 'hour' : ''}`} title={`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`}><Link href={q({ new: '1', date2: c.day, min: String(m), pr: c.pr?.id || prFilter, loc: shiftLoc || loc || '' })} aria-label="Book here" /></div>; })}
              {colAppts.map((a: Appt) => { const st = zoned(a.starts_at, tz).minutes, en = zoned(a.ends_at, tz).minutes; const top = ((st - open) / STEP) * SLOT; const height = Math.max(20, ((en - st) / STEP) * SLOT - 2); const w = 100 / nLanes; const left = (laneOf.get(a.id) || 0) * w;
                return <Link key={a.id} href={q({ appt: a.id })} className={`appt ${a.status.replace('_', '-')}`} style={{ top, height, borderLeftColor: a.practitioner_color, left: `calc(${left}% + 3px)`, width: `calc(${w}% - 6px)`, color: 'inherit', textDecoration: 'none' }} title={`${a.patient_name} · ${a.treatment_name}`}>
                  <div className="nm">{a.patient_name}{a.source === 'online' ? ' 🌐' : ''}</div>{height > 30 ? <div className="tx">{view === 'week' ? a.practitioner_name.split(' ')[0] + ' · ' : ''}{a.treatment_name}</div> : null}{height > 48 ? <div className="st" style={{ color: a.practitioner_color }}>{fmtTime(a.starts_at, tz)} · {STATUS_LABEL[a.status]}</div> : null}</Link>; })}
              {isToday && nowZ.minutes >= open && nowZ.minutes <= close ? <div className="nowline" style={{ top: ((nowZ.minutes - open) / STEP) * SLOT }} /> : null}
            </div></div>;
        })}
      </div></div> : <div className="card empty">No practitioners work at this location yet. Add staff under Staff &amp; Services.</div>}
    <div className="legend"><span style={{ ['--c' as string]: '#eff6ff' }}>Booked</span><span style={{ ['--c' as string]: '#fffbeb' }}>Arrived</span><span style={{ ['--c' as string]: '#f5f3ff' }}>In progress</span><span style={{ ['--c' as string]: '#f0fdf4' }}>Completed</span><span style={{ ['--c' as string]: '#fef2f2' }}>No show</span><span style={{ ['--c' as string]: '#f1f5f9' }}>Cancelled / off shift</span></div>
    <Dialogs sp={sp} s={s} />
  </>;
}
