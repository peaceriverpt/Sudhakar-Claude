'use client';
import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveSettings, inviteMember, removeMember, createApiKey, revokeApiKey, saveIntakeForm } from '@/lib/actions';
import type { Result } from '@/lib/actions';
import { Field, Check } from '@/components/ui';
import { fmtHM, type OrgSettings } from '@/lib/util';
/* eslint-disable @typescript-eslint/no-explicit-any */
export function SettingsForm({ s, orgName, readOnly }: { s: OrgSettings; orgName: string; readOnly: boolean }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(saveSettings, null);
  return <form action={action}><fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
    <Field label="Business name"><input name="clinicName" defaultValue={orgName} required /></Field>
    <div className="grid-3"><Field label="Tax name"><input name="taxName" defaultValue={s.taxName} /></Field><Field label="Tax rate %"><input name="taxRate" type="number" step="0.01" defaultValue={s.taxRateBp / 100} /></Field><Field label="Invoice prefix"><input name="invoicePrefix" defaultValue={s.invoicePrefix} /></Field></div>
    <div className="grid-3"><Field label="Schedule opens"><select name="openHour" defaultValue={s.openHour}>{Array.from({ length: 13 }, (_, i) => <option key={i} value={i + 5}>{fmtHM((i + 5) * 60)}</option>)}</select></Field><Field label="Schedule closes"><select name="closeHour" defaultValue={s.closeHour}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 12}>{fmtHM((i + 12) * 60)}</option>)}</select></Field><Field label="Online booking window (days)"><input name="bookingWindowDays" type="number" defaultValue={s.bookingWindowDays} /></Field></div>
    <div className="grid-2"><Field label="Time zone"><input name="timezone" defaultValue={s.timezone} /></Field><div className="field" style={{ paddingTop: 26 }}><Check name="onlineBookingEnabled" label="Online booking enabled" defaultChecked={s.onlineBookingEnabled} /></div></div>
    <Field label="Cancellation policy (shown on booking page and receipts)"><textarea name="cancellationPolicy" defaultValue={s.cancellationPolicy} /></Field>
    {state && !state.ok ? <div className="err">{state.error}</div> : null}{state && state.ok ? <div className="ok-msg">Saved.</div> : null}
    {!readOnly ? <button className="btn primary" disabled={pending}>Save settings</button> : <div className="muted small">Only the clinic owner can change these settings.</div>}</fieldset></form>;
}
export function InviteForm({ practitioners }: { practitioners: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<Result<{ link: string }> | null, FormData>(inviteMember, null); const [role, setRole] = useState('front_desk');
  return <form action={action}><div className="grid-3"><Field label="Email"><input name="email" type="email" required /></Field><Field label="Role"><select name="role" value={role} onChange={(e) => setRole(e.target.value)}><option value="front_desk">Front desk</option><option value="practitioner">Practitioner</option><option value="admin">Admin</option></select></Field>{role === 'practitioner' ? <Field label="Link to practitioner profile"><select name="practitionerId" defaultValue=""><option value="">—</option>{practitioners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field> : <div />}</div>
    {state && !state.ok ? <div className="err">{state.error}</div> : null}
    {state && state.ok && state.data ? <div className="alert ok">Invitation created. Send this link to them (valid 7 days):<div className="copybox mt"><input readOnly value={state.data.link} onFocus={(e) => e.target.select()} /><button type="button" className="btn xs" onClick={() => navigator.clipboard?.writeText(state.data!.link)}>Copy</button></div></div> : null}
    <button className="btn primary" disabled={pending}>Create invitation</button></form>;
}
export function RemoveMemberButton({ id }: { id: string }) { const router = useRouter(); const [pending, start] = useTransition(); return <button className="btn xs danger" disabled={pending} onClick={() => { if (confirm('Remove this person\'s access?')) start(async () => { await removeMember(id); router.refresh(); }); }}>Remove</button>; }
export function ApiKeyForm() {
  const [state, action, pending] = useActionState<Result<{ key: string }> | null, FormData>(createApiKey, null);
  return <form action={action}><div className="grid-3"><Field label="Key name"><input name="name" placeholder="e.g. Website integration" required /></Field><Field label="Permissions"><div className="flex wrap" style={{ paddingTop: 8 }}><Check name="scopes" value="read" label="Read" defaultChecked /><label className="flex" style={{ margin: 0, fontWeight: 500 }}><input type="checkbox" name="scopes" value="write" style={{ width: 'auto' }} />Write (book appointments)</label></div></Field></div>
    {state && !state.ok ? <div className="err">{state.error}</div> : null}
    {state && state.ok && state.data ? <div className="alert ok">Copy this key now. For security it will not be shown again.<div className="copybox mt"><input readOnly value={state.data.key} onFocus={(e) => e.target.select()} /><button type="button" className="btn xs" onClick={() => navigator.clipboard?.writeText(state.data!.key)}>Copy</button></div></div> : null}
    <button className="btn primary" disabled={pending}>Create API key</button></form>;
}
export function RevokeKeyButton({ id }: { id: string }) { const router = useRouter(); const [pending, start] = useTransition(); return <button className="btn xs danger" disabled={pending} onClick={() => { if (confirm('Revoke this key? Anything using it will stop working.')) start(async () => { await revokeApiKey(id); router.refresh(); }); }}>Revoke</button>; }
export function IntakeFormEditor({ f }: { f: any }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(saveIntakeForm, null);
  const text = (f?.fields || []).map((q: any) => `${q.label} | ${q.type}${q.required ? ' | required' : ''}`).join('\n') || 'What brings you in today? | textarea | required\nCurrent pain level (0 to 10) | number\nAllergies | text\nI consent to assessment and treatment. | consent | required';
  return <form action={action} className="card pad"><input type="hidden" name="id" value={f?.id || ''} /><Field label="Form name"><input name="name" defaultValue={f?.name || ''} required /></Field>
    <Field label="Questions, one per line as  Question | type | required" hint="Types: text, textarea, number, date, yesno, consent"><textarea name="fields" defaultValue={text} style={{ minHeight: 180 }} /></Field>
    <Check name="active" label="Active" defaultChecked={f ? f.active : true} />{state && !state.ok ? <div className="err">{state.error}</div> : null}
    <div className="form-actions"><a className="btn" href="/app/settings/intake">Cancel</a><button className="btn primary" disabled={pending}>Save form</button></div></form>;
}
