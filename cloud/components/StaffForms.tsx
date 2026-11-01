'use client';
import { useActionState } from 'react';
import { savePractitioner, saveTreatment, saveProduct, saveTemplate, saveLocation } from '@/lib/actions';
import type { Result } from '@/lib/actions';
import { Field, Check } from '@/components/ui';
import { COLORS, DAYS, DISCIPLINES, fmtHM } from '@/lib/util';
/* eslint-disable @typescript-eslint/no-explicit-any */
const Err = ({ s }: { s: Result | null }) => (s && !s.ok ? <div className="err">{s.error}</div> : null);
const Actions = ({ back, pending, label }: { back: string; pending: boolean; label?: string }) => <div className="form-actions"><a className="btn" href={back}>Cancel</a><button className="btn primary" disabled={pending}>{pending ? 'Saving…' : label || 'Save'}</button></div>;

export function PractitionerForm({ p, locations }: { p: any; locations: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(savePractitioner, null);
  const shiftFor = (d: number) => (p?.shifts || []).find((s: any) => s.weekday === d);
  return <form action={action} className="card pad"><input type="hidden" name="id" value={p?.id || ''} />
    <div className="grid-3"><Field label="Full name"><input name="name" defaultValue={p?.name || ''} required /></Field><Field label="Credentials"><input name="title" defaultValue={p?.title || ''} placeholder="PT, RMT, DC…" /></Field><Field label="Discipline"><select name="discipline" defaultValue={p?.discipline || DISCIPLINES[0]}>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select></Field>
      <Field label="Email"><input name="email" type="email" defaultValue={p?.email || ''} /></Field><Field label="Phone"><input name="phone" defaultValue={p?.phone || ''} /></Field><Field label="Calendar colour"><input name="color" type="color" defaultValue={p?.color || COLORS[0]} style={{ height: 38, padding: 2 }} /></Field>
      <Field label="Registration / licence #" hint="Printed on receipts for insurance claims"><input name="license_number" defaultValue={p?.license_number || ''} /></Field></div>
    <Field label="Works at"><div className="flex wrap">{locations.map((l) => <Check key={l.id} name="locations" value={l.id} label={l.name} defaultChecked={(p?.locationIds || []).includes(l.id)} />)}</div></Field>
    <Field label="Weekly schedule"><div className="shift-grid">{[1, 2, 3, 4, 5, 6, 0].map((d) => { const sh = shiftFor(d); return <div key={d} style={{ display: 'contents' }}><label className="flex" style={{ margin: 0 }}><input type="checkbox" name={`on_${d}`} defaultChecked={!!sh} style={{ width: 'auto' }} />{DAYS[d]}</label><div className="flex"><input type="time" name={`start_${d}`} defaultValue={sh ? fmtHM(sh.start_min) : '09:00'} style={{ width: 110 }} /><span className="muted">to</span><input type="time" name={`end_${d}`} defaultValue={sh ? fmtHM(sh.end_min) : '17:00'} style={{ width: 110 }} /><span className="muted">at</span><select name={`loc_${d}`} defaultValue={sh?.location_id || p?.locationIds?.[0] || locations[0]?.id} style={{ width: 'auto' }}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div></div>; })}</div></Field>
    <Field label="Bio (shown on the online booking page)"><textarea name="bio" defaultValue={p?.bio || ''} /></Field>
    <div className="flex wrap"><Check name="online" label="Bookable online" defaultChecked={p ? p.online : true} /><Check name="active" label="Active" defaultChecked={p ? p.active : true} /></div>
    <Err s={state} /><Actions back="/app/staff" pending={pending} /></form>;
}
export function TreatmentForm({ t }: { t: any }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(saveTreatment, null);
  return <form action={action} className="card pad" style={{ maxWidth: 720 }}><input type="hidden" name="id" value={t?.id || ''} />
    <Field label="Name"><input name="name" defaultValue={t?.name || ''} required /></Field>
    <div className="grid-3"><Field label="Discipline"><select name="discipline" defaultValue={t?.discipline || DISCIPLINES[0]}>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select></Field><Field label="Duration (min)"><input name="duration_min" type="number" min={5} step={5} defaultValue={t?.duration_min ?? 30} /></Field><Field label="Price ($)"><input name="price" type="number" min={0} step="0.01" defaultValue={t ? (t.price_cents / 100).toFixed(2) : '0.00'} /></Field></div>
    <div className="flex wrap"><Check name="is_assessment" label="Initial assessment (counts for PVA)" defaultChecked={!!t?.is_assessment} /><Check name="taxable" label="Taxable" defaultChecked={!!t?.taxable} /><Check name="online" label="Bookable online" defaultChecked={t ? t.online : true} /><Check name="active" label="Active" defaultChecked={t ? t.active : true} /></div>
    <Err s={state} /><Actions back="/app/staff/treatments" pending={pending} /></form>;
}
export function ProductForm({ t }: { t: any }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(saveProduct, null);
  return <form action={action} className="card pad" style={{ maxWidth: 520 }}><input type="hidden" name="id" value={t?.id || ''} /><Field label="Name"><input name="name" defaultValue={t?.name || ''} required /></Field><Field label="Price ($)"><input name="price" type="number" min={0} step="0.01" defaultValue={t ? (t.price_cents / 100).toFixed(2) : '0.00'} /></Field><div className="flex wrap"><Check name="taxable" label="Taxable" defaultChecked={t ? t.taxable : true} /><Check name="active" label="Active" defaultChecked={t ? t.active : true} /></div><Err s={state} /><Actions back="/app/staff/products" pending={pending} /></form>;
}
export function TemplateForm({ t }: { t: any }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(saveTemplate, null);
  const text = (t?.sections || [{ label: 'Subjective' }, { label: 'Objective' }, { label: 'Assessment' }, { label: 'Plan' }]).map((s: any) => s.label + (s.placeholder ? ' | ' + s.placeholder : '')).join('\n');
  return <form action={action} className="card pad" style={{ maxWidth: 720 }}><input type="hidden" name="id" value={t?.id || ''} /><div className="grid-2"><Field label="Name"><input name="name" defaultValue={t?.name || ''} required /></Field><Field label="Discipline (optional)"><select name="discipline" defaultValue={t?.discipline || ''}><option value="">All</option>{DISCIPLINES.map((d) => <option key={d}>{d}</option>)}</select></Field></div><Field label="Sections, one per line as  Label | hint text"><textarea name="sections" defaultValue={text} style={{ minHeight: 160 }} /></Field><Check name="active" label="Active" defaultChecked={t ? t.active : true} /><Err s={state} /><Actions back="/app/staff/templates" pending={pending} /></form>;
}
export function LocationForm({ l, tz }: { l: any; tz: string }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(saveLocation, null);
  return <form action={action} className="card pad" style={{ maxWidth: 560 }}><input type="hidden" name="id" value={l?.id || ''} /><Field label="Name"><input name="name" defaultValue={l?.name || ''} required /></Field><Field label="Address"><input name="address" defaultValue={l?.address || ''} /></Field><div className="grid-3"><Field label="Phone"><input name="phone" defaultValue={l?.phone || ''} /></Field><Field label="Colour"><input name="color" type="color" defaultValue={l?.color || COLORS[1]} style={{ height: 38, padding: 2 }} /></Field><Field label="Time zone"><input name="timezone" defaultValue={l?.timezone || tz} /></Field></div><Check name="active" label="Active" defaultChecked={l ? l.active : true} /><Err s={state} /><Actions back="/app/settings" pending={pending} /></form>;
}
