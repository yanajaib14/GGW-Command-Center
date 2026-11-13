import "server-only";
import { and, eq } from "drizzle-orm";
import { employees, organizations } from "@/db/schema";
import type { Actor } from "@/server/auth/actor";
import { Forbidden, NotFound } from "@/server/auth/errors";
import type { Tx } from "./client";

/**
 * Serialise changes that can reduce the organization's last Owner or last
 * active location. Take this lock first (before any employee or assignment
 * row lock) so two such changes queue up instead of both passing their check.
 * No other code locks the organization row, so ordering cannot deadlock.
 */
export async function lockOrganization(
  tx: Tx,
  organizationId: string,
): Promise<void> {
  const [row] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .for("update");
  if (!row) throw new NotFound();
}

/**
 * The actor object was loaded at the start of the request. Re-check inside the
 * transaction that they are still an active employee, so a suspension that
 * landed meanwhile stops them from making further changes.
 */
export async function assertActorActive(tx: Tx, actor: Actor): Promise<void> {
  const [me] = await tx
    .select({ status: employees.status })
    .from(employees)
    .where(
      and(
        eq(employees.id, actor.employeeId),
        eq(employees.organizationId, actor.organizationId),
      ),
    );
  if (me?.status !== "active") throw new Forbidden();
}
