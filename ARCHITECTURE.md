# ShayFinance — Architecture Blueprint (Phase 2)

**Status:** Advisory. Produced by Architecture Pass 1 (issue #36).  
**Date:** 2026-04-24  
**References:** docs/PRD-phase2.md · docs/phase2-kickoff.md · issue #35

Every Phase 2 worker should read this document before implementing. Refactors listed here happen tactically inside feature PRs — this document is the shared contract, not a separate refactor phase.

---

## 1. Phase 2 Module Map

Target shape for every new Phase 2 module. Each follows the project's deep module convention: pure functional core, DB-backed wrapper, Zod schemas at the API boundary. Only `scheduler` and `ai-categorization` break this pattern (they're thin orchestrators with no pure layer worth testing in isolation).

### `src/lib/transaction-matching/`

Shared primitive library. **No DB access.** Consumed by `reconciliation` and `recurring-detection`. See Section 2 for full interface and test surface.

```
src/lib/transaction-matching/
  index.ts          # Public interface — only file consumers import
  merchant.ts       # extractMerchant implementation (Hebrew prefix stripping)
  amounts.ts        # amountsMatch, sumMatches
  dates.ts          # datesWithin
  similarity.ts     # scoreSimilarity (Jaro-Winkler over normalized strings)
  index.test.ts     # Full unit suite — see Section 2 for required cases
```

### `src/lib/reconciliation/`

Three-pattern detector plus apply path. Pure detectors are the testable core; DB-backed `runReconciliation` is the integration point invoked by sync post-import.

```
src/lib/reconciliation/
  index.ts          # Public interface
  types.ts          # ReconciliationGroup, ReconciliationCandidate, TxnCandidate
  detect-p1.ts      # Credit-card settlement (bank lump = sum of card cycle txns)
  detect-p2.ts      # 1:1 debit/Bit mirror detection
  detect-p3.ts      # Inter-account transfer detection
  confidence.ts     # Confidence scoring per pattern type
  apply.ts          # DB apply path: category-flip + reconciliation column update
  store.ts          # ReconciliationStore interface + Drizzle implementation
  index.test.ts     # TDD suite: all detectors + confidence scorer
```

### `src/lib/recurring-detection/`

Pattern detection and anomaly generation. Pure functions operate over transaction slices; DB-backed scan orchestrates persistence.

```
src/lib/recurring-detection/
  index.ts          # Public interface
  types.ts          # RecurringPattern, Anomaly, Cadence
  detect.ts         # detectPatterns — pure
  next-date.ts      # computeNextExpectedDate — pure
  anomalies.ts      # detectAnomalies — pure
  scan.ts           # DB-backed runDetection orchestrator
  store.ts          # RecurringStore interface + Drizzle implementation
  index.test.ts     # TDD suite
```

### `src/lib/scheduler/`

Thin node-cron orchestrator. No business logic. Invokes the existing sync pipeline with an OTP-skip handler injected. Gated on `SCHEDULER_ENABLED` env flag.

```
src/lib/scheduler/
  index.ts          # startScheduler, stopScheduler
  config.ts         # SchedulerConfig parsed from env (cron expression, flag)
  otp-skip.ts       # Handler: yields { type: 'otp_skipped', bank }, never blocks
```

No unit tests. Behavior is validated by running the daily job manually and inspecting the `sync_runs` table.

### `src/lib/ai-categorization/`

Thin Ollama HTTP adapter. **Build only if the Spike (gated issue) reaches ≥70% accuracy.** If the Spike fails, delete this directory and defer to Phase 3.

```
src/lib/ai-categorization/
  index.ts          # Public interface: classify, isAvailable
  client.ts         # HTTP adapter → http://ollama:11434/api/generate
  prompt.ts         # Prompt builder (current category list + few-shot examples)
  types.ts          # CategorySuggestion, AiCategorizationResult
```

No unit tests. Accuracy is measured by the Spike benchmark against 50 real Hebrew transactions.

