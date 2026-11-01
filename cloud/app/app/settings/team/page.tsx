import { redirect } from 'next/navigation';
import { pageCtx } from '@/lib/page';
import { can } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getPractitioners } from '@/lib/queries';
import { fmtShortDate } from '@/lib/util';
import { SettingsNav } from '@/components/SettingsNav';
import { InviteForm, RemoveMemberButton } from '@/components/SettingsForms';
export const metadata = { title: 'Team' };
export default async function Team() {
  const { s, run, tz } = await pageCtx(); if (!can(s, 'manage_staff')) redirect('/app/settings');
  const members = await sql`select m.id, m.role, m.active, m.created_at, u.name, u.email, u.last_login_at, p.name as practitioner_name from memberships m join users u on u.id = m.user_id left join practitioners p on p.id = m.practitioner_id where m.org_id = ${s.orgId} and m.active order by m.role, u.name`;
  const invites = await sql`select email, role, expires_at from invites where org_id = ${s.orgId} and accepted_at is null and expires_at > now() order by created_at desc`;
  const prs = await run((tx) => getPractitioners(tx));
  return <><div className="page-head"><h1>Team &amp; logins</h1></div><SettingsNav active="team" />
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="card"><div className="card-head"><h2>People with access</h2></div><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>Role</th><th>Last sign in</th><th></th></tr></thead><tbody>{members.map((m) => <tr key={m.id}><td><div className="bold">{m.name}</div><div className="tiny muted">{m.email}{m.practitioner_name ? ` · ${m.practitioner_name}` : ''}</div></td><td><span className="badge">{m.role.replace('_', ' ')}</span></td><td className="small">{m.last_login_at ? fmtShortDate(m.last_login_at, tz) : '—'}</td><td className="right">{m.role !== 'owner' && m.email !== s.email ? <RemoveMemberButton id={m.id} /> : null}</td></tr>)}</tbody></table></div>
        {invites.length ? <div className="card-body small"><strong>Pending invitations</strong>{invites.map((i, k) => <div key={k} className="muted">{i.email} · {i.role.replace('_', ' ')} · expires {fmtShortDate(i.expires_at, tz)}</div>)}</div> : null}</div>
      <div className="card"><div className="card-head"><h2>Invite someone</h2></div><div className="card-body"><InviteForm practitioners={prs.map((p) => ({ id: p.id, name: p.name }))} /><div className="small muted mt-l"><strong>Roles.</strong> Front desk: schedule, patients, billing; no chart access. Practitioner: schedule, patients, charting; no billing or reports. Admin: everything except clinic settings and API keys. Owner: everything.</div></div></div>
    </div></>;
}
