/* Proves tenant isolation: the app role can only see / write rows for the org set on the transaction. */
import postgres from 'postgres';
const owner = postgres(process.env.DATABASE_OWNER_URL!, { max: 1 });
const app = postgres(process.env.DATABASE_URL!, { max: 1 });
let failures = 0;
const check = (name: string, ok: boolean) => { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) failures++; };

async function main() {
  const [a] = await owner`insert into organizations (name, slug) values ('Org A', 'rls-test-a') returning id`;
  const [b] = await owner`insert into organizations (name, slug) values ('Org B', 'rls-test-b') returning id`;
  await owner`insert into patients (org_id, first_name, last_name) values (${a.id}, 'Alice', 'A'), (${b.id}, 'Bob', 'B')`;

  // no org set: nothing visible
  const none = await app`select count(*)::int as n from patients`;
  check('no org context sees zero patients', none[0].n === 0);

  // org A context
  const seenA = await app.begin(async (tx) => { await tx`select set_config('app.org_id', ${a.id}, true)`; return tx`select first_name from patients`; });
  check('org A sees only Alice', seenA.length === 1 && seenA[0].first_name === 'Alice');

  // org A trying to read B's row by id
  const [bob] = await owner`select id from patients where first_name = 'Bob'`;
  const byId = await app.begin(async (tx) => { await tx`select set_config('app.org_id', ${a.id}, true)`; return tx`select id from patients where id = ${bob.id}`; });
  check('org A cannot read Bob by id', byId.length === 0);

  // org A trying to insert a row tagged with org B
  let blocked = false;
  try { await app.begin(async (tx) => { await tx`select set_config('app.org_id', ${a.id}, true)`; await tx`insert into patients (org_id, first_name, last_name) values (${b.id}, 'Evil', 'X')`; }); } catch { blocked = true; }
  check('org A cannot insert into org B', blocked);

  // org A trying to update B's row: affects 0 rows
  const upd = await app.begin(async (tx) => { await tx`select set_config('app.org_id', ${a.id}, true)`; return tx`update patients set notes = 'hacked' where id = ${bob.id}`; });
  check('org A update of Bob affects 0 rows', upd.count === 0);

  // context does not leak between transactions
  const after = await app`select count(*)::int as n from patients`;
  check('org context cleared after transaction', after[0].n === 0);

  // audit log append-only
  await app.begin(async (tx) => { await tx`select set_config('app.org_id', ${a.id}, true)`; await tx`insert into audit_log (org_id, action, entity) values (${a.id}, 'test', 'x')`; });
  let delBlocked = false;
  try { await app.begin(async (tx) => { await tx`select set_config('app.org_id', ${a.id}, true)`; const r = await tx`delete from audit_log where org_id = ${a.id}`; if (r.count === 0) delBlocked = true; }); } catch { delBlocked = true; }
  check('audit log cannot be deleted by app role', delBlocked);

  await owner`delete from organizations where slug in ('rls-test-a', 'rls-test-b')`;
  await owner.end(); await app.end();
  if (failures) { console.error(`${failures} RLS checks failed`); process.exit(1); }
  console.log('All tenant isolation checks passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
