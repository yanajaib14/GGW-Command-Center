import "server-only";
import { db } from "@/server/db/client";
import { hasPermission, type Actor, type Scope } from "./actor";
import { Forbidden, Unauthenticated } from "./errors";
import { loadActor } from "./load-actor";
import type { Permission } from "./permissions";
import { getSessionUser, type SessionUser } from "./session";

export { getSessionUser, type SessionUser };

/** Seams for tests. Defaults: the real Neon Auth session and `loadActor(db, user)`. */
export type GateDeps = {
  getUser?: () => Promise<SessionUser | null>;
  loadActor?: (user: SessionUser) => Promise<Actor | null>;
};

/**
 * Signed in and an active employee; no permission check. Throws
 * `Unauthenticated` with no session and `Forbidden` when the user is not an
 * active employee. The actor is loaded fresh on every call (no cache), so a
 * suspension or revoke takes effect on the very next request.
 */
export async function requireActor(deps: GateDeps = {}): Promise<Actor> {
  const getUser = deps.getUser ?? getSessionUser;
  const load = deps.loadActor ?? ((u: SessionUser) => loadActor(db, u));

  const user = await getUser();
  if (!user) throw new Unauthenticated();
  const actor = await load(user);
  if (!actor) throw new Forbidden();
  return actor;
}

/**
 * THE authorization gate. Every protected page, server action and route
 * handler must call `requirePermission` (or `requireActor` when any signed-in
 * active employee may proceed) FIRST, before reading or writing anything.
 * The proxy (src/proxy.ts) only redirects signed-out visitors; it is not an
 * authorization layer and must never be relied on for access control.
 *
 * Throws `Unauthenticated` (no session) or `Forbidden` (not an active
 * employee, or no assignment grants `p` in `scope`). Returns the actor.
 *
 * Scope caveat: a `{ locationId }` scope only says "the actor holds `p` at
 * (or above) that id". Callers passing a `locationId` that came from user
 * input must first resolve that location within `actor.organizationId`;
 * org-wide holders pass `hasPermission` for any id, including one that
 * belongs to another organization.
 */
export async function requirePermission(
  p: Permission,
  scope: Scope,
  deps: GateDeps = {},
): Promise<Actor> {
  const actor = await requireActor(deps);
  if (!hasPermission(actor, p, scope)) throw new Forbidden();
  return actor;
}
