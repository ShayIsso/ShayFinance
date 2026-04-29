# ShayFinance — Phase 2 PRD

**Status:** Approved · In progress
**Date:** 2026-04-24 (last updated 2026-04-25)
**Parent:** [PRD-v1](./PRD-v1.md)
**Kickoff Context:** [phase2-kickoff.md](./phase2-kickoff.md)
**GitHub Issue:** [#35](https://github.com/ShayIsso/ShayFinance/issues/35)
**AI Spike Outcome:** [NO-GO — see report](./ai-categorization-spike.md)

---

## Problem Statement

Phase 1 shipped a private, self-hosted finance dashboard that imports, deduplicates, and categorizes transactions from three Israeli banks. But as Shay uses it daily against real account data, four problems stand in the way of trusting the numbers and living inside the app:

1. **Wrong totals.** The same money gets counted twice. On credit-card settlement day ("יום החיוב"), the bank deducts the total monthly charge as a single line — but the individual card transactions are already imported from Max/Cal. Income and expense totals double. The same pattern appears on debit cards and Bit: a single outflow appears on both the card-ledger and the bank-ledger. No matter how clean the categorization is, the savings rate and expense totals are structurally wrong until this is fixed.

2. **Stale data.** Syncing is fully manual. There's no "open the app in the morning and see yesterday reconciled" — every check requires manually triggering a sync.

3. **Manual categorization burden.** Each new merchant has to be hand-categorized until the user creates a rule. No AI fallback, no retroactive rule application — creating a rule today only helps tomorrow's transactions.

4. **MVP aesthetic.** The app looks like a template, not a tool someone uses daily. Charts are unreadable when categories overflow. Forms are verbose and fragile. Loading states are literal "טוען..." strings.

Phase 1 was correct for getting to working software in one session. Phase 2 is the work that makes it a tool Shay actually trusts and opens every morning.

---

## Solution

Phase 2 is three outcomes compounded into one release:

1. **Trustworthy numbers** via a generic Reconciliation Engine that detects three patterns of same-money duplication (credit-card settlement, debit/Bit 1:1 mirror, inter-account transfer) and neutralizes the artifact side of each pair. Uses a confidence-threshold split: high-confidence matches auto-apply with a subtle toast; medium-confidence matches queue into an inbox-zero `/reconciliation` page with bulk-approve. The analytics module doesn't change — reconciliation works by flipping artifact transactions into seeded "transfer" categories that analytics already excludes.

2. **Automation** via a daily scheduled sync, retroactive rule application, and recurring-expense detection with anomaly alerts for price changes, missed payments, and newly-detected subscriptions. (Local AI-assisted categorization was scoped here as Spike-gated; the Spike returned NO-GO 2026-04-25 — feature is now deferred to Phase 3. See `docs/ai-categorization-spike.md`.)

3. **Production-grade craft** across the codebase (React Hook Form + Zod, Server Actions, shared `transaction-matching` primitives, a scoped architecture pass producing an `ARCHITECTURE.md` blueprint) and the UI (Monarch + Linear reference aesthetic, emerald accent over neutral zinc/stone, `tabular-nums` on all financial amounts, chart redesign, polished loading/empty states).

Phase 2 explicitly does NOT compromise the privacy-first posture of Phase 1. No transaction data ever leaves the host. No third-party APIs. Local Ollama only for AI work.

---

## User Stories

### Accounting Engine — Reconciliation

1. As a user who imports transactions from both a credit card provider (Max) and my bank (Discount), I want the settlement-day lump charge ("חיוב ויזה") to be automatically matched against the sum of that cycle's card transactions and marked as a transfer, so that my monthly expenses aren't double-counted.

2. As a user paying via Bit from a debit card, I want the bank-side deduction and the card-side transaction to be recognized as the same money, so that a ₪50 Bit payment counts as ₪50 in my expenses — not ₪100.

3. As a user with multiple bank accounts, I want an outgoing Bit/transfer in one bank and its corresponding incoming Bit/transfer in another bank to be detected as a pair and both marked as internal transfers, so that moving money between my accounts doesn't appear as both expense and income.

4. As a user, I want reconciliation matches with confidence ≥0.95 to be applied automatically, so that obvious cases don't create work.

5. As a user, I want a subtle, non-blocking toast notification when auto-applied reconciliations occur during a sync, so that I'm aware but not interrupted.

6. As a user, I want reconciliation candidates with confidence between 0.70 and 0.95 to be queued into a dedicated `/reconciliation` inbox page, so that I can review uncertain matches without drowning in noise.

7. As a user in the reconciliation inbox, I want to see the full group of related transactions for each candidate (e.g., "this ₪4,200 lump charge matches these 30 card transactions totaling ₪4,200"), so that I can make an informed decision.

8. As a user in the reconciliation inbox, I want to bulk-approve multiple candidates with a single click, so that clearing the queue feels like processing an email inbox rather than a tedious chore.

9. As a user in the reconciliation inbox, I want to reject a candidate in one click so it returns to its normal state, so that mistakes are easy to undo.

10. As a user, I want reconciliation candidates below 0.70 confidence to be dropped entirely, so that the inbox doesn't fill with low-quality matches.

11. As a user viewing a reconciled transaction in the transactions table, I want to see which group it belongs to and which other transactions are in that group, so that I can trace "why is this marked as transfer."

12. As a user, I want to be able to undo an auto-applied reconciliation on an individual transaction, so that a rare false positive is recoverable.

13. As a user, I want the analytics engine (Net Savings, Savings Rate, category totals) to automatically reflect reconciled transactions without me reconfiguring anything, so that correctness propagates for free.

### Retroactive Rule Application

14. As a user who just created a categorization rule, I want a "Apply to existing transactions" action on that rule, so that all historical uncategorized transactions matching the pattern get the new category.

15. As a user applying a rule retroactively, I want a preview of how many transactions will be affected before I confirm, so that I don't accidentally mis-categorize hundreds of transactions.

16. As a user, I want retroactive application to respect rule priority — a lower-priority rule shouldn't overwrite a transaction already categorized by a higher-priority rule — so that the rule engine behaves consistently between live and retroactive modes.

### Background Scheduler

17. As a user opening my dashboard in the morning, I want to see yesterday's data already synced and reconciled, so that I don't have to manually run a sync before checking my finances.

18. As a user, I want a daily automatic sync at 07:00 that runs each bank sequentially, so that fresh data is ready when I wake up.

19. As a user whose bank occasionally demands OTP on login, I want the scheduler to gracefully skip that bank and continue with the others, so that one bank's MFA prompt doesn't abort the whole run.

20. As a user, I want a "Last sync" strip on the dashboard showing per-bank status (success, otp_skipped, error, transaction count), so that I can tell at a glance whether I need to run a manual sync.

21. As a user, I want to manually trigger a sync for a specific bank that got `otp_skipped` overnight, so that I can top up the data that the scheduler couldn't reach.

22. As a user, I want to configure the schedule time (defaulting to 07:00) in Settings, so that I can align the sync with my morning routine.

23. As a user, I want the scheduler to persist each run into a `sync_runs` history table, so that I can review sync reliability over time.

### AI-Assisted Categorization (gated on Spike)

24. As a user, I want a Spike test that runs a candidate local model (qwen2.5-coder:7b or llama3.1:8b) against 50 real uncategorized Hebrew transactions, so that we have empirical accuracy data before investing in implementation.

25. As a user, if the Spike proves out acceptable accuracy (recommended threshold ≥70%), I want local Ollama to propose categories for uncategorized transactions after the rule engine runs, so that I don't have to manually categorize new merchants.

26. As a user reviewing an AI-proposed category, I want a "Confirm" button that accepts the suggestion and a "Create rule?" prompt that offers to build a reusable rule from it, so that the rule engine compounds over time.

27. As a user, I want all AI categorization to run locally (Ollama in a Docker sidecar) with zero network egress, so that my transaction descriptions never leave my host.

28. As a user, I want the system to keep working (with manual categorization only) if the Ollama sidecar is unreachable, so that AI is strictly an enhancement, never a dependency.

29. As a user, if the Spike proves accuracy is insufficient, I want AI categorization cleanly deferred to Phase 3 without further work, so that scope stays disciplined.

### Recurring Expense Detection

30. As a user, I want the system to automatically detect that I pay Netflix ₪47 monthly, Spotify ₪20 monthly, and rent ₪4,000 monthly, so that I can see my fixed costs separately from discretionary spending.

31. As a user, I want recurring detection to use fuzzy merchant matching (tolerating "NETFLIX.COM" vs "Netflix Israel") with ±10% amount tolerance and ±7-day date tolerance, so that noisy bank descriptions don't break pattern detection.

32. As a user, I want detection to require at least 3 occurrences before flagging a pattern as recurring, so that one-offs and two-time purchases don't pollute the subscriptions list.

33. As a user, I want the system to support monthly, quarterly, and annual cadences, so that Israeli utility bills and annual Apple/insurance renewals are both caught.

34. As a user, I want a dedicated `/subscriptions` page listing all detected recurring expenses with next-expected dates, recent amounts, and status (active/paused/canceled), so that I have a single place to review my fixed costs.

35. As a user viewing the transactions table, I want a Repeat icon badge on any transaction that's part of a recurring pattern, so that I can tell a subscription charge from a one-off at a glance.

36. As a user, I want a dashboard card showing "Upcoming recurring charges in the next 7 days: ₪X,XXX", so that I can anticipate debits against my balance.

37. As a user, I want an anomaly alert when a recurring expense's amount changes by more than 15%, so that I notice price hikes immediately.

38. As a user, I want an anomaly alert when a recurring expense hasn't arrived within 7 days of its expected date, so that I notice missed or canceled subscriptions.

39. As a user, I want an "Inbox" for newly-detected recurring patterns (3rd occurrence just seen) so that I can confirm, name, or dismiss them, so that the subscriptions list stays curated.

40. As a user, I do NOT want cancellation helpers in Phase 2 — pure detection and visibility are enough, so that the feature stays focused.

### Code Quality

41. As a user filling out a bank credential form, I want inline validation with Hebrew error messages that appear as I type, so that mistakes are caught immediately instead of on submit.

42. As a user editing a category or rule, I want the form to behave consistently across all entity types (credentials, categories, rules), so that the app feels coherent.

43. As a developer, I want all forms in the app migrated to React Hook Form + Zod using the server-side Zod schemas as the single source of truth, so that client and server validation can't drift.

44. As a developer, I want all mutations (create/update/delete) migrated to Next.js Server Actions with `revalidatePath`, so that client components shed useState+useEffect+fetch boilerplate.

45. As a developer, I want an `ARCHITECTURE.md` blueprint produced by an upfront scoped architecture pass, so that Phase 2 workers implement consistently.

46. As a developer, I want architecture refactors to happen within feature PRs (Pass 2), not as a separate refactor phase, so that we don't stall feature delivery.

47. As a developer, I want the scraper, crypto, auth, credentials, and screenshots modules left untouched, so that production-tested code isn't risked without a Phase 2 reason to change it.

### UI/UX

48. As a user, I want the app to look like a premium personal finance tool (taking cues from Monarch Money and Linear), not a template, so that I enjoy opening it daily.

49. As a user, I want a neutral zinc/stone base palette with a restrained emerald accent (emerald-600, not mint), so that the app feels professional rather than garish.

50. As a user, I want all financial amounts rendered with `tabular-nums`, so that columns of numbers in tables and cards align perfectly.

51. As a user, I want the spending-by-category chart redesigned to handle many categories gracefully — proper label truncation, interactive tooltips, responsive sizing, optionally a horizontal scrollable bar chart — so that I can actually read it.

52. As a user, I want loading skeletons in place of the current "טוען..." text strings, so that the app feels polished during data fetches.

53. As a user, I want polished empty states on every page that has no data yet (no transactions, no rules, no credentials), so that first-time states feel intentional rather than broken.

54. As a user, I want state transitions to use 150ms fades (no scroll-triggered animation, no fancy motion), so that the app feels calm and fast.

55. As a user, I want all icons to come from Lucide with a consistent 1.5px stroke, so that icon weight is uniform across the app.

56. As a user on mobile, I want the app to feel native rather than "just responsive" — tap targets sized appropriately, tables that become cards, chart sizing that actually works on narrow screens — so that I can check finances from my phone.

### Tech Debt

57. As an API client calling `/api/*` without a valid session, I want to receive `401 Unauthorized` JSON rather than a 200 HTML redirect to `/login`, so that API consumers can handle auth failures correctly.

58. As a user filtering for "uncategorized only" in the transactions table, I want this applied server-side (`WHERE category_id IS NULL`), so that it continues to work correctly with pagination.

59. As a user of the transactions table, I want the API to return `{ data, total, page, pageSize }` so that the UI can show accurate "Showing 50 of 1,247" text and exact page counts.

60. As a developer, I want a log-sanitization utility that redacts passwords, OTP codes, national IDs, and account numbers from any logged output, so that accidental leaks are structurally prevented.

61. As a user with two credit cards under one provider, I want the balance display to use exact `bankAccountNumber` matching rather than a `[0]` fallback, so that I don't see the wrong card's balance on a second card.

62. As a developer, I want `puppeteer-core` pinned to the same version bundled by `israeli-bank-scrapers-core`, so that the `as unknown as ScraperBrowser` type cast can be removed.

63. As a user, I want credit card balances (currently null for Max/Cal because `futureDebits` isn't populated) to display real values via an alternative scraping approach, so that the dashboard shows my upcoming card charges.

---

## Implementation Decisions

### Tiered scope

- **Tier 1 (confirmed):** Accounting Engine, Code Quality, UI/UX.
- **Tier 2 (folded in):** retroactive rules, API 401, server-side uncategorized filter, API pagination totals, log sanitization, multi-card balance, puppeteer pinning, credit card balance fix.
- **Tier 3 (in Phase 2):** Background Scheduler, ~~AI Categorization (Spike-gated)~~ → **deferred to Phase 3 per Spike NO-GO**, Recurring Expense Detection.
- **Tier 4 (deferred to Phase 3):** dark mode, budgeting & goals, reports & export, push notifications.

### New deep modules

- **`transaction-matching`** — pure functional primitives (`extractMerchant`, `amountsMatch`, `datesWithin`, `sumMatches`) used by both reconciliation and recurring-detection. Interface is stable; swappable extraction strategies hidden behind it.
- **`reconciliation`** — detects three patterns behind one interface: P1 credit-card settlement (bank lump matches sum of card transactions in cycle), P2 1:1 mirror (single card transaction matches single bank deduction), P3 inter-account transfer (outflow in one bank matches inflow in another). Computes confidence per pattern. Applies results via hybrid storage: new reconciliation columns on `transactions` + category-flip to seeded transfer categories.
- **`recurring-detection`** — detects patterns requiring ≥3 occurrences of fuzzy-matched merchant + amount within ±10% + supported cadence (monthly/quarterly/annual). Computes `next_expected_date`. Detects anomalies: price change >15%, missed (±7 days past expected), newly-detected (3rd occurrence).
- ~~**`ai-categorization`** (Spike-gated)~~ — **NOT BUILT.** Spike (#42) returned NO-GO; module deferred to Phase 3.
- **`scheduler`** — thin node-cron orchestrator gated by env flag; invokes existing sync pipeline with an OTP-skip handler that yields `{ type: 'otp_skipped', bank }` instead of blocking.
- **`logging`** — `createRedactedLogger()` wraps console with regex-based redaction of password fields, OTP codes, national IDs (9-digit numbers in credential context), and account numbers.

### Modified modules

- **`transactions`** — adds reconciliation columns, server-side uncategorized filter, pagination totals `{ data, total, page, pageSize }`.
- **`categories`** — adds retroactive rule application (respecting priority; preview counts before apply).
- **`sync`** — adds post-import reconciliation trigger, writes `sync_runs` history row per run.
- **`scraper`** — minimal touch to fix credit card balance (futureDebits gap). Zero-leak policy preserved.
- **`src/middleware.ts`** — checks `pathname.startsWith("/api/")` and returns `401 JSON` instead of redirecting to `/login`.

### Database schema changes

- **`transactions` table — 4 new columns:**
  - `reconciliation_group_id uuid` (nullable)
  - `reconciliation_role` enum (`settlement_lump`, `settlement_detail`, `transfer_pair`) (nullable)
  - `reconciliation_confidence real` (0-1, nullable)
  - `reconciliation_confirmed_at timestamp` (nullable)

- **New `recurring_expenses` table:**
  - `id uuid`, `pattern_fingerprint text`, `merchant text`, `category_id uuid`, `expected_amount decimal`, `expected_cadence enum`, `next_expected_date date`, `last_matched_txn_id uuid`, `status enum` (active/paused/canceled), timestamps.

- **New `sync_runs` table:**
  - `id uuid`, `started_at timestamp`, `finished_at timestamp`, `bank bank_type enum`, `status enum` (success/otp_skipped/error), `transactions_imported integer`, `error_message text` (nullable).

- **Seeded categories (type `transfer`):**
  - "הסדרה - כרטיס אשראי" (credit card settlement)
  - "העברה פנימית" (internal transfer)

### Reconciliation UX contract

- **Confidence ≥0.95:** auto-apply; subtle toast on sync completion; one-click undo per transaction.
- **Confidence 0.70–0.95:** queued on `/reconciliation` inbox page; grouped view; bulk-approve and bulk-reject supported.
- **Confidence <0.70:** dropped entirely; not stored.
- **Inbox UX:** feels like email triage — keyboard shortcuts optional, bulk-select is mandatory.
- **Dashboard strip:** prominent only when pending medium-confidence candidates exist.

### Confidence scoring rules

- **P1 Settlement:** 1.0 when sum of card txns in cycle exactly equals bank lump AND bank lump date is within card's known settlement window AND bank description matches card provider (`ויזה`, `מאסטרקארד`, card last-4). Drops if sum differs or multiple bank candidates match.
- **P2 1:1 mirror:** 0.95 when amount exact + date within ±1 day + both sides carry a Bit/debit marker. Drops to 0.7 if amount matches but description is generic.
- **P3 Inter-account:** 0.9 when opposite-sign amounts match + both banks imported + date within ±2 days + Bit/transfer markers on both. Drops if multiple candidates match.

### Code quality contract

- **All forms** migrated to React Hook Form + Zod; server Zod schemas re-used client-side; all error messages in Hebrew.
- **All mutations** migrated to Next.js Server Actions with `revalidatePath`; REST routes retained only where Server Actions can't work (SSE, file serving).
- **Two-pass architecture:** Pass 1 (upfront, ~1 day, time-boxed) runs `improve-codebase-architecture` skill scoped to `transactions`, `analytics`, components; produces `ARCHITECTURE.md` blueprint. Pass 2 happens tactically within each feature PR.
- **Untouched modules:** scraper (except futureDebits), crypto, auth, credentials, screenshots.

### UI contract

- **Reference aesthetic:** Monarch Money + Linear.
- **Palette:** zinc/stone neutral base, emerald-600 accent, no gradients.
- **Typography:** Assistant font; `tabular-nums` on every numeric financial amount; tighter line-heights than defaults; stronger weight contrast.
- **Cards:** subtle borders, `rounded-xl`, minimal shadow.
- **Motion:** 150ms fades; no scroll-triggered animation.
- **Icons:** Lucide, 1.5px stroke, duo-tone only on section headers.
- **Charts:** spending-by-category redesigned with label truncation, interactive tooltips, responsive sizing; consider horizontal scroll for many categories.
- **Skeletons:** replace all "טוען..." strings with Shadcn Skeleton components.
- **Empty states:** polished on every page (transactions, rules, credentials, subscriptions, reconciliation).
- **Mobile:** first-class — tables collapse to cards, tap targets sized appropriately.

### AI Categorization contract — RESOLVED: NO-GO

Spike (#42) ran 2026-04-25 against 50 PII-free Hebrew descriptions:

| Model              | Accuracy | Verdict |
| ------------------ | -------- | ------- |
| `qwen2.5-coder:7b` | 26%      | NO-GO   |
| `llama3.1:8b`      | 50%      | NO-GO   |
| Worker baseline    | 84%      | —       |

Both candidate models fall below the 70% go threshold. AI categorization is **deferred to Phase 3**. Issue #52 (AI2 implementation) closed as `wontfix`. Retroactive rule application (#37 RR1) carries the workflow.

Phase 3 considerations if revisited: larger/newer models (llama3.2, Mistral-7B), Hebrew-specific embeddings (AlephBERT, HeBERT), Ollama JSON mode with schema, chain-of-thought, confidence thresholding. Full report: `docs/ai-categorization-spike.md`.

**Privacy invariant remains in force:** no third-party APIs (Claude/OpenAI/etc.) under any circumstances. When Phase 3 retests, local-only stays the rule.

### Background Scheduler contract

- **Cadence:** daily at 07:00 (configurable in Settings).
- **Runner:** node-cron inside the Next.js process, gated behind a `SCHEDULER_ENABLED` env flag to avoid dev-mode spam.
- **OTP strategy:** attempt-and-skip. If a bank requests OTP during a scheduled run, skip that bank with status `otp_skipped` and continue to the next. User tops up manually later.
- **Observability:** `sync_runs` table persists every run; Dashboard "Last sync" strip surfaces per-bank status; no push/notification layer.

### Recurring Detection contract

- **Signal:** fuzzy merchant extraction + amount within ±10% + cadence match.
- **Minimum occurrences:** 3 months of same pattern before confirmation.
- **Cadences:** monthly (±7 day drift), quarterly, annual.
- **Storage:** persisted `recurring_expenses` table with `next_expected_date`.
- **Surfacing:** dedicated `/subscriptions` page + inline Repeat badge on transactions + dashboard "upcoming charges in next 7 days" card.
- **Anomalies:** price change >15%, missed payment (±7 days past expected), newly-detected (surface 3rd occurrence in an "Inbox" for naming/dismissing).
- **Out of scope for Phase 2:** cancellation helpers, provider deep links.

### Shared infrastructure

Both reconciliation and recurring-detection consume the `transaction-matching` module for merchant extraction, amount tolerance, and date windowing. Architecture Pass 1 must identify and extract these primitives before the two consuming modules are built.

---

## Testing Decisions

### What makes a good test in this codebase

Phase 1 established the pattern: tests validate **external behavior through public module interfaces**, never implementation details. Pure computation functions are tested exhaustively without a DB; DB-backed wrappers are tested via their store interface rather than by hitting Postgres in tests. All tests live in `*.test.ts` co-located with or adjacent to the module they cover. Vitest is the runner; `@/*` path alias is configured; `npm test` runs everything.

### Modules that will be tested (Phase 2)

- **`transaction-matching`** — full unit test suite for every primitive. This module is consumed by two other modules, so its contract must be rock-solid. Test cases cover: Hebrew merchant normalization, amount tolerance edges (±10% boundary), date-window boundary (inclusive vs. exclusive), empty/null inputs.

- **`reconciliation` (pure detectors)** — TDD for each of P1/P2/P3 detection functions, plus the confidence scorer. Test fixtures use realistic Hebrew bank descriptions ("חיוב ויזה", "ביט", "העברה"). Test cases cover: exact sum match (high confidence), sum off by ₪1 (low confidence), multiple candidate lumps (confidence degradation), date-window boundary, no card transactions in cycle (no candidate).

- **`recurring-detection` (pure)** — TDD for pattern detection, next-date computation, and anomaly detection. Test cases cover: 3-occurrence threshold, fuzzy merchant tolerance, ±7 day cadence drift, ±10% amount tolerance, quarterly vs monthly ambiguity, price-change anomaly at 15% boundary, missed-payment anomaly at ±7-day boundary.

- **`logging` (redaction)** — TDD for pattern-based redaction of passwords, OTP codes, national IDs, account numbers. Security-critical utility; cheap to test. Test cases cover: credential JSON redaction, 9-digit ID patterns, Bearer tokens, OTP codes mid-string.

- **`categories` (retroactive application)** — extend the existing 14-test categories suite. Test cases cover: retroactive apply respects rule priority, higher-priority rule wins over lower-priority retroactive, preview count is accurate.

### Modules that will NOT be tested (Phase 2)

- **`ai-categorization`** — accuracy is measured by the Spike against real data, not by unit tests. The adapter itself is a thin HTTP wrapper; manual validation is sufficient.
- **`scheduler`** — thin node-cron orchestrator; behavior validated by running the daily job manually and observing `sync_runs` output.
- **Middleware 401 for `/api/*`** — trivial; covered by manual curl/browser verification.
- **API pagination totals** — thin SQL change; covered by manual verification through the UI.

### Prior art in the codebase

- `src/lib/crypto/crypto.test.ts` — round-trip, unique IV, tamper detection, wrong-key patterns.
- `src/lib/categories/rules.test.ts` — match-type coverage and priority ordering pattern.
- `src/lib/transactions/import.test.ts` — Store pattern for testing DB-wrapped logic without hitting Postgres.
- `src/lib/analytics/*.test.ts` — pure-function computation tests with edge cases (division by zero, empty months).
- `src/lib/screenshots/*.test.ts` — path traversal prevention, boundary testing.

### Coverage expectation

All 58 existing tests must continue passing. Phase 2 adds an estimated 40-70 new tests across the modules above. All tests must pass before any PR merges.

---

## Out of Scope

The following are explicitly deferred to Phase 3 or beyond:

- **Dark mode.** Shadcn supports it natively; it's a palette and CSS variables exercise, not a Phase 2 priority. Light-only in Phase 2.
- **Budgeting & goals.** Per-category monthly budgets, savings targets, visual progress. Requires accurate numbers from Phase 2 first.
- **Reports & export.** CSV/PDF generation, year-over-year comparisons.
- **Push notifications.** No notification layer; the Dashboard "Last sync" strip surfaces all scheduler output.
- **AI categorization (any).** Deferred to Phase 3 per Spike #42 NO-GO. Third-party APIs (Claude/OpenAI/etc.) are excluded permanently by privacy policy; when Phase 3 revisits, local-only stays the rule.
- **Cancellation helpers in recurring detection.** No provider deep-links, no unsubscribe flows. Pure detection + visibility only.
- **Multi-user support.** Single-user app remains.
- **Additional banks.** Only Discount, Max, Cal in Phase 2.
- **Cloud deployment.** Local/Docker only.
- **Investment portfolio tracking.** Out of scope.
- **Touching production-tested modules without Phase 2 reason.** Scraper (except minimal futureDebits fix), crypto, auth, credentials, and screenshots stay untouched.
- **Fully unattended sync with long-term OTP tokens.** `israeli-bank-scrapers-core` doesn't reliably expose them. Scheduler uses attempt-and-skip instead.

---

## Further Notes

### Delivery protocol

Phase 2 follows the Phase 1 pattern:

- **Opus orchestrates.** Writes worker prompts, reviews every PR, makes architectural calls.
- **Sonnet workers implement.** From self-contained prompts with exact file paths, schema context, acceptance criteria, and a "Gotchas" section listing CI format requirement + Zod mandate + security rules.
- **Parallel worker tasks use `git worktree`** to prevent branch conflicts.
- **Every PR description includes `Closes #N`** for auto-close on merge.
- **`npm run format` runs before every commit.** CI rejects unformatted code.
- **Feature branches only.** Never direct to main.

### Ordering & dependencies

Suggested implementation order (enforced via `prd-to-issues` slicing):

1. **Architecture Pass 1** → `ARCHITECTURE.md` blueprint. Must land before any module build.
2. **`transaction-matching` primitives.** Shared foundation. Before reconciliation and recurring detection.
3. **Reconciliation engine** (schema + pure detectors + integration + `/reconciliation` inbox + dashboard strip). Highest-value Tier 1 work.
4. **Retroactive rule application.** Enabler for cleaning up historical data once reconciliation lands.
5. **Tech debt cluster** (API 401, pagination totals, server-side uncategorized filter, log sanitization, multi-card balance, puppeteer pinning, credit card balance fix). Can run in parallel with reconciliation.
6. **UI foundation** (design tokens, palette, typography, motion, skeletons, empty states, chart redesign). Locks the visual language early so later features ship consistent.
7. **Code quality migration** (RHF+Zod, Server Actions). Tactical within feature PRs; retrofit legacy forms at the end if time permits.
8. **Background scheduler** (sync_runs table + node-cron + Dashboard strip).
9. ~~**AI categorization Spike.**~~ **DONE 2026-04-25 — NO-GO.** AI categorization deferred to Phase 3 (#52 closed as wontfix). Retroactive rule application (#37) is the substitute workflow.
10. **Recurring expense detection** (detection + `/subscriptions` page + badge + dashboard card + anomalies).

### Privacy and security guardrails (unchanged from Phase 1)

- Zero-leak policy. No `console.log` in scraper, sync, or credential modules.
- Credentials encrypted with AES-256-GCM, unique IV per record.
- Passwords never returned by any API.
- No transaction data ever sent to third-party APIs.
- Failure screenshots auto-delete after 24h.
- Session HMAC key hex-decoded consistently in both edge and node contexts.

### Risks flagged during Grill Me

- **Reconciliation false positives** could make analytics wrong in a direction the user trusts more. Mitigated by confidence-threshold split + inbox review + per-transaction undo.
- **Architecture pass rabbit hole.** Mitigated by time-boxing Pass 1 and scoping to Phase-2-touched modules.
- **AI accuracy on Hebrew.** Mitigated by Spike-first + Phase 3 fallback.
- **Scraper regression from credit card balance fix.** Mitigated by making the fix additive (don't touch existing paths).
- **Form migration scope creep.** Mitigated by "new forms first, legacy forms only if time permits."

### Post-Phase-2 follow-ups to consider

- Schedule a cleanup agent to prune `sync_runs` rows older than 90 days.
- Schedule a periodic re-scan of historical transactions as new rules are added.
- Track reconciliation false-positive rate in production; tune confidence thresholds based on data.
