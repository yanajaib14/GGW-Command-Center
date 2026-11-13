import "server-only";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { auditLog, employees, locations } from "@/db/schema";
import { hasPermission, type Actor } from "@/server/auth/actor";
import { Forbidden, Invalid } from "@/server/auth/errors";
import { withTransaction, type Tx } from "@/server/db/client";

export type TxRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

/** Injectable so integration tests run on TEST_DATABASE_URL, never DATABASE_URL. */
export type AuditDeps = { transaction?: TxRunner };

/**
 * Deliberately narrow: no `before` / `after` snapshots, so nothing sensitive
 * can reach the page even if a future audit row carries it.
 */
export type AuditRow = {
  id: string;
  createdAt: Date;
  action: string;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  locationName: string | null;
};

/** Keyset cursor. `id` breaks ties between rows written in one transaction. */
export type AuditCursor = { createdAt: Date; id: string };

export const AUDIT_PAGE_SIZE = 50;
const MAX_LIMIT = 100;

/**
 * Newest first, this organization only. Needs `audit.view` organization-wide.
 * Pages by `created_at` (compared at millisecond precision, the precision of
 * a JS Date) with the row id as tie-breaker; pass the last row you got as
 * `before`. A bare Date pages by time alone.
 */
export async function listAudit(
  actor: Actor,
  opts: { limit?: number; before?: Date | AuditCursor } = {},
  deps: AuditDeps = {},
): Promise<AuditRow[]> {
  if (!hasPermission(actor, "audit.view", "organization")) throw new Forbidden();
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? AUDIT_PAGE_SIZE) || 1, 1), MAX_LIMIT);
  if (opts.before && !(opts.before instanceof Date) && !z.uuid().safeParse(opts.before.id).success) {
    throw new Invalid("That page marker is not valid.");
  }
  const transaction = deps.transaction ?? withTransaction;

  const ms =sql`date_trunc('milliseconds', ${auditLog.createdAt})`;
  let cursor: SQL | undefined;
  if (opts.before) {
    const at = opts.before instanceof Date ? opts.before : opts.before.createdAt;
    const iso = at.toISOString();
    cursor =
      opts.before instanceof Date
        ? sql`${ms} < ${iso}::timestamptz`
        : sql`(${ms} < ${iso}::timestamptz or (${ms} = ${iso}::timestamptz and ${auditLog.id} < ${opts.before.id}::uuid))`;
  }

  return transaction(async (tx) => {
    const orgId = actor.organizationId;
    const rows = await tx
      .select({
        id: auditLog.id,
        // Truncated to milliseconds in SQL so the Date round-trips exactly.
        createdAtText: sql<string>`to_char(${ms} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        action: auditLog.action,
        actorName: employees.displayName,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        locationName: locations.name,
      })
      .from(auditLog)
      .leftJoin(
        employees,
        and(
          eq(employees.id, auditLog.actorEmployeeId),
          eq(employees.organizationId, orgId),
        ),
      )
      .leftJoin(
        locations,
        and(eq(locations.id, auditLog.locationId), eq(locations.organizationId, orgId)),
      )
      .where(and(eq(auditLog.organizationId, orgId), cursor))
      .orderBy(desc(ms), desc(auditLog.id))
      .limit(limit);

    return rows.map(({ createdAtText, ...rest }) => ({
      ...rest,
      createdAt: new Date(createdAtText),
    }));
  });
}

/** One page plus whether more exist (fetches one extra row to know). */
export async function listAuditPage(
  actor: Actor,
  before?: AuditCursor,
  deps: AuditDeps = {},
): Promise<{ rows: AuditRow[]; hasMore: boolean }> {
  const rows = await listAudit(actor, { limit: AUDIT_PAGE_SIZE + 1, before }, deps);
  return { rows: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE };
}