### `src/lib/logging/`

Redacted logger wrapper. Security-critical. Replaces any direct `console.*` in new Phase 2 code written in modules that touch credentials, OTP, or transaction descriptions.

```
src/lib/logging/
  index.ts          # createRedactedLogger, redact (exported for testing)
  patterns.ts       # Compiled regexes: passwords, 9-digit IDs, OTP codes, account numbers
  index.test.ts     # TDD suite — redaction coverage (see PRD testing decisions)
```

---

## 2. Shared Primitive Extraction: `transaction-matching`

### The case for extraction

Both `reconciliation` and `recurring-detection` need to answer the same three questions:

1. Are these amounts the same money (within tolerance)?
2. Are these dates close enough (within a window)?
3. Are these merchant descriptions the same merchant?

Hebrew bank descriptions are noisy: `NETFLIX.COM`, `נטפליקס ישראל`, and `Netflix IL` are the same merchant. Without a shared module, each consumer implements its own Hebrew normalization and the implementations silently diverge. `extractMerchant` is the complex part — amounts and dates are two-liners. Extracting all primitives into one tested module prevents divergence and gives both consumers a verified foundation before they're built.

This module must exist and its tests must pass before the reconciliation or recurring-detection worker starts.

### Interface

```typescript
// src/lib/transaction-matching/index.ts

export interface MatchOptions {
  amountTolerancePct?: number; // default 0.10 (±10%)
  dateDayWindow?: number; // default 7
}

/**
 * Strips Hebrew bank description prefixes ("תשלום ב", "רכישה", "קניה ב", "ישיר"),
 * removes digits used as identifiers, normalizes whitespace and casing.
 * Returns a string suitable for fuzzy comparison.
 */
export function extractMerchant(description: string): string;

/**
 * True if |a - b| / min(|a|, |b|) <= tolerancePct.
 * Uses min as denominator (stricter: a 100→111 diff is 11% off the smaller value),
 * which matches the test fixture (100, 111, 10%) → false. Same-sign required.
 */
export function amountsMatch(a: number, b: number, options?: MatchOptions): boolean;

/**
 * True if |a - b| in days <= dayWindow (inclusive, UTC dates).
 */
export function datesWithin(a: Date, b: Date, dayWindow: number): boolean;

/**
 * True if sum(items) equals target within tolerancePct.
 * Used for P1 settlement: sum of card transactions matches bank lump charge.
 */
export function sumMatches(items: number[], target: number, options?: MatchOptions): boolean;

/**
 * Returns 0–1 similarity between two descriptions.
 * Calls extractMerchant on both before scoring.
 * Implementation: Jaro-Winkler **squared** on normalized strings — squaring
 * increases discrimination between moderate and high matches so unrelated
 * pairs land below 0.40 (per the test fixture). Consumers picking a "strong
 * match" threshold should aim for ~0.7 in JW² (~0.84 in plain JW).
 */
export function scoreSimilarity(a: string, b: string): number;
```

### Required test cases

```
extractMerchant:
  "תשלום ב-NETFLIX.COM"   → "netflix"         (Latin lowercased, prefix stripped)
  "רכישה בנטפליקס ישראל"  → "נטפליקס ישראל"   (Hebrew merchant name preserved)
  "חיוב ויזה 0584"         → "ויזה"            (card number stripped)
  "העברה 123456789"        → "העברה"           (9-digit account number stripped)
  ""                        → ""

amountsMatch:
  (100, 109, { amountTolerancePct: 0.10 }) → true   (9% diff)
  (100, 111, { amountTolerancePct: 0.10 }) → false  (11% diff)
  (100, 100)                               → true   (exact, default tolerance)
  (-50, -54, { amountTolerancePct: 0.10 }) → true   (8% diff, both negative)
  (50, -50)                                → false  (opposite sign)
  (0, 0)                                   → true

datesWithin:
  (Jan 1, Jan 8, 7)  → true    (exactly 7 days — inclusive)
  (Jan 1, Jan 9, 7)  → false   (8 days)
  (Jan 8, Jan 1, 7)  → true    (order-independent)
  (Jan 1, Jan 1, 0)  → true    (same day)

sumMatches:
  ([30, 20, 50], 100, {})                        → true
  ([30, 20, 49], 100, { amountTolerancePct: 0.02 }) → true  (1% under, within 2%)
  ([30, 20, 49], 100, { amountTolerancePct: 0 })   → false
  ([], 0, {})                                    → true

scoreSimilarity:
  ("netflix.com", "netflix")   → ≥ 0.85
  ("netflix", "spotify")       → ≤ 0.40
  ("netflix", "netflix")       → 1.0
  ("ויזה", "ויזה ישראל")        → ≥ 0.75
```

