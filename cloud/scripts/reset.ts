/* DEV ONLY: drops everything and re-applies migrations. */
import postgres from 'postgres';
import { execSync } from 'node:child_process';
const owner = postgres(process.env.DATABASE_OWNER_URL!, { max: 1 });
async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('refusing to reset a production database');
  await owner`drop schema public cascade`; await owner`create schema public`;
  await owner`grant usage on schema public to clinicflow_app`;
  await owner.end();
  execSync('npx tsx scripts/migrate.ts', { stdio: 'inherit' });
}
main().catch((e) => { console.error(e); process.exit(1); });
