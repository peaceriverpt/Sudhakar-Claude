import { z } from 'zod';
import { apiAuth, apiTenant, apiAudit, needScope } from '@/lib/api';
import { appointmentsBetween, conflicts } from '@/lib/queries';
export async function GET(req: Request) {
  const c = await apiAuth(req); if (c instanceof Response) return c; const deny = needScope(c, 'read'); if (deny) return deny; const u = new URL(req.url);
  const from = new Date(u.searchParams.get('from') || Date.now()), to = new Date(u.searchParams.get('to') || Date.now() + 7 * 86400000); if (isNaN(+from) || isNaN(+to)) return Response.json({ error: 'from/to must be ISO dates' }, { status: 400 });
  const data = await apiTenant(c, async (tx) => { const rows = await appointmentsBetween(tx, from, to, { locationId: u.searchParams.get('locationId'), practitionerId: u.searchParams.get('practitionerId') }); await apiAudit(tx, c, 'api.appointments.list', 'appointment'); return rows.map((a) => ({ id: a.id, patientId: a.patient_id, patientName: a.patient_name, practitionerId: a.practitioner_id, locationId: a.location_id, treatmentId: a.treatment_id, startsAt: a.starts_at, endsAt: a.ends_at, status: a.status, source: a.source })); });
  return Response.json({ data });
}
const schema = z.object({ patient: z.object({ first: z.string().min(1), last: z.string().min(1), email: z.string().email(), phone: z.string().optional() }), practitionerId: z.string().uuid(), locationId: z.string().uuid(), treatmentId: z.string().uuid(), startsAt: z.string().datetime(), notes: z.string().max(1000).optional() });
export async function POST(req: Request) {
  const c = await apiAuth(req); if (c instanceof Response) return c; const deny = needScope(c, 'write'); if (deny) return deny;
  const p = schema.safeParse(await req.json().catch(() => null)); if (!p.success) return Response.json({ error: 'Invalid body', issues: p.error.issues }, { status: 400 }); const d = p.data;
  const result = await apiTenant(c, async (tx) => {
    const [t] = await tx`select duration_min from treatments where id = ${d.treatmentId} and active`; if (!t) return { error: 'Treatment not found', status: 404 };
    const start = new Date(d.startsAt), end = new Date(start.getTime() + t.duration_min * 60000); if ((await conflicts(tx, d.practitionerId, start, end)).length) return { error: 'Time slot is not available', status: 409 };
    let [pt] = await tx`select id from patients where lower(email) = ${d.patient.email.toLowerCase()} limit 1`;
    if (!pt) [pt] = await tx`insert into patients (org_id, first_name, last_name, email, phone, home_location_id, referred_by) values (${c.orgId}, ${d.patient.first}, ${d.patient.last}, ${d.patient.email}, ${d.patient.phone || ''}, ${d.locationId}, 'API') returning id`;
    const [a] = await tx`insert into appointments (org_id, patient_id, practitioner_id, location_id, treatment_id, starts_at, ends_at, notes, source) values (${c.orgId}, ${pt.id}, ${d.practitionerId}, ${d.locationId}, ${d.treatmentId}, ${start}, ${end}, ${d.notes || ''}, 'api') returning id, starts_at, ends_at`;
    await apiAudit(tx, c, 'api.appointments.create', 'appointment', a.id, pt.id); return { data: { id: a.id, patientId: pt.id, startsAt: a.starts_at, endsAt: a.ends_at, status: 'booked' } };
  });
  if ('error' in result) return Response.json({ error: result.error }, { status: result.status }); return Response.json(result, { status: 201 });
}