---

## 3. Existing In-Scope Modules

### `src/lib/transactions`

**Current public interface:**

```typescript
importScrapedAccounts(credentialId: string, scrapedAccounts: ScrapedAccount[]): Promise<void>
getTransactions(filters: TransactionFilters): Promise<{ data: Transaction[], page: number, pageSize: number }>
updateTransaction(id: string, changes: Partial<Transaction>): Promise<void>
bulkCategorize(transactionIds: string[], categoryId: string): Promise<void>
```

**Shallow spots:**

| Spot                                | Location                 | Risk                               | Fix                                                                                                    |
| ----------------------------------- | ------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| No `total` in pagination            | `index.ts` + `store.ts`  | Medium — UI shows wrong page count | Add `count(*) over ()` or a second `COUNT(*)` query; return `{ data, total, page, pageSize }`          |
| Uncategorized filter is client-side | `transactions-table.tsx` | Medium — breaks with pagination    | Add `WHERE category_id IS NULL` branch in `store.ts` when `filters.categoryId === '__uncategorized__'` |
| No post-import reconciliation hook  | `index.ts`               | Blocks Phase 2                     | Hook belongs in `src/lib/sync/index.ts` (post-import), not here — keeps this module clean              |

**Tactical fix (happens inside the tech-debt cluster PR):**

Return type change:

```typescript
// Before
getTransactions(filters): Promise<{ data: Transaction[], page: number, pageSize: number }>

// After
getTransactions(filters): Promise<{ data: Transaction[], total: number, page: number, pageSize: number }>
```

The `__uncategorized__` sentinel mapping moves from `transactions-table.tsx` to the `store.ts` filter builder.

**Phase 2 schema additions** (4 reconciliation columns) land in `store.ts` and `src/db/schema.ts` only. The pure `importTransaction` function and `TransactionStore` interface in `import.ts` are unaffected — they don't need to know about reconciliation columns.

**Leave as-is:** `importTransaction` pure function, `TransactionStore` interface, `bulkCategorize`, `updateTransaction`.

---

### `src/lib/analytics`

**Current public interface:**

```typescript
// Pure
computeMonthlySummary(transactions: AnalyticsTransaction[]): MonthlySummary
computeSpendingByCategory(transactions: TransactionWithCategory[]): CategorySpending[]

// DB-backed
getMonthlySummary(year: number, month: number): Promise<MonthlySummary>
getSpendingByCategory(year: number, month: number): Promise<CategorySpending[]>
getAccountBalances(): Promise<AccountBalance[]>
getRecentTransactions(limit: number): Promise<RecentTransaction[]>
```

**Diagnosis:** No shallow spots. This is the reference implementation of the deep module pattern in this codebase. Pure functions handle all computation; DB wrappers fetch and delegate. 13 tests cover the pure layer exhaustively including edge cases (division by zero, empty months, all five category types).

**Phase 2 impact:** None structural. Reconciliation works by category-flipping artifact transactions to `transfer` type. `computeMonthlySummary` already excludes `transfer` and `ignore` from all totals. When reconciliation runs correctly, analytics automatically reflects correct numbers — no code changes to this module are required.

**Leave as-is.**

---

