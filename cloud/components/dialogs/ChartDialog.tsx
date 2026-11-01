'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import Modal, { useCloseDialog } from '@/components/Modal';
import { Avatar } from '@/components/ui';
import { saveChart, addAddendum, deleteChart } from '@/lib/actions';

type Tpl = { id: string; name: string; discipline: string; sections: { key: string; label: string; placeholder: string }[] };
export type ChartProps = {
  chart: { id: string; templateId: string | null; templateName: string; fields: Record<string, string>; signed: boolean; signedLabel: string; addenda: { at: string; by: string; text: string }[]; practitionerName: string; dateLabel: string } | null;
  appointmentId: string | null; patient: { id: string; name: string; age: string | number; alerts: string }; context: string; templates: Tpl[]; defaultTemplateId: string;
  prior: { id: string; dateLabel: string; templateName: string; templateId: string | null; practitionerName: string; fields: Record<string, string> }[];
};
const CLOSE = ['chart', 'chartFor'];
export default function ChartDialog(p: ChartProps) {
  const close = useCloseDialog(CLOSE); const c = p.chart; const locked = !!c?.signed;
  const [templateId, setTemplateId] = useState(c?.templateId || p.defaultTemplateId); const tpl = p.templates.find((t) => t.id === templateId) || p.templates[0];
  const [fields, setFields] = useState<Record<string, string>>(c?.fields || {}); const [addendum, setAddendum] = useState(''); const [err, setErr] = useState(''); const [pending, start] = useTransition();
  const persist = (sign: boolean) => start(async () => { setErr(''); const r = await saveChart({ id: c?.id || null, appointmentId: p.appointmentId, patientId: p.patient.id, templateId: tpl.id, fields, sign }); if (r.ok) close(); else setErr(r.error); });
  const copyForward = () => { const last = p.prior[0]; if (!last) return; if (last.templateId && p.templates.some((t) => t.id === last.templateId)) setTemplateId(last.templateId); setFields({ ...last.fields }); };
  return <Modal title={c ? `Chart note · ${c.dateLabel}` : 'New chart note'} size="wide" closeParams={CLOSE} foot={locked ? <><button className="btn" onClick={() => window.print()}>🖨 Print</button><button className="btn" onClick={() => close()}>Close</button><button className="btn primary" disabled={pending} onClick={() => start(async () => { const r = await addAddendum(c!.id, addendum); if (r.ok) close(); else setErr(r.error); })}>Save addendum</button></> : <><div className="left">{c ? <button className="btn danger" disabled={pending} onClick={() => start(async () => { if (!confirm('Delete this draft?')) return; const r = await deleteChart(c.id); if (r.ok) close(); else setErr(r.error); })}>Delete draft</button> : null}</div><button className="btn" onClick={() => close()}>Close</button><button className="btn" disabled={pending} onClick={() => persist(false)}>Save draft</button><button className="btn primary" disabled={pending} onClick={() => persist(true)}>✔ Sign &amp; lock</button></>}>
    <div className="flex between mb wrap"><div className="flex"><Avatar name={p.patient.name} color="#475569" /><div><div className="bold"><Link href={`/app/patients/${p.patient.id}?tab=charts`}>{p.patient.name}</Link>{p.patient.age !== '' ? ` · ${p.patient.age}y` : ''}</div><div className="small muted">{p.context}</div></div></div>{locked ? <span className="badge completed">Signed {c!.signedLabel}</span> : c ? <span className="badge arrived">Draft</span> : <span className="badge">New note</span>}</div>
    {p.patient.alerts ? <div className="alert danger">⚠ {p.patient.alerts}</div> : null}
    {!locked ? <div className="flex between mb wrap"><div className="flex"><label style={{ margin: 0 }}>Template</label><select value={templateId} style={{ width: 'auto' }} onChange={(e) => { setTemplateId(e.target.value); }}>{p.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>{p.prior.length ? <button type="button" className="btn sm" onClick={copyForward}>⎘ Copy forward from {p.prior[0].dateLabel}</button> : null}</div> : null}
    {(locked ? Object.keys(c!.fields).map((k) => ({ key: k, label: tpl?.sections.find((s) => s.key === k)?.label || k, placeholder: '' })) : tpl.sections).map((s) => <div className="chart-section" key={s.key}><div className="lbl">{s.label}</div>{locked ? <div className="chart-locked">{c!.fields[s.key] || '—'}</div> : <textarea value={fields[s.key] || ''} placeholder={s.placeholder} onChange={(e) => setFields({ ...fields, [s.key]: e.target.value })} />}</div>)}
    {locked ? <div className="field mt"><label>Add addendum (signed notes can't be edited; addenda are appended with a timestamp)</label><textarea value={addendum} onChange={(e) => setAddendum(e.target.value)} /></div> : null}
    {c?.addenda?.length ? <div className="mt small"><strong>Addenda</strong>{c.addenda.map((ad, i) => <div className="chart-locked" style={{ marginTop: 6 }} key={i}><span className="tiny muted">{new Date(ad.at).toLocaleString('en-CA')} · {ad.by}</span><br />{ad.text}</div>)}</div> : null}
    {err ? <div className="alert warn mt">{err}</div> : null}
    {p.prior.length ? <details className="mt"><summary className="bold small" style={{ cursor: 'pointer' }}>Previous notes ({p.prior.length})</summary>{p.prior.slice(0, 5).map((x) => <div className="card pad mt small" key={x.id}><div className="bold">{x.dateLabel} · {x.templateName} · {x.practitionerName}</div>{Object.entries(x.fields).map(([k, v]) => v ? <div key={k} style={{ marginTop: 6 }}><span className="muted">{k}:</span> {v}</div> : null)}</div>)}</details> : null}
  </Modal>;
}
