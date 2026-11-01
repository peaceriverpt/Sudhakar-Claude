import { redirect } from 'next/navigation';
import { pageCtx } from '@/lib/page';
import { can } from '@/lib/auth';
import { fmtShortDate } from '@/lib/util';
import { SettingsNav } from '@/components/SettingsNav';
import { ApiKeyForm, RevokeKeyButton } from '@/components/SettingsForms';
export const metadata = { title: 'API keys' };
export default async function ApiKeys() {
  const { s, run, tz } = await pageCtx(); if (!can(s, 'manage_org')) redirect('/app/settings');
  const keys = await run((tx) => tx`select * from api_keys order by created_at desc`); const base = process.env.APP_URL || '';
  return <><div className="page-head"><h1>API keys</h1></div><SettingsNav active="api" />
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div><div className="card mb"><div className="card-head"><h2>Keys</h2></div><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>Key</th><th>Permissions</th><th>Last used</th><th></th></tr></thead><tbody>{keys.map((k) => <tr key={k.id} style={k.revoked_at ? { opacity: .5 } : undefined}><td className="bold">{k.name}</td><td className="small" style={{ fontFamily: 'monospace' }}>{k.prefix}…</td><td>{k.scopes.join(', ')}</td><td className="small">{k.last_used_at ? fmtShortDate(k.last_used_at, tz) : 'never'}</td><td className="right">{k.revoked_at ? <span className="badge">revoked</span> : <RevokeKeyButton id={k.id} />}</td></tr>)}{!keys.length ? <tr><td colSpan={5} className="empty">No API keys yet.</td></tr> : null}</tbody></table></div></div>
        <div className="card"><div className="card-head"><h2>Create a key</h2></div><div className="card-body"><ApiKeyForm /></div></div></div>
      <div className="card"><div className="card-head"><h2>Open API reference</h2></div><div className="card-body small">
        <p>Send the key in an <code>Authorization: Bearer cfk_…</code> header. All responses are JSON. Times are ISO 8601 in UTC. Money is in cents.</p>
        <table className="tbl"><tbody>
          <tr><td><code>GET {base}/api/v1/locations</code></td><td>Locations</td></tr><tr><td><code>GET /api/v1/practitioners</code></td><td>Practitioners with disciplines and locations</td></tr><tr><td><code>GET /api/v1/treatments</code></td><td>Services, durations, prices</td></tr>
          <tr><td><code>GET /api/v1/availability?practitionerId=&amp;locationId=&amp;treatmentId=&amp;date=YYYY-MM-DD</code></td><td>Open start times</td></tr>
          <tr><td><code>GET /api/v1/patients?q=</code></td><td>Search patients (read scope)</td></tr><tr><td><code>GET /api/v1/appointments?from=&amp;to=&amp;locationId=</code></td><td>Appointments in a range</td></tr>
          <tr><td><code>POST /api/v1/appointments</code></td><td>Book: <code>{'{ patient: { first, last, email, phone }, practitionerId, locationId, treatmentId, startsAt }'}</code> (write scope)</td></tr>
        </tbody></table><p className="muted mt">Rate limit: 600 requests per minute per key. Every API call is written to the audit log.</p></div></div>
    </div></>;
}
