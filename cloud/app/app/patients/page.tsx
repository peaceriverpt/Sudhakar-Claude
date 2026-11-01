import Link from 'next/link';
import { pageCtx, one, type SP } from '@/lib/page';
import { searchPatients } from '@/lib/queries';
import { age, fmtShortDate, money } from '@/lib/util';
import { Avatar } from '@/components/ui';
import { PatientSearchBox } from '@/components/PatientSearchBox';
import Dialogs from '@/components/dialogs/Dialogs';
export const metadata = { title: 'Patients' };
export default async function Patients({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const { s, loc, run, tz, locations } = await pageCtx(); const q = one(sp.q), filter = one(sp.filter);
  const list = await run((tx) => searchPatients(tx, q, filter, loc));
  const total = list.length >= 300 ? Number((await run((tx) => tx`select count(*)::int as n from patients ${loc ? tx`where home_location_id = ${loc}` : tx``}`))[0].n) : list.length;
  const fq = (f: string) => `/app/patients?filter=${f}${q ? '&q=' + encodeURIComponent(q) : ''}`;
  const filters = [['', 'All'], ['new', 'New (30d)'], ['balance', 'Owing'], ['unsigned', 'Unsigned charts'], ['noshow', 'Recent no-shows'], ['inactive', 'Lapsed (60d+)']];
  return <>
    <div className="page-head"><h1>Patients</h1><div className="actions"><Link className="btn primary" href="/app/patients/new">+ New patient</Link></div></div>
    <div className="sched-toolbar"><PatientSearchBox q={q} filter={filter} /><div className="btn-group">{filters.map(([k, l]) => <Link key={k} className={`btn ${filter === k ? 'active' : ''}`} href={fq(k)}>{l}</Link>)}</div><span className="muted small">{list.length >= 300 ? `Showing the first 300${!q && !filter ? ` of ${total.toLocaleString()}` : ''}. Search to find others.` : `${list.length} patients`}</span></div>
    <div className="card"><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>Age</th><th>Phone</th><th>Email</th><th>Insurance</th><th>Last visit</th><th>Next visit</th><th className="num">Balance</th></tr></thead><tbody>
      {list.map((p) => <tr key={p.id}><td><Link href={`/app/patients/${p.id}`} className="flex" style={{ color: 'inherit' }}><Avatar name={`${p.first_name} ${p.last_name}`} color="#475569" /><div><div className="bold">{p.last_name}, {p.first_name}</div><div className="tiny muted">{locations.find((l) => l.id === p.home_location_id)?.name || ''}{p.alerts ? <> · <span style={{ color: 'var(--danger)' }}>⚠ {p.alerts}</span></> : null}</div></div></Link></td><td>{age(p.dob)}</td><td className="nowrap">{p.phone}</td><td>{p.email}</td><td>{p.insurer || <span className="muted">—</span>}</td><td className="nowrap">{p.last_visit ? fmtShortDate(p.last_visit, tz) : <span className="muted">—</span>}</td><td className="nowrap">{p.next_visit ? fmtShortDate(p.next_visit, tz) : <span className="muted">—</span>}</td><td className={`num ${p.balance_cents > 0 ? 'bold' : 'muted'}`} style={p.balance_cents > 0 ? { color: 'var(--danger)' } : undefined}>{money(p.balance_cents)}</td></tr>)}
      {!list.length ? <tr><td colSpan={8} className="empty">No patients match.</td></tr> : null}</tbody></table></div></div>
    <Dialogs sp={sp} s={s} />
  </>;
}
