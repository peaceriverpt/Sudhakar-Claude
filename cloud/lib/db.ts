import 'server-only';
import postgres, { type Sql, type TransactionSql } from 'postgres';

declare global { var __cf_sql: Sql | undefined; }

/** Application connection: clinicflow_app role, subject to row-level security. */
export const sql: Sql = global.__cf_sql ?? postgres(process.env.DATABASE_URL!, { max: 10, idle_timeout: 20, prepare: false, transform: { undefined: null } });
if (process.env.NODE_ENV !== 'production') global.__cf_sql = sql;

export type Tx = TransactionSql;

/**
 * Runs `fn` inside a transaction whose row-level-security context is pinned to one organization.
 * Every tenant query in the app goes through here; forgetting an org_id filter can never leak data across clinics.
 */
export async function withTenant<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.org_id', ${orgId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

export type AuditEntry = { action: string; entity: string; entityId?: string | null; patientId?: string | null; details?: Record<string, unknown> };
export async function audit(tx: Tx, orgId: string, actor: { userId?: string | null; label: string; ip?: string | null }, e: AuditEntry) {
  await tx`insert into audit_log (org_id, user_id, actor, action, entity, entity_id, patient_id, details, ip)
    values (${orgId}, ${actor.userId ?? null}, ${actor.label}, ${e.action}, ${e.entity}, ${e.entityId ?? null}, ${e.patientId ?? null}, ${tx.json((e.details ?? {}) as never)}, ${actor.ip ?? null})`;
}
