import "server-only";
import { redirect } from "next/navigation";
import type { Actor, Scope } from "./actor";
import { Forbidden, Unauthenticated } from "./errors";
import { requirePermission } from "./require";
import type { Permission } from "./permissions";

/**
 * `requirePermission` for pages: a signed-out visitor goes to sign-in and an
 * actor without the permission goes to no-access, instead of an error page.
 * This is the authorization gate; the proxy only redirects.
 */
export async function requirePagePermission(
  p: Permission,
  scope: Scope,
): Promise<Actor> {
  try {
    return await requirePermission(p, scope);
  } catch (error) {
    if (error instanceof Unauthenticated) redirect("/sign-in");
    if (error instanceof Forbidden) redirect("/no-access");
    throw error;
  }
}
