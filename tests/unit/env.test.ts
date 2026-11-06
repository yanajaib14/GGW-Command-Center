import { afterEach, describe, expect, it, vi } from "vitest";
import { serverEnv } from "@/server/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("serverEnv", () => {
  it("does not read or validate anything until a variable is accessed", () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    expect(() => serverEnv()).not.toThrow();
  });

  it("throws a readable error naming a missing variable", () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    expect(() => serverEnv().NEON_AUTH_BASE_URL).toThrow(/NEON_AUTH_BASE_URL/);
    expect(() => serverEnv().NEON_AUTH_BASE_URL).toThrow(/\.env\.example/);
  });

  it("names an invalid variable without echoing its value", () => {
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "too-short-secret-value");
    let message = "";
    try {
      void serverEnv().NEON_AUTH_COOKIE_SECRET;
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/NEON_AUTH_COOKIE_SECRET/);
    expect(message).not.toContain("too-short-secret-value");
  });

  it("rejects a base URL that is not a URL", () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "not a url");
    expect(() => serverEnv().NEON_AUTH_BASE_URL).toThrow(/NEON_AUTH_BASE_URL/);
  });

  it("returns valid values", () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.test/neondb/auth");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "x".repeat(32));
    expect(serverEnv().NEON_AUTH_BASE_URL).toBe(
      "https://auth.example.test/neondb/auth",
    );
    expect(serverEnv().NEON_AUTH_COOKIE_SECRET).toBe("x".repeat(32));
  });

  it("an unrelated missing variable does not block a present one", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.test");
    expect(serverEnv().NEON_AUTH_BASE_URL).toBe("https://auth.example.test");
  });
});
