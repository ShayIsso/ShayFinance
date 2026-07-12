# ADR-0009: Generated migrations from a marked-applied baseline

**Status:** Accepted (Phase 3). Supersedes [ADR-0006](./0006-db-push-until-phase-2-stabilises.md).
**Date:** 2026-07-12 (migration bootstrap, GitHub issue [#104](https://github.com/ShayIsso/ShayFinance/issues/104), map [#97](https://github.com/ShayIsso/ShayFinance/issues/97))
**Evidence:** ADR-0006 (the destructive-migration trap and the bootstrap plan), [`BACKLOG.md`](../../BACKLOG.md) history §"Bootstrap Drizzle Migration System"

## Context

ADR-0006 kept `db:push` for Phase 2 and scheduled a one-time bootstrap chore once enough schema churn justified it. Phase 2 accumulated well past the 3-slice trigger (reconciliation columns, `recurring_expenses`, `sync_runs`, `scheduler_config`), and Phase 3's charted slices (AI suggestions, provenance columns, merchant memory, budgets, goals, hierarchical categories) all touch schema — each would widen the gap between the schema file and any migration history.

The trap ADR-0006 documented still applies: a first `drizzle-kit generate` with no baseline produces a create-everything migration that would destroy the live dev DB (861 real transactions at bootstrap time). The bootstrap ritual defuses it by making history start from a baseline the migrator believes is already applied.

One deviation from ADR-0006's sketch: the baseline was **generated from `src/db/schema.ts`**, not from `drizzle-kit introspect`. Both were produced and diffed first; the only differences were cosmetic (explicit default `text_ops` operator classes on four unique indexes in the introspected output). Generating from the schema file makes the baseline snapshot exactly match the source of truth, so subsequent `generate` runs diff cleanly — verified by an immediate re-run reporting "No schema changes".

## Decision

**All schema changes from this point ship as generated migrations.** The bootstrap, performed 2026-07-12 against the live dev DB:

1. `pg_dump -Fc` backup (owner-run, per the standing backup-before-schema-ops rule).
2. `drizzle-kit generate` from `src/db/schema.ts` → `drizzle/0000_baseline.sql` (+ `meta/` snapshot and journal), committed to the repo.
3. Baseline marked applied (owner-run): row in `drizzle.__drizzle_migrations` with `hash` `97528b1fac1c172a86e84e4123985af50b9128b4f0847a12d2cbebf3833c5cc4` (sha256 of `0000_baseline.sql`) and `created_at` `1783871612911` (the journal `when`).
4. Verified: marker row reads back exactly; `npm run db:migrate` is a no-op (still one row, data untouched).

The workflow is now:

- Schema changes go in `src/db/schema.ts`, then `npm run db:generate` produces the migration; the SQL file is reviewed and committed with the slice.
- Applying migrations (`npm run db:migrate`) remains **owner-only** (Shay), preceded by a `pg_dump` backup, and verified after with `to_regclass`/`information_schema`.
- `npm run db:push` must no longer be used — it bypasses history and would desynchronise the snapshot. The script stays in `package.json` only for emergency owner use.
- Migration files are immutable once merged; a wrong migration is corrected by a new one, never by editing history.

## Consequences

- **Locks in:** historical schema records from the baseline forward; an offline application path; the Phase 4 remote/multi-environment option ADR-0006 explicitly precluded is unblocked.
- **Locks in:** the baseline is a permanent no-op — its journal timestamp equals the marker row's `created_at`, and the migrator only applies entries with a strictly newer timestamp.
- **Fresh environments** (new dev DB, production container) now build the schema via `npm run db:migrate` from an empty database instead of `db:push`.
- **Precludes:** hand-applied DDL drift. If the DB is ever changed outside a migration, `generate` will surface the drift as a spurious diff against the snapshot.
- **Owner-only boundary unchanged:** workers generate and commit migration files; only Shay applies them.
