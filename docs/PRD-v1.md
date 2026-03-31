# ShayFinance — Product Requirements Document (v1)

> **Status:** Approved
> **Date:** 2026-03-31
> **GitHub Issue:** [ShayIsso/ShayFinance#1](https://github.com/ShayIsso/ShayFinance/issues/1)

---

## Problem Statement

Managing personal finances across multiple Israeli banks (Bank Discount, Max, Cal) requires manually logging into each bank's website, downloading transactions, and reconciling them in spreadsheets. There is no unified, private, and secure tool that aggregates transactions from Israeli banks, categorizes them automatically, and provides a clear picture of monthly savings and investment deployment — all while keeping sensitive financial data fully local and under the user's control.

## Solution

ShayFinance is a private, self-hosted personal finance dashboard that automatically scrapes transactions from Bank Discount, Max, and Cal using the `israeli-bank-scrapers-core` library. It stores all data in a local PostgreSQL database with AES-256-GCM encrypted credentials, categorizes transactions via user-defined rules, and presents a clean Hebrew RTL interface focused on savings tracking and investment awareness. The app runs entirely locally (Docker) with zero cloud dependencies.

## User Stories

1. As a user, I want to add my bank credentials through a settings UI, so that I don't have to edit configuration files manually.
2. As a user, I want my bank credentials encrypted at rest with AES-256-GCM, so that my financial login details are never stored in plaintext.
3. As a user, I want to trigger a manual sync for all my banks with a single button, so that I can fetch the latest transactions on demand.
4. As a user, I want to trigger a sync for a specific bank individually, so that I can refresh one bank without waiting for all of them.
5. As a user, I want to see real-time progress during sync (which bank is being processed, login status, scraping status), so that I know the system is working and where it is in the process.
6. As a user, I want to be prompted for an OTP/SMS code inline during sync when a bank requires MFA, so that I can complete the authentication without leaving the app.
7. As a user, I want a 3-minute timeout on OTP entry, after which the bank sync fails gracefully and moves to the next bank, so that one failed MFA doesn't block the entire sync.
8. As a user, I want to retry a failed bank sync individually without re-running all banks, so that I can recover from a missed OTP efficiently.
9. As a user, I want the first sync to fetch 12 months of transaction history, so that I have a meaningful baseline of financial data.
10. As a user, I want subsequent syncs to fetch 3 months of rolling data, so that pending transactions get updated and recent history stays current.
11. As a user, I want transactions to be deduplicated on import (by asmachta/external ID), so that overlapping sync windows don't create duplicate entries.
12. As a user, I want pending transactions to automatically update to completed status when they reappear as settled, so that my records stay accurate.
13. As a user, I want to see all my transactions in a filterable, sortable table with columns for date, description, amount, category, bank, and status.
14. As a user, I want to filter transactions by date range, bank, category, and status, so that I can drill into specific subsets of my spending.
15. As a user, I want to search transactions by description text, so that I can quickly find specific purchases or merchants.
16. As a user, I want to edit a transaction's description (custom_description) inline, so that I can replace unhelpful bank descriptions like "ATM Withdrawal" with meaningful labels like "Eden's Wedding Gift."
17. As a user, I want the original bank description preserved and visible even after I add a custom description, so that I can always trace back to the source.
18. As a user, I want to assign a category to a transaction manually, so that uncategorized or miscategorized transactions can be corrected.
19. As a user, I want to bulk-assign categories to multiple transactions at once, so that I can categorize efficiently.
20. As a user, I want the system to suggest "Create a rule?" when I manually categorize a transaction, so that similar future transactions are auto-categorized.
21. As a user, I want to define categorization rules (contains, starts_with, exact, regex) with priority ordering, so that transactions are automatically categorized on import.
22. As a user, I want 18 pre-seeded Hebrew categories covering typical Israeli expenses (משכורת, מזון וסופר, מסעדות וקפה, רכב ודלק, דיור ושכירות, חשבונות ושירותים, בריאות, בילויים ופנאי, קניות וביגוד, חינוך, ביטוח, מנויים, מתנות ואירועים, השקעות, חיסכון, העברה פנימית, תשלום כ. אשראי, אחר).
23. As a user, I want categories to have a type (income, expense, investment, transfer, ignore), so that my financial metrics are calculated correctly.
24. As a user, I want the "ignore" category type to exclude transactions like credit card bill payments from totals, so that I avoid double-counting.
25. As a user, I want the "transfer" category type to exclude internal bank-to-bank moves from income/expense totals, so that my savings rate isn't inflated.
26. As a user, I want to see a Dashboard with a prominent Savings Summary showing Net Savings (Income - Expenses) and Savings Rate (%) for the current month.
27. As a user, I want to see how much of my net savings was deployed to the "investment" category, so that I can track my investment discipline.
28. As a user, I want to see my total income and total expenses for the current month on the dashboard.
29. As a user, I want to see my balance per bank account on the dashboard.
30. As a user, I want to see a spending-by-category chart on the dashboard, so that I can visualize where my money goes.
31. As a user, I want to see a list of recent transactions on the dashboard for a quick overview.
32. As a user, I want the entire interface to be in Hebrew with RTL layout, so that it feels native and readable.
33. As a user, I want a clean, minimal, light-themed UI (neutral whites/grays, emerald accent for positive values), so that the interface is pleasant and professional.
34. As a user, I want the app to be mobile-responsive, so that I can check my finances on my phone.
35. As a user, I want a simple password gate protecting the app, so that my financial data isn't exposed if someone accesses my laptop.
36. As a user, I want failure screenshots from scraping errors to be stored temporarily (24h) and viewable in the UI, so that I can debug bank-side changes.
37. As a user, I want failure screenshots to be auto-deleted after 24 hours, so that sensitive data doesn't persist.
38. As a user, I want installment transactions stored as individual rows (one per monthly charge), so that each month's cash flow accurately reflects actual charges.
39. As a user, I want to see installment details (e.g., 3 of 12) on installment transactions, so that I can track ongoing payment plans.
40. As a user, I want both original and charged amounts/currencies on transactions, so that I can see the true cost of international purchases.

## Implementation Decisions

### Module Architecture

The system is divided into 9 deep modules with clean, testable interfaces:

1. **Crypto Module** — Pure AES-256-GCM encryption/decryption service. Takes plaintext, returns encrypted payload (ciphertext + IV + auth tag). No database awareness. Single `ENCRYPTION_KEY` sourced from `.env`.

2. **Credentials Module** — Manages the `bank_credentials` table. Encrypts on write, decrypts on read. Validates required fields per bank type: Discount requires `{id, password, num}`, Max and Cal require `{username, password}`. For Max and Cal, the username is the "Internet Username" (User ID), NOT the national ID.

3. **Scraper Module** — Wraps all `israeli-bank-scrapers-core` interaction. Takes a credential ID, launches Puppeteer, runs the scraper, and yields typed events (`progress`, `otp_required`, `otp_timeout`, `complete`, `error`). The `otpCodeRetriever` callback is bridged via a promise that the caller resolves when OTP is submitted.

4. **Sync Orchestrator** — Orchestrates sequential bank-by-bank syncing. Manages the SSE stream to the frontend. Bridges OTP submission between the API layer and the scraper. Passes transactions to the importer as each bank completes (streaming import, not batch). Per-bank failure isolation: one bank's failure doesn't block the rest.

5. **Transactions Module** — Handles import with deduplication (primary: `external_id` + `bank_account_id` unique constraint; fallback: composite match on `date + charged_amount + description` for pending transactions without an external_id). Manages pending-to-completed status transitions. Applies category rules on import. Provides filtered query and update (including `custom_description`) operations.

6. **Categories & Rules Module** — Runs transaction descriptions through categorization rules ordered by priority. Supports match types: `contains`, `starts_with`, `exact`, `regex`. Provides "suggest rule" functionality when a user manually categorizes a transaction. CRUD for categories and rules.

7. **Analytics Module** — Pure functional computation layer. Queries transactions and computes: total income, total expenses, net savings, savings rate (%), investment total, spending by category. Category types drive the calculations: `income` counts as income, `expense` as expenses, `investment` tracked separately, `transfer` and `ignore` excluded from totals.

8. **Auth Module** — Simple bcrypt password verification against hashed `APP_PASSWORD` from `.env`. HTTP-only session cookie. Middleware protecting all routes.

9. **Screenshots Module** — Manages temporary failure screenshot directory. Serves screenshots to UI. Runs 24h cleanup (delete files older than 24 hours).

### Database Schema (Drizzle ORM + PostgreSQL)

**Tables:**

- `bank_credentials` — id (UUID PK), bank_type (enum: discount/max/visaCal), display_name, encrypted_credentials (BYTEA), iv (BYTEA), auth_tag (BYTEA), created_at, updated_at
- `bank_accounts` — id (UUID PK), credential_id (FK), account_number, balance (decimal, nullable), balance_updated_at
- `transactions` — id (UUID PK), bank_account_id (FK), external_id, date, processed_date, description, custom_description (nullable), memo (nullable), original_amount (decimal), original_currency (varchar 3), charged_amount (decimal), charged_currency (varchar 3), type (enum: normal/installments), installment_number (nullable), installment_total (nullable), status (enum: completed/pending), category_id (FK, nullable), scraped_at, created_at, updated_at
- `categories` — id (UUID PK), name (varchar, Hebrew), type (enum: income/expense/investment/transfer/ignore), icon (varchar, Lucide icon name), color (varchar, hex), is_default (boolean)
- `category_rules` — id (UUID PK), category_id (FK), match_type (enum: contains/starts_with/exact/regex), pattern (varchar), priority (int)

**Unique Constraints:**

- `transactions`: unique on (external_id, bank_account_id) where external_id is not null

### API Design

- `GET /api/sync` — SSE endpoint. Starts sequential bank sync, streams progress events.
- `POST /api/sync/otp` — Submits OTP code. Body: `{ code: string }`.
- `POST /api/sync/:bankId` — Sync a single bank (also SSE).
- Standard REST endpoints for transactions, categories, rules, credentials, and analytics.
- All routes protected by auth middleware (session cookie).

### SSE Event Types

```
{ type: "progress",      bank: string, status: "initializing" | "logging_in" | "login_success" | "scraping" | "importing" }
{ type: "otp_required",  bank: string }
{ type: "otp_timeout",   bank: string }
{ type: "bank_complete", bank: string, transactionCount: number }
{ type: "bank_error",    bank: string, error: string, hasScreenshot: boolean }
{ type: "sync_complete", summary: { total: number, byBank: Record<string, number> } }
```

### Infrastructure

- **Development:** Docker Compose runs PostgreSQL only. Next.js runs natively for hot reload. Chromium runs natively on M2 Mac.
- **Production:** Single Docker container via multi-stage Dockerfile. Bundles Chromium + all Linux dependencies. ARM64-aware.
- **Environment:** `.env` contains only `DATABASE_URL`, `ENCRYPTION_KEY`, `APP_PASSWORD` (hashed).

## Testing Decisions

Tests validate **external behavior** through the module's public interface, not implementation details.

### Modules to Test

1. **Transactions Module** — Deduplication (same external_id = no duplicate), pending-to-completed transitions, composite fallback matching, mixed new + duplicate imports.

2. **Analytics Module** — Net Savings and Savings Rate calculations, investment tracking as separate metric, transfer/ignore exclusion, edge cases (zero income, empty months).

3. **Categories Module** — Priority-ordered rule matching, all match types (contains, starts_with, exact, regex), first-match-wins behavior, unmatched transactions stay uncategorized, rule suggestion from manual assignment.

4. **Crypto Module** — Encrypt/decrypt round-trip integrity, unique IVs per encryption, wrong-key rejection, GCM tamper detection.

## Out of Scope

- Background scheduler / cron sync
- AI-based transaction classification
- Recurring/fixed expense detection
- Dark mode
- Budgeting & goals
- Reports & export
- Multi-user support
- Cloud deployment
- Push notifications

All deferred features are tracked in [BACKLOG.md](../BACKLOG.md).

## Further Notes

- **Streaming imports:** Transactions are imported per-bank as they arrive, not batched at the end.
- **Analytics purity:** The analytics module must remain strictly functional with no side effects.
- **Hebrew categories:** All 18 default categories are seeded on first run.
- **Security posture:** Zero-leak policy. Never log credentials, raw HTML, or decrypted data. Failure screenshots auto-delete after 24h.
- **Git workflow:** Feature branches only. Never commit directly to `main`.
