import { createHash, randomBytes } from "node:crypto";

/** SHA-256 of the raw token, lowercase hex (64 chars). Only this is stored. */
export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** 32 random bytes as base64url (43 chars, no padding), plus its stored hash. */
export function generateInviteToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashInviteToken(raw) };
}

// Kept in one small function so a validated env module can replace it later.
function appUrl(): string {
  const value = process.env.APP_URL?.trim();
  if (!value) {
    throw new Error("APP_URL is not set. Add it to .env.local to build invite links.");
  }
  return value.replace(/\/+$/, "");
}

export function inviteUrl(raw: string): string {
  return `${appUrl()}/invite/${raw}`;
}
