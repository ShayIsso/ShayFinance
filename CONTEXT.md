# ShayFinance — Domain Context

Glossary of terms, financial invariants, and architectural vocabulary that should be used consistently across PRDs, issues, ADRs, refactor proposals, test names, and UI copy.

This file starts lean. New terms get added by `/grill-with-docs` as planning sessions surface them — don't pre-define vocabulary that hasn't shown up in real work.

---

## What this project is

A private, self-hosted personal finance dashboard for a single user. Fetches and categorizes transactions from three Israeli banks (Bank Discount, Max, Cal). Local/Docker only for hosting and all bank data. Hebrew RTL interface.

Hard constraints: single-user, self-hosted, zero-leak logging. The only permitted external egress is redaction-gated AI categorization per [ADR-0008](./docs/adr/0008-redaction-gated-external-categorization.md) — anything else that sends data off the host is wrong by construction.

---

## Financial vocabulary

### `transaction`

A single financial event imported from a bank. Has a `description` (the raw merchant string from the bank, **never modified**) and an optional `custom_description` (user-edited override for display). When showing a transaction in the UI, prefer `custom_description` if set; otherwise show `description`. Rule matching always runs against `description`, never `custom_description`.

### `category type` — load-bearing

Every category has exactly one of five types. The type determines how the category contributes to financial totals:

| Type         | Counts toward         | Visible in totals? |
| ------------ | --------------------- | ------------------ |
| `income`     | Total Income          | Yes                |
| `expense`    | Total Expenses        | Yes                |
| `investment` | Investment deployment | Tracked separately |
| `transfer`   | Nothing               | Invisible          |
| `ignore`     | Nothing               | Invisible          |

`transfer` and `ignore` are **invisible to all financial calculations**. They exist to neutralize internal movements (Bit transfers, inter-account moves) and credit-card settlement charges so they don't double-count.

`investment` does **not** reduce Net Savings. Investing is the _deployment_ of savings, not their consumption. The dashboard shows it on a separate track.

### `Net Savings` and `Savings Rate`

```
Net Savings   = Total Income − Total Expenses
Savings Rate  = Net Savings / Total Income × 100
```

Investment, transfer, and ignore are excluded from both. If a calculation produces a different number, it's wrong.

### `transfer` (vocabulary)

Say "transfer" — never "internal movement", "self-payment", or "between-account move". The category type is `transfer`; the GitHub issue, PR, refactor proposal, and UI copy all use the same word.

### `ignore` (vocabulary)

Say "ignore" — never "excluded", "skipped", or "hidden". The category type is `ignore`. A transaction marked ignore still exists in the DB; it's just invisible to financial totals.

### `installment`

A monthly charge that's part of a multi-payment purchase. Stored as **individual rows per monthly charge**, not collapsed. Each row has `installment_number` and `installment_total`. UI shows installment progress (e.g. "3/12") rendered from these fields.

---

## Bank-domain vocabulary

### `settlement charge` / `"The Paradox"`

When a credit card settles on `יום החיוב`, the bank imports both the individual transactions (coffee, groceries, …) **and** the total monthly charge as a single deduction from the bank account. Without intervention, both get counted — doubling expense totals. Reconciliation (Phase 2) detects settlement-day lump charges by matching `sum(card cycle transactions) ≈ bank lump amount` and re-categorizes the lump as `transfer` so it disappears from totals.

Always say "settlement charge" or "The Paradox" — these names are used in BACKLOG.md, PRD-phase2.md, and the reconciliation module's identifiers.

### `OTP` (one-time password)

Only **Bank Discount** issues an OTP during scraping. Max and Cal do not. The OTP arrives as an SMS to the user; the UI prompts them to enter it within a 3-minute window (`/api/sync/otp` POST endpoint, promise-bridged to the scraper). On timeout the per-bank scrape fails and the next bank starts (per ADR-0003).

### `futureDebits` (scraper field, credit cards)

The `israeli-bank-scrapers-core` library exposes a `futureDebits` array on credit-card account objects, intended to surface upcoming charges. **It is empty in practice for Max and Cal.** Don't design features assuming `futureDebits` is populated — currently it isn't. The card-balance gap this caused is resolved by the `next-debit estimate` (below), which deliberately bypasses this field.

