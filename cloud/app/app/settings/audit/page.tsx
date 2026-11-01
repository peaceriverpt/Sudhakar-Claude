import { pageCtx, one, type SP } from '@/lib/page';
import { fmtShortDate, fmtTime } from '@/lib/util';
import { SettingsNav } from '@/components/SettingsNav';
export const metadata = { title: 'Audit log' };
export default async function Audit({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const { run, tz } = await pageCtx(); const page = Math.max(1, Number(one(sp.page)) || 1); const per = 100;
  const rows = await run((tx) => tx`select a.*, p.first_name || ' ' || p.last_name as patient_name from audit_log a left join patients p on p.id = a.patient_id order by a.at desc limit ${per} offset ${(page - 1) * per}`);
  return <><div className="page-head"><h1>Audit log</h1></div><SettingsNav active="audit" />
    <div className="card"><div className="tbl-wrap"><table className="tbl small"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Patient</th><th>Details</th><th>IP</th></tr></thead><tbody>{rows.map((a) => <tr key={a.id}><td className="nowrap">{fmtShortDate(a.at, tz)} {fmtTime(a.at, tz)}</td><td>{a.actor}</td><td>{a.action}</td><td>{a.patient_name || ''}</td><td className="muted">{Object.keys(a.details || {}).length ? JSON.stringify(a.details) : ''}</td><td className="muted">{a.ip || ''}</td></tr>)}{!rows.length ? <tr><td colSpan={6} className="empty">Nothing here yet.</td></tr> : null}</tbody></table></div></div>
    <div className="flex mt">{page > 1 ? <a className="btn sm" href={`?page=${page - 1}`}>‹ Newer</a> : null}{rows.length === per ? <a className="btn sm" href={`?page=${page + 1}`}>Older ›</a> : null}</div></>;
}
