# ShayFinance — Feature Backlog

Deferred features captured during the architecture planning session (2026-03-31). These are explicitly out of scope for the MVP but represent validated ideas for future development.

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