### `next-debit estimate` — load-bearing

What the dashboard shows as a Max/Cal card's "balance": an estimate of the upcoming charge (החיוב הקרוב) against the bank account, **derived from stored transactions**, not read from the scraper. Decided in issue #102, shipped in PR #127.

The rule: sum of `chargedAmount` over the card's transactions with `processedDate` in `(today, today + 31 days]` — exclusive of today, inclusive at +31 days. Transaction status and type are deliberately ignored; the date predicate alone decides. Empty window → ₪0 (never "—"). The debit-date hint shown next to it is the in-window date carrying the largest absolute summed charge, so a small off-cycle straggler can't outrank the main billing-cycle date.

Invariants: it is **display-only** — it never enters Net Savings, expenses, or any financial total. `bank_accounts.balance` stays scraper-truth (null for cards); the estimate is computed live in `src/lib/analytics` (`computeNextDebitEstimate`). Installments need no special handling — each payment is its own row with its own `processedDate`, so the window naturally catches only the next payment.

---

## Categorization vocabulary

### `category` and `category rule`

A `category` is a Hebrew-named bucket with a `type` (see above). Categories form an optional one-level hierarchy: a category may be a `category group` or a `root leaf` (see below). `מזומן ומשיכות` (#133) is the honest home for purpose-unknowable money movement — ATM/cash withdrawals and generic P2P (bit/PayBox) — kept distinct from `העברה פנימית` (genuine own-account self-transfers). A `category rule` is a pattern that auto-assigns a category to matching transactions. Rules have a `priority` integer; higher priority wins. Rules are the top precedence layer — deliberately-authored law for pattern-shaped semantics (chain-wide matches, bank-mechanics strings). Per [ADR-0010](./docs/adr/0010-categorization-precedence-and-merchant-memory.md) they no longer grow by default: the "Create rule?" suggestion on manual assignment is removed; merchant memory is the default learning path.

### `category group` / `root leaf` — load-bearing

Categories form an **optional, exactly-one-level** hierarchy ([ADR-0011](./docs/adr/0011-hierarchical-categories-one-level-typed-leaf-only.md)). A `category group` is a category with children; a `root leaf` is a category with no parent and no children (all pre-hierarchy categories are root leaves). Every category has a `type`; a parent-child link requires **matching types** on both ends — there is no typeless or mixed-type group.

Say "group" and "leaf" — never "parent category" / "subcategory" as primary vocabulary.

### `leaf-only assignment` — load-bearing

A category with children is **not assignable** — derived from "has children", not a flag. Binds every assignment surface: the transaction picker, category rules, merchant memory, AI answers, and retroactive application. The AI's answer space is exactly the assignable (childless) categories; group structure is never rendered into the prompt. A group needing a catch-all gets an explicit general leaf, created deliberately — never auto-created.

### `aggregation lens` — load-bearing

The hierarchy invariant: grouping **never changes financial totals**. Net Savings, Total Expenses, and all type-driven calculations flow from leaves exactly as without hierarchy; a group's total is _defined_ as the sum of its leaves' totals, so a transaction contributes through exactly one leaf and double-counting is structurally impossible. Breakdowns present group-first with drill-down; root leaves appear beside groups.

### `match type`

Rules match by one of four match types: `contains`, `starts_with`, `exact`, `regex`. The pure function `categorize(description, rules)` walks rules in priority order and returns the first match.

### `retroactive application` (Phase 2)

Applying a newly created rule to existing transactions, governed by the `overwrite law` (below): uncategorized and `ai`-sourced assignments may be overwritten; `user`/`rule`/`memory`-sourced never. (Phase 2 shipped fill-NULL-only; ADR-0010 extends it to `ai` rows.) Lives in `categories/retroactive.ts` as `previewRetroactiveApply` + `applyRetroactively`.

### `overwrite law` — load-bearing

The single rule governing every automated recategorization (retroactive rule application, memory fan-out, AI runs): automation may overwrite only `NULL` and `ai`-sourced assignments. `user`, `rule`, and `memory`-sourced assignments are never overwritten by automation. One sentence explains the system: user decisions are never overwritten; AI guesses yield to everything. Locked in [ADR-0010](./docs/adr/0010-categorization-precedence-and-merchant-memory.md).

### `category_source`

Provenance enum on transactions: `rule | memory | ai | user` (NULL = uncategorized). Records the **trust tier, not the mechanism** — a user-tier merchant-memory hit writes `memory`; an ai-tier hit writes `ai`, so a cached AI guess never gains protected status by passing through the cache.

### `corrections log`

Append-only record of every user recategorization of an already-categorized transaction: merchant key, pre-redacted description snapshot, from/to category **name snapshots** (immutable history that survives taxonomy changes), `from_source`, timestamp. First-time labeling is a memory write, not a correction. Consumers: AI prompts read `from_source = 'ai'` rows as anti-examples; taxonomy work (#133) reads the whole log as oscillation evidence.

---

## AI categorization vocabulary (Phase 3)

Locked in [ADR-0008](./docs/adr/0008-redaction-gated-external-categorization.md). Use these exact terms.

### `redaction boundary` — load-bearing

The line between what may and may never leave the host. Forbidden classes (credentials, secrets, national IDs, account numbers, any 5+ digit string) never cross; merchant descriptors cross only after redaction. Replaces the blanket "local-only, no third-party APIs" invariant from ADR-0005. The redaction rule set — digit runs of 5+, keyword-secret patterns, emails, credentialed URLs, home paths — is a pure, TDD'd module shared with the log sanitizer.

### `RedactedString`

Branded TypeScript type produced only by the redaction module. Provider adapters accept `RedactedString`, never plain `string`, so unredacted text structurally cannot reach a provider.

### `anchored confidence`

The 1–7 confidence rubric every provider must return, with each level behaviourally anchored (not a free-floating score). Drives tiered auto-apply. Same rubric for external and local providers.

### `tiered auto-apply`

Trust posture for AI suggestions: merchant-memory hits always apply (user-tier as trusted, ai-tier as a cached AI guess — see `merchant memory`); confidence 6–7 auto-applies marked-as-AI with one-click undo (overrides feed the corrections log); 3–5 queue as review suggestions; 1–2 stay uncategorized.

### `merchant memory` — load-bearing

Learned merchant-to-category mappings, consulted in bulk before any model call. Key = `extractMerchant(description)` (imported from `transaction-matching`, computed on raw `description`, never `custom_description`). Every assignment event writes an entry, in one of two trust tiers: **user-tier** (manual assignment, correction, explicit approval — hits always apply and outrank any model output) and **ai-tier** (written by confidence 6–7 auto-apply — hits skip the model call but the assignment stays marked AI-assigned with undo). Any user touch promotes the entry to user-tier. Conflicts are last-write-wins; a user-tier write fans out to existing same-key transactions under the `overwrite law`. Memory is managed through the transactions page (correcting any transaction of a merchant updates its entry) — it has no settings UI. Full model: [ADR-0010](./docs/adr/0010-categorization-precedence-and-merchant-memory.md).

### `zero-egress mode`

Running categorization against local Ollama behind the same adapter boundary — same anchored confidence, same review flow, no data leaves the host. Always selectable.

---

## Budgets and goals vocabulary (Phase 3)

Locked in decision record #105 (budgets-goals-reports epic), goals accumulation amended by #183. Use these exact terms.

### `goals accumulate, budgets reset monthly` — load-bearing

The one law separating the two tracking primitives. A **goal** carries a running balance forward across months and measures progress toward a target — and since #183, all goals accumulate **one shared stream, distributed by priority** (see `goal ladder`): no shekel advances two goals. A **budget** (and the monthly savings target) evaluates one calendar month in isolation and resets — it never accumulates. When a feature is unsure which primitive it belongs to, this law decides.

### `savings goal` — load-bearing

A named cumulative target holding a rung on the `goal ladder`, with an optional **opening amount** (a head start counted toward this goal alone — it reduces the goal's claim on the pool), a start month, and an optional target month. **Progress = opening + the goal's slice of the `savings pool`, capped at the target** — a goal never shows past 100%; overflow belongs to the next rung. Negative months still show honestly: a shrinking pool retreats from the bottom rung up.

> Supersedes (#183, 2026-07-19) the original #105 §5 semantics, where each goal independently accumulated the full Net Savings stream since its own start month — valid per-goal in isolation, but the same shekel advanced every goal at once. The start month survives as **pace anchor only**; it no longer bounds any accumulation window. Unclamped progress display is likewise superseded by waterfall fill.

A target month turns on **deadline pace**: a linear expected line, `expected = opening + (target − opening) × elapsed ∕ total`, anchored at the start month and compared against the goal's ladder fill. **Month counts are inclusive** — the start month is month 1, so a Jan→Dec goal is 12 months and an on-rate saver reaches exactly 100% at the deadline with no overshoot. Per-month phrasing ("₪X לחודש עד תאריך") is form-entry **sugar** that derives the same cumulative target over that inclusive span; it is one goal kind in storage, not a separate shape. Manual contributions and linked-category progress were rejected.

### `savings pool` — load-bearing

The single stream every goal draws from: cumulative **Net Savings** — the analytics definition, deployment-of-savings rule included (`investment` contributions remain pool money; liquid-vs-deployed is a presentation concern, never a pool redefinition) — since the **tracking-since month**: one global month, set explicitly by the user in Settings, never inferred. Editing it recomputes all goal progress (the ladder is judged against current values), and the UI must state that consequence.

### `goal ladder` — load-bearing

Active goals in user-set priority order, filled by a **stateless fold**: at any moment the current `savings pool` total is distributed top-down — each rung claims up to its need (target − opening), overflow spills to the next rung. There is no attribution ledger and no drain rule: a shrinking pool retreats bottom-first by construction, so the top priority is the most protected. A completed goal **holds its claim at 100% until archived**; archiving releases the claim — the gesture that pairs with actually spending the saved money. Archived goals leave the ladder but remain viewable history. Pool beyond all active needs is **unallocated surplus** (עודף ללא יעד) — shown, never hidden. A one-goal ladder behaves exactly as a single primary goal.

### `budget` — load-bearing

An optional monthly spending cap on a single **expense-type** category (one budget per category; enforced in `src/lib/budgets`, backstopped by the DB `uq_budget_category` index). A budget is a **gauge, not an allocation**: it evaluates one calendar month in isolation on `transactions.date` — the same window analytics uses — and resets (see `goals accumulate, budgets reset monthly`). Deleting a category cascade-deletes its budget (`ON DELETE CASCADE`).

**Budget spend = subtree spend**: the category's own expense spend plus its direct children's, over the one-level hierarchy — so it degenerates to self for a `root leaf`. A parent (group) budget and a child (leaf) budget may **coexist and evaluate independently**; there is no precedence or roll-up law between them.

### `budget pace` — load-bearing

Where a budget stands mid-month, from its spent fraction (`spent ∕ limit`) against the elapsed fraction of the month (inclusive day count: day 1 is `1∕daysInMonth`, the last day is exactly 1). One of four **pace verdicts**:

- `over` — spent ≥ 100% of the limit (outranks every other verdict, even early in the month);
- `at-risk` — spent fraction exceeds elapsed by more than the **warn margin** (+10 points);
- `comfortably-under` — spent fraction is below elapsed by more than the **reassure margin** (−20 points), but **never during the early-month mute window** (through day 7), so a sparse early month never over-reassures;
- `on-pace` — everything else, including exactly on either band edge.

The bands are deliberately **asymmetric** (warn eagerly, reassure reluctantly). The three tuning values (warn +10, reassure −20, mute through day 7) are named constants in `src/lib/budgets/pace.ts` — one edit point.

### `monthly targets` — load-bearing

Two optional overall (non-per-category) monthly numbers, stored as a single row (id=1, mirrors `scheduler_config`): the **monthly expense target** and the **monthly savings target**. The savings target is gauged against the month's Net Savings and, like every budget, **resets monthly** — but in V1 it is **evaluated at month close only** (`met`/`missed` once the month's last day has passed); intra-month savings pacing is deliberately deferred.

### `month-close verdict` — load-bearing

The דוחות monthly report's per-category-budget and savings-target results for a **CLOSED** month (issue #169, `src/lib/reports/month-close.ts`), composing the same `budget pace` core the Dashboard's live chips use — a past month naturally has `monthElapsed` fraction 1, so `at-risk` never occurs there and every budget resolves to `over` / `on-pace` / `comfortably-under`. Renders only once `isMonthClosed` is true; an in-progress month shows nothing here (the Dashboard's live pace chips already cover it).

**Judged against CURRENT values, not historical ones** — an acknowledged trend-reading simplification: neither a budget's `monthly_limit` nor the savings target is versioned, so re-opening a report for a month whose budget has since changed shows that month's actual spend against **today's** limit/target, not what was configured back then. The UI states this plainly next to the section.

---

## Recurring-charges vocabulary (Phase 3)

### `recurring series`

A detected repeating charge (subscription, standing order, membership) persisted in `recurring_expenses`, keyed by a fingerprint of (`merchant identity`, cadence) — amount is deliberately excluded, so a price change cannot fork or freeze a series. `cadence` is its repeat interval: monthly, quarterly, or annual.
_Avoid_: subscription (a series need not be a subscription — standing orders and fees qualify)

### `liveness evidence` — load-bearing

The only admissible input for judging whether a series is live: the most recent money-out transaction that is the same `merchant identity` as the series' `merchant`. The stored `next_expected_date` is **never** lifecycle input — it is a detection-time display artifact. See [ADR-0012](./docs/adr/0012-evidence-based-derived-recurring-lifecycle.md).

### `merchant identity` — load-bearing

The single answer to "are these two descriptors the same merchant?", owned by `transaction-matching` (`sameMerchant`, over the `merchantKey` identity key). One definition, two consumers that must never disagree: detection's merchant clustering and `liveness evidence` matching. Identity survives **descriptor drift** — a per-charge machine token, a per-charge date stamp, a branch rename — because a series whose charges continue under a drifted descriptor would otherwise be clustered as one merchant yet derived dead from evidence (#237). Distinct from `extractMerchant`, which stays a _persisted_ key (`merchant memory`, `recurring_expenses.merchant`) and so may not be redefined; identity layers on top of it and is idempotent, which is what lets a stored merchant re-key without a migration.
_Avoid_: fuzzy match (identity is a verdict, not a score; whole-string similarity alone reads sibling names as one merchant)

### `live` / `dead` — load-bearing

A series is **live** when its silence is under the death threshold, **dead** otherwise. The verdict is derived at read time and never persisted — `status: active` means "not user-retired", not "alive". Explicit user cancel is the only persisted death. Dead-but-uncancelled series surface as dormant alerts for owner adjudication.
_Avoid_: retired, expired (as automated states)

### `silence` and the `death threshold`

**Silence** is days elapsed since a series' last observed matching charge. The **death threshold** is 1.5× the cadence interval (monthly ≈ 45d, quarterly ≈ 137d, annual ≈ 548d) — one shared constant with the dormant/missed anomaly detectors, so a series can never be simultaneously "dormant" on one page and "upcoming" on another. Liveness matching is amount-agnostic: price changes must not kill a series.

### `price regime` and `incidental charge`

Within one merchant's charges, a **price regime** is an amount bucket the merchant charged at least three times — a plan or price the merchant genuinely billed, whether or not those dates turn out to form a cadence. Everything else at that merchant is an **incidental charge**. Detection's exclusivity heuristic weighs a candidate series against the merchant's incidental charges only, never against its other regimes: measuring against _all_ of the merchant's activity made a series that changed price mid-window a structural minority of itself, so a live standing order whose branch descriptor and price both moved was never detected (#237). Regimes are sequential (a price rise retires the old one) or concurrent (two plans at one merchant).

### `projected charge` — load-bearing

A forward forecast entry for a live series: projected date = last observed charge + cadence interval; expected amount = rolling average of recent observed charges. Both computed from liveness evidence, never read from stored columns. A projected date in the past (series late but not yet dead) is still shown, first — "expected any day". The upcoming-charges forecast horizon is 31 days, so every live monthly series appears exactly once.
_Avoid_: fabricated charge (a projection for a dead series — the #192 defect; must never render)

---

## Openness vocabulary (Phase 3)

Locked in [ADR-0013](./docs/adr/0013-declarative-bank-registry.md) and [ADR-0014](./docs/adr/0014-first-run-bootstrap-and-secret-placement.md) (#110). Use these exact terms.

### `bank registry` — load-bearing

The single committed, frozen, DB-free source of every fact about a supported institution: id, Hebrew and English display names, `kind`, `issuesOtp`, scraper company id, credential fields, and tier. Two laws bind it: **a bank literal outside the registry is a bug**, and **code branches on a registry property, never on a bank id**. The second is the load-bearing one — label drift is cosmetic, behaviour drift (a new institution missing from a `CARD_BANK_TYPES` set) is wrong money. Not a table, not a plugin format: an entry cannot make an institution work — only the scraper library can — so runtime-addable entries would only enable broken rows.
_Avoid_: bank list, bank map (both name a copy; there is exactly one)

### `verified tier` / `experimental tier` — load-bearing

Two presentational trust levels on a registry entry — **never a second code path**. `verified` means we have tested the institution with real credentials; `experimental` means the library implements it and we have not. An experimental failure must read as "unverified institution", never as an app defect. The registry's tier is the global default and changes by pull request; an installation overrules the label from its own evidence, so **a recorded successful sync retires the caveat on that install**. The distinction: _the registry states what we have verified; the instance states what it has observed._

### `credential field kind` — load-bearing

One of a **closed** union (`text`, `password`, `national-id`, `account-number`, `card-6-digits`) naming how a credential field renders and validates. A generic form builds any institution's credential form from its field list; per-bank form forks and duplicated Zod schemas do not exist. Field descriptors are curated by us and **pinned by assertion against the scraper library's `loginFields`**, since pure derivation breaks on non-user-entered fields and yields no Hebrew labels or secrecy marking. `password` is the only kind marked secret — national IDs and account numbers are already covered structurally by the `redaction boundary`'s 5+-digit rule.
_Avoid_: field schema (implies a DSL; the kinds are closed and each maps to one rendering)

### `onboarding completion` — load-bearing

The explicit `onboarding_completed_at` flag on the single-row settings table — the **sole** first-run signal, never inferred from data (deleting your only bank must not relaunch onboarding). Only the app-password step is mandatory; every later step is skippable and lands the user in the app with the corresponding empty state. Onboarding is a courtesy path, never a gate, and has no re-run entry point — each step's real home is in Settings.

---

## Architectural vocabulary

### `deep module`

A module with a small public interface hiding a large implementation (Ousterhout). The architectural baseline for every domain module in `src/lib/`. See [ADR-0007](./docs/adr/0007-deep-modules-with-store-pattern.md) for the formal decision.

### `pure functional core` / `DB-backed wrapper`

Every domain module splits computation (pure functions taking data, returning data, never touching the DB) from persistence (thin wrappers that fetch, call the pure function, persist the result). `src/lib/analytics` is the reference implementation.

### `Store pattern`

A TypeScript interface (e.g. `TransactionStore`) representing the persistence boundary. The Drizzle implementation is one of potentially many; tests inject in-memory implementations. **Tests must not mock Drizzle calls directly.** Reference: `src/lib/transactions/import.ts`.

### `Zod boundary`

Every API route and Server Action validates input through a Zod schema co-located with the module that owns the type. Hebrew error messages. No untyped JSON crosses into module code.

---

## Triage and workflow vocabulary

`AFK`, `HITL`, `needs-triage`, `needs-info`, `wontfix` — see [`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md). Do not create parallel `ready-for-agent` / `ready-for-human` labels; reuse `AFK` / `HITL` as-is.

---

## What's deliberately not here

- **Reconciliation patterns (P1/P2/P3, confidence scores)** — Phase 2 work in progress. `/grill-with-docs` will capture these terms during reconciliation planning, not before.
- **Module file layouts and test surfaces** — read the code: `src/lib/*/index.ts` is each module's public interface. [`ARCHITECTURE.md`](./ARCHITECTURE.md) is the frozen Phase 2 blueprint (historical record, not living truth).
- **Architectural decisions and their rationale** — see [`docs/adr/`](./docs/adr/). Cross-check before contradicting.
- **Deferred features** — see [`BACKLOG.md`](./BACKLOG.md).
- **Personal preferences and workflow gotchas** — these live in Claude's memory (`MEMORY.md` outside the repo), not here. CONTEXT.md is for _the codebase_, not _the developer_.
