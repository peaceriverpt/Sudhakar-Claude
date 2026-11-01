import { can } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getAppointment, getLocations, getPractitioners, getTreatments, getProducts, getPatient, getChart, patientCharts, patientBalance, getTemplates } from '@/lib/queries';
import { age, fmtDate, fmtShortDate, fmtTime, zoned, type InvoiceItem } from '@/lib/util';
import type { Session } from '@/lib/auth';
import AppointmentDialog from './AppointmentDialog';
import CheckoutDialog from './CheckoutDialog';
import ChartDialog from './ChartDialog';
import type { SP } from '@/lib/page';
import { one } from '@/lib/page';

/** Renders whichever dialog the URL asks for: ?appt=ID, ?new=1, ?checkout=APPT, ?sale=1, ?chart=ID, ?chartFor=APPT */
export default async function Dialogs({ sp, s }: { sp: SP; s: Session }) {
  const tz = s.settings.timezone; const apptId = one(sp.appt), isNew = one(sp.new), checkout = one(sp.checkout), sale = one(sp.sale), chartId = one(sp.chart), chartFor = one(sp.chartFor);
  if (!apptId && !isNew && !checkout && !sale && !chartId && !chartFor) return null;
  return withTenant(s.orgId, async (tx) => {
    if (apptId || isNew) {
      const [locations, practitioners, treatments] = await Promise.all([getLocations(tx), getPractitioners(tx), getTreatments(tx)]);
      const lists = { locations: locations.map((l) => ({ id: l.id, name: l.name })), practitioners: practitioners.map((p) => ({ id: p.id, name: p.name, discipline: p.discipline, color: p.color, locationIds: p.locationIds, treatmentIds: p.treatmentIds })), treatments: treatments.map((t) => ({ id: t.id, name: t.name, duration_min: t.duration_min, price_cents: t.price_cents, discipline: t.discipline })) };
      if (apptId) {
        const a = await getAppointment(tx, apptId); if (!a) return null; const z = zoned(a.starts_at, tz); const bal = await patientBalance(tx, a.patient_id);
        const invStatus = a.invoice_id ? ((a.invoice_paid ?? 0) >= (a.invoice_total ?? 0) ? 'paid' : (a.invoice_paid ?? 0) > 0 ? 'partial' : 'unpaid') : null;
        return <AppointmentDialog mode="edit" {...lists} canChart={can(s, 'chart')} canBill={can(s, 'billing')} appt={{ id: a.id, patientId: a.patient_id, patientName: a.patient_name, patientPhone: a.patient_phone, patientAlerts: a.patient_alerts, patientBalance: bal, status: a.status, source: a.source, locationId: a.location_id, practitionerId: a.practitioner_id, treatmentId: a.treatment_id, date: z.dateKey, min: z.minutes, notes: a.notes, chartId: a.chart_id, chartSigned: a.chart_signed, invoiceId: a.invoice_id, invoiceNumber: a.invoice_number, invoiceStatus: invStatus, label: `${fmtDate(a.starts_at, tz)} ${fmtTime(a.starts_at, tz)}` }} />;
      }
      return <AppointmentDialog mode="new" {...lists} canChart={can(s, 'chart')} canBill={can(s, 'billing')} prefill={{ date: one(sp.date2) || one(sp.date) || undefined, min: sp.min ? Number(one(sp.min)) : undefined, practitionerId: one(sp.pr) || undefined, locationId: one(sp.loc) || undefined, patientId: one(sp.patient) || undefined, patientName: one(sp.patientName) || undefined, treatmentId: one(sp.tx) || undefined }} />;
    }
    if (checkout || sale) {
      if (!can(s, 'billing')) return null;
      const [locations, practitioners, treatments, products] = await Promise.all([getLocations(tx), getPractitioners(tx), getTreatments(tx), getProducts(tx)]);
      const base = { locations: locations.map((l) => ({ id: l.id, name: l.name })), practitioners: practitioners.map((p) => ({ id: p.id, name: p.name })), treatments: treatments.map((t) => ({ id: t.id, name: t.name, price_cents: t.price_cents, taxable: t.taxable })), products: products.map((t) => ({ id: t.id, name: t.name, price_cents: t.price_cents, taxable: t.taxable })), taxName: s.settings.taxName, taxRateBp: s.settings.taxRateBp };
      if (checkout) {
        const a = await getAppointment(tx, checkout); if (!a) return null; if (a.invoice_id) return null; const pt = await getPatient(tx, a.patient_id); const t = treatments.find((x) => x.id === a.treatment_id);
        const items: InvoiceItem[] = t ? [{ id: 'tx', desc: t.name, qty: 1, priceCents: t.price_cents, taxable: t.taxable, kind: 'treatment' }] : [];
        return <CheckoutDialog {...base} title={`Check out · ${a.patient_name}`} patient={{ id: a.patient_id, name: a.patient_name }} appointmentId={a.id} locationId={a.location_id} practitionerId={a.practitioner_id} initialItems={items} insurers={(pt?.insurers || []).map((i) => ({ company: i.company, coverage_pct: i.coverage_pct }))} />;
      }
      const pid = one(sp.patient); const pt = pid ? await getPatient(tx, pid) : null;
      return <CheckoutDialog {...base} title="New sale" patient={pt ? { id: pt.id, name: `${pt.first_name} ${pt.last_name}` } : null} appointmentId={null} locationId={one(sp.loc) || locations[0]?.id} practitionerId={null} initialItems={[]} insurers={(pt?.insurers || []).map((i) => ({ company: i.company, coverage_pct: i.coverage_pct }))} />;
    }
    if (chartId || chartFor) {
      if (!can(s, 'chart')) return null;
      const templates = await getTemplates(tx);
      let chart = chartId ? await getChart(tx, chartId) : null; const appt = chartFor ? await getAppointment(tx, chartFor) : chart?.appointment_id ? await getAppointment(tx, chart.appointment_id) : null;
      if (!chart && appt?.chart_id) chart = await getChart(tx, appt.chart_id);
      const patientId = chart?.patient_id || appt?.patient_id; if (!patientId) return null; const pt = await getPatient(tx, patientId); if (!pt) return null;
      const prs = await getPractitioners(tx); const pr = prs.find((x) => x.id === (chart?.practitioner_id || appt?.practitioner_id));
      const treatment = appt ? (await getTreatments(tx)).find((t) => t.id === appt.treatment_id) : null;
      const byDisc = templates.filter((t) => t.discipline === pr?.discipline); const def = (treatment?.is_assessment && byDisc[0]) || byDisc.find((t) => !/initial|assessment/i.test(t.name)) || byDisc[0] || templates[0];
      const prior = (await patientCharts(tx, patientId)).filter((x) => x.id !== chart?.id && (!chart || x.service_date < chart.service_date));
      return <ChartDialog templates={templates.map((t) => ({ id: t.id, name: t.name, discipline: t.discipline, sections: t.sections }))} defaultTemplateId={def?.id || ''} appointmentId={appt?.id || null}
        patient={{ id: pt.id, name: `${pt.first_name} ${pt.last_name}`, age: age(pt.dob), alerts: pt.alerts }} context={`${appt ? `${fmtDate(appt.starts_at, tz)} · ${appt.treatment_name} · ` : ''}${pr?.name || ''}`}
        chart={chart ? { id: chart.id, templateId: chart.template_id, templateName: chart.template_name, fields: chart.fields, signed: chart.signed, signedLabel: chart.signed_at ? `${fmtShortDate(chart.signed_at, tz)} ${fmtTime(chart.signed_at, tz)}` : '', addenda: chart.addenda || [], practitionerName: chart.practitioner_name, dateLabel: fmtShortDate(chart.service_date, tz) } : null}
        prior={prior.map((x) => ({ id: x.id, dateLabel: fmtShortDate(x.service_date, tz), templateName: x.template_name, templateId: x.template_id, practitionerName: x.practitioner_name, fields: x.fields }))} />;
    }
    return null;
  });
}
