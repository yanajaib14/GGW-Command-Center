import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { employees, locations, roleAssignments } from "@/db/schema";
import { writeAudit } from "@/server/audit/write";
import { hasPermission, type Actor } from "@/server/auth/actor";
import { Forbidden, Invalid, NotFound } from "@/server/auth/errors";
import { withTransaction, type Tx } from "@/server/db/client";

export type TxRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

/** Injectable so integration tests run on TEST_DATABASE_URL, never DATABASE_URL. */
export type StaffDeps = { transaction?: TxRunner };

export type ProfileInput = { displayName: string; phone: string | null };

// Only these two fields exist in the schema: anything else a caller sends
// (email, status, organization) is stripped, never written.
const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(60, "Your name can be up to 60 characters."),
  phone: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[0-9 +()-]{1,20}$/.test(v), {
      message: "Enter a phone number using digits, spaces and + ( ) -, up to 20 characters.",
    }),
});

/**
 * Update the signed-in employee's own display name and phone. Always acts on
 * `actor.employeeId`; there is no way to name another employee.
 */
export async function updateOwnProfile(
  actor: Actor,
  rawInput: ProfileInput,
  deps: StaffDeps = {},
): Promise<void> {
  if (!hasPermission(actor, "profile.edit_own", "any")) throw new Forbidden();
  const parsed = profileSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Invalid(parsed.error.issues[0]?.message ?? "That input is not valid.");
  }
  const { displayName, phone } = parsed.data;
  const transaction = deps.transaction ?? withTransaction;

  await transaction(async (tx) => {
    const [before] = await tx
      .select({ displayName: employees.displayName, phone: employees.phone })
      .from(employees)
      .where(
        and(
          eq(employees.id, actor.employeeId),
          eq(employees.organizationId, actor.organizationId),
        ),
      )
      .for("update");
    if (!before) throw new NotFound();

    await tx
      .update(employees)
      .set({ displayName, phone })
      .where(
        and(
          eq(employees.id, actor.employeeId),
          eq(employees.organizationId, actor.organizationId),
        ),
      );
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorEmployeeId: actor.employeeId,
      action: "employee.profile_updated",
      entityType: "employee",
      entityId: actor.employeeId,
      before,
      after: { displayName, phone },
    });
  });
}

export type HubContext = {
  locationName: string | null;
  timezone: string;
  phone: string | null;
};

const DEFAULT_TIMEZONE = "America/Phoenix";

/**
 * What the Hub and profile pages show about the signed-in employee: their
 * first assigned location (name, timezone) and phone. Org-wide staff with no
 * location assignment get no location name.
 */
export async function getHubContext(
  actor: Actor,
  deps: StaffDeps = {},
): Promise<HubContext> {
  const transaction = deps.transaction ?? withTransaction;
  return transaction(async (tx) => {
    const [me] = await tx
      .select({ phone: employees.phone })
      .from(employees)
      .where(
        and(
          eq(employees.id, actor.employeeId),
          eq(employees.organizationId, actor.organizationId),
        ),
      );
    const [loc] = await tx
      .select({ name: locations.name, timezone: locations.timezone })
      .from(roleAssignments)
      .innerJoin(
        locations,
        and(
          eq(locations.id, roleAssignments.locationId),
          eq(locations.organizationId, roleAssignments.organizationId),
        ),
      )
      .where(
        and(
          eq(roleAssignments.employeeId, actor.employeeId),
          eq(roleAssignments.organizationId, actor.organizationId),
          isNull(roleAssignments.revokedAt),
          eq(locations.status, "active"),
        ),
      )
      .orderBy(roleAssignments.grantedAt)
      .limit(1);
    return {
      locationName: loc?.name ?? null,
      timezone: loc?.timezone ?? DEFAULT_TIMEZONE,
      phone: me?.phone ?? null,
    };
  });
}
