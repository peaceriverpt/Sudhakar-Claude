/* Applies db/migrations/*.sql in order, once each, as the owner role. */
import postgres from 'postgres';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sslFor } from '../lib/dbssl';

const url = process.env.DATABASE_OWNER_URL || process.env.DATABASE_URL;
if (!url) { console.error('Set DATABASE_OWNER_URL (owner role) to run migrations.'); process.exit(1); }
const sql = postgres(url, { max: 1, ssl: sslFor(url) });

async function main() {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name as string));
  const dir = join(process.cwd(), 'db', 'migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(f)) continue;
    const text = readFileSync(join(dir, f), 'utf8');
    await sql.begin(async (tx) => { await tx.unsafe(text); await tx`insert into schema_migrations (name) values (${f})`; });
    console.log('applied', f);
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
