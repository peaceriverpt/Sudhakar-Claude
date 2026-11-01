import Link from 'next/link';
import { pageCtx, one, type SP } from '@/lib/page';
import { appointmentsOnDay, report, listInvoices } from '@/lib/queries';
import { addDaysKey, fmtKey, fmtTime, money, todayKey, DAYS, weekdayOfKey, localToUtc } from '@/lib/util';
import { Avatar, Stat, StatusBadge, Empty, Alert } from '@/components/ui';
import Dialogs from '@/components/dialogs/Dialogs';

export const metadata = { title: 'Dashboard' };
export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const { s, loc, run, tz } = await pageCtx(); const tk = todayKey(tz);
  const data = await run(async (tx) => {
    const appts = (await appointmentsOnDay(tx, tk, tz, { locationId: loc })).filter((a) => a.status !== 'cancelled');
    const today = await report(tx, tk, tk, tz, loc); const week = await report(tx, addDaysKey(tk, -6), tk, tz, loc);
    const owing = await listInvoices(tx, { owing: true, locationId: loc, limit: 2000 });
    const unsigned = await tx`select count(*)::int as n from charts where not signed ${loc ? tx`and location_id = ${loc}` : tx``}`;
    const uncharted = await tx`select count(*)::int as n from appointments a where a.status = 'completed' and a.starts_at > now() - interval '14 days' and not exists (select 1 from charts c where c.appointment_id = a.id) ${loc ? tx`and a.location_id = ${loc}` : tx``}`;
    const wait = await tx`select count(*)::int as n from waitlist ${loc ? tx`where location_id = ${loc}` : tx``}`;
    const next7: { k: string; n: number }[] = [];
    for (let i = 0; i < 7; i++) { const k = addDaysKey(tk, i); const r = await tx`select count(*)::int as n from appointments where status <> 'cancelled' and starts_at >= ${localToUtc(k, 0, tz)} and starts_at < ${localToUtc(addDaysKey(k, 1), 0, tz)} ${loc ? tx`and location_id = ${loc}` : tx``}`; next7.push({ k, n: r[0].n as number }); }
    const activity = await tx`select actor, action, entity, at from audit_log order by at desc limit 8`;
    return { appts, today, week, owing, unsigned: unsigned[0].n as number, uncharted: uncharted[0].n as number, wait: wait[0].n as number, next7, activity };
  });
  const owingTotal = data.owing.reduce((sum, i) => sum + i.balance_cents, 0); const waiting = data.appts.filter((a) => a.status === 'arrived').length; const remaining = data.appts.filter((a) => new Date(a.ends_at) > new Date()).length; const maxN = Math.max(1, ...data.next7.map((x) => x.n));
  return <>
    {one(sp.welcome) ? <Alert kind="ok">Welcome! Your clinic is set up. Next steps: add your practitioners and services under <Link href="/app/staff">Staff &amp; Services</Link>, then book your first appointment.</Alert> : null}
    <div className="page-head"><div><h1>Dashboard</h1><div className="muted">{fmtKey(tk)} · {loc ? data.appts[0]?.location_name || 'Selected location' : 'All locations'}</div></div><div className="actions"><Link className="btn" href={`/app/schedule?date=${tk}`}>Open today&apos;s schedule</Link><Link className="btn primary" href="/app/schedule?new=1">+ Book appointment</Link></div></div>
    <div className="stats">
      <Stat accent label="Today's visits" value={data.appts.length} sub={`${data.today.visits} done · ${waiting} in waiting room`} />
      <Stat label="Today's billings" value={money(data.today.revenue)} sub={`${money(data.today.collected)} collected`} />
      <Stat label="Last 7 days" value={money(data.week.revenue)} sub={`${data.week.visits} visits · PVA ${data.week.pva}`} />
      <Stat label="Outstanding A/R" value={money(owingTotal)} sub={`${data.owing.length} open invoices`} />
      <Stat label="No-show rate (7d)" value={`${data.week.noShowRate}%`} sub={`${data.week.noShows} no-shows`} />
      <Stat label="Charts to finish" value={data.unsigned + data.uncharted} sub={`${data.unsigned} unsigned · ${data.uncharted} not started`} />
    </div>
    <div className="grid-2">
      <div className="card"><div className="card-head"><h2>Today&apos;s appointments</h2><span className="muted small">{remaining} remaining</span></div><div className="card-body" style={{ padding: '0 16px' }}>
        {data.appts.length ? <div className="list">{data.appts.map((a) => <Link key={a.id} href={`?appt=${a.id}`} className="list-item click" style={{ color: 'inherit', textDecoration: 'none' }}><div className="nowrap" style={{ width: 72 }}>{fmtTime(a.starts_at, tz)}</div><Avatar name={a.practitioner_name} color={a.practitioner_color} /><div className="grow" style={{ minWidth: 0 }}><div className="bold">{a.patient_name}</div><div className="small muted">{a.treatment_name} · {a.practitioner_name} · {a.location_name}</div></div><StatusBadge status={a.status} /></Link>)}</div> : <Empty>No appointments today.</Empty>}</div></div>
      <div>
        <div className="card mb"><div className="card-head"><h2>Next 7 days</h2></div><div className="card-body"><div className="spark" style={{ height: 90 }}>{data.next7.map((x) => <Link key={x.k} href={`/app/schedule?date=${x.k}`} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', height: '100%' }}><i style={{ height: `${(x.n / maxN) * 100}%`, width: '100%' }} data-tip={`${x.n} visits`} /></Link>)}</div><div className="flex between tiny muted" style={{ marginTop: 4 }}>{data.next7.map((x) => <span key={x.k} style={{ flex: 1, textAlign: 'center' }}>{DAYS[weekdayOfKey(x.k)]}<br />{x.n}</span>)}</div></div></div>
        <div className="card mb"><div className="card-head"><h2>Needs attention</h2></div><div className="card-body" style={{ padding: '4px 16px' }}><div className="list">
          <Link href="/app/billing?status=owing" className="list-item click" style={{ color: 'inherit' }}><span className="grow">Invoices with a balance owing</span><span className="badge unpaid">{data.owing.length}</span></Link>
          <Link href="/app/patients?filter=unsigned" className="list-item click" style={{ color: 'inherit' }}><span className="grow">Unsigned chart notes</span><span className="badge arrived">{data.unsigned}</span></Link>
          <Link href="/app/waitlist" className="list-item click" style={{ color: 'inherit' }}><span className="grow">Patients on the wait list</span><span className="badge">{data.wait}</span></Link>
          <Link href="/app/patients?filter=noshow" className="list-item click" style={{ color: 'inherit' }}><span className="grow">No-shows in the last 7 days to follow up</span><span className="badge no-show">{data.week.noShows}</span></Link></div></div></div>
        <div className="card"><div className="card-head"><h2>Recent activity</h2><Link className="small" href="/app/settings/audit">Audit log</Link></div><div className="card-body" style={{ padding: '4px 16px' }}>{data.activity.length ? <div className="list">{data.activity.map((a, i) => <div className="list-item small" key={i}><span className="muted nowrap">{fmtTime(a.at, tz)}</span><span>{a.action.replace('.', ' ')} · {a.actor.split(' <')[0]}</span></div>)}</div> : <Empty>Actions will show up here.</Empty>}</div></div>
      </div>
    </div>
    <Dialogs sp={sp} s={s} />
  </>;
}
