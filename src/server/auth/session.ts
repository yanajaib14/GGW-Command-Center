import "server-only";
import { getAuth } from "./neon";

/** The Neon Auth user behind the current request. Identity only, no access. */
export type SessionUser = { id: string; email: string };

type SessionResultLike = {
  data?: { user?: { id?: string; email?: string } | null } | null;
  error?: unknown;
};

/**
 * Map an `auth.getSession()` result to a SessionUser. The result is
 * `{ data, error }`; the user lives at `data.user`, not the top level.
 */
export function sessionUserFrom(result: SessionResultLike): SessionUser | null {
  if (result.error) return null;
  const user = result.data?.user;
  if (!user?.id || !user.email) return null;
  return { id: user.id, email: user.email.toLowerCase() };
}

/** The signed-in user for this request, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  return sessionUserFrom(await getAuth().getSession());
}
