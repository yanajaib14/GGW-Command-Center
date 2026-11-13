"use server";

import { AppError } from "@/server/auth/errors";
import { requirePermission } from "@/server/auth/require";
import { updateOwnProfile } from "./service";

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
