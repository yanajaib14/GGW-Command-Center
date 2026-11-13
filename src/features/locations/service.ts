import "server-only";
import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { locations } from "@/db/schema";
import { writeAudit } from "@/server/audit/write";
import { allowedLocationIds, hasPermission, type Actor } from "@/server/auth/actor";
import { Forbidden, Invalid, NotFound } from "@/server/auth/errors";
import { withTransaction, type Tx } from "@/server/db/client";
import { assertActorActive, lockOrganization } from "@/server/db/locks";

export type TxRunner = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

/** Injectable so integration tests run on TEST_DATABASE_URL, never DATABASE_URL. */
export type LocationDeps = { transaction?: TxRunner };

export const DEFAULT_TIMEZONE = "America/Phoenix";

export type LocationStatus = "active" | "closed";

export type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  status: LocationStatus;
};

let zones: Set<string> | undefined;

/** Every IANA zone this runtime knows, for validation and the form's list. */
export function supportedTimezones(): string[] {
  zones ??= new Set(Intl.supportedValuesOf("timeZone"));
  return [...zones];
}

function isTimezone(value: string): boolean {
  zones ??= new Set(Intl.supportedValuesOf("timeZone"));
  return zones.has(value);
}

export async function listLocations(
  actor: Actor,
  deps: LocationDeps = {},
): Promise<LocationRow[]> {
  if (!hasPermission(actor, "locations.manage", "any")) throw new Forbidden();
  const allowed = allowedLocationIds(actor, "locations.manage");
  if (allowed !== "all" && allowed.length === 0) return [];
  const transaction = deps.transaction ?? withTransaction;
  return transaction((tx) =>
    tx
      .select({
        id: locations.id,
        name: locations.name,
        address: locations.address,
        timezone: locations.timezone,
        status: locations.status,
      })
      .from(locations)
      .where(
        and(
          eq(locations.organizationId, actor.organizationId),
          allowed === "all" ? undefined : inArray(locations.id, allowed),
        ),
      )
      .orderBy(asc(locations.status), asc(locations.name)),
  );
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name for the location.")
  .max(80, "The name can be up to 80 characters.");

const addressSchema = z
  .string()
  .trim()
  .max(200, "The address can be up to 200 characters.")
  .nullish()
  .transform((v) => (v ? v : null));

const timezoneSchema = z
  .string()
  .refine(isTimezone, { message: "Choose a time zone from the list." });

const createSchema = z.object({
  name: nameSchema,
  address: addressSchema,
  timezone: timezoneSchema.default(DEFAULT_TIMEZONE),
});

const updateSchema = z.object({
  name: nameSchema.optional(),
  address: addressSchema.optional(),
  timezone: timezoneSchema.optional(),
  status: z.enum(["active", "closed"], { message: "Choose open or closed." }).optional(),
});

/** Add a location. Needs `locations.manage` organization-wide. */
export async function createLocation(
  actor: Actor,
  rawInput: { name: string; address?: string | null; timezone?: string },
  deps: LocationDeps = {},
): Promise<string> {
  if (!hasPermission(actor, "locations.manage", "organization")) throw new Forbidden();
  const parsed = createSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Invalid(parsed.error.issues[0]?.message ?? "That input is not valid.");
  }
  const { name, address, timezone } = parsed.data;
  const transaction = deps.transaction ?? withTransaction;

  return transaction(async (tx) => {
    await assertActorActive(tx, actor);
    const [created] = await tx
      .insert(locations)
      .values({ organizationId: actor.organizationId, name, address, timezone })
      .returning({ id: locations.id });
    if (!created) throw new Error("location insert returned no row");
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      locationId: created.id,
      actorEmployeeId: actor.employeeId,
      action: "location.created",
      entityType: "location",
      entityId: created.id,
      after: { name, address, timezone, status: "active" },
    });
    return created.id;
  });
}

/**
 * Change a location. Needs `locations.manage` at that location; opening or
 * closing it needs organization scope. Closing keeps the row and the
 * assignments (they grant nothing while closed). The last active location
 * cannot be closed.
 */
export async function updateLocation(
  actor: Actor,
  locationIdInput: string,
  rawPatch: {
    name?: string;
    address?: string | null;
    timezone?: string;
    status?: LocationStatus;
  },
  deps: LocationDeps = {},
): Promise<void> {
  const idParsed = z.uuid().safeParse(locationIdInput);
  if (!idParsed.success) throw new Invalid("We could not find that location.");
  const locationId = idParsed.data;
  if (!hasPermission(actor, "locations.manage", { locationId })) throw new Forbidden();
  const parsed = updateSchema.safeParse(rawPatch);
  if (!parsed.success) {
    throw new Invalid(parsed.error.issues[0]?.message ?? "That input is not valid.");
  }
  const patch = parsed.data;
  if (
    patch.status !== undefined &&
    !hasPermission(actor, "locations.manage", "organization")
  ) {
    throw new Forbidden();
  }
  const transaction = deps.transaction ?? withTransaction;

  await transaction(async (tx) => {
    const orgId = actor.organizationId;
    await lockOrganization(tx, orgId);
    await assertActorActive(tx, actor);

    const [current] = await tx
      .select({
        id: locations.id,
        name: locations.name,
        address: locations.address,
        timezone: locations.timezone,
        status: locations.status,
      })
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.organizationId, orgId)))
      .for("update");
    if (!current) throw new NotFound("We could not find that location.");

    const before: Partial<LocationRow> = {};
    const after: Partial<LocationRow> = {};
    const set: Partial<Omit<LocationRow, "id">> = {};
    if (patch.name !== undefined && patch.name !== current.name) {
      before.name = current.name;
      after.name = set.name = patch.name;
    }
    if (patch.address !== undefined && patch.address !== current.address) {
      before.address = current.address;
      after.address = set.address = patch.address;
    }
    if (patch.timezone !== undefined && patch.timezone !== current.timezone) {
      before.timezone = current.timezone;
      after.timezone = set.timezone = patch.timezone;
    }
    if (patch.status !== undefined && patch.status !== current.status) {
      before.status = current.status;
      after.status = set.status = patch.status;
    }
    if (Object.keys(set).length === 0) return;

    if (set.status === "closed") {
      const [others] = await tx
        .select({ n: count() })
        .from(locations)
        .where(
          and(
            eq(locations.organizationId, orgId),
            eq(locations.status, "active"),
            ne(locations.id, locationId),
          ),
        );
      if ((others?.n ?? 0) === 0) {
        throw new Invalid("You need at least one open location.");
      }
    }

    await tx
      .update(locations)
      .set(set)
      .where(and(eq(locations.id, locationId), eq(locations.organizationId, orgId)));
    await writeAudit(tx, {
      organizationId: orgId,
      locationId,
      actorEmployeeId: actor.employeeId,
      action: "location.updated",
      entityType: "location",
      entityId: locationId,
      before,
      after,
    });
  });
}
