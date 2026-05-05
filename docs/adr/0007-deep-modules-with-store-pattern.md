# ADR-0007: Deep modules with pure functional core + Store pattern

**Status:** Accepted
**Date:** 2026-02-20 (MVP build, retroactively recorded 2026-05-05)
**References:** John Ousterhout, _A Philosophy of Software Design_; [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §1; [`CLAUDE.md`](../../CLAUDE.md) "Architecture Rules"

## Context

ShayFinance is built primarily by AI workers reading the codebase cold. Two recurring failure modes had to be designed against:

- **Tests that mock the DB.** Mocking ORM calls produces tests that pass while the underlying SQL silently breaks. Phase 1 contained early examples; the regression cost was high.
- **Workers writing shallow wrappers around DB calls.** Logic spreads across components and route handlers; the same dedup or matching rule gets re-implemented in three places, then drifts.

The chosen pattern, applied across all 9 MVP modules:

- **Public interface** is one file (`index.ts`) — the only thing consumers import.
- **Pure functional core** — computation lives in functions that take data and return data. No DB access, no I/O. Examples: `categorize` in `src/lib/categories/rules.ts`, `computeMonthlySummary` in `src/lib/analytics`, `importTransaction` in `src/lib/transactions/import.ts`.
- **DB-backed wrapper** — fetches data, calls the pure function, persists the result. Examples: `categorizeTransaction`, `getMonthlySummary`.
- **Store interface for the persistence boundary** — a TypeScript interface (e.g. `TransactionStore`) consumed by the pure orchestration logic. The Drizzle implementation is one of potentially many; tests provide an in-memory implementation. Reference: `src/lib/transactions/import.ts`.
- **Zod schemas at the API boundary** — every API route and Server Action validates input through a Zod schema co-located with the module that owns the type.

`src/lib/analytics` is the reference implementation: 13 tests cover the pure layer exhaustively (savings rate, all five category types, division-by-zero, empty months) without ever touching a database.

## Decision

Every domain module in `src/lib/` follows this shape. New Phase 2 modules — `transaction-matching`, `reconciliation`, `recurring-detection`, `logging` — are designed to fit it. The exceptions are `scheduler` and `ai-categorization` (deferred per ADR-0005), which are thin orchestrators with no testable pure layer; they don't get unit tests.

The TDD discipline is: tests first, against the pure core, through the public interface. Tests must not mock the DB; they exercise either pure functions or in-memory `Store` implementations.

## Consequences

- **Locks in:** the directory shape (`index.ts`, pure modules, `store.ts`, `index.test.ts`) for every domain module. Workers can predict where to put new code without asking.
- **Locks in:** "tests mocking Drizzle calls" is a code-review-blocking pattern. The Store interface exists specifically to remove the temptation.
- **Locks in:** computation is testable without spinning up Postgres. CI runtime stays low; Vitest handles 58+ tests in seconds.
- **Precludes:** "thin module" patterns where logic leaks into route handlers or React components. If a route handler does anything beyond Zod-parse → call module → return, it's wrong.
- **Implications for new modules:** if there's no pure layer worth testing in isolation, the module probably shouldn't exist as a separate module — fold it into an existing one or accept it as a thin orchestrator (and document the exception, like `scheduler`).
- **AI navigability:** workers reading the codebase find the same shape everywhere. The cost of onboarding a new domain area is a single `index.ts` read.
- **Phase 2 enforcement:** `transaction-matching` is the canonical example for shared primitives — it exists specifically because both `reconciliation` and `recurring-detection` need the same Hebrew normalization, and without extraction the implementations would silently diverge (see `ARCHITECTURE.md` §2).