### `src/lib/categories`

**Current public interface:**

```typescript
// categories/index.ts
getCategories(): Promise<Category[]>
createCategory(data: CreateCategoryInput): Promise<string>
updateCategory(id: string, changes: Partial<Category>): Promise<void>
deleteCategory(id: string): Promise<void>

// categories/rules.ts — pure
categorize(description: string, rules: CategoryRule[]): string | null
suggestRule(description: string, categoryId: string): CategoryRule

// categories/rules.ts — DB-backed
categorizeTransaction(description: string): Promise<string | null>
getRules(): Promise<CategoryRule[]>
createRule(data: CreateRuleInput): Promise<string>
updateRule(id: string, changes: Partial<CategoryRule>): Promise<void>
deleteRule(id: string): Promise<void>
```

**Diagnosis:** Clean. `categorize` is a textbook pure function with priority-ordered matching and 14 tests covering all four match types, case-insensitivity, and first-match-wins behavior. The pure/DB split is correct. No shallow spots.

**Phase 2 addition — retroactive rule application:**

Add to `categories/rules.ts`. No refactor to existing functions; these are additive:

```typescript
/**
 * Returns count of transactions the rule would recategorize without modifying anything.
 * Only counts transactions where categoryId IS NULL, or where the existing rule
 * has strictly lower priority than this rule's priority.
 */
previewRetroactiveApply(ruleId: string): Promise<{ count: number }>

/**
 * Applies rule to all eligible transactions respecting priority.
 * A transaction is eligible if: uncategorized, OR its current category_rule
 * has lower priority than this rule's priority.
 * Returns count of updated transactions.
 */
applyRetroactively(ruleId: string): Promise<{ applied: number }>
```

Priority join for eligibility:

```sql
-- Eligible transactions for ruleId with priority P:
SELECT t.id
FROM transactions t
LEFT JOIN category_rules cr ON cr.category_id = t.category_id
WHERE t.bank_account_id IN (/* user's accounts */)
  AND (t.category_id IS NULL OR cr.priority < P)
  AND <rule match condition applied to t.description>
```

The match condition reuses the same `categorize` pure function — fetch the specific rule, wrap it in an array, call `categorize(description, [rule])`.

**Leave all existing functions as-is.**

---

### Form Components

**In scope:** `credentials-section.tsx` (347 lines), `categories-section.tsx` (418 lines), `rules-section.tsx` (320 lines), `transactions-table.tsx` (660 lines).

**Current pattern — repeated across all three settings sections:**

```typescript
const [field1, setField1] = useState("");
const [error, setError] = useState<string | null>(null);
const [loading, setLoading] = useState(false);

const handleSubmit = async () => {
  setLoading(true);
  const res = await fetch("/api/...", { method: "POST", body: JSON.stringify({ field1 }) });
  if (!res.ok) {
    setError("שגיאה");
  }
  setLoading(false);
};
```

**Shallow spots:**

| Spot                                    | Component                                | Impact                                                                                             |
| --------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| No inline validation                    | All three                                | Errors only surface on submit; Zod schemas already exist server-side but aren't reused client-side |
| No error clearing on field change       | All three                                | Stale error messages persist while user corrects input                                             |
| Icon map embedded in component          | `categories-section.tsx` ~line 180       | 31 Lucide icons hardcoded in a component; must be shared with any future category UI               |
| Conditional bank-type fields as raw JSX | `credentials-section.tsx` ~lines 180–240 | Works but not idiomatic with RHF; maps cleanly to `watch('bankType')` after migration              |

**`transactions-table.tsx` diagnosis:** 660 lines with many responsibilities (filter state, pagination state, inline edit state, bulk categorize state, rule suggestion state, display logic, API calls). The display/formatting logic (currency, dates, installments) is correct and isolated — it's not the problem. The state management and fetch calls are Phase 2 Server Actions targets. No structural pre-refactor needed; the migration itself slims it.

---

## 4. Forms Migration Pattern

