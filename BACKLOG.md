# ShayFinance — Feature Backlog

Deferred features captured during the architecture planning session (2026-03-31). These are explicitly out of scope for the MVP but represent validated ideas for future development.

---

## Tech Debt & UI Refinements

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
