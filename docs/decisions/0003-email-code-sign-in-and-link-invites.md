# 0003. Email code sign-in and copyable invite links

Status: accepted (2026-11-06)

## Context

Staff must sign in without passwords. Neon Managed Auth sends only its own auth emails (codes, magic links). It cannot send the app's invitation email.

## Decision

Sign-in uses an email one-time code (Neon Auth Email OTP). Magic link may be enabled later.

Version 1 delivers invitations as a copyable link shown to the inviter, who shares it by text or email. Delivery sits behind an `InviteDelivery` interface so automatic email can be added once a custom sender exists. This amends the original spec, which assumed an invite email.

Tokens are 32 random bytes, base64url (43 characters), stored only as a SHA-256 hex hash. Invitations expire 7 days after creation and are single-use. Accepting needs a matching token hash, an invitation that is not expired, revoked or accepted, and a signed-in email equal to the invited email (case-insensitive). Re-inviting an email revokes its earlier open invitation. The first Owner invite link will be printed by `npm run setup:owner`.

Neon's shared mail sender is fine for getting started. Production needs the owner's own SMTP sender before real staff are invited.

## Consequences

- No passwords to store or reset.
- Inviters must send the link themselves until a custom sender is added.
- A leaked database exposes hashes, not usable links.
- The invite link is a bearer secret until used; the email check limits what a stolen link can do.
