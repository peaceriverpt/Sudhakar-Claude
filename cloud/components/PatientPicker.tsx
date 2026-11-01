'use client';
import { useEffect, useRef, useState } from 'react';
import { searchPatientsAction, quickCreatePatient } from '@/lib/actions';
import { age } from '@/lib/util';
type Hit = { id: string; name: string; phone: string; email: string; dob: string | null };
/** Search-or-create patient control. Reports the chosen patient id via onChange. */
export default function PatientPicker({ value, onChange, locationId, allowNew = true, name = 'patientId' }: { value: { id: string; name: string; sub?: string } | null; onChange: (p: { id: string; name: string; sub?: string } | null) => void; locationId?: string; allowNew?: boolean; name?: string }) {
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Hit[]>([]); const [open, setOpen] = useState(false); const [creating, setCreating] = useState(false); const [nf, setNf] = useState({ first: '', last: '', phone: '', email: '' }); const [err, setErr] = useState(''); const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { clearTimeout(t.current); if (q.trim().length < 2) { setHits([]); return; } t.current = setTimeout(async () => { setHits(await searchPatientsAction(q)); setOpen(true); }, 180); }, [q]);
  if (value) return <div className="pp-selected"><input type="hidden" name={name} value={value.id} /><span className="avatar" style={{ background: '#475569' }}>{value.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span><div className="grow"><div className="bold">{value.name}</div>{value.sub ? <div className="tiny muted">{value.sub}</div> : null}</div><button type="button" className="btn xs" onClick={() => onChange(null)}>Change</button></div>;
  return <div className="patient-picker">
    <input type="hidden" name={name} value="" />
    <input type="text" placeholder="Type a patient's name, phone or email…" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
    {open && q.trim().length >= 2 ? <div className="pp-results">{hits.length ? hits.map((h) => <div key={h.id} onMouseDown={() => { onChange({ id: h.id, name: h.name, sub: `${h.phone} · ${h.email}` }); setOpen(false); }}><strong>{h.name}</strong> <span className="muted small">{h.phone}{h.dob ? ` · ${age(h.dob)}y` : ''}</span></div>) : <div className="muted">No matches{allowNew ? ' — use “New patient” below' : ''}</div>}</div> : null}
    {allowNew ? <div className="small mt"><a href="#" onClick={(e) => { e.preventDefault(); setCreating(!creating); }}>+ New patient</a></div> : null}
    {creating ? <div className="mt"><div className="grid-2"><div className="field"><label>First name</label><input value={nf.first} onChange={(e) => setNf({ ...nf, first: e.target.value })} /></div><div className="field"><label>Last name</label><input value={nf.last} onChange={(e) => setNf({ ...nf, last: e.target.value })} /></div><div className="field"><label>Phone</label><input value={nf.phone} onChange={(e) => setNf({ ...nf, phone: e.target.value })} /></div><div className="field"><label>Email</label><input type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} /></div></div>
      {err ? <div className="err">{err}</div> : null}
      <button type="button" className="btn sm" onClick={async () => { const r = await quickCreatePatient({ ...nf, locationId }); if (r.ok && r.data) { onChange({ id: r.data.id, name: r.data.name, sub: `${nf.phone} · ${nf.email}` }); setCreating(false); } else if (!r.ok) setErr(r.error); }}>Create patient</button></div> : null}
  </div>;
}
