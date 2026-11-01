import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pageCtx, one, type SP } from '@/lib/page';
import { can } from '@/lib/auth';
import { report, getPractitioners } from '@/lib/queries';
import { addDaysKey, fmtKeyShort, money, todayKey, parseKey } from '@/lib/util';
import { Stat, HBars, Avatar } from '@/components/ui';
import { DateRange } from '@/components/DateRange';
export const metadata = { title: 'Reports' };
export default async function Reports({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const { s, loc, run, tz, locations } = await pageCtx(); if (!can(s, 'reports')) redirect('/app');
  const preset = one(sp.range) || '30'; const tk = todayKey(tz); let from = one(sp.from); const to = one(sp.to) || tk;
  if (!from) from = preset === 'mtd' ? tk.slice(0, 8) + '01' : preset === 'ytd' ? tk.slice(0, 4) + '-01-01' : addDaysKey(tk, -(Number(preset) || 30) + 1);
  const days = Math.max(1, Math.round((Date.UTC(parseKey(to).y, parseKey(to).m - 1, parseKey(to).d) - Date.UTC(parseKey(from).y, parseKey(from).m - 1, parseKey(from).d)) / 86400000) + 1);
  const { r, prev, prs } = await run(async (tx) => ({ r: await report(tx, from, to, tz, loc), prev: await report(tx, addDaysKey(from, -days), addDaysKey(from, -1), tz, loc), prs: await getPractitioners(tx, true) }));
  const delta = (a: number, b: number) => { if (!b) return <span className="muted">—</span>; const d = ((a - b) / b) * 100; return <><span style={{ color: d >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(0)}%</span> <span className="muted">vs prior {days}d</span></>; };
  const series: { k: string; v: number }[] = []; for (let i = 0; i < Math.min(days, 92); i++) { const k = addDaysKey(from, i); series.push({ k, v: r.revenueByDay[k] || 0 }); } const maxV = Math.max(1, ...series.map((x) => x.v));
  const prRows = prs.filter((p) => r.visitsByPractitioner[p.id] || r.revenueByPractitioner[p.id]).map((p) => { const v = r.visitsByPractitioner[p.id] || 0, a = r.assessmentsByPractitioner[p.id] || 0, rev = r.revenueByPractitioner[p.id] || 0; return { p, v, a, rev, pva: a ? Math.round((v / a) * 100) / 100 : 0, perVisit: v ? Math.round(rev / v) : 0 }; }).sort((a, b) => b.rev - a.rev);
  const locName = (id: string) => locations.find((l) => l.id === id)?.name || '—';
  return <>
    <div className="page-head"><div><h1>Reports</h1><div className="muted">{fmtKeyShort(from)} – {fmtKeyShort(to)} · {loc ? locName(loc) : 'All locations'}</div></div>
      <div className="actions"><div className="btn-group">{[['7', '7d'], ['30', '30d'], ['90', '90d'], ['mtd', 'Month to date'], ['ytd', 'Year to date']].map(([k, l]) => <Link key={k} className={`btn ${preset === k && !one(sp.from) ? 'active' : ''}`} href={`/app/reports?range=${k}`}>{l}</Link>)}</div><DateRange from={from} to={to} base="/app/reports" /></div></div>
    <div className="stats">
      <Stat accent label="Revenue billed" value={money(r.revenue)} sub={delta(r.revenue, prev.revenue)} /><Stat label="Collected" value={money(r.collected)} sub={`${money(r.outstanding)} outstanding`} /><Stat label="Visits" value={r.visits} sub={delta(r.visits, prev.visits)} />
      <Stat label="PVA" value={r.pva} sub={`${r.visits} visits ÷ ${r.assessments} assessments`} /><Stat label="New patients" value={r.newPatients} sub={delta(r.newPatients, prev.newPatients)} /><Stat label="Avg. invoice" value={money(r.avgTicket)} sub={`${r.uniquePatients} unique patients`} />
      <Stat label="No-show rate" value={`${r.noShowRate}%`} sub={`${r.noShows} no-shows · ${r.cancelRate}% cancelled`} /><Stat label="Rebooking rate" value={`${r.rebookRate}%`} sub="visits with a next appointment within 45 days" /></div>
    <div className="card mb"><div className="card-head"><h2>Daily revenue</h2><span className="muted small">{money(Math.round(r.revenue / days))} / day average</span></div><div className="card-body"><div className="spark">{series.map((x) => <i key={x.k} style={{ height: `${(x.v / maxV) * 100}%` }} data-tip={`${fmtKeyShort(x.k)}: ${money(x.v)}`} />)}</div></div></div>
    <div className="grid-2">
      <div className="card"><div className="card-head"><h2>Revenue by location</h2></div><div className="card-body"><HBars data={r.revenueByLocation} labels={locName} money colors={(k) => locations.find((l) => l.id === k)?.color} /></div></div>
      <div className="card"><div className="card-head"><h2>Visits by discipline</h2></div><div className="card-body"><HBars data={r.visitsByDiscipline} labels={(k) => k} /></div></div>
      <div className="card"><div className="card-head"><h2>Payments by method</h2></div><div className="card-body"><HBars data={r.paymentsByMethod} labels={(k) => k} money /></div></div>
      <div className="card"><div className="card-head"><h2>New patient sources</h2></div><div className="card-body"><HBars data={r.referralSources} labels={(k) => k} /></div></div></div>
    <div className="card mt"><div className="card-head"><h2>Practitioner performance</h2></div><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Practitioner</th><th>Discipline</th><th className="num">Visits</th><th className="num">Assessments</th><th className="num">PVA</th><th className="num">Revenue</th><th className="num">Per visit</th></tr></thead><tbody>
      {prRows.map((x) => <tr key={x.p.id}><td className="bold"><div className="flex"><Avatar name={x.p.name} color={x.p.color} />{x.p.name}</div></td><td>{x.p.discipline}</td><td className="num">{x.v}</td><td className="num">{x.a}</td><td className="num">{x.pva || '—'}</td><td className="num">{money(x.rev)}</td><td className="num">{money(x.perVisit)}</td></tr>)}{!prRows.length ? <tr><td colSpan={7} className="empty">No data in this period.</td></tr> : null}</tbody></table></div></div>
  </>;
}
