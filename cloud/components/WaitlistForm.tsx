'use client';
import { useActionState, useState } from 'react';
import PatientPicker from '@/components/PatientPicker';
import { addWaitlist } from '@/lib/actions';
import type { Result } from '@/lib/actions';
import { Field } from '@/components/ui';
export function WaitlistForm(p: { patient: { id: string; name: string } | null; treatments: { id: string; name: string }[]; practitioners: { id: string; name: string }[]; locations: { id: string; name: string }[]; defaultLocation: string }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(addWaitlist, null); const [patient, setPatient] = useState(p.patient);
  return <form action={action} className="card pad" style={{ maxWidth: 720 }}>
    <Field label="Patient"><PatientPicker value={patient} onChange={setPatient} /></Field>
    <div className="grid-3"><Field label="Service"><select name="treatmentId" defaultValue="">{p.treatments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field><Field label="Practitioner"><select name="practitionerId" defaultValue=""><option value="">Any</option>{p.practitioners.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field><Field label="Location"><select name="locationId" defaultValue={p.defaultLocation}>{p.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field></div>
    <Field label="Availability notes"><input name="notes" placeholder="e.g. weekday mornings, ASAP" /></Field>
    {state && !state.ok ? <div className="err">{state.error}</div> : null}
    <div className="form-actions"><a className="btn" href="/app/waitlist">Cancel</a><button className="btn primary" disabled={pending}>Add</button></div>
  </form>;
}
