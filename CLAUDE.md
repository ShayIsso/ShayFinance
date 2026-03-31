# ShayFinance — Development Guidelines

## Project Overview

Private, self-hosted personal finance dashboard. Fetches and categorizes transactions from Israeli banks (Bank Discount, Max, Cal). Single-user, local/Docker only. Hebrew RTL interface.

**PRD:** https://github.com/ShayIsso/ShayFinance/issues/1

## Tech Stack

- **Framework:** Next.js (App Router) + TypeScript (strict)
- **Styling:** Tailwind CSS + Shadcn UI
- **ORM:** Drizzle ORM + PostgreSQL (Docker)
- **Scraping:** `israeli-bank-scrapers-core` + `puppeteer-core`
- **Charts:** Shadcn Charts (Recharts)
- **Icons:** Lucide React only

## Architecture Rules

### Module Structure

The app is composed of 9 deep modules. Each module has a clean public interface and encapsulates its complexity internally:

1. `crypto` — AES-256-GCM encrypt/decrypt. No DB awareness.
2. `credentials` — Bank credential CRUD. Encrypts on write, decrypts on read.
3. `scraper` — Wraps `israeli-bank-scrapers-core`. Yields typed events.
4. `sync` — Sequential bank-by-bank orchestrator. SSE stream + OTP bridge.
5. `transactions` — Import with deduplication, status updates, CRUD.
6. `categories` — Rule engine + CRUD. Priority-ordered matching.
7. `analytics` — Pure functional. Computes financial metrics. No side effects.
8. `auth` — Bcrypt password check + session cookie middleware.
9. `screenshots` — Temporary failure screenshot management. 24h cleanup.

### Scraper Execution

- **On-demand only.** No background scheduler.
- **Sequential:** Discount → Max → Cal, one at a time.
- **SSE** for real-time progress to the frontend.
- **OTP:** `otpCodeRetriever` bridged via promise. Frontend POSTs OTP to `/api/sync/otp`. 3-minute timeout.
- **Per-bank failure isolation.** One bank failing does not block the rest.
- **Streaming import:** Transactions imported per-bank as they arrive, not batched.
- **Sync window:** 12 months (first sync), 3 months (subsequent).

### Bank Credentials

- **Discount:** `{ id (national ID), password, num (account number) }`
- **Max:** `{ username (Internet Username, NOT national ID), password }`
- **Cal:** `{ username (Internet Username, NOT national ID), password }`

### Category System

- **5 types:** `income`, `expense`, `investment`, `transfer`, `ignore`
- **Rule-based auto-categorization** with priority ordering.
- **Match types:** `contains`, `starts_with`, `exact`, `regex`
- Manual assignment triggers a "Create rule?" suggestion.
- `transfer` and `ignore` are excluded from all financial totals.
- `investment` is tracked separately from expenses.

### Financial Metrics

- **Net Savings** = Total Income − Total Expenses
- **Savings Rate (%)** = Net Savings / Total Income × 100
- `investment` does NOT reduce net savings — it's tracked as deployment of savings.
- `transfer` and `ignore` are invisible to calculations.

## Security Rules

These are non-negotiable:

- **Zero-leak policy.** NEVER log credentials, decrypted data, or raw HTML responses.
- **Credentials** stored in PostgreSQL encrypted with AES-256-GCM. Unique IV per record.
- **`.env` contains only:** `DATABASE_URL`, `ENCRYPTION_KEY`, `APP_PASSWORD`
- **Never commit** `.env`, `node_modules`, `.DS_Store`, or the screenshots directory.
- **Failure screenshots** auto-delete after 24 hours. Directory is gitignored.
- **App auth:** Simple password gate with bcrypt hash. HTTP-only session cookie.

## Database Schema (Drizzle ORM)

### Tables

- `bank_credentials` — encrypted bank login data
- `bank_accounts` — account numbers and balances per credential
- `transactions` — all financial transactions with dedup support
- `categories` — Hebrew categories with type classification
- `category_rules` — auto-categorization rules with priority

### Key Constraints

- **Deduplication:** Unique on `(external_id, bank_account_id)` where external_id is not null. Fallback: composite match on `(date, charged_amount, description)` for pending transactions.
- **Installments:** Individual rows per monthly charge. `installment_number` / `installment_total` fields.
- **Custom descriptions:** `custom_description` (nullable) overrides display. Original `description` is never modified.

## UI/Design Rules

- **RTL** (`dir="rtl"`) is mandatory. Primary language: Hebrew.
- **Light theme only.** No dark mode.
- **Shadcn UI** components. **Lucide** icons. **No emoji anywhere.**
- **Typography:** Assistant or Inter (Google Fonts) with Hebrew support.
- **Palette:** Neutral whites/grays. Emerald/green accent for positive balances only.
- **NO** bright saturated gradients, heavy shadows, or busy patterns.
- **Mobile responsive.**

## MVP Pages

1. **Dashboard** — Savings Summary (Net Savings, Savings Rate %), income/expenses, balance per account, spending-by-category chart, recent transactions.
2. **Transactions** — Filterable/sortable table, inline custom_description editing, bulk category assignment.
3. **Sync** — Per-bank progress, OTP input, error/retry per bank.
4. **Settings** — Bank credentials CRUD, categories & rules management.

## Infrastructure

- **Dev:** `docker compose up db` for PostgreSQL. `npm run dev` for Next.js natively.
- **Production:** Single Docker container. Multi-stage Dockerfile. Bundled Chromium. ARM64-aware.
- **Docker Compose** has dev (DB only) and production (full) profiles.

## Git Workflow

- **Feature branches only** (e.g., `feature/init-setup`, `feature/scraper-engine`).
- **Never commit directly to `main`.**
- **`.gitignore`** must cover: `.env`, `node_modules`, `.DS_Store`, `/tmp/scraper-failures/`

## Testing Priorities

Tests validate external behavior through public interfaces, not implementation details.

1. **Transactions** — Deduplication logic, pending→completed transitions.
2. **Analytics** — Savings rate calculation, category type handling, edge cases.
3. **Categories** — Rule priority matching, all match types.
4. **Crypto** — Encrypt/decrypt integrity, unique IVs, tamper detection.
