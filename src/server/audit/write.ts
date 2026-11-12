import "server-only";
import { auditLog } from "@/db/schema";
import type { Tx } from "@/server/db/client";

export type AuditAction =
  | "setup.run"
  | "invitation.created"
  | "invitation.revoked"
  | "invitation.accepted"
  | "role.granted"
  | "role.revoked"
  | "employee.status_changed"
  | "employee.profile_updated"
  | "role.created"
  | "role.permissions_changed"
  | "location.created"
  | "location.updated";

export type AuditEntry = {
  organizationId: string;
  locationId?: string | null;
  /** Null for system actions such as the setup command. */
  actorEmployeeId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  /** JSON-serialisable snapshots. Never put tokens, secrets or invite links here. */
  before?: unknown;
  after?: unknown;
};

/**
 * Append one audit row inside the caller's transaction, so the audit entry and
 * the change it describes commit or roll back together.
 */
export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    organizationId: entry.organizationId,
    locationId: entry.locationId ?? null,
    actorEmployeeId: entry.actorEmployeeId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}
