# 0001. Identity in Neon Auth, permissions in the app

Status: accepted (2026-11-06)

## Context

The app needs sign-in, plus roles per location, custom permissions, invitations and an audit log. Three options were considered:

- Neon Auth for identity only, with roles and permissions in our own tables.
- Self-managed Better Auth on Vercel. It offers MFA today, but we would maintain the auth server and email delivery.
- The Neon Auth Organization plugin for roles. It is beta, has fixed owner/admin/member roles, and has no custom permissions or per-location roles.

## Decision

Neon Auth (managed Better Auth, `@neon/auth`) handles identity only: users and sessions in the `neon_auth` schema. The app owns employees, roles, permissions, assignments, invitations and the audit log in its own tables.

One server function, `requirePermission` (or `requireActor` when any active employee may proceed), is the only gate. It reads the session, loads the active employee, and checks permissions from active assignments. Nothing is cached beyond a request.

We do not call `betterAuth()`, add a Better Auth database adapter, or run Better Auth migrations. Neon hosts the auth server.

## Consequences

- Role and permission rules are ours to test and change, with no plugin limits.
- Status and role changes apply on the next request.
- No MFA at first. Self-managed Better Auth can be adopted later without changing the permission tables.
- We depend on Neon Auth for sign-in and its email sender.
