'use client';
import { useActionState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addPayment, removePayment, voidInvoice } from '@/lib/actions';
import type { Result } from '@/lib/actions';
import { fromCents, PAY_METHODS } from '@/lib/util';
export function PaymentForm({ invoiceId, balance, defaultMethod }: { invoiceId: string; balance: number; defaultMethod: string }) {
  const [state, action, pending] = useActionState<Result | null, FormData>(addPayment, null);
  return <form action={action} className="row"><input type="hidden" name="invoiceId" value={invoiceId} /><select name="method" defaultValue={defaultMethod}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select><input type="number" name="amount" step="0.01" min="0.01" max={fromCents(balance)} defaultValue={fromCents(balance)} required /><input name="note" placeholder="Reference / note" /><button className="btn primary" disabled={pending}>Add payment</button>{state && !state.ok ? <div className="err" style={{ flexBasis: '100%' }}>{state.error}</div> : null}</form>;
}
export function InvoiceActions({ invoiceId, paymentId, voided, canVoid, email, subject, body }: { invoiceId: string; paymentId?: string; voided?: boolean; canVoid?: boolean; email?: string; subject?: string; body?: string }) {
  const router = useRouter(); const [pending, start] = useTransition();
  if (paymentId) return <button className="btn xs" disabled={pending} title="Remove payment" onClick={() => { if (confirm('Remove this payment?')) start(async () => { await removePayment(invoiceId, paymentId); router.refresh(); }); }}>×</button>;
  return <>{!voided && canVoid ? <button className="btn danger" disabled={pending} onClick={() => { if (confirm('Void this invoice? It will be excluded from revenue reports.')) start(async () => { await voidInvoice(invoiceId); router.refresh(); }); }}>Void</button> : null}
    {email ? <a className="btn" href={`mailto:${email}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`}>✉ Email</a> : null}<button className="btn" onClick={() => window.print()}>🖨 Print</button></>;
}
