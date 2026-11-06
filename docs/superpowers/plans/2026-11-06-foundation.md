# GGW Command Center Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Version 1 foundation: invitation-only sign-in, server-enforced role and location permissions, audit log, design system, app shell, and the Employee, Manager and Owner experiences as working shells.

**Architecture:** Next.js 16 App Router on Vercel. Neon Auth (Managed Better Auth via `@neon/auth`) proves identity; application tables in Neon Postgres (Drizzle ORM) hold employees, roles, permissions, invitations and the audit log. Every protected page and server action goes through one gate, `requirePermission`, which loads the actor from the database on each request. Business rules live in `src/features` and `src/server`; routes only render and call them.

**Tech Stack:** Node 22, Next.js 16.4, React 19, TypeScript strict, Tailwind CSS 4, `@neon/auth` 0.8, `drizzle-orm` 0.45 + `drizzle-kit` 0.31, `@neondatabase/serverless` 1.2 (Pool driver, for transactions), Zod, Vitest + Testing Library, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-06-foundation-design.md`

## Global Constraints

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

## Spec amendment made by this plan

Neon Managed Auth sends only its own auth emails (codes, magic links); it cannot send the app's invitation email. Version 1 therefore delivers invitations as a **copyable invite link** shown to the inviter (to share by text or email themselves), behind an `InviteDelivery` interface so automatic email can be added once a custom sender exists. The setup command prints the Owner link, as the spec already says.

## Review Focus

1. Invite email typed with capitals or spaces (`" Som@Example.com "`) — the invitee signing in as `som@example.com` is accepted.
2. Invite link opened while signed in as a different account — shows "This invite is for s•••@example.com", offers sign-out, attaches nothing.
3. Accept submitted twice (refresh, double tap) — second attempt lands on the hub; no duplicate assignment, no error page.
4. Inviting an email that already belongs to an active or suspended employee — refused with "already on the team"; inviting an `invited` employee again revokes the old invite and reuses the employee row.
5. Role assignments at a `closed` location — grant nothing.

Each line has its test in the owning task (Tasks 5, 8 and 9).

## File Map

```
.github/workflows/ci.yml           typecheck, lint, unit+integration tests
drizzle.config.ts                  drizzle-kit config (schema + migrations paths)
next.config.ts, tsconfig.json, eslint.config.mjs, vitest.config.ts, playwright.config.ts
proxy.ts                           Neon Auth middleware (route protection)
public/manifest.webmanifest, public/sw.js, public/icons/*
scripts/setup-owner.ts             one-time bootstrap
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
src/server/auth/neon.ts            createNeonAuth instance
src/server/auth/client.ts          browser createAuthClient
src/server/auth/permissions.ts     catalog, matrix, Permission type
src/server/auth/actor.ts           loadActor, hasPermission, allowedLocationIds
src/server/auth/require.ts         requirePermission, getSessionUser
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

---

### Task 1: Project scaffold, tooling, CI and agent docs

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (temporary), `.gitignore`, `.env.example`, `.github/workflows/ci.yml`, `CLAUDE.md`, `AGENTS.md`
- Test: `tests/unit/smoke.test.ts`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `test` (`vitest run`), `test:unit` (`vitest run tests/unit`), `test:integration` (`vitest run tests/integration`), `test:e2e` (`playwright test`), `check` (`typecheck && lint && test:unit`). Path alias `@/*` → `src/*`.

- [ ] **Step 1:** Run `npx create-next-app@16 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack --skip-install` then `npm install`. Expected: `next` resolves to 16.x.
- [ ] **Step 2:** Set `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` in `tsconfig.json`. Add the scripts above. Install `vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom vite-tsconfig-paths zod` (zod as dependency).
- [ ] **Step 3:** Write `tests/unit/smoke.test.ts`: `it("runs", () => expect(1 + 1).toBe(2))`. Configure `vitest.config.ts` with tsconfig paths, `environment: "node"` default, `environmentMatchGlobs` for `tests/unit/components/**` → `jsdom`, `setupFiles` loading `@testing-library/jest-dom/vitest`.
- [ ] **Step 4:** Run `npm run check`. Expected: typecheck clean, lint clean, 1 test passes.
- [ ] **Step 5:** `.gitignore` includes `.env*` except `.env.example`. `.env.example` lists `DATABASE_URL=`, `TEST_DATABASE_URL=`, `NEON_AUTH_BASE_URL=`, `NEON_AUTH_COOKIE_SECRET=`, `APP_URL=` with one-line comments, no values.
- [ ] **Step 6:** `.github/workflows/ci.yml`: on pull_request and push to main; Node 22; `npm ci`; `npm run typecheck`; `npm run lint`; `npm run test:unit`; `npm run test:integration` only when secret `TEST_DATABASE_URL` is present (pass it as env).
- [ ] **Step 7:** Write `CLAUDE.md`: purpose, commands, folder map (from File Map), rules (Global Constraints verbatim, "every server action and protected page calls `requirePermission` first", "reuse `src/components/ui` before creating components", "business logic never in `src/app`", "never paste or commit secrets", "no destructive migrations without owner approval"), docs to update when architecture changes. `AGENTS.md`: one line, "Read and follow CLAUDE.md."
- [ ] **Step 8:** Commit: `chore: scaffold Next.js 16 app with strict TS, Vitest and CI`.

---

### Task 2: Design tokens and UI primitives

**Files:**
- Modify: `src/app/globals.css` (Tailwind `@theme` tokens, light/dark)
- Create: `src/components/ui/{button,input,field,select,card,list-row,badge,empty-state,page-header,banner,dialog,toast}.tsx`, `src/components/ui/index.ts`, `src/lib/cn.ts`
- Test: `tests/unit/components/ui.test.tsx`

**Interfaces:**
- Produces: named exports from `@/components/ui`: `Button({ variant?: "primary"|"secondary"|"danger"|"ghost", size?: "md"|"lg", loading?: boolean, ...button props })`, `Input`, `Field({ label: string, hint?: string, error?: string, children })`, `Select`, `Card({ title?, children })`, `ListRow({ title, subtitle?, trailing?, href? })`, `Badge({ tone: "neutral"|"success"|"warning"|"danger" })`, `EmptyState({ title, body?, action? })`, `PageHeader({ title, subtitle?, actions? })`, `Banner({ tone: "info"|"warning"|"danger", children })`, `Dialog({ open, onClose, title, children })` (native `<dialog>`), `Toast` + `useToast()`. `cn(...classes)` in `@/lib/cn`.

Tokens: colours `--color-bg, surface, fg, muted, line, accent, accent-fg, success, warning, danger` with light and dark (`prefers-color-scheme` plus `[data-theme]`); spacing on a 4 px scale; radius `sm 6px, md 10px, lg 16px`; type scale `sm 15px, base 17px, lg 20px, xl 24px, 2xl 30px`; `--size-touch: 48px`. Basil-green accent family (as the audit page: `#2f6b3a` light, `#8cc795` dark).

- [ ] **Step 1: Write failing tests** in `tests/unit/components/ui.test.tsx`:
  - `Button renders at least the touch-target height class` — expect the element to have class `min-h-touch`.
  - `Button with loading is disabled and aria-busy` — `toBeDisabled()`, `aria-busy="true"`.
  - `Field links label, hint and error to the control` — `getByLabelText("Email")` returns the input; input has `aria-describedby` containing the hint and error ids; error has `role="alert"`.
  - `Badge tone sets data-tone` — `data-tone="danger"`.
  - `EmptyState shows title and action` — text and button present.
- [ ] **Step 2:** Run `npx vitest run tests/unit/components/ui.test.tsx`. Expected: FAIL, modules not found.
- [ ] **Step 3:** Implement tokens and the primitives. `Field` clones its single child to add `id`, `aria-describedby`, `aria-invalid`.
- [ ] **Step 4:** Run the test file. Expected: all PASS. Run `npm run check`.
- [ ] **Step 5:** Commit: `feat(ui): design tokens and reusable primitives`.

---

### Task 3: Database schema, client and migrations

**Files:**
- Create: `drizzle.config.ts`, `src/db/schema/{organizations,locations,employees,roles,invitations,audit}.ts`, `src/db/schema/index.ts`, `src/server/db/client.ts`, `src/db/migrations/*` (generated), `src/db/migrations/0001_audit_append_only.sql` (custom), `tests/helpers/db.ts`
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Produces: Drizzle tables `organizations, locations, employees, roles, rolePermissions, roleAssignments, invitations, auditLog` with columns exactly as spec section 7 (camelCase in TS, snake_case in SQL), plus `invitations.grants_org_wide boolean not null default false` (the accepted role assignment gets `location_id` null when true; used by the Owner setup invitation). Enums `employeeStatus`, `locationStatus` as Postgres enums. `db` (Drizzle over `@neondatabase/serverless` `Pool`), `type Db = typeof db`, `type Tx` (transaction handle), `withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>`. Test helpers: `testDb()`, `resetDb()` (TRUNCATE all app tables `RESTART IDENTITY CASCADE`), `seedOrg(): Promise<{ orgId, locationId, roles: Record<"owner"|"manager"|"employee", string> }>`.

Constraints: unique `organizations.slug`; unique (`organization_id`, `lower(email)`) on employees; unique `employees.auth_user_id`; unique (`organization_id`, `key`) on roles; partial unique index on `role_assignments (employee_id, role_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'))` where `revoked_at is null`; unique `invitations.token_hash`; FKs on every `*_id`; index on `audit_log (organization_id, created_at desc)`.

- [ ] **Owner action (before Step 4):** create a Neon branch named `test` and put its connection string in `.env.local` as `TEST_DATABASE_URL`, and in GitHub repo secrets as `TEST_DATABASE_URL`. Put the main branch string in `.env.local` as `DATABASE_URL`. Do not paste either into chat.
- [ ] **Step 1: Write failing tests** in `tests/integration/schema.test.ts` (each runs after `resetDb()`):
  - `employee email is unique per organization ignoring case` — inserting `Som@x.com` then `som@x.com` in the same org rejects with a unique violation.
  - `one active assignment per employee, role and location` — second identical active insert rejects; insert after setting `revoked_at` on the first succeeds.
  - `org-wide duplicate assignment rejected` — two active rows with `location_id` null for the same employee and role reject.
  - `audit_log rejects update and delete` — `UPDATE audit_log SET action='x'` and `DELETE FROM audit_log` both throw with message containing `audit_log is append-only`.
- [ ] **Step 2:** Run `npm run test:integration -- schema`. Expected: FAIL (tables missing).
- [ ] **Step 3:** Write the schema files and `drizzle.config.ts` (`out: "src/db/migrations"`, `dialect: "postgresql"`). Add scripts `db:generate` (`drizzle-kit generate`), `db:migrate` (`drizzle-kit migrate`). Run `npm run db:generate`. Add custom migration `0001_audit_append_only.sql` (via `drizzle-kit generate --custom`) creating trigger function `audit_log_block_mutation()` raising `audit_log is append-only` on `BEFORE UPDATE OR DELETE` (this implements the spec's "UPDATE and DELETE are revoked" intent regardless of which database role connects).
- [ ] **Step 4:** `tests/helpers/db.ts` runs migrations once against `TEST_DATABASE_URL` in a Vitest `globalSetup`, and throws if `TEST_DATABASE_URL` is unset or equals `DATABASE_URL`.
- [ ] **Step 5:** Run the schema tests. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(db): schema, migrations and append-only audit log`.

---

### Task 4: Permission catalog, actor resolution and guardrails (pure)

**Files:**
- Create: `src/server/auth/permissions.ts`, `src/server/auth/actor.ts` (pure parts), `src/server/auth/guardrails.ts`, `src/server/auth/errors.ts`
- Test: `tests/unit/permissions.test.ts`, `tests/unit/guardrails.test.ts`

**Interfaces:**
- Produces:
  - `PERMISSIONS` (readonly tuple of the 10 keys), `type Permission`, `isPermission(s: string): s is Permission`, `DEFAULT_ROLE_PERMISSIONS: Record<"owner"|"manager"|"employee", readonly Permission[]>`, `EXPERIENCES` = `[{ key: "owner", permission: "dashboard.owner", path: "/owner" }, { key: "manager", permission: "dashboard.manager", path: "/manager" }, { key: "employee", permission: "dashboard.employee", path: "/hub" }]`.
  - `type ActorAssignment = { assignmentId: string; roleId: string; roleKey: string; locationId: string | null; permissions: readonly Permission[] }`
  - `type Actor = { employeeId: string; organizationId: string; email: string; displayName: string; assignments: readonly ActorAssignment[] }`
  - `type Scope = { locationId: string } | "organization" | "any"`
  - `hasPermission(actor: Actor, p: Permission, scope: Scope): boolean` — `{locationId}`: assignments with that location or org-wide; `"organization"`: org-wide only; `"any"`: any assignment.
  - `allowedLocationIds(actor: Actor, p: Permission): "all" | string[]`
  - `landingPath(actor: Actor): string` — first `EXPERIENCES` entry held with scope `"any"`, else `/no-access`.
  - Errors: `Unauthenticated`, `Forbidden`, `NotFound`, `Conflict`, `Invalid` (all `extends AppError` with `code`).
  - `assertCanGrant(actor: Actor, rolePermissions: readonly Permission[], locationId: string | null): void` — throws `Forbidden` unless every permission is held at that scope (`null` → `"organization"`).
  - `assertNotSelf(actor: Actor, targetEmployeeId: string): void` — throws `Forbidden`.

- [ ] **Step 1: Write failing tests** in `tests/unit/permissions.test.ts`:
  - `matrix matches the spec` — table-driven over all 30 (role × permission) cells; expected values copied from spec section 8.
  - `location-scoped assignment grants only at that location` — manager at L1: `hasPermission(…, "staff.view", {locationId: L1})` true, `{locationId: L2}` false, `"organization"` false, `"any"` true.
  - `org-wide assignment grants everywhere` — owner with `locationId: null` true at L1, L2 and `"organization"`.
  - `multiple roles union their permissions` — employee at L1 + manager at L2: `staff.invite` at L2 true, at L1 false; `dashboard.employee` at L1 true.
  - `allowedLocationIds` — owner → `"all"`; manager at L1 and L2 → `[L1, L2]`; employee for `staff.view` → `[]`.
  - `landingPath` — owner → `/owner`; manager+employee → `/manager`; no assignments → `/no-access`.
  - `isPermission rejects unknown keys` — `isPermission("staff.delete")` false.
- [ ] **Step 2:** Write failing tests in `tests/unit/guardrails.test.ts`:
  - `manager can grant employee role at own location` — no throw.
  - `manager cannot grant owner role at own location` — throws `Forbidden`.
  - `manager cannot grant employee role at another location` — throws `Forbidden`.
  - `manager cannot grant org-wide roles` — `locationId: null` throws.
  - `owner can grant owner role org-wide` — no throw.
  - `manager cannot invite another manager` — `assertCanInviteWithRole` throws `Forbidden`.
  - `owner can invite a manager` — no throw.
  - `cannot act on self` — `assertNotSelf(actor, actor.employeeId)` throws `Forbidden`.
- [ ] **Step 3:** Run `npm run test:unit`. Expected: FAIL.
- [ ] **Step 4:** Implement. `assertCanGrant` alone would let a Manager grant the Manager role (they hold all its permissions), so add `assertCanInviteWithRole(actor: Actor, rolePermissions: readonly Permission[], locationId: string | null): void` in `guardrails.ts`: it calls `assertCanGrant`, then throws `Forbidden` if the role includes `staff.invite` and the actor lacks `staff.manage` at that scope. This enforces the spec's "Managers can invite Employees only".
- [ ] **Step 5:** Run `npm run test:unit`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(auth): permission catalog, actor scopes and guardrails`.

---

### Task 5: Neon Auth wiring and the `requirePermission` gate

**Files:**
- Create: `src/server/auth/neon.ts`, `src/server/auth/client.ts`, `src/app/api/auth/[...path]/route.ts`, `proxy.ts`, `src/server/auth/require.ts`, add `loadActor` to `src/server/auth/actor.ts`
- Test: `tests/integration/actor.test.ts`, `tests/integration/require.test.ts`

**Interfaces:**
- Consumes: Task 3 `db`, tables; Task 4 types and `hasPermission`, errors.
- Produces:
  - `auth` = `createNeonAuth({ baseUrl: env.NEON_AUTH_BASE_URL, cookies: { secret: env.NEON_AUTH_COOKIE_SECRET } })` from `@neon/auth/next/server`.
  - `authClient` = `createAuthClient()` from `@neon/auth/next` (no arguments).
  - `type SessionUser = { id: string; email: string }`
  - `getSessionUser(): Promise<SessionUser | null>` — wraps `auth.getSession()`; reads `data?.user`.
  - `loadActor(db: Db | Tx, user: SessionUser): Promise<Actor | null>` — employee by `auth_user_id`, status `active`, org match; active assignments (`revoked_at is null`) whose location is null or `status = 'active'`; permissions from `role_permissions` filtered by `isPermission`.
  - `requirePermission(p: Permission, scope: Scope, deps?: { getUser?: () => Promise<SessionUser | null>; db?: Db }): Promise<Actor>` — throws `Unauthenticated` (no session) or `Forbidden` (no actor or permission).
  - `requireActor(deps?): Promise<Actor>` — signed in and active, no permission check.

- [ ] **Owner action (before Step 5):** In the Neon Console for the project: confirm it is in an AWS region with no IP Allow / Private Networking; enable Neon Auth on the main and `test` branches; enable Email OTP; leave "Verify email at signup" off. Copy each branch's Auth URL into `.env.local` (`NEON_AUTH_BASE_URL`) and Vercel env (Production uses main, Preview uses main until a preview branch exists). Generate `NEON_AUTH_COOKIE_SECRET` locally with `openssl rand -base64 32` and set it in `.env.local` and Vercel. Add the Vercel production and preview origins as trusted domains. Re-verify these steps against https://neon.com/docs/auth/quick-start/nextjs-api-only.md before doing them.
- [ ] **Step 1: Write failing tests** in `tests/integration/actor.test.ts` (seed with `seedOrg()` + helper `seedEmployee({ status, authUserId, assignments })` added to `tests/helpers/db.ts`):
  - `returns null for unknown auth user`.
  - `returns null for suspended and left employees`.
  - `ignores revoked assignments`.
  - `ignores assignments at a closed location` (Review Focus 5) — manager at closed L2 gives no permissions at L2 and `"any"` false for `dashboard.manager`.
  - `loads permissions per assignment` — owner org-wide has all 10.
- [ ] **Step 2:** Write failing tests in `tests/integration/require.test.ts` using `deps.getUser` stubs:
  - `no session → Unauthenticated`.
  - `session without employee → Forbidden`.
  - `employee asking for staff.view → Forbidden`.
  - `manager staff.view at own location → returns actor`.
  - `suspension takes effect on next call` — call succeeds, set status `suspended`, next call throws `Forbidden`.
- [ ] **Step 3:** Run `npm run test:integration -- actor require`. Expected: FAIL.
- [ ] **Step 4:** Implement `loadActor`, `requirePermission`, `requireActor`, `getSessionUser`.
- [ ] **Step 5:** Install `@neon/auth` (`npm i @neon/auth`; do not pin `better-auth`). Write `neon.ts`, `client.ts`, the catch-all route exporting `GET, POST, PUT, DELETE, PATCH` from `auth.handler()`, and `proxy.ts` with `auth.middleware({ loginUrl: "/sign-in", publicRoutes: ["/sign-in", "/invite"] })` and the catch-all matcher from the Neon reference. Env access goes through `src/server/env.ts` (Zod-parsed, throws a readable error naming the missing variable, imported only by server code).
- [ ] **Step 6:** Run integration tests. Expected: PASS. Run `npm run dev`, open `/hub` signed out. Expected: redirect to `/sign-in`.
- [ ] **Step 7:** Commit: `feat(auth): Neon Auth wiring and server permission gate`.

---

### Task 6: Audit writer and owner setup command

**Files:**
- Create: `src/server/audit/write.ts`, `src/features/setup/service.ts`, `scripts/setup-owner.ts`
- Test: `tests/integration/setup.test.ts`

**Interfaces:**
- Consumes: Task 3 tables, `withTransaction`; Task 4 `DEFAULT_ROLE_PERMISSIONS`, errors.
- Produces:
  - `src/features/invitations/tokens.ts` (also used by Task 8): `generateInviteToken(): { raw: string; hash: string }`, `hashInviteToken(raw: string): string`, `inviteUrl(raw: string): string` (uses `APP_URL`).
  - `type AuditEntry = { organizationId: string; locationId?: string | null; actorEmployeeId: string | null; action: AuditAction; entityType: string; entityId: string; before?: unknown; after?: unknown }`, `type AuditAction = "setup.run" | "invitation.created" | "invitation.revoked" | "invitation.accepted" | "role.granted" | "role.revoked" | "employee.status_changed" | "employee.profile_updated" | "role.created" | "role.permissions_changed" | "location.created" | "location.updated"`.
  - `writeAudit(tx: Tx, entry: AuditEntry): Promise<void>`.
  - `runOwnerSetup(input: { organizationName: string; slug: string; locationName: string; ownerEmail: string; ownerFirstName: string; ownerLastName: string }): Promise<{ inviteUrl: string }>`.
  - npm script `setup:owner` → `tsx scripts/setup-owner.ts --org "Glai Gung Won" --slug ggw --location "…" --email … --first … --last …`.

- [ ] **Step 1: Write failing tests:**
  - `tests/unit/tokens.test.ts`: `token is 43 base64url chars` (32 bytes); `hash is 64 lowercase hex and deterministic`; `two tokens differ`.
  - `tests/integration/setup.test.ts`: `creates org, location, three system roles with the spec matrix and an owner invitation` (invitation role is `owner`, `grants_org_wide` true, `location_id` = the new location); `writes a setup.run audit entry with actor null`; `refuses when an active owner exists` (throws `Conflict`, no new rows); `location timezone defaults to America/Phoenix`; `email stored lower-cased and trimmed`.
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3:** Implement tokens, `writeAudit`, `runOwnerSetup` (one transaction), and the CLI (parse args with `node:util` `parseArgs`, print the link, exit 1 with the message on `Conflict`).
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(setup): audit writer and one-time owner setup`.

---

### Task 7: Sign-in, landing and no-access screens

**Files:**
- Create: `src/app/(public)/layout.tsx`, `src/app/(public)/sign-in/page.tsx`, `src/app/(public)/sign-in/sign-in-form.tsx` (client), `src/app/(app)/page.tsx`, `src/app/(public)/no-access/page.tsx` (outside the app shell; still requires a session because `proxy.ts` does not list it as public)
- Remove: temporary `src/app/page.tsx`
- Test: `tests/unit/components/sign-in-form.test.tsx`

**Interfaces:**
- Consumes: `authClient` (Task 5), `requireActor`/`loadActor`, `landingPath` (Task 4), UI primitives (Task 2).
- Produces: `SignInForm({ redirectTo?: string })` — two steps: email → `authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })`; code → `authClient.signIn.emailOtp({ email, otp })`; then `router.replace(redirectTo ?? "/")`. `redirectTo` accepted only if it starts with `/` and not `//`.

- [ ] **Step 1: Write failing tests** (mock `@/server/auth/client`):
  - `sends a code to the trimmed lower-cased email` — typing `" Som@X.com "` calls `sendVerificationOtp` with `som@x.com`.
  - `shows the error message when sending fails` — `{ error: { message: "…" } }` renders in `role="alert"`.
  - `submits the code and redirects to /` — `signIn.emailOtp` called with email and code; `router.replace("/")`.
  - `rejects an unsafe redirectTo` — `redirectTo="//evil.com"` → replaces with `/`.
  - `submit button shows loading while pending` — `aria-busy="true"`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `(app)/page.tsx` (server): user → `loadActor` → `redirect(landingPath(actor))`, no actor → `/no-access`. `/no-access` shows "You don't have access yet. Ask a manager to send you an invite." and a sign-out Button (`authClient.signOut()` then `/sign-in`).
- [ ] **Step 4:** Run tests and `npm run check`. Manually: sign in with an uninvited email on dev. Expected: lands on `/no-access`.
- [ ] **Step 5:** Commit: `feat(auth-ui): email code sign-in, landing redirect, no-access`.

---

### Task 8: Invitations — create, revoke, accept

**Files:**
- Create: `src/features/invitations/service.ts`, `src/features/invitations/delivery.ts`, `src/features/invitations/actions.ts`, `src/app/(public)/invite/[token]/page.tsx`, `src/app/(public)/invite/[token]/accept-panel.tsx`
- Test: `tests/integration/invitations.test.ts`

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces:
  - `type InviteInput = { firstName: string; lastName: string; email: string; locationId: string; roleId: string }` (validated with Zod; email trimmed, lower-cased).
  - `createInvitation(actor: Actor, input: InviteInput): Promise<{ invitationId: string; inviteUrl: string }>` — requires `staff.invite` at `input.locationId`; `assertCanInviteWithRole`; existing `active`/`suspended` employee with that email → `Conflict("already on the team")`; existing `invited` employee → revoke its open invitations and reuse the row; `left` employee → set back to `invited`; writes `invitation.created` (and `invitation.revoked` for replaced ones).
  - `revokeInvitation(actor: Actor, invitationId: string): Promise<void>` — requires `staff.invite` at the invitation's location.
  - `getInvitationPreview(rawToken: string): Promise<{ status: "valid" | "expired" | "revoked" | "accepted" | "unknown"; organizationName?: string; locationName?: string; roleName?: string; maskedEmail?: string }>` — `maskedEmail` = first letter + `•••` + `@domain`.
  - `acceptInvitation(user: SessionUser, rawToken: string): Promise<{ employeeId: string }>` — in one transaction with `SELECT … FOR UPDATE` on the invitation; validates status and `lower(user.email) = invitation.email`; sets `auth_user_id`, status `active`, creates the assignment (org-wide when `grants_org_wide`), marks accepted, writes `invitation.accepted` and `role.granted`. If already accepted by this same auth user → returns the employee id (idempotent). Mismatched email → `Forbidden("wrong account")`. Any other state → `Invalid(status)`.
  - `interface InviteDelivery { deliver(invite: { email: string; inviteUrl: string; inviterName: string }): Promise<{ method: "link" }> }`, `linkDelivery` (returns the link for the UI to show).
  - Server actions `createInvitationAction(formData)`, `revokeInvitationAction(formData)`, `acceptInvitationAction(token)`; each calls `requirePermission`/`getSessionUser` first and maps `AppError` to `{ ok: false, message }`.

- [ ] **Step 1: Write failing tests** in `tests/integration/invitations.test.ts`:
  - `manager invites employee at own location` — returns URL containing `/invite/`; employee row `invited`; audit `invitation.created`.
  - `manager cannot invite at another location` — `Forbidden`.
  - `manager cannot invite a manager` — `Forbidden`.
  - `email is normalised` (Review Focus 1) — invite `" Som@Example.com "`, accept as `som@example.com` succeeds.
  - `wrong account cannot accept` (Review Focus 2) — `Forbidden`, invitation still open, employee still `invited`.
  - `accept is idempotent for the same user` (Review Focus 3) — second call returns same id; exactly one active assignment.
  - `expired invitation` — set `expires_at` in the past → `Invalid("expired")`; preview status `expired`.
  - `revoked invitation cannot be accepted` — `Invalid("revoked")`.
  - `re-invite replaces the open invite` (Review Focus 4) — old invite `revoked_at` set, same employee id, old token preview `revoked`.
  - `inviting an active member is refused` (Review Focus 4) — `Conflict`.
  - `owner invitation grants org-wide owner on accept` — using `runOwnerSetup` output; actor `hasPermission(…, "audit.view", "organization")` true.
  - `preview masks the email` — `s•••@example.com`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the service, delivery and actions.
- [ ] **Step 4:** Implement `/invite/[token]`: server component calls `getInvitationPreview`; non-valid statuses render a clear `Banner` ("This invite has expired — ask for a new one", etc.). Valid + signed out → summary ("You're invited to Glai Gung Won as Employee at …") and `SignInForm redirectTo="/invite/<token>"`. Valid + signed in → `AcceptPanel` (client) calling `acceptInvitationAction`; on success `router.replace("/")`; on wrong account shows "This invite is for s•••@example.com" plus sign-out Button. Accepted + same user → redirect `/`.
- [ ] **Step 5:** Run tests and `npm run check`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(invitations): invite, revoke and accept with audit`.

---

### Task 9: App shell and navigation

**Files:**
- Create: `src/server/nav.ts`, `src/components/shell/{app-shell,nav-bar,experience-switcher,offline-banner}.tsx`, `src/app/(app)/layout.tsx`, `public/manifest.webmanifest`, `public/sw.js`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `src/components/shell/register-sw.tsx`
- Test: `tests/unit/nav.test.ts`, `tests/unit/components/offline-banner.test.tsx`

**Interfaces:**
- Consumes: `Actor`, `hasPermission`, `EXPERIENCES` (Task 4); `requireActor` (Task 5).
- Produces: `type NavItem = { label: string; href: string; icon: string }`, `navFor(actor: Actor, experience: "owner" | "manager" | "employee"): NavItem[]`, `experiencesFor(actor: Actor): Array<"owner"|"manager"|"employee">`. Nav per experience: employee → Today `/hub`, Profile `/hub/profile`; manager → Staff `/manager`; owner → Overview `/owner`, Roles `/owner/roles` (`roles.manage`), Locations `/owner/locations` (`locations.manage`), Audit `/owner/audit` (`audit.view`). An item appears only if its permission is held with scope `"any"`.
- `AppShell({ actor, experience, children })` — bottom tabs below `md` (768 px), sidebar at `md`+; switcher only when `experiencesFor(actor).length > 1`.

- [ ] **Step 1: Write failing tests:**
  - `tests/unit/nav.test.ts`: `employee sees only hub items`; `owner sees Roles, Locations, Audit`; `owner-role-without-audit (custom matrix) hides Audit`; `experiencesFor manager+employee → ["manager","employee"]`.
  - `tests/unit/components/offline-banner.test.tsx`: `hidden when online`; `shows "You're offline" after an offline event`; `hides again after online`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `(app)/layout.tsx` calls `requireActor()`; on `Unauthenticated` redirect `/sign-in`, on `Forbidden` redirect `/no-access`. Each page additionally calls `requirePermission` for its own permission. Service worker caches only the shell assets and an offline fallback page; no API or data caching.
- [ ] **Step 4:** Run tests and `npm run check`. Manually at 375 px and 1024 px widths: tabs vs sidebar.
- [ ] **Step 5:** Commit: `feat(shell): responsive app shell, permission-filtered nav, offline banner`.

---

### Task 10: Employee Hub and profile

**Files:**
- Create: `src/features/staff/service.ts` (profile part), `src/features/staff/actions.ts`, `src/app/(app)/hub/page.tsx`, `src/app/(app)/hub/profile/page.tsx`, `src/app/(app)/hub/profile/profile-form.tsx`
- Test: `tests/integration/profile.test.ts`

**Interfaces:**
- Produces: `updateOwnProfile(actor: Actor, input: { displayName: string; phone: string | null }): Promise<void>` — requires `profile.edit_own` scope `"any"`; `displayName` 1–60 chars trimmed; phone optional, digits/spaces/`+()-` up to 20; writes `employee.profile_updated` with before/after. Action `updateOwnProfileAction(formData)`.

- [ ] **Step 1: Failing tests:** `updates own display name and phone with audit`; `rejects empty display name` (`Invalid`); `cannot change email or status through profile` (extra fields ignored; email unchanged).
- [ ] **Step 2:** Run. FAIL. **Step 3:** Implement service, action, pages. Hub: `PageHeader` "Good morning, {displayName}" by location timezone, location name, three `EmptyState` cards ("Checklists", "Prep", "Notes") reading "Coming soon". **Step 4:** Run tests and check. PASS.
- [ ] **Step 5:** Commit: `feat(hub): employee hub and own profile`.

---

### Task 11: Manager Workspace

**Files:**
- Modify: `src/features/staff/service.ts`, `src/features/staff/actions.ts`
- Create: `src/app/(app)/manager/page.tsx`, `src/app/(app)/manager/invite-form.tsx`, `src/app/(app)/manager/pending-invites.tsx`
- Test: `tests/integration/staff-list.test.ts`

**Interfaces:**
- Produces: `listStaff(actor: Actor, opts?: { locationId?: string }): Promise<Array<{ employeeId: string; displayName: string; email: string; status: EmployeeStatus; roles: Array<{ roleName: string; locationName: string | null }> }>>` — requires `staff.view`; restricted to `allowedLocationIds`. `listPendingInvitations(actor: Actor): Promise<Array<{ invitationId: string; email: string; roleName: string; locationName: string; expiresAt: Date }>>` — requires `staff.invite`; open, unexpired only; within allowed locations. `listInvitableRoles(actor: Actor, locationId: string)` — roles passing `assertCanInviteWithRole`.

- [ ] **Step 1: Failing tests:** `manager sees only staff at own location` (Review Focus location isolation); `owner sees all locations`; `employee cannot list staff` (`Forbidden`); `pending list excludes expired, revoked, accepted`; `manager's invitable roles are Employee only`.
- [ ] **Step 2:** Run. FAIL. **Step 3:** Implement services and the page: staff `ListRow`s with status `Badge`; invite form (`Field`s, role `Select` from `listInvitableRoles`); after create, a `Dialog` shows the link with a Copy button and "Send this link to {name} by text or email. It expires in 7 days."; pending list with Revoke (confirm `Dialog`). **Step 4:** Run tests and check. PASS.
- [ ] **Step 5:** Commit: `feat(manager): staff list, invite with shareable link, pending invites`.

---

### Task 12: Owner Dashboard — staff management, roles, locations, audit

**Files:**
- Modify: `src/features/staff/service.ts`, `src/features/staff/actions.ts`
- Create: `src/features/roles/{service,actions}.ts`, `src/features/locations/{service,actions}.ts`, `src/features/audit/service.ts`, `src/app/(app)/owner/{page,staff/[id]/page,roles/page,locations/page,audit/page}.tsx` plus client form components beside them
- Test: `tests/integration/staff-manage.test.ts`, `tests/integration/roles.test.ts`, `tests/integration/locations.test.ts`, `tests/integration/audit.test.ts`

**Interfaces:**
- Produces:
  - `setEmployeeStatus(actor, employeeId, status: "active" | "suspended" | "left"): Promise<void>` — `staff.manage` org-wide or at a location where the target has an assignment; `assertNotSelf`; last-Owner rule; audit.
  - `grantRole(actor, { employeeId, roleId, locationId: string | null }): Promise<void>` — `staff.manage` at scope; `assertCanGrant`; `assertNotSelf`; audit `role.granted`.
  - `revokeRole(actor, assignmentId): Promise<void>` — `staff.manage`; `assertNotSelf`; last-Owner rule; sets `revoked_at`/`revoked_by_employee_id`; audit.
  - `countActiveOrgOwners(tx, organizationId): Promise<number>` — active employees with an unrevoked org-wide assignment of role key `owner`.
  - `createRole(actor, { key, name, description })` — `roles.manage` org-wide; key `^[a-z][a-z0-9_]{1,30}$`, not a system key.
  - `setRolePermissions(actor, roleId, permissions: Permission[])` — `roles.manage`; unknown keys → `Invalid`; `owner` system role → `Forbidden("owner role permissions are fixed")`; audit with before/after.
  - `listLocations(actor)`, `createLocation(actor, { name, address, timezone })`, `updateLocation(actor, id, { name?, address?, timezone?, status? })` — `locations.manage`; timezone validated with `Intl.supportedValuesOf("timeZone")`; closing the last active location → `Invalid`.
  - `listAudit(actor, { limit = 50, before?: Date }): Promise<Array<{ id; createdAt; action; actorName: string | null; entityType; entityId; locationName: string | null }>>` — `audit.view` org-wide; newest first; keyset pagination on `created_at`.

- [ ] **Step 1: Failing tests:**
  - `staff-manage`: `owner suspends a manager and the manager is blocked next request`; `cannot suspend self`; `cannot remove the last owner` (suspend, mark left, revoke owner role all → `Conflict`); `second owner allows removing the first`; `manager cannot change status` (`Forbidden`); `grant beyond own permissions is refused`; `revoked role row keeps history` (row present with `revoked_at`).
  - `roles`: `create custom role`; `reject system key`; `set permissions writes audit before/after`; `unknown permission rejected`; `owner role permissions are fixed`.
  - `locations`: `create with default timezone`; `invalid timezone rejected`; `cannot close the last active location`.
  - `audit`: `lists newest first with actor names`; `paginates with before`; `manager cannot read audit` (`Forbidden`).
- [ ] **Step 2:** Run. FAIL. **Step 3:** Implement services and actions. **Step 4:** Implement pages: Overview (counts of active staff, pending invites, locations; `EmptyState` cards "Sales", "Food cost", "Labour" — "Connect your POS in a later phase"); staff detail with status `Select` and role grant/revoke (confirm `Dialog` for suspend/left/revoke); roles page with permission checkboxes grouped by area, owner role read-only; locations list and form; audit table with "Load more". **Step 5:** Run tests and check. PASS.
- [ ] **Step 6:** Commit: `feat(owner): staff management, roles, locations and audit log`.

---

### Task 13: End-to-end tests, documentation and deploy check

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/access.spec.ts`, `docs/architecture.md`, `docs/permissions.md`, `docs/decisions/0001-identity-neon-auth-app-permissions.md`, `docs/decisions/0002-drizzle-migrations.md`, `docs/decisions/0003-email-code-sign-in-and-link-invites.md`
- Modify: `.github/workflows/ci.yml` (e2e against Vercel preview via `deployment_status` event), `CLAUDE.md` (link docs)

**Interfaces:**
- Consumes: everything above. E2E base URL from `E2E_BASE_URL` (default `http://localhost:3000`).

- [ ] **Step 1: Write the e2e tests** in `tests/e2e/access.spec.ts`:
  - `sign-in page loads with email field` — `getByLabel("Email")` visible.
  - `signed-out visitor is redirected from /hub, /manager, /owner to /sign-in`.
  - `invalid invite token shows the not-found message` — `/invite/abc` shows "This invite link isn't valid".
  - `signed-out visitor cannot reach /no-access or /owner/audit` — both redirect to `/sign-in` and the response body contains no audit rows.

  (Server actions themselves are covered by the integration tests on each service and on `requirePermission`; actions are thin wrappers.)
- [ ] **Step 2:** Run `npm run build && npm run start` and `npm run test:e2e`. Expected: PASS.
- [ ] **Step 3:** Write the docs: `architecture.md` (overview diagram in Mermaid, folder map, request flow through `requirePermission`, roadmap section copied from spec section 15 with "connect" items marked), `permissions.md` (catalog, matrix, scopes, guardrails), three ADRs (context, decision, consequences; ≤ 1 page each).
- [ ] **Step 4:** Push the branch and open a pull request; confirm Vercel preview builds and CI is green. Then the owner runs `npm run setup:owner` against production `DATABASE_URL` locally, opens the printed link, signs in, and reaches `/owner` — the spec's first "done when" check.
- [ ] **Step 5:** Run the spec section 17 checklist manually on the preview (Owner invites Manager, Manager invites Employee, each lands correctly and is blocked from the others; uninvited email sees No access; suspension blocks; audit shows all). Record results in the PR description.
- [ ] **Step 6:** Commit: `test(e2e): access checks; docs: architecture, permissions, ADRs`.

---

## Owner actions summary (in order)

1. Task 3: create Neon `test` branch; set `DATABASE_URL`, `TEST_DATABASE_URL` locally and `TEST_DATABASE_URL` in GitHub secrets.
2. Task 5: enable Neon Auth + Email OTP on both branches; set `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `APP_URL` locally and in Vercel; add trusted domains.
3. Task 13: run `npm run setup:owner` once against production.
4. Before inviting real staff: configure custom SMTP in Neon Auth.
