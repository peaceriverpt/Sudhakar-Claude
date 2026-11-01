import { apiAuth, apiTenant } from '@/lib/api';
import { availability } from '@/lib/queries';
import { localToUtc } from '@/lib/util';
export async function GET(req: Request) {
  const c = await apiAuth(req); if (c instanceof Response) return c; const u = new URL(req.url); const practitionerId = u.searchParams.get('practitionerId'), locationId = u.searchParams.get('locationId'), treatmentId = u.searchParams.get('treatmentId'), date = u.searchParams.get('date');
  if (!practitionerId || !treatmentId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: 'practitionerId, treatmentId and date=YYYY-MM-DD are required' }, { status: 400 });
  const data = await apiTenant(c, async (tx) => { const [t] = await tx`select duration_min from treatments where id = ${treatmentId}`; if (!t) return null; const slots = await availability(tx, practitionerId, locationId, date, t.duration_min, c.settings.timezone); return slots.map((s) => ({ startsAt: localToUtc(date, s.min, c.settings.timezone).toISOString(), locationId: s.locationId })); });
  if (!data) return Response.json({ error: 'Treatment not found' }, { status: 404 }); return Response.json({ data });
}
