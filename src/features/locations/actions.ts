"use server";

import { AppError } from "@/server/auth/errors";
import { requirePermission } from "@/server/auth/require";
import { createLocation, updateLocation, type LocationStatus } from "./service";

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; message: string; code?: string };

function fail(error: unknown): { ok: false; message: string; code?: string } {
  if (error instanceof AppError) {
    return { ok: false, message: error.message, code: error.code };
  }
  console.error(
    "location action failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return { ok: false, message: "Something went wrong. Try again." };
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function createLocationAction(
  formData: FormData,
): Promise<ActionResult<{ locationId: string }>> {
  try {
    const actor = await requirePermission("locations.manage", "organization");
    const timezone = text(formData, "timezone");
    const locationId = await createLocation(actor, {
      name: text(formData, "name"),
      address: text(formData, "address"),
      ...(timezone ? { timezone } : {}),
    });
    return { ok: true, locationId };
  } catch (error) {
    return fail(error);
  }
}

/** Only fields present in the form are changed; the service validates each. */
export async function updateLocationAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requirePermission("locations.manage", "any");
    const patch: {
      name?: string;
      address?: string;
      timezone?: string;
      status?: LocationStatus;
    } = {};
    if (formData.has("name")) patch.name = text(formData, "name");
    if (formData.has("address")) patch.address = text(formData, "address");
    if (formData.has("timezone")) patch.timezone = text(formData, "timezone");
    // The service validates the value against the allowed statuses.
    if (formData.has("status")) patch.status = text(formData, "status") as LocationStatus;
    await updateLocation(actor, text(formData, "locationId"), patch);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
