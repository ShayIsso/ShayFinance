# ShayFinance — Development Guidelines

## Project Overview

Private, self-hosted personal finance dashboard. Fetches and categorizes transactions from Israeli banks (Bank Discount, Max, Cal). Single-user, local/Docker only. Hebrew RTL interface.

**PRD v1 (MVP):** https://github.com/ShayIsso/ShayFinance/issues/1
**Phase 2 Kickoff:** `docs/phase2-kickoff.md`
**Backlog:** `BACKLOG.md`

## Tech Stack

- **Framework:** Next.js (App Router) + TypeScript (strict)
- **Styling:** Tailwind CSS + Shadcn UI
- **ORM:** Drizzle ORM + PostgreSQL (Docker)
- **Scraping:** `israeli-bank-scrapers-core` + `puppeteer-core`
- **Charts:** Shadcn Charts (Recharts)
- **Validation:** Zod on all API boundaries
- **Testing:** Vitest (58 tests across 5 suites)
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

### Adding New Modules

When building Phase 2 features, follow the deep module pattern:

- Clean public interface (export only what consumers need)
- Pure computation functions testable without DB
- DB-backed wrappers that call pure functions
- Zod schemas for all inputs at the API boundary
- Use the Store pattern (see `src/lib/transactions/import.ts`) for logic that needs DB abstraction

### Scraper Execution

- **On-demand only.** No background scheduler (Phase 2 backlog item).
- **Sequential:** Discount → Max → Cal, one at a time.
- **SSE** for real-time progress to the frontend.
- **OTP:** `otpCodeRetriever` bridged via promise. Frontend POSTs OTP to `/api/sync/otp`. 3-minute timeout.
- **Per-bank failure isolation.** One bank failing does not block the rest.
- **Streaming import:** Transactions imported per-bank as they arrive, not batched.
- **Sync window:** 12 months (first sync), 3 months (subsequent).
- **Browser lifecycle:** Puppeteer browser created per-bank, closed in `finally` block.

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
- **No `console.log` in scraper, sync, or credential modules.** Use structured error yields instead.
- **Credentials** stored in PostgreSQL encrypted with AES-256-GCM. Unique IV per record.
- **Passwords never returned by API.** The `GET /api/credentials/:id` route strips passwords and returns only safe fields.
- **Path traversal prevention.** The screenshots module validates filenames with `/^[a-zA-Z0-9_-]+\.png$/`.
- **`.env` contains only:** `DATABASE_URL`, `ENCRYPTION_KEY`, `APP_PASSWORD`, `CHROMIUM_PATH` (optional)
- **Never commit** `.env`, `node_modules`, `.DS_Store`, or the screenshots directory.
- **Failure screenshots** auto-delete after 24 hours. Directory is gitignored.
- **App auth:** Simple password gate with bcrypt hash. HTTP-only HMAC-signed session cookie.
- **Session HMAC key must be hex-decoded.** Both `createSession` and `validateSessionEdge` decode `ENCRYPTION_KEY` from hex before HMAC.

## Database Schema (Drizzle ORM)

### Tables

- `bank_credentials` — encrypted bank login data
- `bank_accounts` — account numbers and balances per credential (unique: credentialId + accountNumber)
- `transactions` — all financial transactions with dedup support
- `categories` — Hebrew categories with type classification (unique: name)
- `category_rules` — auto-categorization rules with priority

### Key Constraints

- **Deduplication:** Unique on `(external_id, bank_account_id)` where external_id is not null. Fallback: composite match on `(date, charged_amount, description)` for pending transactions.
- **Bank accounts:** `onConflictDoUpdate` upsert — updates balance on every sync.
- **Installments:** Individual rows per monthly charge. `installment_number` / `installment_total` fields.
- **Custom descriptions:** `custom_description` (nullable) overrides display. Original `description` is never modified.

## UI/Design Rules

- **RTL** (`dir="rtl"`) is mandatory. Primary language: Hebrew.
- **Light theme only.** No dark mode (Phase 2 backlog item).
- **Shadcn UI** components. **Lucide** icons. **No emoji anywhere.**
- **Typography:** Assistant (Google Fonts) with Hebrew support.
- **Palette:** Neutral whites/grays. Emerald/green accent for positive balances only.
- **NO** bright saturated gradients, heavy shadows, or busy patterns.
- **Mobile responsive.**
- **All formatting (dates, currency) must happen in client components only** to prevent hydration mismatches.

## Pages

1. **Dashboard** — Savings Summary (Net Savings, Savings Rate %), income/expenses, balance per account, spending-by-category chart, recent transactions. Month navigation.
2. **Transactions** — Filterable/sortable table, inline custom_description editing, bulk category assignment, "create rule?" suggestions.
3. **Sync** — Per-bank progress, OTP input with 3-min countdown, error/retry per bank, screenshot links.
4. **Settings** — Bank credentials CRUD, categories management, categorization rules CRUD.

