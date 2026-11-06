import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateInviteToken,
  hashInviteToken,
  inviteUrl,
} from "@/features/invitations/tokens";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("invite tokens", () => {
  it("token is 43 base64url chars", () => {
    const { raw } = generateInviteToken();
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hash is 64 lowercase hex and deterministic", () => {
    const { raw, hash } = generateInviteToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken(raw)).toBe(hash);
    expect(hashInviteToken(raw)).toBe(hashInviteToken(raw));
  });

  it("two tokens differ", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });

  it("inviteUrl joins APP_URL without double slash", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000/");
    expect(inviteUrl("abc")).toBe("http://localhost:3000/invite/abc");
  });

  it("inviteUrl throws naming APP_URL when unset", () => {
    vi.stubEnv("APP_URL", "");
    expect(() => inviteUrl("abc")).toThrow(/APP_URL/);
  });
});
