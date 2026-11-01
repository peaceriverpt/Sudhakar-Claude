import 'server-only';
import { cookies } from 'next/headers';
import type { Location } from './queries';
/** The topbar location filter: a cookie, validated against the current org's locations. */
export async function locFilter(locations: Location[]): Promise<string | null> { const v = (await cookies()).get('cf_loc')?.value; return v && locations.some((l) => l.id === v) ? v : null; }
