# ADR-0003: Sequential bank scraping with per-bank failure isolation

**Status:** Accepted
**Date:** 2026-03-10 (MVP build, retroactively recorded 2026-05-05)

## Context

ShayFinance scrapes three Israeli banks: Bank Discount, Max, and Cal. The library is `israeli-bank-scrapers-core` driving a Puppeteer browser. Two design questions had to be resolved:

1. **Concurrency** — run all banks in parallel for speed, or sequentially?
2. **Failure handling** — if one bank fails (login error, OTP timeout, site change), should the whole sync abort or should the others continue?

Constraints and observations:

- Each bank requires a fresh Puppeteer browser instance (heavy: ~150–250 MB RAM during scrape).
- Bank Discount issues an OTP that the user has to type within 3 minutes. Running multiple OTP-issuing banks in parallel would create overlapping prompts the user couldn't track.
- Bank sites change without notice. A failure in Max should not cost the user their Discount and Cal data for that sync.
- The user is human, watching SSE progress in the UI. Sequential progress reads naturally; parallel logs are confusing.

## Decision

- **Sequential:** Discount → Max → Cal, one at a time.
- **Per-bank failure isolation:** each bank runs in its own try/finally. A failure (any kind) is yielded as a typed error event over SSE, the browser is closed in `finally`, and the next bank starts. Failed banks do not block the rest.
- **Streaming import:** transactions are imported per-bank as they arrive, not batched at the end of the sync. If sync aborts mid-run, partial progress is persisted.
- **Browser lifecycle:** one Puppeteer browser per bank, created at the start of that bank's run, closed in the `finally` block. Never reused across banks.

## Consequences

- **Locks in:** sync duration scales with `sum(per-bank time)`, not `max(per-bank time)`. ~3–5 minutes total when all three succeed.
- **Locks in:** the SSE event protocol (per-bank progress, per-bank errors, OTP request/response) is the user-facing contract. New banks must fit this protocol.
- **Precludes:** simple parallelisation as a "speed-up" — would require redesigning OTP UX, error reporting, and the user's mental model.
- **Implications for Phase 2 scheduler:** background sync (BACKLOG.md) inherits this contract. The scheduler injects an OTP-skip handler instead of blocking; banks that need OTP are skipped, the rest run. This is consistent with per-bank failure isolation.
- **Phase 2 reconciliation:** because import is per-bank streaming, reconciliation runs _after_ the full sync completes (post-import hook in the sync orchestrator) — see `ARCHITECTURE.md` §5.
