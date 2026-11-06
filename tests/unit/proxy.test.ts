import { DEFAULT_AUTH_SKIP_ROUTES, shouldProtectRoute } from "@neon/auth/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, LOGIN_URL, PUBLIC_ROUTES } from "@/proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy", () => {
  it("imports without any Neon Auth environment", () => {
    // Reaching this line means the module loaded with no env (lazy auth).
    expect(LOGIN_URL).toBe("/sign-in");
  });

  it("leaves sign-in, invites and the PWA assets public", () => {
    for (const route of [
      "/sign-in",
      "/invite",
      "/sw.js",
      "/manifest.webmanifest",
      "/offline.html",
      "/icons",
    ]) {
      expect(PUBLIC_ROUTES).toContain(route);
    }
  });

  it("does not make /no-access, app pages or the site root public", () => {
    for (const route of ["/no-access", "/", "/hub", "/manager", "/owner"]) {
      expect(PUBLIC_ROUTES).not.toContain(route);
    }
  });

  it("uses the catch-all matcher excluding Next static assets and the favicon", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/static|_next/image|favicon.ico).*)",
    ]);
  });

  it("matches routes through the package matcher", () => {
    const skip = [...DEFAULT_AUTH_SKIP_ROUTES, ...PUBLIC_ROUTES];
    expect(shouldProtectRoute("/invite/abc", skip)).toBe(false);
    expect(shouldProtectRoute("/sign-in", skip)).toBe(false);
    expect(shouldProtectRoute("/icons/icon-192.png", skip)).toBe(false);
    expect(shouldProtectRoute("/invitex", skip)).toBe(true);
    expect(shouldProtectRoute("/no-access", skip)).toBe(true);
    expect(shouldProtectRoute("/", skip)).toBe(true);
  });
});
