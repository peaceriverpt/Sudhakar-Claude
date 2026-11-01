'use client';
import { useActionState, useTransition } from 'react';
import { savePatient, deletePatient } from '@/lib/actions';
import type { Result } from '@/lib/actions';
import { Field, Check } from '@/components/ui';

const INSURERS = ['Alberta Blue Cross', 'Sun Life', 'Manulife', 'Canada Life', 'Green Shield', 'WCB Alberta', 'Desjardins', 'Equitable Life', 'Medavie'];
export default function PatientForm({ patient, locations, canDelete }: { patient: Record<string, unknown> & { insurers?: Record<string, unknown>[] } | null; locations: { id: string; name: string }[]; canDelete: boolean }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(savePatient, null); const [, start] = useTransition();
  const p = (patient || {}) as Record<string, string>; const ins = [patient?.insurers?.[0] || {}, patient?.insurers?.[1] || {}] as Record<string, string | number>[];
  const v = (k: string) => (p[k] ?? '') as string;
  return <form action={action} className="card pad">
    <input type="hidden" name="id" value={v('id')} />
    <div className="grid-3"><Field label="First name"><input name="first_name" defaultValue={v('first_name')} required /></Field><Field label="Last name"><input name="last_name" defaultValue={v('last_name')} required /></Field><Field label="Date of birth"><input name="dob" type="date" defaultValue={v('dob') ? String(v('dob')).slice(0, 10) : ''} /></Field>
      <Field label="Sex"><select name="sex" defaultValue={v('sex')}>{['', 'F', 'M', 'X'].map((x) => <option key={x} value={x}>{x || '—'}</option>)}</select></Field><Field label="Phone"><input name="phone" defaultValue={v('phone')} /></Field><Field label="Email"><input name="email" type="email" defaultValue={v('email')} /></Field></div>
    <div className="grid-4"><div className="field" style={{ gridColumn: 'span 2' }}><label>Address</label><input name="address" defaultValue={v('address')} /></div><Field label="City"><input name="city" defaultValue={v('city')} /></Field><Field label="Province / Postal"><div className="flex"><input name="province" defaultValue={v('province') || 'AB'} style={{ width: 60 }} /><input name="postal" defaultValue={v('postal')} /></div></Field></div>
    <div className="grid-3"><Field label="Health card #"><input name="health_number" defaultValue={v('health_number')} /></Field><Field label="Home clinic"><select name="home_location_id" defaultValue={v('home_location_id') || ''}><option value="">—</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field><Field label="Referred by"><input name="referred_by" defaultValue={v('referred_by')} list="ref-src" /><datalist id="ref-src">{['Google', 'Word of mouth', 'Physician referral', 'Instagram', 'Facebook', 'Walk-in', 'Returning', 'Insurance / WCB'].map((x) => <option key={x} value={x} />)}</datalist></Field></div>
    <div className="grid-2"><Field label="Emergency contact"><input name="emergency_name" defaultValue={v('emergency_name')} /></Field><Field label="Emergency phone"><input name="emergency_phone" defaultValue={v('emergency_phone')} /></Field></div>
    <Field label="Primary complaint"><input name="complaint" defaultValue={v('complaint')} /></Field>
    <div className="grid-2"><Field label="Alerts (allergies, precautions; shown in red everywhere)"><input name="alerts" defaultValue={v('alerts')} /></Field><Field label="Tags (comma separated)"><input name="tags" defaultValue={((patient?.tags as string[]) || []).join(', ')} placeholder="VIP, Athlete, WCB" /></Field></div>
    <Field label="Notes"><textarea name="notes" defaultValue={v('notes')} /></Field>
    <Check name="consent_on_file" label="Consent & intake form on file" defaultChecked={!!patient?.consent_on_file} />
    <h3 className="mt-l">Insurance</h3>
    {ins.map((i, n) => <div className="grid-4 mt" style={{ gap: 8 }} key={n}><Field label={n === 0 ? 'Primary insurer' : 'Secondary insurer'}><input name={`ins${n}_company`} defaultValue={(i.company as string) || ''} list="ins-list" /></Field><Field label="Policy #"><input name={`ins${n}_policy`} defaultValue={(i.policy as string) || ''} /></Field><Field label="Member ID"><input name={`ins${n}_member`} defaultValue={(i.member_id as string) || ''} /></Field><Field label="Coverage % / Annual max $"><div className="flex"><input name={`ins${n}_pct`} type="number" defaultValue={(i.coverage_pct as number) ?? 80} style={{ width: 70 }} /><input name={`ins${n}_max`} type="number" defaultValue={i.annual_max_cents ? (i.annual_max_cents as number) / 100 : ''} placeholder="max" /></div></Field></div>)}
    <datalist id="ins-list">{INSURERS.map((x) => <option key={x} value={x} />)}</datalist>
    {state && !state.ok ? <div className="err">{state.error}</div> : null}
    <div className="form-actions">{canDelete && v('id') ? <button type="button" className="btn danger" style={{ marginRight: 'auto' }} onClick={() => { if (confirm('Permanently delete this patient and all their appointments, charts and invoices?')) start(() => deletePatient(v('id')).then(() => {})); }}>Delete patient</button> : null}<a className="btn" href={v('id') ? `/app/patients/${v('id')}` : '/app/patients'}>Cancel</a><button className="btn primary" disabled={pending}>{pending ? 'Saving…' : 'Save patient'}</button></div>
  </form>;
}
