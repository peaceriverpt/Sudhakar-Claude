import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pageCtx, one, type SP } from '@/lib/page';
import { can } from '@/lib/auth';
import { listInvoices } from '@/lib/queries';
import { addDaysKey, fmtShortDate, localToUtc, money, todayKey } from '@/lib/util';
import { InvBadge, Stat } from '@/components/ui';
import { DateRange } from '@/components/DateRange';
import Dialogs from '@/components/dialogs/Dialogs';
export const metadata = { title: 'Billing' };
export default async function Billing({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const { s, loc, run, tz } = await pageCtx(); if (!can(s, 'billing')) redirect('/app');
  const status = one(sp.status); const from = one(sp.from) || addDaysKey(todayKey(tz), -30), to = one(sp.to) || todayKey(tz);
  const invs = await run((tx) => status === 'owing' ? listInvoices(tx, { owing: true, locationId: loc, limit: 1000 }) : listInvoices(tx, { from: localToUtc(from, 0, tz), to: localToUtc(addDaysKey(to, 1), 0, tz), locationId: loc, status: status || 'all', limit: 1000 }));
  const live = invs.filter((i) => !i.voided); const total = live.reduce((a, i) => a + i.total_cents, 0), collected = invs.reduce((a, i) => a + i.paid_cents, 0), owing = live.reduce((a, i) => a + Math.max(0, i.balance_cents), 0), insOwing = live.filter((i) => i.balance_cents > 0).reduce((a, i) => a + Math.min(i.balance_cents, i.insurer_portion_cents), 0);
  const q = (o: Record<string, string>) => '/app/billing?' + Object.entries({ status, from, to, ...o }).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
  return <>
    <div className="page-head"><h1>Billing</h1><div className="actions"><a className="btn" href={`/app/billing/export?from=${from}&to=${to}`}>Export CSV</a><Link className="btn primary" href="?sale=1">+ New sale</Link></div></div>
    <div className="sched-toolbar"><div className="btn-group">{[['', 'All'], ['owing', 'Owing (all time)'], ['partial', 'Partial'], ['paid', 'Paid'], ['void', 'Void']].map(([k, l]) => <Link key={k} className={`btn ${status === k ? 'active' : ''}`} href={q({ status: k })}>{l}</Link>)}</div>{status !== 'owing' ? <DateRange from={from} to={to} base="/app/billing" extra={{ status }} /> : null}</div>
    <div className="stats"><Stat label="Billed" value={money(total)} /><Stat label="Collected" value={money(collected)} /><Stat accent danger={owing > 0} label="Balance owing" value={money(owing)} sub={`${money(insOwing)} expected from insurers`} /><Stat label="Invoices" value={invs.length} /></div>
    <div className="card"><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Invoice</th><th>Date</th><th>Patient</th><th>Items</th><th>Practitioner</th><th>Location</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Owing</th><th>Status</th></tr></thead><tbody>
      {invs.map((i) => <tr key={i.id}><td className="bold nowrap"><Link href={`/app/invoices/${i.id}`}>{i.number}</Link></td><td className="nowrap">{fmtShortDate(i.issued_at, tz)}</td><td><Link href={`/app/patients/${i.patient_id}`}>{i.patient_name}</Link></td><td className="small">{(i.items as { desc: string }[]).map((x) => x.desc).join(', ')}{i.insurer ? <div className="tiny muted">Insurer: {i.insurer} {money(i.insurer_portion_cents)}</div> : null}</td><td>{i.practitioner_name || '—'}</td><td>{i.location_name}</td><td className="num">{money(i.total_cents)}</td><td className="num">{money(i.paid_cents)}</td><td className={`num ${i.balance_cents > 0 ? 'bold' : ''}`}>{money(Math.max(0, i.balance_cents))}</td><td><InvBadge status={i.status} /></td></tr>)}
      {!invs.length ? <tr><td colSpan={10} className="empty">No invoices.</td></tr> : null}</tbody></table></div></div>
    <Dialogs sp={sp} s={s} />
  </>;
}
