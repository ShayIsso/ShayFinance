# ShayFinance — Domain Context

Glossary of terms, financial invariants, and architectural vocabulary that should be used consistently across PRDs, issues, ADRs, refactor proposals, test names, and UI copy.

This file starts lean. New terms get added by `/grill-with-docs` as planning sessions surface them — don't pre-define vocabulary that hasn't shown up in real work.

---

## What this project is

A private, self-hosted personal finance dashboard for a single user. Fetches and categorizes transactions from three Israeli banks (Bank Discount, Max, Cal). Local/Docker only, no cloud, no third-party APIs. Hebrew RTL interface.

Hard constraints: single-user, local-only, zero-leak logging, no third-party services. Anything that violates these is wrong by construction.

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

The `israeli-bank-scrapers-core` library exposes a `futureDebits` array on credit-card account objects, intended to surface upcoming charges. **It is empty in practice for Max and Cal.** This is a known gap captured in BACKLOG.md ("Multi-Card Credit Balance Mapping"). Don't design Phase 2 features assuming `futureDebits` is populated — currently it isn't.

---

## Categorization vocabulary

### `category` and `category rule`

A `category` is a Hebrew-named bucket with a `type` (see above). A `category rule` is a pattern that auto-assigns a category to matching transactions. Rules have a `priority` integer; higher priority wins. When the user manually assigns a category, the UI suggests creating a rule from that assignment.

### `match type`

Rules match by one of four match types: `contains`, `starts_with`, `exact`, `regex`. The pure function `categorize(description, rules)` walks rules in priority order and returns the first match.

### `retroactive application` (Phase 2)

Applying a newly created rule to existing uncategorized transactions, or to transactions whose current rule has strictly lower priority than the new rule. Carries the workflow load that AI categorization was meant to handle (per ADR-0005). Lives in `categories/rules.ts` as `previewRetroactiveApply` + `applyRetroactively`.

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
- **Recurring detection vocabulary (cadence, anomaly, next expected date)** — same; capture during recurring-detection planning.
- **Module file layouts and test surfaces** — see [`ARCHITECTURE.md`](./ARCHITECTURE.md) at repo root for the Phase 2 blueprint.
- **Architectural decisions and their rationale** — see [`docs/adr/`](./docs/adr/). Cross-check before contradicting.
- **Deferred features** — see [`BACKLOG.md`](./BACKLOG.md).
- **Personal preferences and workflow gotchas** — these live in Claude's memory (`MEMORY.md` outside the repo), not here. CONTEXT.md is for _the codebase_, not _the developer_.
