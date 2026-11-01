/** Hosted databases require encrypted connections; a local database usually does not support them. */
export const sslFor = (url: string) => (/@(localhost|127\.0\.0\.1)(:|\/)/.test(url) || process.env.DATABASE_SSL === 'disable' ? false : ('require' as const));
