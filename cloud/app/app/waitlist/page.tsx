import Link from 'next/link';
import { pageCtx, type SP } from '@/lib/page';
import { fmtShortDate } from '@/lib/util';
import { RemoveWaitlistButton } from '@/components/WaitlistButtons';
import Dialogs from '@/components/dialogs/Dialogs';
export const metadata = { title: 'Wait list' };
export default async function Waitlist({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const { s, loc, run, tz } = await pageCtx();
  const rows = await run((tx) => tx`select w.*, p.first_name || ' ' || p.last_name as patient_name, p.phone, t.name as treatment_name, pr.name as practitioner_name, l.name as location_name from waitlist w join patients p on p.id = w.patient_id left join treatments t on t.id = w.treatment_id left join practitioners pr on pr.id = w.practitioner_id left join locations l on l.id = w.location_id where ${loc ? tx`w.location_id = ${loc}` : tx`true`} order by w.created_at`);
  return <>
    <div className="page-head"><h1>Wait list</h1><div className="actions"><Link className="btn primary" href="/app/waitlist/new">+ Add to wait list</Link></div></div>
    <div className="card"><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Added</th><th>Patient</th><th>Phone</th><th>Service</th><th>Practitioner</th><th>Location</th><th>Notes</th><th></th></tr></thead><tbody>
      {rows.map((w) => <tr key={w.id}><td className="nowrap">{fmtShortDate(w.created_at, tz)}</td><td className="bold"><Link href={`/app/patients/${w.patient_id}`}>{w.patient_name}</Link></td><td className="nowrap">{w.phone}</td><td>{w.treatment_name || '—'}</td><td>{w.practitioner_name || <span className="muted">Any</span>}</td><td>{w.location_name || '—'}</td><td>{w.notes}</td><td className="right nowrap"><Link className="btn xs primary" href={`?new=1&patient=${w.patient_id}&patientName=${encodeURIComponent(w.patient_name)}&tx=${w.treatment_id || ''}&pr=${w.practitioner_id || ''}&loc=${w.location_id || ''}`}>Book</Link> <RemoveWaitlistButton id={w.id} /></td></tr>)}
      {!rows.length ? <tr><td colSpan={8} className="empty">Wait list is empty.</td></tr> : null}</tbody></table></div></div>
    <Dialogs sp={sp} s={s} />
  </>;
}
