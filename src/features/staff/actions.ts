"use server";

import { AppError } from "@/server/auth/errors";
import { requirePermission } from "@/server/auth/require";
import {
  grantRole,
  revokeRole,
  setEmployeeStatus,
  updateOwnProfile,
} from "./service";

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; message: string; code?: string };

function fail(error: unknown): { ok: false; message: string; code?: string } {
  if (error instanceof AppError) {
    return { ok: false, message: error.message, code: error.code };
  }
  console.error(
    "staff action failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return { ok: false, message: "Something went wrong. Try again." };
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * Gate first (`staff.manage` anywhere); the service then checks the exact
 * scope of everything the person holds, resolves ids inside the actor's
 * organization and applies the guardrails.
 */
export async function setEmployeeStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requirePermission("staff.manage", "any");
    const status = text(formData, "status");
    if (status !== "active" && status !== "suspended" && status !== "left") {
      return { ok: false, message: "Choose active, suspended or left.", code: "INVALID" };
    }
    await setEmployeeStatus(actor, text(formData, "employeeId"), status);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function grantRoleAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("staff.manage", "any");
    const location = text(formData, "locationId");
    await grantRole(actor, {
      employeeId: text(formData, "employeeId"),
      roleId: text(formData, "roleId"),
      locationId: location === "" || location === "all" ? null : location,
    });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function revokeRoleAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePermission("staff.manage", "any");
    await revokeRole(actor, text(formData, "assignmentId"));
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function updateOwnProfileAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requirePermission("profile.edit_own", "any");
    const phone = text(formData, "phone").trim();
    await updateOwnProfile(actor, {
      displayName: text(formData, "displayName"),
      phone: phone === "" ? null : phone,
    });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
