import 'server-only';
import { sql, withTenant, audit, type Tx } from './db';
import { hashToken } from './auth';
import { settingsOf, type OrgSettings } from './util';
export type ApiCtx = { orgId: string; keyId: string; keyName: string; scopes: string[]; settings: OrgSettings };
const buckets = new Map<string, { n: number; reset: number }>();
export async function apiAuth(req: Request): Promise<ApiCtx | Response> {
  const h = req.headers.get('authorization') || ''; const raw = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!raw) return Response.json({ error: 'Missing Authorization: Bearer <api key>' }, { status: 401 });
  const [k] = await sql`select k.id, k.name, k.org_id, k.scopes, o.settings from lookup_api_key(${hashToken(raw)}) k join organizations o on o.id = k.org_id`;
  if (!k) return Response.json({ error: 'Invalid API key' }, { status: 401 });
  const now = Date.now(); const b = buckets.get(k.id) || { n: 0, reset: now + 60000 }; if (now > b.reset) { b.n = 0; b.reset = now + 60000; } b.n++; buckets.set(k.id, b);
  if (b.n > 600) return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
  await sql`select touch_api_key(${k.id})`;
  return { orgId: k.org_id, keyId: k.id, keyName: k.name, scopes: k.scopes, settings: settingsOf(k.settings) };
}
export const needScope = (c: ApiCtx, s: string) => (c.scopes.includes(s) ? null : Response.json({ error: `This key lacks the "${s}" scope` }, { status: 403 }));
export function apiTenant<T>(c: ApiCtx, fn: (tx: Tx) => Promise<T>) { return withTenant(c.orgId, fn); }
export const apiAudit = (tx: Tx, c: ApiCtx, action: string, entity: string, entityId?: string | null, patientId?: string | null) => audit(tx, c.orgId, { label: `API key: ${c.keyName}` }, { action, entity, entityId, patientId });
