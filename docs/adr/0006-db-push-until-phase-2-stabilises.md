# ADR-0006: Use `db:push` for schema changes until Phase 2 stabilises

**Status:** Accepted (interim). Will be superseded by an ADR introducing generated migrations once Phase 2 accumulates 3+ schema-changing slices.
**Date:** 2026-04-22 (R1 reconciliation schema work, PR #66)
**Related:** [`BACKLOG.md`](../../BACKLOG.md) §"Bootstrap Drizzle Migration System"

## Context

Drizzle supports two schema-change workflows:

- **`drizzle-kit push`** — diffs the schema file against the live DB and applies changes directly. No migration files generated. No history.
- **`drizzle-kit generate`** — produces SQL migration files committed to the repo, applied via a migrator. Standard for multi-environment deployment.

Phase 1 used `db:push` exclusively — no migration files have ever been generated for this project. When Phase 2's reconciliation work (issue #46, PR #66) prepared to introduce 4 new columns + a seeded category, the worker proposed running `drizzle-kit generate` for the first time.

**The discovery that forced this ADR:** a `generate` run against the current schema, with no prior baseline, produces a single migration that re-creates the entire schema as if from scratch. Applied to the dev DB containing Shay's 400+ real transactions, this would have wiped the data. The migrator has no way to know "this DB already has tables matching this schema" without a baseline marker in `__drizzle_migrations`.

The alternatives:

1. **Continue with `db:push`** — accept the lack of history, ship Phase 2 features without the ceremony.
2. **Bootstrap generated migrations now** — `drizzle-kit introspect` against the current dev DB to produce `0000_baseline.sql`, mark it already-applied via `INSERT INTO __drizzle_migrations`, then `generate` for new changes. Higher upfront cost, history starts now.
3. **Skip the bootstrap, add a "wait for Phase 2 to stabilise" tracking item** — keep `db:push`, capture the bootstrap as tech debt to be done once enough schema churn justifies the one-time cost.

## Decision

**Use `db:push` for all Phase 2 schema changes.** Do not generate migrations until Phase 2 has accumulated 3+ schema-changing slices. At that point, perform the bootstrap chore once: introspect the production-like dev DB, mark the baseline applied, and generate from there.

Until that bootstrap lands, the workflow is:

- Schema changes go in `src/db/schema.ts`.
- Workers and Shay run `npm run db:push` after pulling.
- No `migrations/` folder exists, and `drizzle-kit generate` must not be run.

## Consequences

- **Locks in for now:** no historical schema records, no offline migration application path, no multi-environment story. Acceptable because the deployment is single-user local/Docker only.
- **Locks in:** the destructive-migration trap is documented and won't bite a Phase 2 worker who tries to "do it properly". Anyone proposing `drizzle-kit generate` must perform the introspect-then-baseline ritual first.
- **Precludes:** any near-term move to remote / multi-environment deployment that would require migration history. The Phase 4 cloud option (BACKLOG.md) cannot land before this ADR is superseded.
- **Triggers re-evaluation when:** Phase 2 has accumulated 3+ schema-changing slices (currently 1 — the R1 reconciliation columns). At that point, do the bootstrap chore in a dedicated PR, write the superseding ADR, and switch to generated migrations from that day forward.
