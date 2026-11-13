# 0002. Drizzle ORM and versioned SQL migrations

Status: accepted (2026-11-06)

## Context

The app uses Neon Postgres. It needs typed queries, reviewable schema changes, and a light footprint on Vercel.

## Decision

Use Drizzle ORM for data access and drizzle-kit for migrations. Schema lives in `src/db/schema/*.ts`, one file per table group. Generated SQL lives in `src/db/migrations/` and is committed.

Conventions: UUID primary keys (`gen_random_uuid()`), `created_at` and `updated_at` as `timestamptz` (UTC), and `organization_id` on every table. No hard deletes in application code; inactive rows use a status field or `revoked_at` / `ended_at`.

Migrations are applied with the direct (non-pooler) Neon URL. Migrations that drop or rewrite data need explicit owner approval before they run. Tests that touch a database use `TEST_DATABASE_URL` (a Neon test branch), never `DATABASE_URL`.

## Consequences

- Schema changes are plain SQL files that can be read in review.
- Queries are typed against the schema.
- Soft-state columns add filters to queries; data-access functions must apply them.
- Integration tests need a separate Neon branch.
