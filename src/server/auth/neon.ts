import "server-only";
import { createNeonAuth, type NeonAuth } from "@neon/auth/next/server";
import { serverEnv } from "@/server/env";

let instance: NeonAuth | undefined;

/**
 * The Neon Auth server instance, created on first use (never at import time)
 * so `next build` works without NEON_AUTH_BASE_URL / NEON_AUTH_COOKIE_SECRET.
 * Neon hosts the auth server: never call `betterAuth()` here.
 */
export function getAuth(): NeonAuth {
  if (instance) return instance;
  const env = serverEnv();
  instance = createNeonAuth({
    baseUrl: env.NEON_AUTH_BASE_URL,
    cookies: { secret: env.NEON_AUTH_COOKIE_SECRET },
  });
  return instance;
}
