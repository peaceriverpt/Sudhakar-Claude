import Link from 'next/link';
import { requireSession, can } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getLocations } from '@/lib/queries';
import { locFilter } from '@/lib/loc';
import { logout, switchOrganization } from '@/lib/actions';
import { GlobalSearch, LocationFilter, MenuButton, NavLinks } from '@/components/Topbar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const locations = await withTenant(s.orgId, getLocations);
  const loc = await locFilter(locations);
  const nav = [
    { href: '/app', label: 'Dashboard', ico: '⌂' }, { href: '/app/schedule', label: 'Schedule', ico: '📅' }, { href: '/app/patients', label: 'Patients', ico: '👤' },
    ...(can(s, 'billing') ? [{ href: '/app/billing', label: 'Billing', ico: '💳' }] : []), { href: '/app/waitlist', label: 'Wait list', ico: '⏳' },
    ...(can(s, 'reports') ? [{ href: '/app/reports', label: 'Reports', ico: '📈' }] : []), ...(can(s, 'manage_staff') ? [{ href: '/app/staff', label: 'Staff & Services', ico: '🩺' }] : []), { href: '/app/settings', label: 'Settings', ico: '⚙' },
  ];
  return <div className="app">
    <aside className="sidebar" id="sidebar">
      <div className="brand"><div className="logo">✚</div><span>ClinicFlow</span></div>
      <div className="org">{s.orgs.length > 1 ? <form action={switchOrganization}><select name="orgId" defaultValue={s.orgId} onChange={undefined}>{s.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select> <button className="btn xs" style={{ marginTop: 6 }}>Switch</button></form> : <strong style={{ color: '#e2e8f0' }}>{s.orgName}</strong>}</div>
      <NavLinks items={nav} />
      <div className="spacer" />
      <div className="foot"><a href={`/book/${s.orgSlug}`} target="_blank" rel="noopener">↗ Patient booking page</a></div>
      <div className="user"><span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>{s.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span><div><div>{s.name}</div><div className="role">{s.role.replace('_', ' ')}</div></div><form action={logout}><button>Sign out</button></form></div>
    </aside>
    <header className="topbar">
      <MenuButton />
      <div className="title">{s.orgName}</div>
      <GlobalSearch />
      <LocationFilter locations={locations} value={loc} />
      <Link href="/app/schedule?new=1" className="btn primary">+ Book</Link>
    </header>
    <main className="main" id="main">{children}</main>
  </div>;
}
