import { apiAuth, apiTenant } from '@/lib/api';
import { getTreatments } from '@/lib/queries';
export async function GET(req: Request) { const c = await apiAuth(req); if (c instanceof Response) return c; const rows = await apiTenant(c, (tx) => getTreatments(tx)); return Response.json({ data: rows.map((t) => ({ id: t.id, name: t.name, discipline: t.discipline, durationMin: t.duration_min, priceCents: t.price_cents, isAssessment: t.is_assessment, online: t.online })) }); }
