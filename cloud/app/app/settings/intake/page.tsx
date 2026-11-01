import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pageCtx, one, type SP } from '@/lib/page';
import { can } from '@/lib/auth';
import { SettingsNav } from '@/components/SettingsNav';
import { IntakeFormEditor } from '@/components/SettingsForms';
export const metadata = { title: 'Intake forms' };
export default async function Intake({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const { s, run } = await pageCtx(); if (!can(s, 'manage_staff')) redirect('/app/settings'); const edit = one(sp.edit), isNew = one(sp.new) === '1';
  const forms = await run((tx) => tx`select f.*, (select count(*) from intake_submissions where form_id = f.id and submitted_at is not null)::int as submissions from intake_forms f order by name`);
  const editing = edit ? forms.find((f) => f.id === edit) : null;
  return <><div className="page-head"><h1>Intake forms</h1><div className="actions"><Link className="btn primary" href="/app/settings/intake?new=1">+ New form</Link></div></div><SettingsNav active="intake" />
    {edit || isNew ? <div className="mb"><IntakeFormEditor f={editing} /></div> : null}
    <div className="grid-2">{forms.map((f) => <div className="card" key={f.id}><div className="card-head"><div><h2>{f.name}</h2><div className="small muted">{f.submissions} submissions{f.active ? '' : ' · inactive'}</div></div><Link className="btn xs" href={`/app/settings/intake?edit=${f.id}`}>Edit</Link></div><div className="card-body small">{(f.fields as { label: string; type: string; required: boolean }[]).map((q, i) => <div key={i} className="mb"><strong>{q.label}</strong> <span className="muted">· {q.type}{q.required ? ' · required' : ''}</span></div>)}</div></div>)}</div>
    <p className="muted small mt">Patients receive a private link (from their profile page) and fill the form in on their phone. Answers and the typed signature are saved to their file and consent is marked on file.</p></>;
}
