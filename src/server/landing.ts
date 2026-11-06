import { landingPath, type Actor } from "./auth/actor";
import type { SessionUser } from "./auth/session";
import type { Experience } from "./nav";

/**
 * Where `/` sends a visitor: sign-in without a session, no-access when the
 * user is not an active employee, otherwise their highest experience.
 * Pure on purpose so the redirect decision is unit-testable.
 */
export function resolveLanding(
  user: SessionUser | null,
  actor: Actor | null,
): string {
  if (!user) return "/sign-in";
  if (!actor) return "/no-access";
  return landingPath(actor);
}

const PREFIXES: readonly [string, Experience][] = [
  ["/owner", "owner"],
  ["/manager", "manager"],
  ["/hub", "employee"],
];

/** The experience a pathname belongs to; unknown paths default to employee. */
export function experienceFromPath(pathname: string): Experience {
  for (const [prefix, experience] of PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return experience;
  }
  return "employee";
}
