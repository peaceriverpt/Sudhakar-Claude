import Link from 'next/link';
import { pageCtx, one, type SP } from '@/lib/page';
import { can } from '@/lib/auth';
import { SettingsForm } from '@/components/SettingsForms';
import { LocationForm } from '@/components/StaffForms';
import { SettingsNav } from '@/components/SettingsNav';
export const metadata = { title: 'Settings' };
export default async function Settings({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const { s, run } = await pageCtx(); const edit = one(sp.edit); const isNew = one(sp.new) === '1';
  const all = await run((tx) => tx`select * from locations order by name`); const counts = await run(async (tx) => (await tx`select (select count(*) from patients)::int as patients, (select count(*) from appointments)::int as appointments, (select count(*) from invoices)::int as invoices, (select count(*) from charts)::int as charts`)[0]);
  const editing = edit ? all.find((l) => l.id === edit) : null;
  return <><div className="page-head"><h1>Settings</h1></div><SettingsNav active="general" />
    {can(s, 'manage_org') && (edit || isNew) ? <div className="mb"><h3 className="mb">{editing ? 'Edit location' : 'Add location'}</h3><LocationForm l={editing} tz={s.settings.timezone} /></div> : null}
    <div className="grid-2">
      <div className="card"><div className="card-head"><h2>Clinic</h2></div><div className="card-body"><SettingsForm s={s.settings} orgName={s.orgName} readOnly={!can(s, 'manage_org')} /></div></div>
      <div>
        <div className="card mb"><div className="card-head"><h2>Locations</h2>{can(s, 'manage_org') ? <Link className="btn xs" href="/app/settings?new=1">+ Add</Link> : null}</div><div className="card-body" style={{ padding: '4px 16px' }}><div className="list">{all.map((l) => <div className="list-item" key={l.id}><span className="dot" style={{ background: l.color }} /><div className="grow"><div className="bold">{l.name}{l.active ? '' : ' (inactive)'}</div><div className="small muted">{l.address} · {l.phone} · {l.timezone}</div></div>{can(s, 'manage_org') ? <Link className="btn xs" href={`/app/settings?edit=${l.id}`}>Edit</Link> : null}</div>)}</div></div></div>
        <div className="card mb"><div className="card-head"><h2>Online booking</h2></div><div className="card-body small"><p>Your public booking page:</p><div className="copybox"><input readOnly value={`${process.env.APP_URL || ''}/book/${s.orgSlug}`} /><a className="btn xs" href={`/book/${s.orgSlug}`} target="_blank" rel="noopener">Open ↗</a></div><p className="muted mt">Put this link on your website, Google Business profile and social media. Bookings appear on the schedule instantly, marked with 🌐.</p></div></div>
        <div className="card"><div className="card-head"><h2>Your data</h2></div><div className="card-body small"><p>{counts.patients} patients · {counts.appointments} appointments · {counts.invoices} invoices · {counts.charts} chart notes</p><p className="muted">Data is stored in an encrypted PostgreSQL database with automated backups managed by your hosting provider. Every access to a patient record is written to the <Link href="/app/settings/audit">audit log</Link>.</p></div></div>
      </div></div></>;
}
