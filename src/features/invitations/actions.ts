"use server";

import { AppError } from "@/server/auth/errors";
import { requirePermission } from "@/server/auth/require";
import { getSessionUser } from "@/server/auth/session";
import {
  acceptInvitation,
  createInvitation,
  revokeInvitation,
} from "./service";

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; message: string; code?: string };

function fail(error: unknown): { ok: false; message: string; code?: string } {
  if (error instanceof AppError) {
    return { ok: false, message: error.message, code: error.code };
  }
  console.error(
    "invitation action failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return { ok: false, message: "Something went wrong. Try again." };
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * Gate first (`staff.invite` anywhere); the service then checks the exact
 * location, resolves location and role inside the actor's organization and
 * applies the role guardrail.
 */
export async function createInvitationAction(
  formData: FormData,
): Promise<ActionResult<{ invitationId: string; inviteUrl: string }>> {
  try {
    const actor = await requirePermission("staff.invite", "any");
    const created = await createInvitation(actor, {
      firstName: text(formData, "firstName"),
      lastName: text(formData, "lastName"),
      email: text(formData, "email"),
      locationId: text(formData, "locationId"),
      roleId: text(formData, "roleId"),
    });
    return { ok: true, ...created };
  } catch (error) {
    return fail(error);
  }
}

export async function revokeInvitationAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requirePermission("staff.invite", "any");
    await revokeInvitation(actor, text(formData, "invitationId"));
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Any signed-in user may try; the service binds the invite to their email. */
export async function acceptInvitationAction(
  token: string,
): Promise<ActionResult<{ employeeId: string }>> {
  try {
    const user = await getSessionUser();
    if (!user) return { ok: false, message: "You need to sign in.", code: "UNAUTHENTICATED" };
    const { employeeId } = await acceptInvitation(user, token);
    return { ok: true, employeeId };
  } catch (error) {
    return fail(error);
  }
}
