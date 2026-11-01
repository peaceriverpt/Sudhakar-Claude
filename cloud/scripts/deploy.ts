/* Runs on every Vercel deploy (see vercel.json): applies new migrations, then optionally loads the demo clinic.
   Needs DATABASE_OWNER_URL. Set SEED_DEMO=1 to create the demo clinic if it does not exist yet (it is never overwritten). */
import { execSync } from 'node:child_process';
import postgres from 'postgres';
import { sslFor } from '../lib/dbssl';

async function main() {
  if (!process.env.DATABASE_OWNER_URL) { console.error('DATABASE_OWNER_URL is not set. Add it in Vercel → Settings → Environment Variables.'); process.exit(1); }
  execSync('npx tsx scripts/migrate.ts', { stdio: 'inherit' });
  if (process.env.SEED_DEMO === '1') {
    const sql = postgres(process.env.DATABASE_OWNER_URL, { max: 1, ssl: sslFor(process.env.DATABASE_OWNER_URL) });
    const [demo] = await sql`select 1 from organizations where slug = 'demo'`; await sql.end();
    if (demo) console.log('Demo clinic already exists, leaving it alone.');
    else execSync('npx tsx scripts/seed.ts', { stdio: 'inherit' });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
