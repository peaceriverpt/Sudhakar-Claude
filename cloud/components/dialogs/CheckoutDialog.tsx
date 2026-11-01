'use client';
import { useMemo, useState, useTransition } from 'react';
import Modal, { useCloseDialog } from '@/components/Modal';
import PatientPicker from '@/components/PatientPicker';
import { createInvoice } from '@/lib/actions';
import { invoiceTotals, money, fromCents, toCents, PAY_METHODS, type InvoiceItem } from '@/lib/util';

export type CheckoutProps = {
  title: string; patient: { id: string; name: string } | null; appointmentId: string | null; locationId: string; practitionerId: string | null;
  locations: { id: string; name: string }[]; practitioners: { id: string; name: string }[]; treatments: { id: string; name: string; price_cents: number; taxable: boolean }[]; products: { id: string; name: string; price_cents: number; taxable: boolean }[];
  initialItems: InvoiceItem[]; insurers: { company: string; coverage_pct: number }[]; taxName: string; taxRateBp: number;
};
const CLOSE = ['checkout', 'sale', 'patient', 'patientName'];
const INSURERS = ['Alberta Blue Cross', 'Sun Life', 'Manulife', 'Canada Life', 'Green Shield', 'WCB Alberta', 'Desjardins', 'Medavie', 'Other'];
export default function CheckoutDialog(p: CheckoutProps) {
  const close = useCloseDialog(CLOSE);
  const [patient, setPatient] = useState(p.patient); const [locationId, setLocationId] = useState(p.locationId); const [practitionerId, setPractitionerId] = useState(p.practitionerId || '');
  const [items, setItems] = useState<InvoiceItem[]>(p.initialItems); const [discount, setDiscount] = useState('0'); const [insurer, setInsurer] = useState(p.insurers[0]?.company || ''); const [insPortion, setInsPortion] = useState(() => { const ins = p.insurers[0]; const tx = p.initialItems.filter((i) => i.kind === 'treatment').reduce((s, i) => s + i.qty * i.priceCents, 0); return ins ? fromCents(Math.round((tx * ins.coverage_pct) / 100)) : '0'; });
  const [method, setMethod] = useState('Credit Card'); const [payAmt, setPayAmt] = useState(''); const [err, setErr] = useState(''); const [pending, start] = useTransition();
  const tot = useMemo(() => invoiceTotals(items, toCents(discount), p.taxRateBp), [items, discount, p.taxRateBp]);
  const insCents = insurer ? Math.min(toCents(insPortion), tot.total) : 0; const due = tot.total - insCents;
  const upd = (i: number, patch: Partial<InvoiceItem>) => setItems(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const addFromCatalogue = (v: string) => { const [kind, id] = v.split(':'); const src = kind === 't' ? p.treatments.find((t) => t.id === id) : p.products.find((t) => t.id === id); if (src) setItems([...items, { id: Math.random().toString(36).slice(2), desc: src.name, qty: 1, priceCents: src.price_cents, taxable: src.taxable, kind: kind === 't' ? 'treatment' : 'product' }]); };
  const onInsurer = (v: string) => { setInsurer(v); const rec = p.insurers.find((i) => i.company === v); if (!v) setInsPortion('0'); else if (rec) { const tx = items.filter((i) => i.kind === 'treatment').reduce((s, i) => s + i.qty * i.priceCents, 0); setInsPortion(fromCents(Math.round((tx * rec.coverage_pct) / 100))); } };
  const submit = () => start(async () => { setErr(''); if (!patient) return setErr('Choose a patient first.'); if (!items.length) return setErr('Add at least one item.');
    const amt = toCents(payAmt); const r = await createInvoice({ patientId: patient.id, appointmentId: p.appointmentId, locationId, practitionerId: practitionerId || null, items, discountCents: toCents(discount), insurer, insurerPortionCents: insCents, payment: amt > 0 ? { method, amountCents: Math.min(amt, due > 0 ? due : tot.total) } : null });
    if (r.ok && r.data) close(`/app/invoices/${r.data.id}`); else if (!r.ok) setErr(r.error); });
  return <Modal title={p.title} size="wide" closeParams={CLOSE} foot={<><button className="btn" onClick={() => close()}>Cancel</button><button className="btn primary" disabled={pending} onClick={submit}>{pending ? 'Saving…' : 'Complete sale'}</button></>}>
    {!p.patient ? <div className="field"><label>Patient</label><PatientPicker value={patient} onChange={setPatient} locationId={locationId} /></div> : null}
    <div className="grid-2"><div className="field"><label>Location</label><select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{p.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div><div className="field"><label>Practitioner (for reports)</label><select value={practitionerId} onChange={(e) => setPractitionerId(e.target.value)}><option value="">—</option>{p.practitioners.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div></div>
    <table className="tbl line-items"><thead><tr><th>Item</th><th className="num" style={{ width: 76 }}>Qty</th><th className="num" style={{ width: 110 }}>Price</th><th className="num" style={{ width: 100 }}>Amount</th><th style={{ width: 30 }}></th></tr></thead><tbody>
      {items.map((it, i) => <tr key={it.id}><td><input value={it.desc} onChange={(e) => upd(i, { desc: e.target.value })} /></td><td><input type="number" min={0} step={1} value={it.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) || 0 })} /></td><td><input type="number" min={0} step="0.01" value={fromCents(it.priceCents)} onChange={(e) => upd(i, { priceCents: toCents(e.target.value) })} /></td><td className="num">{money(it.qty * it.priceCents)}</td><td><button type="button" className="close" onClick={() => setItems(items.filter((_, k) => k !== i))} title="Remove">×</button></td></tr>)}
      {!items.length ? <tr><td colSpan={5} className="empty small">No items yet. Add a treatment or product.</td></tr> : null}</tbody></table>
    <div className="flex mt wrap"><select style={{ maxWidth: 360 }} value="" onChange={(e) => addFromCatalogue(e.target.value)}><option value="">+ Add treatment or product…</option><optgroup label="Treatments">{p.treatments.map((t) => <option key={t.id} value={'t:' + t.id}>{t.name} · {money(t.price_cents)}</option>)}</optgroup><optgroup label="Products">{p.products.map((t) => <option key={t.id} value={'p:' + t.id}>{t.name} · {money(t.price_cents)}</option>)}</optgroup></select><button type="button" className="btn sm" onClick={() => setItems([...items, { id: Math.random().toString(36).slice(2), desc: 'Custom item', qty: 1, priceCents: 0, taxable: false, kind: 'custom' }])}>+ Custom line</button></div>
    <div className="grid-2 mt">
      <div><div className="field"><label>Discount ($)</label><input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
        <div className="field"><label>Insurer (direct billing)</label><select value={insurer} onChange={(e) => onInsurer(e.target.value)}><option value="">None — patient pays</option>{p.insurers.map((i) => <option key={i.company} value={i.company}>{i.company} · {i.coverage_pct}%</option>)}{INSURERS.filter((n) => !p.insurers.some((i) => i.company === n)).map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
        <div className="field"><label>Insurer portion ($)</label><input type="number" min={0} step="0.01" value={insPortion} onChange={(e) => setInsPortion(e.target.value)} disabled={!insurer} /></div></div>
      <div className="card pad" style={{ background: 'var(--surface-2)' }}>
        <div className="flex between"><span>Subtotal</span><strong>{money(tot.subtotal)}</strong></div>
        {tot.discount ? <div className="flex between"><span>Discount</span><strong>-{money(tot.discount)}</strong></div> : null}
        <div className="flex between"><span>{p.taxName} {p.taxRateBp / 100}% (taxable items)</span><strong>{money(tot.tax)}</strong></div>
        <div className="flex between" style={{ fontSize: 16, marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 6 }}><span>Total</span><strong>{money(tot.total)}</strong></div>
        {insurer ? <div className="flex between small muted"><span>Insurer pays</span><span>{money(insCents)}</span></div> : null}
        <div className="flex between" style={{ color: 'var(--primary)' }}><span>Patient pays today</span><strong>{money(due)}</strong></div></div></div>
    <div className="field mt"><label>Payment</label><div className="row"><select value={method} onChange={(e) => setMethod(e.target.value)}>{PAY_METHODS.filter((x) => x !== 'Insurance').map((x) => <option key={x}>{x}</option>)}</select><input type="number" step="0.01" min={0} value={payAmt} onChange={(e) => setPayAmt(e.target.value)} placeholder={money(due)} /><button type="button" className="btn sm" onClick={() => setPayAmt(fromCents(due))}>Full balance</button></div><div className="tiny muted mt">Leave the amount blank to save the invoice unpaid.</div></div>
    {err ? <div className="alert warn">{err}</div> : null}
  </Modal>;
}
