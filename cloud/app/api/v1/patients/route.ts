import { apiAuth, apiTenant, apiAudit, needScope } from '@/lib/api';
export async function GET(req: Request) {
  const c = await apiAuth(req); if (c instanceof Response) return c; const deny = needScope(c, 'read'); if (deny) return deny; const q = new URL(req.url).searchParams.get('q') || '';
  const data = await apiTenant(c, async (tx) => { const like = `%${q}%`; const rows = await tx`select id, first_name, last_name, email, phone, dob, created_at from patients where ${q ? tx`first_name || ' ' || last_name ilike ${like} or email ilike ${like} or phone ilike ${like}` : tx`true`} order by last_name, first_name limit 100`; await apiAudit(tx, c, 'api.patients.list', 'patient'); return rows.map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email, phone: r.phone, dob: r.dob, createdAt: r.created_at })); });
  return Response.json({ data });
}
