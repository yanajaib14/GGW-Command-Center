import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auditLog, locations } from "@/db/schema";
import {
  createLocation,
  listLocations,
  updateLocation,
} from "@/features/locations/service";
import { Forbidden, Invalid, NotFound } from "@/server/auth/errors";
import { actorFor, testDeps as deps } from "../helpers/actors";
import { resetDb, seedDefaultPermissions, seedOrg, testDb, type SeededOrg } from "../helpers/db";

let org: SeededOrg;

beforeEach(async () => {
  await resetDb();
  org = await seedOrg();
  await seedDefaultPermissions(org);
});

describe("createLocation", () => {
  it("create with default timezone", async () => {
    const owner = await actorFor(org, "owner", null);
    const id = await createLocation(owner, { name: "  Downtown ", address: "1 Main St" }, deps);
    const [row] = await testDb().select().from(locations).where(eq(locations.id, id));
    expect(row).toMatchObject({
      organizationId: org.orgId,
      name: "Downtown",
      address: "1 Main St",
      timezone: "America/Phoenix",
      status: "active",
    });
    const [entry] = await testDb().select().from(auditLog).where(eq(auditLog.action, "location.created"));
    expect(entry).toMatchObject({ actorEmployeeId: owner.employeeId, entityId: id, locationId: id });
  });

  it("stores a blank address as null and accepts another valid timezone", async () => {
    const owner = await actorFor(org, "owner", null);
    const id = await createLocation(owner, { name: "Lake", address: "  ", timezone: "America/New_York" }, deps);
    const [row] = await testDb().select().from(locations).where(eq(locations.id, id));
    expect(row).toMatchObject({ address: null, timezone: "America/New_York" });
  });

  it("invalid timezone rejected", async () => {
    const owner = await actorFor(org, "owner", null);
    await expect(
      createLocation(owner, { name: "Bad", address: "", timezone: "Mars/Olympus" }, deps),
    ).rejects.toBeInstanceOf(Invalid);
    await expect(createLocation(owner, { name: "", address: "" }, deps)).rejects.toBeInstanceOf(Invalid);
  });

  it("manager cannot create", async () => {
    const manager = await actorFor(org, "manager", org.locationId);
    await expect(createLocation(manager, { name: "Nope", address: "" }, deps)).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("updateLocation", () => {
  it("updates fields and audits before/after", async () => {
    const owner = await actorFor(org, "owner", null);
    await updateLocation(owner, org.locationId, { name: "Renamed", timezone: "America/Denver" }, deps);
    const [row] = await testDb().select().from(locations).where(eq(locations.id, org.locationId));
    expect(row).toMatchObject({ name: "Renamed", timezone: "America/Denver" });
    const [entry] = await testDb().select().from(auditLog).where(eq(auditLog.action, "location.updated"));
    expect(entry?.before).toMatchObject({ name: "Test Location", timezone: "America/Phoenix" });
    expect(entry?.after).toMatchObject({ name: "Renamed", timezone: "America/Denver" });
  });

  it("closes a location when another stays active, and can reopen it", async () => {
    const owner = await actorFor(org, "owner", null);
    const second = await createLocation(owner, { name: "Second", address: "" }, deps);
    await updateLocation(owner, second, { status: "closed" }, deps);
    const [closed] = await testDb().select().from(locations).where(eq(locations.id, second));
    expect(closed?.status).toBe("closed");
    await updateLocation(owner, second, { status: "active" }, deps);
    const [open] = await testDb().select().from(locations).where(eq(locations.id, second));
    expect(open?.status).toBe("active");
  });

  it("cannot close the last active location", async () => {
    const owner = await actorFor(org, "owner", null);
    await expect(updateLocation(owner, org.locationId, { status: "closed" }, deps)).rejects.toBeInstanceOf(
      Invalid,
    );
    const second = await createLocation(owner, { name: "Second", address: "" }, deps);
    await updateLocation(owner, second, { status: "closed" }, deps);
    await expect(updateLocation(owner, org.locationId, { status: "closed" }, deps)).rejects.toBeInstanceOf(
      Invalid,
    );
    const [row] = await testDb().select().from(locations).where(eq(locations.id, org.locationId));
    expect(row?.status).toBe("active");
  });

  it("two simultaneous closes leave one location active", async () => {
    const owner = await actorFor(org, "owner", null);
    const second = await createLocation(owner, { name: "Second", address: "" }, deps);
    const results = await Promise.allSettled([
      updateLocation(owner, org.locationId, { status: "closed" }, deps),
      updateLocation(owner, second, { status: "closed" }, deps),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rows = await testDb().select().from(locations).where(eq(locations.organizationId, org.orgId));
    expect(rows.filter((r) => r.status === "active")).toHaveLength(1);
  });

  it("rejects invalid timezone and unknown status", async () => {
    const owner = await actorFor(org, "owner", null);
    await expect(updateLocation(owner, org.locationId, { timezone: "Nope/Zone" }, deps)).rejects.toBeInstanceOf(
      Invalid,
    );
    await expect(
      updateLocation(owner, org.locationId, { status: "deleted" as "closed" }, deps),
    ).rejects.toBeInstanceOf(Invalid);
    await expect(updateLocation(owner, org.locationId, { name: " " }, deps)).rejects.toBeInstanceOf(Invalid);
  });

  it("another organization's location is not found; manager is refused", async () => {
    const owner = await actorFor(org, "owner", null);
    const other = await seedOrg();
    await expect(updateLocation(owner, other.locationId, { name: "Hijack" }, deps)).rejects.toBeInstanceOf(
      NotFound,
    );
    await expect(updateLocation(owner, "not-a-uuid", { name: "x" }, deps)).rejects.toBeInstanceOf(Invalid);
    const manager = await actorFor(org, "manager", org.locationId);
    await expect(updateLocation(manager, org.locationId, { name: "Mine" }, deps)).rejects.toBeInstanceOf(
      Forbidden,
    );
  });
});

describe("listLocations", () => {
  it("lists this organization's locations, open and closed; manager is refused", async () => {
    const owner = await actorFor(org, "owner", null);
    const second = await createLocation(owner, { name: "Second", address: "" }, deps);
    await updateLocation(owner, second, { status: "closed" }, deps);
    const other = await seedOrg();
    const rows = await listLocations(owner, deps);
    expect(rows.map((r) => r.id).sort()).toEqual([org.locationId, second].sort());
    expect(rows.map((r) => r.id)).not.toContain(other.locationId);
    expect(rows.find((r) => r.id === second)?.status).toBe("closed");
    const manager = await actorFor(org, "manager", org.locationId);
    await expect(listLocations(manager, deps)).rejects.toBeInstanceOf(Forbidden);
  });
});
