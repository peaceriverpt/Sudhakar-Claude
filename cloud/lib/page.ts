import 'server-only';
import { requireSession, type Session } from './auth';
import { withTenant, type Tx } from './db';
import { getLocations, type Location } from './queries';
import { locFilter } from './loc';
/** Common page bootstrap: session, locations, active location filter, and a tenant runner. */
export async function pageCtx() {
  const s = await requireSession();
  const locations = await withTenant(s.orgId, getLocations);
  const loc = await locFilter(locations);
  const run = <T,>(fn: (tx: Tx) => Promise<T>) => withTenant(s.orgId, fn);
  return { s, locations, loc, run, tz: s.settings.timezone };
}
export type PageCtx = { s: Session; locations: Location[]; loc: string | null; tz: string };
export type SP = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';
