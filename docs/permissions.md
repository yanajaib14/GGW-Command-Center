# Permissions

Source of truth: `src/server/auth/permissions.ts` (catalog and default matrix) and the foundation spec, section 8.

## Status

In place: the catalog, the frozen default matrix, scopes (`hasPermission`, `allowedLocationIds`), the guardrail functions `assertCanGrant`, `assertCanInviteWithRole` and `assertNotSelf`, permission-filtered navigation in `src/server/nav.ts`, and the server gate `requirePermission` / `requireActor` in `src/server/auth/require.ts`. Loading permissions from the database (`loadActor` in `src/server/auth/load-actor.ts`, through `isPermission`) is written; it is verified once the test database is configured.

Planned, not built yet: the last-Owner rule, audit log writes, the staff and role services, and `npm run setup:owner`. Sections below mark each item.

## Catalog

| Key | Meaning |
|---|---|
| `dashboard.employee` | Open the Employee hub. |
| `dashboard.manager` | Open the Manager dashboard. |
| `dashboard.owner` | Open the Owner dashboard. |
| `profile.edit_own` | Edit your own profile. |
| `staff.view` | See staff in your scope. |
| `staff.invite` | Invite people into a role you are allowed to grant. |
| `staff.manage` | Change staff roles and status. |
| `roles.manage` | Create roles and change role permissions. |
| `locations.manage` | Create and change locations. |
| `audit.view` | Read the audit log. |

The catalog is a typed list in code (in place). The database stores which roles hold which keys (`role_permissions`, unrevoked rows only); `loadActor` drops unknown keys through `isPermission`.

## Role matrix

| Permission | Owner | Manager | Employee |
|---|:-:|:-:|:-:|
| `dashboard.employee` | yes | yes | yes |
| `dashboard.manager` | yes | yes | |
| `dashboard.owner` | yes | | |
| `profile.edit_own` | yes | yes | yes |
| `staff.view` | yes | yes | |
| `staff.invite` | yes | yes | |
| `staff.manage` | yes | | |
| `roles.manage` | yes | | |
| `locations.manage` | yes | | |
| `audit.view` | yes | | |

`DEFAULT_ROLE_PERMISSIONS` holds this matrix. It is frozen. The setup command (`npm run setup:owner`, planned) will copy it into the database; after that, the database is what counts.

## Scopes

A role assignment is either organization-wide (no location) or tied to one location. A check names the scope it needs:

| Scope | Passes when |
|---|---|
| `{ locationId }` | The actor holds the permission at that location, or organization-wide. |
| `"organization"` | The actor holds the permission through an organization-wide assignment. |
| `"any"` | The actor holds the permission anywhere. Use for navigation and landing, never for data access. |

Examples:

- A Manager at location A passes `staff.view` for `{ locationId: A }`. It fails for `{ locationId: B }` and for `"organization"`. It passes for `"any"`.
- An Owner with an organization-wide assignment passes every scope.
- An actor who is Employee at A and Manager at B has the union: `staff.invite` at B only.

`allowedLocationIds(actor, permission)` returns `"all"` if any holding assignment is organization-wide, otherwise the de-duplicated list of locations. Data queries filter by it.

## Guardrails

Status is marked per rule. The functions live in `src/server/auth/guardrails.ts`.

- **No escalation (in place).** An actor can grant only a role whose permissions they all hold at that scope. Inviting into a role that includes `staff.invite` also needs `staff.manage` at that scope, so Managers can invite Employees only.
- **Last Owner (planned).** The last active, organization-wide Owner cannot be revoked, suspended or marked as left.
- **No self-change (in place, `assertNotSelf`).** An actor cannot change their own role assignments or status.
- **Audit (planned).** Invitations (created, accepted, revoked, expired on use), role grants and revokes, employee status changes, role permission changes, location changes and setup runs each write an audit entry in the same transaction as the change.

`assertCanGrant` and `assertCanInviteWithRole` are not gates by themselves. Call `requirePermission("staff.manage" | "staff.invite", scope)` first.

## Adding a permission

1. Add the key to `PERMISSIONS` in `src/server/auth/permissions.ts`.
2. Decide which default roles hold it and update `DEFAULT_ROLE_PERMISSIONS`.
3. Update `EXPECTED` in `tests/unit/permissions.test.ts` (it checks all keys and every role).
4. Write a migration that adds the key to the matching system roles in existing databases. Do not run it without owner approval if it changes existing data.
5. Call `requirePermission` with the new key in every action or page that needs it.
6. If it affects navigation, update `src/server/nav.ts` and its test.
7. Update this file and the matrix in the spec.
