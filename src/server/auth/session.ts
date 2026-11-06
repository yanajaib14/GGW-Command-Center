import "server-only";
import { getAuth } from "./neon";

/** The Neon Auth user behind the current request. Identity only, no access. */
export type SessionUser = { id: string; email: string };

type SessionResultLike = {
  data?: { session?: unknown; user?: { id?: string; email?: string } | null } | null;
  error?: unknown;
};

/**
 * Map an `auth.getSession()` result to a SessionUser. The result is
 * `{ data, error }`; the user lives at `data.user`, not the top level.
 */
export function sessionUserFrom(result: SessionResultLike): SessionUser | null {
  if (result.error) return null;
  if (!result.data?.session) return null;
  const user = result.data.user;
  if (!user?.id || !user.email) return null;
  return { id: user.id, email: user.email.toLowerCase() };
}

/**
 * The signed-in user for this request, or null. Fails closed: if the auth
 * server call throws, the visitor is treated as signed out. Only the error
 * name is logged, never its message (it can carry emails or tokens).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    return sessionUserFrom(await getAuth().getSession());
  } catch (error) {
    console.error(
      "getSessionUser: session lookup failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return null;
  }
}
