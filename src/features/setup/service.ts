import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import {
  employees,
  invitations,
  locations,
  organizations,
  roleAssignments,
  rolePermissions,
  roles,
} from "@/db/schema";
import { generateInviteToken, inviteUrl } from "@/features/invitations/tokens";
import { writeAudit } from "@/server/audit/write";
import { Conflict, Invalid } from "@/server/auth/errors";
import { DEFAULT_ROLE_PERMISSIONS } from "@/server/auth/permissions";
import { withTransaction, type Tx } from "@/server/db/client";

export type OwnerSetupInput = {
  organizationName: string;
  slug: string;
  locationName: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
};

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SYSTEM_ROLES = [
  { key: "owner", name: "Owner", description: "Full access to the organization." },
  { key: "manager", name: "Manager", description: "Runs a location and its team." },
  { key: "employee", name: "Employee", description: "Works shifts at a location." },
] as const;

function required(value: string, label: string): string {
  const v = value.trim();
  if (!v) throw new Invalid(`${label} is required.`);
  return v;
}

/**
 * One-time bootstrap: organization, first location, the three system roles
 * with their default permissions, and an Owner invitation. All in one
 * transaction. Refuses (Conflict) if an active Owner already exists or the
 * slug is taken. Returns the link for the Owner to open; the raw token is
 * never stored or written to the audit log.
 */
export async function runOwnerSetup(
  input: OwnerSetupInput,
  /** Injectable so integration tests run against TEST_DATABASE_URL, never DATABASE_URL. */
  transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T> = withTransaction,
): Promise<{ inviteUrl: string }> {
  const organizationName = required(input.organizationName, "Organization name");
  const slug = required(input.slug, "Slug").toLowerCase();
  const locationName = required(input.locationName, "Location name");
  const email = required(input.ownerEmail, "Owner email").toLowerCase();
  const firstName = required(input.ownerFirstName, "Owner first name");
  const lastName = required(input.ownerLastName, "Owner last name");

  const token = generateInviteToken();
  const link = inviteUrl(token.raw); // fails early if APP_URL is unset

  await transaction(async (tx) => {
    // An active owner = active employee with a non-revoked owner assignment.
    const activeOwners = await tx
      .select({ id: employees.id })
      .from(roleAssignments)
      .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
      .innerJoin(employees, eq(employees.id, roleAssignments.employeeId))
      .where(
        and(
          eq(roles.key, "owner"),
          eq(employees.status, "active"),
          isNull(roleAssignments.revokedAt),
        ),
      )
      .limit(1);
    if (activeOwners.length > 0) {
      throw new Conflict("Setup has already been run: an active Owner exists.");
    }

    const taken = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (taken.length > 0) {
      throw new Conflict(`An organization with the slug "${slug}" already exists.`);
    }

    const [org] = await tx
      .insert(organizations)
      .values({ name: organizationName, slug })
      .returning({ id: organizations.id });
    if (!org) throw new Error("Setup: organization insert returned no row");

    const [location] = await tx
      .insert(locations)
      .values({ organizationId: org.id, name: locationName })
      .returning({ id: locations.id });
    if (!location) throw new Error("Setup: location insert returned no row");

    const roleRows = await tx
      .insert(roles)
      .values(
        SYSTEM_ROLES.map((r) => ({
          organizationId: org.id,
          key: r.key,
          name: r.name,
          description: r.description,
          isSystem: true,
        })),
      )
      .returning({ id: roles.id, key: roles.key });
    const roleIdByKey = new Map(roleRows.map((r) => [r.key, r.id]));

    const permissionRows = SYSTEM_ROLES.flatMap(({ key }) => {
      const roleId = roleIdByKey.get(key);
      if (!roleId) throw new Error(`Setup: missing system role ${key}`);
      return DEFAULT_ROLE_PERMISSIONS[key].map((permission) => ({
        organizationId: org.id,
        roleId,
        permission,
      }));
    });
    await tx.insert(rolePermissions).values(permissionRows);

    const ownerRoleId = roleIdByKey.get("owner");
    if (!ownerRoleId) throw new Error("Setup: missing owner role");

    const [employee] = await tx
      .insert(employees)
      .values({
        organizationId: org.id,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        email,
        status: "invited",
      })
      .returning({ id: employees.id });
    if (!employee) throw new Error("Setup: employee insert returned no row");

    await tx.insert(invitations).values({
      organizationId: org.id,
      employeeId: employee.id,
      email,
      locationId: location.id,
      roleId: ownerRoleId,
      tokenHash: token.hash,
      grantsOrgWide: true,
      invitedByEmployeeId: null,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    await writeAudit(tx, {
      organizationId: org.id,
      locationId: location.id,
      actorEmployeeId: null,
      action: "setup.run",
      entityType: "organization",
      entityId: org.id,
      after: {
        organizationName,
        slug,
        locationName,
        ownerEmail: email,
        ownerEmployeeId: employee.id,
      },
    });
  });

  return { inviteUrl: link };
}
