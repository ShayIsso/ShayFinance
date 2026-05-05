# ADR-0001: Drizzle ORM over Prisma

**Status:** Accepted
**Date:** 2026-02-01 (MVP build, retroactively recorded 2026-05-05)

## Context

ShayFinance needs a TypeScript ORM for PostgreSQL. Two mainstream options were considered:

- **Prisma** — generates a typed client from a schema file, runs its own migration engine, ships a query API that abstracts SQL.
- **Drizzle** — TypeScript-first schema definitions with SQL-like query builder; lightweight migration tooling (`drizzle-kit push` / `generate`).

Constraints:

- Single-user, self-hosted, local/Docker only. No managed cloud DB.
- Schema is small (5 tables) but evolves rapidly during MVP and Phase 2.
- The query patterns are simple (filtered SELECTs, INSERTs with `onConflictDoUpdate`, occasional joins) — no need for the higher-level abstractions Prisma provides.
- Bundle size matters for the standalone Next.js Docker image; Prisma's generated client and query engine binary add weight.

## Decision

Use Drizzle ORM. Schema lives in `src/db/schema.ts` as TypeScript declarations; queries are written as composable Drizzle expressions; migrations are managed via `drizzle-kit`.

## Consequences

- **Locks in:** TypeScript-native schema definitions; SQL-like query building; raw `pgTable` / `pgEnum` primitives across the codebase.
- **Precludes:** Prisma-style relation autoloading, Prisma Studio, the Prisma migration narrative.
- **Implications:** writing queries reads close to SQL — easy to audit, but no automatic relation graph traversal. Workers must be comfortable with explicit joins.
- **Migration approach:** `db:push` is used until Phase 2 stabilises — see [ADR-0006](./0006-db-push-until-phase-2-stabilises.md) and the `BACKLOG.md` entry "Bootstrap Drizzle Migration System". Generated migrations will land via the introspect-then-baseline ritual once Phase 2 has 3+ schema-changing slices.
