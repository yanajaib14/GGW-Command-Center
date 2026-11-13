"use server";

import { AppError } from "@/server/auth/errors";
import { requirePermission } from "@/server/auth/require";
import { createRole, setRolePermissions } from "./service";

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; message: string; code?: string };

function fail(error: unknown): { ok: false; message: string; code?: string } {
  if (error instanceof AppError) {
    return { ok: false, message: error.message, code: error.code };
  }
  console.error(
    "role action failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return { ok: false, message: "Something went wrong. Try again." };
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function createRoleAction(
  formData: FormData,
): Promise<ActionResult<{ roleId: string }>> {
  try {
    const actor = await requirePermission("roles.manage", "organization");
    const roleId = await createRole(actor, {
      key: text(formData, "key"),
      name: text(formData, "name"),
      description: text(formData, "description"),
    });
    return { ok: true, roleId };
  } catch (error) {
    return fail(error);
  }
}

/** Permission keys come as repeated `permission` fields; the service validates each. */
export async function setRolePermissionsAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requirePermission("roles.manage", "organization");
    const permissions = formData
      .getAll("permission")
      .filter((v): v is string => typeof v === "string");
    await setRolePermissions(actor, text(formData, "roleId"), permissions);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
