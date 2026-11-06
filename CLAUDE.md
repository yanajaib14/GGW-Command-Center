# GGW Command Center

Mobile-first restaurant operations web app. Version 1 (the foundation) delivers sign-in, invitations, staff, roles and permissions, locations and an audit log. It deliberately contains no restaurant workflows and no AI features yet.

Stack: Next.js 16 (App Router, `src/`), TypeScript, Tailwind CSS 4, Drizzle on Neon Postgres, Neon Managed Auth, Vitest, Playwright.

## Commands

- `npm run dev` / `build` / `start`: Next.js app
- `npm run typecheck`: `tsc --noEmit`
- `npm run lint`: `eslint .`
- `npm run test:unit`: `vitest run tests/unit`
- `npm run test:integration`: Vitest with `vitest.integration.config.mts` (needs `TEST_DATABASE_URL`; globalSetup migrates the test branch)
- `npm run db:generate` / `db:migrate`: drizzle-kit generate / apply migrations (`DATABASE_URL`; run migrations with the direct, non-pooler Neon URL)
- `npm run test:e2e`: `playwright test`
- `npm run check`: typecheck, lint and unit tests; must pass before every commit

## Folder map

```
.github/workflows/ci.yml           typecheck, lint, unit+integration tests
drizzle.config.ts                  drizzle-kit config (schema + migrations paths)
next.config.ts, tsconfig.json, eslint.config.mjs, vitest.config.mts, vitest.integration.config.mts, playwright.config.ts
public/manifest.webmanifest, public/sw.js, public/icons/*
scripts/setup-owner.ts             one-time bootstrap
src/proxy.ts                       Neon Auth proxy: redirects signed-out visitors only (Next detects it next to src/app)
src/app/layout.tsx, globals.css    root layout, tokens via Tailwind theme
src/app/api/auth/[...path]/route.ts  Neon Auth proxy handler
src/app/(public)/sign-in/page.tsx
src/app/(public)/invite/[token]/page.tsx
src/app/(app)/layout.tsx           app shell (loads actor, builds nav)
src/app/(app)/page.tsx             post-sign-in landing redirect
src/app/(public)/no-access/page.tsx   signed in, no access
src/app/(app)/hub/page.tsx, hub/profile/page.tsx
src/app/(app)/manager/page.tsx
src/app/(app)/owner/page.tsx, owner/staff/[id]/page.tsx, owner/roles/page.tsx,
  owner/locations/page.tsx, owner/audit/page.tsx
src/components/ui/*                design-system primitives
src/components/shell/*             AppShell, NavBar, ExperienceSwitcher, OfflineBanner
src/db/schema/*.ts                 one file per table group
src/db/migrations/*                generated SQL
src/server/db/client.ts            Drizzle client + withTransaction
src/server/env.ts                  Zod-parsed server env, lazy per variable (serverEnv())
src/server/auth/neon.ts            createNeonAuth instance (lazy, getAuth())
src/server/auth/session.ts         SessionUser, getSessionUser
src/server/auth/client.ts          browser createAuthClient
src/server/auth/permissions.ts     catalog, matrix, Permission type
src/server/auth/actor.ts           Actor type, hasPermission, allowedLocationIds (pure; reaches client bundles via nav)
src/server/auth/load-actor.ts      loadActor (database; server-only)
src/server/auth/require.ts         requirePermission, requireActor (re-exports getSessionUser)
src/server/auth/guardrails.ts      assertCanGrant, assertNotSelf
src/server/auth/errors.ts          Unauthenticated, Forbidden, NotFound, Conflict, Invalid
src/server/audit/write.ts          writeAudit
src/server/nav.ts                  navFor(actor)
src/features/invitations/{tokens,service,delivery,actions}.ts
src/features/staff/{service,actions}.ts
src/features/roles/{service,actions}.ts
src/features/locations/{service,actions}.ts
src/features/audit/service.ts
src/features/setup/service.ts
tests/unit/*, tests/integration/*, tests/e2e/*, tests/helpers/*
docs/architecture.md, docs/permissions.md, docs/decisions/000{1,2,3}-*.md
CLAUDE.md, AGENTS.md, .env.example
```

Not every file exists yet; the map is the target layout for Version 1.

## Rules

Global constraints:

- TypeScript `strict: true` and `noUncheckedIndexedAccess: true`; no `any` in `src/`.
- No AI functionality. No restaurant workflows (checklists, logs, inventory, scheduling, reports).
- Primary keys are UUIDs (`gen_random_uuid()`); every table has `created_at`/`updated_at` `timestamptz` (UTC) and `organization_id`.
- No hard deletes anywhere in application code. Inactive = status field or `revoked_at`/`ended_at`.
- Location timezone default: `America/Phoenix`.
- Employee status values: `invited`, `active`, `suspended`, `left`. Location status values: `active`, `closed`.
- Invitations expire 7 days after creation; single-use; token = 32 random bytes, base64url; stored only as SHA-256 hex hash.
- Permission catalog (exact keys): `dashboard.employee`, `dashboard.manager`, `dashboard.owner`, `profile.edit_own`, `staff.view`, `staff.invite`, `staff.manage`, `roles.manage`, `locations.manage`, `audit.view`.
- System role keys: `owner`, `manager`, `employee`; matrix exactly as spec section 8.
- Touch targets at least 48 px; mobile bottom tabs below 768 px, left sidebar at 768 px and above; WCAG AA contrast in light and dark.
- Secrets never committed or pasted into chat. `.env.example` holds names only; `.env.local` is git-ignored.
- Migrations that drop or rewrite data need explicit owner approval before they run.
- Tests that touch a database use `TEST_DATABASE_URL` (a Neon test branch), never `DATABASE_URL`.
- Do not call `betterAuth()`, add a Better Auth database adapter, or run Better Auth migrations: Neon hosts the auth server.

Working rules:

- Every server action, protected page and route handler calls `requirePermission` (or `requireActor`) first. `src/proxy.ts` only redirects; it is not authorization.
- Server-only modules start with `import "server-only"`; Vitest aliases it to an empty module.
- Reuse `src/components/ui` before creating components.
- Business logic never lives in `src/app`; pages and routes call `src/features` and `src/server`.
- Never paste or commit secrets.
- No destructive migrations without owner approval.

## Docs to update when architecture changes

- `docs/architecture.md`: layers, data flow, folder responsibilities
- [`docs/permissions.md`](docs/permissions.md): permission catalog, role matrix, scopes, guardrails
- [`docs/decisions/`](docs/decisions/): add a numbered decision record for any significant choice
- `CLAUDE.md` (this file) and `.env.example` when commands, structure or environment variables change

Design and plan documents live in `docs/superpowers/`.