## Infrastructure

- **Dev:** `docker compose up db -d` for PostgreSQL. `npm run dev` for Next.js natively.
- **Production:** Single Docker container. Multi-stage Dockerfile. Bundled Chromium. ARM64-aware. Non-root user.
- **Docker Compose** has dev (DB only) and production (full) profiles.
- **Next.js config:** `output: "standalone"` for Docker deployment.

## Git Workflow

- **Feature branches only** (e.g., `feature/init-setup`, `feature/scraper-engine`).
- **Never commit directly to `main`.**
- **Before every commit, run `npm run format`** to auto-fix Prettier issues. CI runs `prettier --check` and will reject unformatted code.
- **PR descriptions must include `Closes #N`** (where N is the GitHub issue number) so issues auto-close on merge.
- **Parallel work must use `git worktree`** to prevent branch conflicts. Each worker operates in a dedicated worktree.
- **`.gitignore`** must cover: `.env`, `node_modules`, `.DS_Store`, `/tmp/scraper-failures/`

## Agent Workflow (Phase 2)

### Orchestrator Protocol

- Use **`sequential-thinking`** MCP for multi-step logic design (dedup, async coordination, financial calculations).
- Use **`improve-codebase-architecture`** skill before implementing features that touch multiple modules.
- Use **`/tdd`** skill for any module with computation logic (analytics, rules, transactions).
- Worker prompts must include: exact file paths, schema context, acceptance criteria, gotchas section.
- Every PR must be reviewed by the orchestrator before merge.
- After agent work, optionally run **/simplify** on touched modules if complexity warrants it — skip if changes are minor.
- Use the **obsidian** skills to sync relevant project files, decisions, and module graphs to Obsidian when tracking cross-module changes or phase milestones.

### Worker Protocol

- Read `CLAUDE.md` first, then specified files.
- Run `npm run format` before every commit.
- Run `npm test` and `npm run build` before pushing.
- PR description must include `Closes #N`.
- Use Zod for all API input validation.
- Follow existing patterns in the codebase (check similar modules first).
- Never log credentials, OTP codes, or bank data.

## Agent skills

### Issue tracker

GitHub issues at `ShayIsso/ShayFinance` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles mapped to existing repo labels (`AFK` for ready-for-agent, `HITL` for ready-for-human). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.

## Known Gotchas

- **CI uses `npm install`, not `npm ci`.** Lock file is generated on macOS ARM64 and `npm ci` rejects it on Linux CI runners. Do not change CI back to `npm ci`.
- **Never add `os=any` or `cpu=any` to `.npmrc`.** This corrupts native bindings on macOS. If the lock file needs regenerating: `rm -rf node_modules package-lock.json && npm install`.
- **Test runner is Vitest.** `npm test` runs all tests. `npm run test:watch` for watch mode. Config in `vitest.config.ts` with `@/*` path alias.
- **`APP_PASSWORD` in `.env` must escape `$` as `\$`.** Next.js's dotenv parser expands `$VAR` — bcrypt hashes contain `$2b$12$...` which gets mangled. Always write `\$2b\$12\$...` in `.env`.
- **`APP_PASSWORD` in Docker `.env` must escape `$` as `$$`.** Docker Compose interprets `$` as variable substitution.
- **Session HMAC key must be hex-decoded.** `createSession` and `validateSessionEdge` both decode `ENCRYPTION_KEY` from hex to raw bytes before using it as the HMAC key. If one uses the raw string and the other decodes it, tokens will never validate.
- **Middleware file must be `src/middleware.ts` exporting `middleware`.** Next.js 16 shows a deprecation warning suggesting `proxy.ts`, but `proxy.ts` does not reliably intercept requests — routes will be unprotected. Ignore the warning and keep `middleware.ts`.
- **`puppeteer-core` version mismatch.** The scraper library bundles its own puppeteer-core. We use `as unknown as ScraperBrowser` to bridge types. Pin versions when possible.
- **Discount scraper is patched locally.** `israeli-bank-scrapers-core@6.7.4` doesn't recognize Discount's `apollo/retail3/` post-login URL — we add it via `patches/israeli-bank-scrapers-core+6.7.4.patch` (auto-applied by the `postinstall` hook). See `patches/README.md` for the drop condition.

## Testing Priorities

Tests validate external behavior through public interfaces, not implementation details.

1. **Transactions** — Deduplication logic, pending→completed transitions.
2. **Analytics** — Savings rate calculation, category type handling, edge cases.
3. **Categories** — Rule priority matching, all match types.
4. **Crypto** — Encrypt/decrypt integrity, unique IVs, tamper detection.
5. **Screenshots** — Path traversal prevention, 24h cleanup, age formatting.

Current: **58 tests across 5 suites.** All must pass before any PR merge.
