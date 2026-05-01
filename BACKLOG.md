# ShayFinance — Feature Backlog

Deferred features captured during the architecture planning session (2026-03-31). These are explicitly out of scope for the MVP but represent validated ideas for future development.

---

## Phase 2 Critical — Accounting Engine

### Credit Card Double-Counting ("The Paradox")

When a credit card settles on "יום החיוב" (settlement day), the bank imports both the individual transactions (coffee, groceries, etc.) AND the total monthly charge as a single deduction from the bank account. Both get imported, doubling expense totals. The system must detect settlement-day lump charges and auto-classify them as `ignore` or `transfer` to prevent double-counting. This likely requires matching the sum of a card's monthly transactions against the bank's settlement charge.

### Transfer Reconciliation (Bit/Internal)

Bit payments and inter-account transfers create duplicate entries across banks. E.g., a Bit transfer shows as an expense in the sender's bank and income in the receiver's — but it's the same money. Need detection logic to identify and neutralize these pairs based on matching amounts, dates, and counterparty patterns. Critical for accurate net income/expense calculations.

### Net Analytics Accuracy

The analytics engine must produce clean numbers without noise from double-counting, internal transfers, or settlement charges. This is the core value proposition — wrong numbers undermine trust. May require a reconciliation pass that runs after import, flagging suspicious pairs for user confirmation.

---

## Phase 2 Critical — Code Quality

### React Hook Form + Zod Integration

Replace all manual `useState` forms (credentials, categories, rules) with React Hook Form integrated with Zod schemas. Current forms are verbose and fragile. The Zod schemas already exist server-side — reuse them client-side.

### Server Actions & Mutations

Reduce `useState` + `useEffect` + `fetch` patterns. Move to Next.js Server Actions for mutations (create, update, delete) and use `revalidatePath` for data synchronization. Keeps data fetching on the server where possible.

### Architecture Deep Pass

Run `improve-codebase-architecture` skill to refine directory structure, identify shallow modules, and ensure Phase 2 features build on solid foundations.

---

## Phase 2 Critical — UI/UX

### Visual Identity Overhaul

Replace the B&W MVP aesthetic with a sophisticated, modern design. Introduce a professional green palette (subtle emerald tones, not garish). Refine spacing, typography hierarchy, and card designs. The app should look like a premium personal finance tool, not a template.

### Chart Readability

Fix overlapping text and categories in the spending-by-category chart. Implement proper label truncation, interactive tooltips, and responsive sizing. Consider horizontal bar chart with scroll for many categories.

### UX Polish

Every interaction must feel fluid: loading skeletons (not "טוען..."), smooth transitions, proper empty states, confirmation feedback on actions. Mobile experience must be refined, not just "responsive."

---

## Tech Debt & UI Refinements

### Bootstrap Drizzle Migration System

Phase 2 schema changes (R1 reconciliation columns, future RD1 `recurring_expenses`, S1 `sync_runs`) currently apply via `npm run db:push`. Phase 1 also used `db:push` exclusively — no migration files have ever been generated. This works for single-user local/Docker deployments but loses historical schema records and complicates any future remote/multi-environment deployment.

When Phase 2 has accumulated 3+ schema-changing slices, do a bootstrap chore: `npx drizzle-kit introspect` against the current dev DB to produce a baseline `0000_baseline.sql`, mark it as already-applied via `INSERT INTO __drizzle_migrations`, then generate `0001_*.sql` for the next change. From that point onward, all schema changes flow through generated migrations.

Discovered during R1 (#46/PR #66): a worker-generated "create everything" first migration would have wiped Shay's 400+ real transactions. We chose `db:push` to avoid that and tracked this as future tech debt.

### API Route Auth: Return 401 JSON Instead of Redirect

The auth middleware redirects all unauthenticated requests to `/login` (HTML). For `/api/*` routes, this returns a 200 with the login page HTML instead of a proper `401 JSON` response. The middleware should check `pathname.startsWith("/api/")` and return `NextResponse.json({ error: "Unauthorized" }, { status: 401 })` instead of redirecting.

### Server-Side Uncategorized Filter

The transactions table filters "uncategorized" client-side after fetching. This should be a server-side query filter (`WHERE category_id IS NULL`) to work correctly with pagination.

### API-Driven Pagination Totals

Pagination currently estimates total pages based on whether a full page was returned. The `GET /api/transactions` endpoint should return `{ data, total, page, pageSize }` so the UI can show accurate page counts and "showing X of Y" text.

### Log Sanitization Utility

Build a logger wrapper that redacts sensitive patterns (passwords, OTP codes, national IDs, account numbers) from stdout. Currently no evidence of actual leaks (zero console.log in scraper/sync code), but a defensive utility would prevent accidental leaks from future development or third-party library output.

### Multi-Card Credit Balance Mapping

The `futureDebits` fallback uses `[0]` when `bankAccountNumber` doesn't match. For users with multiple credit cards under one provider (e.g., two Max cards), this could show the wrong balance on the second card. Fix: require exact `bankAccountNumber` match and show null if unmatched.

### Pin Puppeteer-Core Version

The scraper uses `as unknown as ScraperBrowser` to bridge between our `puppeteer-core` v24 and the library's bundled version. Pin to the same version as `israeli-bank-scrapers-core` to eliminate the type cast.

### Retroactive Category Rules

When a new categorization rule is created, it only applies to future imports. There should be a "Apply to existing transactions" action that re-runs the rule against all uncategorized (or all) transactions in the database, assigning the category where the pattern matches. This is critical for initial data triage after the first sync.

---

## Phase 2 — High Value

### Background Scheduler / Cron Sync

Automatic scheduled scraping (e.g., daily at 8am). Requires solving the MFA/OTP problem for unattended runs — possibly via long-term OTP tokens where supported, or skipping banks that require MFA during automated syncs.

### AI-Based Transaction Classification

Use an LLM to auto-categorize transactions that don't match any rule. Could run locally (Ollama) to maintain the privacy-first approach, or optionally call Claude API. Would supplement, not replace, the rule engine.

### Recurring / Fixed Expense Detection

Auto-detect transactions that repeat monthly with similar amounts and descriptions. Flag them in the UI. Detect missed payments or price changes. Useful for subscription tracking.

---

## Phase 3 — Nice to Have

### Dark Mode

Add dark theme toggle. Shadcn UI supports theming natively — mostly a palette and CSS variables exercise.

### Budgeting & Goals

Set monthly budget per category. Track progress with visual indicators. Set savings goals with target amounts and timelines.

### Reports & Export

Generate monthly/annual financial reports. Export transactions to CSV/PDF. Year-over-year comparisons.

### Push Notifications

Alerts for large transactions, low balances, unusual spending patterns. Would require a notification service layer.

---

## Phase 4 — Long Term

### Multi-User Support

Full authentication system (NextAuth). Separate credentials and data per user. Useful if sharing the tool with a partner.

### Additional Banks

Extend to other Israeli banks supported by `israeli-bank-scrapers-core` (Hapoalim, Leumi, Mizrahi, Isracard, etc.).

### Cloud Deployment Option

Optional cloud hosting (e.g., private VPS) with proper TLS, secure credential storage (e.g., HashiCorp Vault), and remote access.

### Investment Portfolio Tracking

Connect to investment platforms. Track portfolio value, returns, and asset allocation alongside bank transactions.
