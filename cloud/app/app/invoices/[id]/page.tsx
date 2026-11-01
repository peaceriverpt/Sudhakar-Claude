import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { pageCtx } from '@/lib/page';
import { can } from '@/lib/auth';
import { getInvoice, getPatient } from '@/lib/queries';
import { fmtDate, fmtShortDate, money } from '@/lib/util';
import { InvBadge } from '@/components/ui';
import { PaymentForm, InvoiceActions } from '@/components/InvoiceActions';
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { s, run, tz } = await pageCtx(); if (!can(s, 'billing')) redirect('/app');
  const d = await run(async (tx) => { const inv = await getInvoice(tx, id); if (!inv) return null; const p = await getPatient(tx, inv.patient_id); return { inv, p }; }); if (!d) notFound(); const { inv, p } = d; const st = s.settings;
  const items = inv.items as { desc: string; qty: number; priceCents: number }[]; const policy = p?.insurers.find((i) => i.company === inv.insurer);
  return <>
    <div className="page-head no-print"><h1>Invoice {inv.number} <InvBadge status={inv.status} /></h1><div className="actions"><Link className="btn" href={`/app/patients/${inv.patient_id}?tab=billing`}>‹ Patient billing</Link><InvoiceActions invoiceId={inv.id} voided={inv.voided} canVoid={can(s, 'manage_staff')} email={p?.email || ''} subject={`Receipt ${inv.number}`} body={`Hi ${p?.first_name},\n\nThank you for your visit. Your receipt ${inv.number} for ${money(inv.total_cents)} is attached.\n\n${s.orgName}`} /></div></div>
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="card pad receipt">
        <div className="flex between" style={{ alignItems: 'flex-start' }}><div><div style={{ fontSize: 18, fontWeight: 700 }}>{s.orgName}</div><div className="small muted">{inv.location_name}<br />{inv.location_address}<br />{inv.location_phone}</div></div><div className="right"><div style={{ fontSize: 16, fontWeight: 700 }}>{inv.voided ? 'VOID · ' : ''}Receipt {inv.number}</div><div className="small muted">{fmtDate(inv.issued_at, tz)}</div></div></div>
        <div className="grid-2 mt"><div><div className="tiny muted">BILL TO</div><div className="bold">{inv.patient_name}</div><div className="small">{inv.patient_address} {inv.patient_city}<br />{inv.patient_email} · {inv.patient_phone}</div></div><div><div className="tiny muted">PRACTITIONER</div><div className="bold">{inv.practitioner_name ? `${inv.practitioner_name}${inv.practitioner_title ? ', ' + inv.practitioner_title : ''}` : '—'}</div>{inv.insurer ? <><div className="tiny muted mt">INSURER</div><div>{inv.insurer}{policy ? ` · Policy ${policy.policy}` : ''}</div></> : null}</div></div>
        <table className="mt"><thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Amount</th></tr></thead><tbody>{items.map((it, i) => <tr key={i}><td>{it.desc}</td><td className="num">{it.qty}</td><td className="num">{money(it.priceCents)}</td><td className="num">{money(it.qty * it.priceCents)}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={3} className="num">Subtotal</td><td className="num">{money(inv.subtotal_cents)}</td></tr>{inv.discount_cents ? <tr><td colSpan={3} className="num">Discount</td><td className="num">-{money(inv.discount_cents)}</td></tr> : null}<tr><td colSpan={3} className="num">{inv.tax_name} {inv.tax_rate_bp / 100}%</td><td className="num">{money(inv.tax_cents)}</td></tr><tr><td colSpan={3} className="num bold">Total</td><td className="num bold">{money(inv.total_cents)}</td></tr>{inv.insurer ? <tr><td colSpan={3} className="num">Billed to {inv.insurer}</td><td className="num">{money(inv.insurer_portion_cents)}</td></tr> : null}{inv.payments.map((pm) => <tr key={pm.id}><td colSpan={3} className="num">Paid · {pm.method} · {fmtShortDate(pm.paid_at, tz)}</td><td className="num">-{money(pm.amount_cents)}</td></tr>)}<tr><td colSpan={3} className="num bold">Balance due</td><td className="num bold">{money(Math.max(0, inv.balance_cents))}</td></tr></tfoot></table>
        <p className="tiny muted mt">{st.cancellationPolicy}</p>
      </div>
      <div className="no-print">
        {!inv.voided && inv.balance_cents > 0 ? <div className="card pad mb"><div className="bold mb">Record a payment</div><PaymentForm invoiceId={inv.id} balance={inv.balance_cents} defaultMethod={inv.insurer && inv.balance_cents <= inv.insurer_portion_cents ? 'Insurance' : 'Credit Card'} /></div> : null}
        {inv.payments.length ? <div className="card pad"><div className="bold mb">Payments</div><div className="list">{inv.payments.map((pm) => <div className="list-item" key={pm.id}><span className="grow">{fmtShortDate(pm.paid_at, tz)} · {pm.method}{pm.note ? ' · ' + pm.note : ''}</span><span className="bold">{money(pm.amount_cents)}</span>{can(s, 'manage_staff') ? <InvoiceActions invoiceId={inv.id} paymentId={pm.id} /> : null}</div>)}</div></div> : null}
      </div>
    </div>
  </>;
}
