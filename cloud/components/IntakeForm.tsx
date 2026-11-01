'use client';
import { useActionState } from 'react';
import { submitIntake } from '@/lib/actions';
import type { Result } from '@/lib/actions';
export default function IntakeForm({ token, fields }: { token: string; fields: { key: string; label: string; type: string; required: boolean }[] }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(submitIntake, null);
  if (state?.ok) return <div className="card pad center"><div style={{ fontSize: 40 }}>✅</div><h2>Thank you!</h2><p className="muted">Your form was received.</p></div>;
  return <form action={action} className="card pad"><input type="hidden" name="token" value={token} />
    {fields.map((f) => <div className="field" key={f.key}>{f.type === 'consent' ? <label className="flex" style={{ fontWeight: 500 }}><input type="checkbox" name={f.key} required={f.required} style={{ width: 'auto' }} />{f.label}</label> : <><label>{f.label}{f.required ? ' *' : ''}</label>{f.type === 'textarea' ? <textarea name={f.key} required={f.required} /> : f.type === 'yesno' ? <select name={f.key} required={f.required} defaultValue=""><option value="">—</option><option>Yes</option><option>No</option></select> : <input name={f.key} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} required={f.required} />}</>}</div>)}
    <div className="field"><label>Type your full name as your signature *</label><input name="signature" required placeholder="Full name" /></div>
    {state && !state.ok ? <div className="err">{state.error}</div> : null}
    <button className="btn primary" style={{ width: '100%', padding: 12 }} disabled={pending}>{pending ? 'Sending…' : 'Submit form'}</button></form>;
}
