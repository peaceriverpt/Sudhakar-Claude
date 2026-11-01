'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Modal, { useCloseDialog } from '@/components/Modal';
import PatientPicker from '@/components/PatientPicker';
import { Avatar, StatusBadge } from '@/components/ui';
import { getSlots, saveAppointment, setAppointmentStatus, deleteAppointment } from '@/lib/actions';
import { fmtClock, fmtHM, fmtKey, money, STATUS_LABEL, hm } from '@/lib/util';

type Pr = { id: string; name: string; discipline: string; color: string; locationIds: string[]; treatmentIds: string[] };
type Tx = { id: string; name: string; duration_min: number; price_cents: number; discipline: string };
export type ApptDialogProps = {
  mode: 'new' | 'edit'; locations: { id: string; name: string }[]; practitioners: Pr[]; treatments: Tx[];
  appt?: { id: string; patientId: string; patientName: string; patientPhone: string; patientAlerts: string; patientBalance: number; status: string; source: string; locationId: string; practitionerId: string; treatmentId: string; date: string; min: number; notes: string; chartId: string | null; chartSigned: boolean | null; invoiceId: string | null; invoiceNumber: string | null; invoiceStatus: string | null; label: string } | null;
  prefill?: { date?: string; min?: number; practitionerId?: string; locationId?: string; patientId?: string; patientName?: string; treatmentId?: string };
  canChart: boolean; canBill: boolean;
};
const CLOSE = ['appt', 'new', 'date2', 'min', 'pr', 'patient', 'patientName', 'tx'];
export default function AppointmentDialog(p: ApptDialogProps) {
  const a = p.appt; const close = useCloseDialog(CLOSE); const sp = useSearchParams();
  const withQ = (o: Record<string, string>) => { const q = new URLSearchParams(sp.toString()); [...CLOSE, 'checkout', 'chart', 'chartFor', 'sale'].forEach((k) => q.delete(k)); Object.entries(o).forEach(([k, v]) => q.set(k, v)); return '?' + q.toString(); };
  const [patient, setPatient] = useState<{ id: string; name: string; sub?: string } | null>(a ? { id: a.patientId, name: a.patientName } : p.prefill?.patientId ? { id: p.prefill.patientId, name: p.prefill.patientName || 'Selected patient' } : null);
  const prefillPr = p.practitioners.find((x) => x.id === p.prefill?.practitionerId);
  const [locationId, setLocationId] = useState(a?.locationId || p.prefill?.locationId || prefillPr?.locationIds[0] || p.locations[0]?.id || '');
  const prsHere = useMemo(() => p.practitioners.filter((x) => x.locationIds.includes(locationId)), [p.practitioners, locationId]);
  const [practitionerId, setPractitionerId] = useState(a?.practitionerId || p.prefill?.practitionerId || '');
  useEffect(() => { if (!prsHere.some((x) => x.id === practitionerId)) setPractitionerId(prsHere[0]?.id || ''); }, [prsHere, practitionerId]);
  const pr = p.practitioners.find((x) => x.id === practitionerId);
  const txs = useMemo(() => (pr ? p.treatments.filter((t) => pr.treatmentIds.includes(t.id) || t.discipline === pr.discipline) : p.treatments), [pr, p.treatments]);
  const [treatmentId, setTreatmentId] = useState(a?.treatmentId || p.prefill?.treatmentId || '');
  useEffect(() => { if (!txs.some((t) => t.id === treatmentId)) setTreatmentId(txs[0]?.id || ''); }, [txs, treatmentId]);
  const [date, setDate] = useState(a?.date || p.prefill?.date || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(a ? fmtHM(a.min) : p.prefill?.min != null ? fmtHM(p.prefill.min) : '');
  const [notes, setNotes] = useState(a?.notes || '');
  const [slots, setSlots] = useState<number[]>([]); const [err, setErr] = useState(''); const [force, setForce] = useState(false); const [pending, start] = useTransition();
  useEffect(() => { if (!practitionerId || !treatmentId || !date) { setSlots([]); return; } let live = true; getSlots({ practitionerId, locationId, date, treatmentId, ignoreId: a?.id }).then((r) => { if (live) setSlots(r.ok && r.data ? r.data.map((x) => x.min) : []); }); return () => { live = false; }; }, [practitionerId, locationId, date, treatmentId, a?.id]);

  const submit = () => { setErr(''); if (!patient) return setErr('Choose a patient first.'); if (!time) return setErr('Pick a time.');
    start(async () => { const r = await saveAppointment({ id: a?.id || '', patientId: patient.id, practitionerId, locationId, treatmentId, date, time, notes, force }); if (r.ok) close(p.mode === 'new' ? `/app/schedule?date=${date}` : undefined); else { setErr(r.error); if (r.error.startsWith('Overlaps')) setForce(true); } }); };
  const status = (st: string) => start(async () => { if (!a) return; const r = await setAppointmentStatus(a.id, st); if (!r.ok) setErr(r.error); else if (st === 'completed' && !a.invoiceId && p.canBill) close(withQ({ checkout: a.id })); else close(); });

  return <Modal title={a ? `Appointment · ${a.label}` : 'Book appointment'} size="wide" closeParams={CLOSE} foot={<>{a ? <div className="left"><button className="btn danger" disabled={pending} onClick={() => start(async () => { if (!confirm('Delete this appointment? Use Cancelled to keep a record.')) return; const r = await deleteAppointment(a.id); if (r.ok) close(); else setErr(r.error); })}>Delete</button></div> : null}<button className="btn" onClick={() => close()}>Close</button><button className="btn primary" disabled={pending} onClick={submit}>{pending ? 'Saving…' : force ? 'Save anyway' : a ? 'Save changes' : 'Book appointment'}</button></>}>
    {a ? <>
      <div className="flex between mb wrap"><div className="flex"><Avatar name={a.patientName} color="#475569" lg /><div><div className="bold" style={{ fontSize: 16 }}><Link href={`/app/patients/${a.patientId}`}>{a.patientName}</Link></div><div className="small muted">{a.patientPhone}{a.patientBalance > 0 ? <> · <span style={{ color: 'var(--danger)' }}>Owes {money(a.patientBalance)}</span></> : null}</div>{a.patientAlerts ? <div className="small" style={{ color: 'var(--danger)' }}>⚠ {a.patientAlerts}</div> : null}</div></div>{a.source === 'online' ? <span className="badge online">Booked online</span> : null}</div>
      <div className="field"><label>Status</label><div className="status-bar">{Object.keys(STATUS_LABEL).map((st) => <button key={st} type="button" className={`btn sm ${a.status === st ? 'active' : ''}`} disabled={pending} onClick={() => status(st)}>{STATUS_LABEL[st]}</button>)}</div></div>
      <div className="flex wrap mb" style={{ gap: 8 }}>
        {p.canChart ? <Link className="btn" href={a.chartId ? withQ({ chart: a.chartId }) : withQ({ chartFor: a.id })}>📝 {a.chartId ? (a.chartSigned ? 'View chart' : 'Continue chart') : 'Chart'}</Link> : null}
        {a.invoiceId ? <Link className="btn" href={`/app/invoices/${a.invoiceId}`}>🧾 {a.invoiceNumber} <span className={`badge ${a.invoiceStatus}`}>{a.invoiceStatus}</span></Link> : p.canBill ? <Link className="btn primary" href={withQ({ checkout: a.id })}>💳 Check out &amp; pay</Link> : null}
        <Link className="btn" href={`/app/schedule?new=1&patient=${a.patientId}&patientName=${encodeURIComponent(a.patientName)}&pr=${a.practitionerId}&loc=${a.locationId}`}>↻ Book next visit</Link>
      </div><hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '4px 0 14px' }} /></> : <div className="field"><label>Patient</label><PatientPicker value={patient} onChange={setPatient} locationId={locationId} /></div>}
    <div className="grid-2">
      <div className="field"><label>Location</label><select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{p.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      <div className="field"><label>Practitioner</label><select value={practitionerId} onChange={(e) => setPractitionerId(e.target.value)}>{prsHere.length ? prsHere.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.discipline}</option>) : <option value="">No staff at this location</option>}</select></div>
      <div className="field"><label>Treatment</label><select value={treatmentId} onChange={(e) => setTreatmentId(e.target.value)}>{txs.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.duration_min} min · {money(t.price_cents)}</option>)}</select></div>
      <div className="field"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
    </div>
    <div className="field"><label>Time <span className="muted" style={{ fontWeight: 400 }}>(open times for {pr?.name.split(' ')[0] || 'this practitioner'} on {fmtKey(date)})</span></label>
      <div className="slot-grid">{slots.length ? slots.map((m) => <button key={m} type="button" className={`btn xs ${time === fmtHM(m) ? 'active' : ''}`} onClick={() => setTime(fmtHM(m))}>{fmtClock(m)}</button>) : <span className="muted small">No open times on this day. You can still enter an exact time below.</span>}</div>
      <div className="flex mt small"><span className="muted">Or exact time:</span><input type="time" value={time} step={300} style={{ width: 'auto' }} onChange={(e) => { setTime(e.target.value); setForce(false); }} />{time && !slots.includes(hm(time)) ? <span className="muted">Outside open times</span> : null}</div></div>
    <div className="field"><label>Appointment notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. bring MRI report, prefers firm pressure" /></div>
    {err ? <div className="alert warn">{err}</div> : null}
  </Modal>;
}