The target is a **hook discipline**, not a shared `EntityForm<T>` wrapper component. A shared wrapper would obscure each form's specific field layout; consistent hook usage gives the same benefits (inline validation, loading state, server error propagation) with zero abstraction overhead.

### Hook discipline

Every settings dialog after migration follows this structure:

```typescript
// 1. Re-use the server Zod schema on the client — no duplication
import { createCredentialSchema } from '@/lib/credentials/schemas';
type CreateCredentialInput = z.infer<typeof createCredentialSchema>;

// 2. Form hook with Zod resolver
const form = useForm<CreateCredentialInput>({
  resolver: zodResolver(createCredentialSchema),
  defaultValues: { bankType: 'discount', username: '', password: '' },
});

// 3. Submit via Server Action
const onSubmit = form.handleSubmit(async (data) => {
  const result = await createCredentialAction(data);
  if (result.error) {
    form.setError('root', { message: result.error });
    return;
  }
  form.reset();
  onSuccess();
});

// 4. Field with inline validation (Shadcn FormField)
<FormField
  control={form.control}
  name="username"
  render={({ field, fieldState }) => (
    <FormItem>
      <FormLabel>שם משתמש</FormLabel>
      <FormControl><Input {...field} /></FormControl>
      {fieldState.error && (
        <FormMessage>{fieldState.error.message}</FormMessage>
      )}
    </FormItem>
  )}
/>

// 5. Submit button disabled during submission
<Button type="submit" disabled={form.formState.isSubmitting}>
  {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : 'שמור'}
</Button>
```

### Server Action shape (consistent across all mutations)

```typescript
// src/app/actions/credentials.ts
"use server";

import { createCredentialSchema } from "@/lib/credentials/schemas";
import { formatZodError } from "@/lib/api-utils";

export async function createCredentialAction(data: unknown): Promise<{ error?: string }> {
  const parsed = createCredentialSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }
  await createCredential(parsed.data);
  revalidatePath("/settings");
  return {};
}
```

Return type `{ error?: string }` is the shared contract: empty object on success, `{ error }` on failure. The form's `form.setError('root', ...)` renders the server error below the submit button using Shadcn's `<FormMessage />`.

### Pre-migration extract: category icons

Move icon map out of `categories-section.tsx` before starting the categories migration. This is the only standalone extract needed before any form migration begins:

```typescript
// src/lib/categories/icons.ts
import { ShoppingCart, Home, Car /* ... */ } from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";

export const CATEGORY_ICONS: Record<string, ComponentType<LucideProps>> = {
  ShoppingCart,
  Home,
  Car,
  // ... all 31
};

export const CATEGORY_ICON_LABELS: Record<string, string> = {
  ShoppingCart: "קניות",
  Home: "בית",
  // ...
};
```

This unblocks the categories migration and makes the icon set available to future UI (subscriptions page, reconciliation inbox) without importing from a component file.

### Migration order for settings sections

1. `categories-section.tsx` — extract icons first, then migrate (most self-contained)
2. `rules-section.tsx` — no dependencies on other migrated sections
3. `credentials-section.tsx` — bank-type conditional fields need `watch('bankType')` attention
4. Inline edits in `transactions-table.tsx` — migrate last; highest complexity, most state

---

## 5. Untouched Modules

These are production-proven against 400+ real transactions. No Phase 2 feature requires modifying them. Do not change them.

