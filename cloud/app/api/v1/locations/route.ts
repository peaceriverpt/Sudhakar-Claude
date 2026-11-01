import { apiAuth, apiTenant } from '@/lib/api';
import { getLocations } from '@/lib/queries';
export async function GET(req: Request) { const c = await apiAuth(req); if (c instanceof Response) return c; const rows = await apiTenant(c, getLocations); return Response.json({ data: rows.map((l) => ({ id: l.id, name: l.name, address: l.address, phone: l.phone, timezone: l.timezone })) }); }
