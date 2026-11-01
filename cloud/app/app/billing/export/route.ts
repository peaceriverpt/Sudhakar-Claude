import { pageCtx } from '@/lib/page';
import { can } from '@/lib/auth';
import { listInvoices } from '@/lib/queries';
import { addDaysKey, localToUtc, todayKey } from '@/lib/util';
export async function GET(req: Request) {
  const { s, loc, run, tz } = await pageCtx(); if (!can(s, 'billing')) return new Response('Forbidden', { status: 403 });
  const u = new URL(req.url); const from = u.searchParams.get('from') || addDaysKey(todayKey(tz), -30), to = u.searchParams.get('to') || todayKey(tz);
  const invs = await run((tx) => listInvoices(tx, { from: localToUtc(from, 0, tz), to: localToUtc(addDaysKey(to, 1), 0, tz), locationId: loc, limit: 100000 }));
  const rows = [['Invoice', 'Date', 'Patient', 'Location', 'Practitioner', 'Items', 'Subtotal', 'Tax', 'Total', 'Insurer', 'Insurer portion', 'Paid', 'Balance', 'Status'], ...invs.map((i) => [i.number, new Date(i.issued_at).toISOString().slice(0, 10), i.patient_name, i.location_name, i.practitioner_name, (i.items as { desc: string }[]).map((x) => x.desc).join('; '), i.subtotal_cents / 100, i.tax_cents / 100, i.total_cents / 100, i.insurer, i.insurer_portion_cents / 100, i.paid_cents / 100, i.balance_cents / 100, i.status])];
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  return new Response(csv, { headers: { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="invoices-${from}-to-${to}.csv"` } });
}