| Module                | Why untouched                                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/crypto`      | AES-256-GCM implementation is correct and tested (5 tests). No new encryption requirements in Phase 2.                                                                                                      |
| `src/lib/auth`        | Bcrypt + HMAC session cookie works. The only Phase 2 auth change is in `src/middleware.ts` (return `401 JSON` for `/api/*` paths) — not in this module.                                                     |
| `src/lib/credentials` | Encrypt-on-write/decrypt-on-read CRUD is working. No new credential types in Phase 2.                                                                                                                       |
| `src/lib/scraper`     | Tested against real bank data. The only Phase 2 touch is an **additive** fix for `futureDebits` (credit card balance gap). Must not restructure existing output — append to existing return structure only. |
| `src/lib/screenshots` | Self-contained. Not involved in any Phase 2 feature.                                                                                                                                                        |

**`src/lib/sync` — modified additively only:**

The sync orchestrator gets two additive hooks in Phase 2. Neither touches the existing OTP bridge or SSE stream:

```typescript
// After existing per-bank import loop completes:
await triggerReconciliation(importedAccountIds); // new — reconciliation module
await writeSyncRun({ bank, status, transactionsImported }); // new — sync_runs table
```

The OTP-skip handler for the scheduler is injected via the existing `otpCodeRetriever` callback parameter — the sync module itself doesn't change, only the caller differs (scheduler passes a skip handler instead of a promise resolver).

---

## 6. Dependency Graph

Phase 2 features and their module dependencies. Critical path: `transaction-matching` must be complete before reconciliation or recurring-detection workers start. All other tracks are independent and can run in parallel worktrees.

```
[Architecture Pass 1] — this document — must merge before any other Phase 2 PR
        │
        ├── [transaction-matching primitives] ◄── shared foundation; build first
        │           │
        │           ├── [Reconciliation Engine]
        │           │     · schema: 4 columns on transactions + seeded transfer categories
        │           │     · pure: detect-p1, detect-p2, detect-p3, confidence scorer
        │           │     · integration: post-import hook in sync module
        │           │     · UI: /reconciliation inbox + dashboard strip + undo per txn
        │           │     · analytics: no code change (auto-correct via category flip)
        │           │
        │           └── [Recurring Detection]
        │                 · schema: recurring_expenses table
        │                 · pure: detectPatterns, computeNextExpectedDate, detectAnomalies
        │                 · UI: /subscriptions page + Repeat badge + dashboard card
        │
        ├── [Retroactive Rule Application] ◄── categories module only; no new primitives
        │     · adds previewRetroactiveApply + applyRetroactively to categories/rules.ts
        │     · UI: "Apply to existing" button + preview count dialog on rules-section
        │
        ├── [Tech Debt Cluster] ─────────────────────────────── parallel track
        │     · API 401 JSON (src/middleware.ts only)
        │     · Pagination totals (transactions store + API + UI)
        │     · Server-side uncategorized filter (transactions store)
        │     · Log sanitization (logging module — new)
        │     · Multi-card balance fix (scraper, additive)
        │     · puppeteer-core version pin
        │
        ├── [UI Foundation] ──────────────────────────────────── parallel track
        │     · Design tokens (tailwind.config.ts: zinc/stone palette, emerald-600 accent)
        │     · Typography (tabular-nums, weight contrast, tighter line-heights)
        │     · Skeletons replacing "טוען..." strings
        │     · Empty states (transactions, rules, credentials, reconciliation, subscriptions)
        │     · Spending chart redesign (label truncation, tooltips, responsive)
        │
        ├── [Code Quality — RHF+Zod + Server Actions] ────────── parallel track
        │     · categories-section (extract icons first, then migrate)
        │     · rules-section
        │     · credentials-section
        │     · transactions-table inline edits + bulk categorize
        │     One PR per section; new forms first, legacy retrofit last
        │
        ├── [Background Scheduler] ───────────────────────────── independent
        │     · schema: sync_runs table
        │     · logging module (from tech debt cluster) should land first
        │     · node-cron + SCHEDULER_ENABLED env flag
        │     · UI: "Last sync" dashboard strip
        │
        └── [AI Categorization Spike] ────────────────────────── gated
                    │
                    ├── if accuracy ≥ 70%: build ai-categorization module + Ollama sidecar
                    └── if accuracy < 70%: defer to Phase 3; retroactive rules carry the load
```

**Critical path summary:**

```
Architecture Pass 1 → transaction-matching → Reconciliation Engine
```

Everything else is parallel once this document merges.
