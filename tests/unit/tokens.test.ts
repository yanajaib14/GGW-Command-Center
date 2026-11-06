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

  it("hashInviteToken matches the SHA-256 known answer", () => {
    expect(hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("inviteUrl trims whitespace around APP_URL", () => {
    vi.stubEnv("APP_URL", " http://x/ ");
    expect(inviteUrl("abc")).toBe("http://x/invite/abc");
  });

  it("inviteUrl throws when APP_URL is only whitespace", () => {
    vi.stubEnv("APP_URL", "  ");
    expect(() => inviteUrl("abc")).toThrow(/APP_URL/);
  });

  it("inviteUrl throws naming APP_URL when unset", () => {
    vi.stubEnv("APP_URL", "");
    expect(() => inviteUrl("abc")).toThrow(/APP_URL/);
  });
});
