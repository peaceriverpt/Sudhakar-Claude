import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { sql } from './db';
import { settingsOf, type OrgSettings } from './util';

const COOKIE = 'cf_session';
const SESSION_DAYS = 14;
export const hashToken = (t: string) => createHash('sha256').update(t + (process.env.SESSION_SECRET || '')).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, hash: string) => bcrypt.compare(p, hash);

export type Role = 'owner' | 'admin' | 'front_desk' | 'practitioner';
export type Session = {
  userId: string; email: string; name: string; sessionId: string;
  orgId: string; orgName: string; orgSlug: string; role: Role; practitionerId: string | null; settings: OrgSettings;
  orgs: { id: string; name: string; slug: string; role: Role }[];
};

export async function createSession(userId: string, orgId: string | null) {
  const token = newToken();
  const h = await headers();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await sql`insert into sessions (user_id, token_hash, org_id, expires_at, ip, user_agent) values (${userId}, ${hashToken(token)}, ${orgId}, ${expires}, ${h.get('x-forwarded-for')?.split(',')[0] ?? null}, ${h.get('user-agent')?.slice(0, 300) ?? null})`;
  await sql`update users set last_login_at = now() where id = ${userId}`;
  const c = await cookies();
  c.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires });
}
export async function destroySession() {
  const c = await cookies(); const token = c.get(COOKIE)?.value;
  if (token) await sql`delete from sessions where token_hash = ${hashToken(token)}`;
  c.delete(COOKIE);
}
export async function switchOrg(orgId: string) {
  const c = await cookies(); const token = c.get(COOKIE)?.value; if (!token) return;
  await sql`update sessions s set org_id = ${orgId} from memberships m where s.token_hash = ${hashToken(token)} and m.user_id = s.user_id and m.org_id = ${orgId} and m.active`;
}

/** Current signed-in user + active organization, or null. Cached per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const c = await cookies(); const token = c.get(COOKIE)?.value; if (!token) return null;
  const rows = await sql`select s.id as session_id, s.org_id as session_org, u.id as user_id, u.email, u.name from sessions s join users u on u.id = s.user_id where s.token_hash = ${hashToken(token)} and s.expires_at > now()`;
  if (!rows.length) return null;
  const r = rows[0];
  const orgs = await sql`select o.id, o.name, o.slug, o.settings, m.role, m.practitioner_id from memberships m join organizations o on o.id = m.org_id where m.user_id = ${r.user_id} and m.active order by o.name`;
  if (!orgs.length) return null;
  const active = orgs.find((o) => o.id === r.session_org) ?? orgs[0];
  return { userId: r.user_id, email: r.email, name: r.name, sessionId: r.session_id, orgId: active.id, orgName: active.name, orgSlug: active.slug, role: active.role, practitionerId: active.practitioner_id, settings: settingsOf(active.settings), orgs: orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug, role: o.role })) };
});
export async function requireSession(): Promise<Session> { const s = await getSession(); if (!s) redirect('/login'); return s; }
export function can(s: Session, action: 'manage_org' | 'manage_staff' | 'billing' | 'chart' | 'schedule' | 'reports' | 'view_patients') {
  const r = s.role;
  switch (action) {
    case 'manage_org': return r === 'owner';
    case 'manage_staff': return r === 'owner' || r === 'admin';
    case 'reports': return r === 'owner' || r === 'admin';
    case 'billing': return r !== 'practitioner';
    case 'chart': return r === 'practitioner' || r === 'owner' || r === 'admin';
    default: return true;
  }
}
export const actorOf = (s: Session) => ({ userId: s.userId, label: `${s.name} <${s.email}>` });
