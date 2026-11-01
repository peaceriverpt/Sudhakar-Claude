import { apiAuth, apiTenant } from '@/lib/api';
import { getPractitioners } from '@/lib/queries';
export async function GET(req: Request) { const c = await apiAuth(req); if (c instanceof Response) return c; const rows = await apiTenant(c, (tx) => getPractitioners(tx)); return Response.json({ data: rows.map((p) => ({ id: p.id, name: p.name, title: p.title, discipline: p.discipline, online: p.online, locationIds: p.locationIds, treatmentIds: p.treatmentIds })) }); }
