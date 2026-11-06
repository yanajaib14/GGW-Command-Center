import type { NextRequest } from "next/server";
import { getAuth } from "@/server/auth/neon";

/*
 * Next 16 proxy (formerly middleware). With the `src/` layout Next only
 * detects it at `src/proxy.ts`, next to `src/app`.
 *
 * It ONLY redirects signed-out visitors to sign-in and refreshes the session.
 * It is not the authorization layer: every protected page, server action and
 * route handler still calls `requirePermission` / `requireActor` itself.
 */

export const LOGIN_URL = "/sign-in";

/**
 * Paths reachable without a session (each also covers its subpaths). Neon's
 * own auth routes (/api/auth, ...) are added by the SDK. The PWA assets must be
 * public or the service worker install fails. /no-access is deliberately NOT
 * here: it is for signed-in users without access.
 */
export const PUBLIC_ROUTES = [
  "/sign-in",
  "/invite",
  "/sw.js",
  "/manifest.webmanifest",
  "/offline.html",
  "/icons",
];

type Middleware = ReturnType<ReturnType<typeof getAuth>["middleware"]>;
let middleware: Middleware | undefined;

/** Built on the first request so `next build` needs no Neon Auth env. */
export default function proxy(request: NextRequest) {
  middleware ??= getAuth().middleware({
    loginUrl: LOGIN_URL,
    publicRoutes: PUBLIC_ROUTES,
  });
  return middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
