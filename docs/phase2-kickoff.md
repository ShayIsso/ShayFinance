---
title: "Phase 2 Kickoff: The Inheritance"
tags:
  - phase2
  - architecture
  - handover
created: 2026-04-04
status: active
parent: "[[PRD-v1]]"
---

# Phase 2 Kickoff: The Inheritance

## The Journey So Far

ShayFinance began as a blank repo on 2026-03-31. Through a structured process — **Grill Me** (18 architectural decisions) → **PRD** (40 user stories) → **CLAUDE.md** → **13 vertical-slice issues** — we shipped a complete MVP in one session.

### How We Worked

- **Opus as Orchestrator**: Designed architecture, wrote worker prompts, reviewed every PR
- **Sonnet as Workers**: Implemented issues from self-contained prompts with exact file paths
- **TDD for Core Logic**: Crypto, category rules, transaction dedup, analytics — 58 tests total
- **Zod Everywhere**: All API inputs validated at the boundary with Hebrew error messages
- **Zero Direct Commits**: Feature branches → PR → orchestrator review → merge

### Key Architectural Decisions (and Why)

| Decision                                        | Why                                                                   | Reference                        |
| ----------------------------------------------- | --------------------------------------------------------------------- | -------------------------------- |
| Sequential scraping (not parallel)              | OTP prompts would overlap, creating UX chaos                          | [[PRD-v1#Scraper Execution]]     |
| SSE over WebSocket                              | Simpler, native browser support, works with Next.js API routes        | [[PRD-v1#API Design]]            |
| Category-driven classification (not sign-based) | Full control over what counts toward savings                          | [[PRD-v1#Categories]]            |
| Investment as 5th category type                 | Shay tracks savings _deployment_ separately from savings _generation_ | [[PRD-v1#Financial Metrics]]     |
| Rule-based over AI categorization               | Transparent, local, private — AI deferred to Phase 2                  | [[PRD-v1#Categories]]            |
| Store pattern for transaction dedup             | Pure function testable without DB — swap implementation freely        | `src/lib/transactions/import.ts` |
| Pure functional analytics                       | No side effects — easy to extend with new metrics                     | `src/lib/analytics/index.ts`     |

---

## Architecture Snapshot

### Module Map

```
src/
├── app/                          # Next.js App Router
│   ├── (dashboard)/              # Auth-protected layout
│   │   ├── page.tsx              # Dashboard (analytics + charts)
│   │   ├── transactions/         # Transaction table
│   │   ├── sync/                 # Real-time sync UI
│   │   └── settings/             # Credentials + categories + rules
│   ├── login/                    # Password gate
│   └── api/
│       ├── auth/                 # Login/logout
│       ├── analytics/            # Monthly, spending, balances, recent
│       ├── categories/           # CRUD
│       ├── category-rules/       # CRUD
│       ├── credentials/          # Encrypted CRUD
│       ├── screenshots/          # List, serve, cleanup
│       ├── sync/                 # SSE stream + OTP submission
│       └── transactions/         # Filtered list, update, bulk categorize
├── lib/
│   ├── crypto/                   # AES-256-GCM (5 tests)
│   ├── credentials/              # Encrypt on write, decrypt on read
│   ├── scraper/                  # israeli-bank-scrapers-core wrapper
│   ├── sync/                     # Sequential orchestrator + OTP bridge
│   ├── transactions/             # Dedup engine (11 tests) + CRUD
│   ├── categories/               # Rule engine (14 tests) + CRUD
│   ├── analytics/                # Pure computation (13 tests)
│   ├── auth/                     # Bcrypt + HMAC session
│   ├── screenshots/              # Temp file management (15 tests)
│   ├── env.ts                    # Zod-validated environment
│   └── api-utils.ts              # Shared Zod error formatter
├── db/
│   ├── schema.ts                 # Drizzle ORM (5 tables, 6 enums)
│   ├── index.ts                  # DB connection
│   └── seed.ts                   # 19 default Hebrew categories
└── components/
    ├── dashboard-panel.tsx        # Charts + savings summary
    ├── transactions-table.tsx     # Filters + inline edit + bulk ops
    ├── sync-panel.tsx             # SSE consumer + OTP input
    ├── categories-section.tsx     # Settings CRUD
    ├── credentials-section.tsx    # Encrypted bank management
    ├── rules-section.tsx          # Category rules CRUD
    ├── sidebar-nav.tsx            # RTL navigation
    └── ui/                        # Shadcn components
```

### Database Schema

```
bank_credentials (encrypted)
  └── bank_accounts (unique: credentialId + accountNumber)
       └── transactions (dedup: externalId + bankAccountId)

categories (19 defaults, 5 types)
  └── category_rules (priority-ordered matching)
```

### Test Coverage

| Module                | Tests  | What's Tested                                                             |
| --------------------- | ------ | ------------------------------------------------------------------------- |
| `crypto`              | 5      | Round-trip, unique IVs, tamper detection, wrong key                       |
| `categories/rules`    | 14     | All 4 match types, priority ordering, first-match-wins                    |
| `transactions/import` | 11     | External ID dedup, composite fallback, pending→completed, auto-categorize |
| `analytics`           | 13     | All category types, savings rate, division-by-zero, empty months          |
| `screenshots`         | 15     | Path traversal prevention, 24h cleanup, age formatting                    |
| **Total**             | **58** |                                                                           |

---

## Strategic Debt

#tech-debt items that must be understood before building Phase 2:

### Code-Level Hacks

| Hack                                  | Location                                | Risk                               | Fix Approach                                       |
| ------------------------------------- | --------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `as unknown as ScraperBrowser`        | `src/lib/scraper/index.ts`              | Low — structurally identical types | Pin puppeteer-core to scraper's version            |
| Client-side uncategorized filter      | `src/components/transactions-table.tsx` | Medium — breaks with pagination    | Add `WHERE category_id IS NULL` to API             |
| Estimated pagination (no total count) | `GET /api/transactions`                 | Low — functional but imprecise     | Return `{ data, total, page, pageSize }`           |
| API auth returns HTML instead of 401  | `src/middleware.ts`                     | Medium — confusing for API clients | Check `pathname.startsWith("/api/")` in middleware |

### Missing Features (Accepted for MVP)

| Gap                                      | Impact                                  | Phase 2 Priority                           |
| ---------------------------------------- | --------------------------------------- | ------------------------------------------ |
| Credit card balances always null         | Dashboard shows "—" for Max/Cal         | High — needs alternative scraping approach |
| No retroactive rule application          | New rules only affect future imports    | High — critical for initial triage         |
| No log sanitization                      | No evidence of leaks, but no guardrails | Medium — preventive                        |
| Generator abandonment can orphan browser | Edge case on client disconnect          | Low — short-lived operations               |
| Docker APP_PASSWORD needs `$$` escaping  | Separate from Next.js `\$` escaping     | Document-only                              |

---

## The Backlog Mission

Derived from [[BACKLOG]] — organized by strategic impact:

### Immediate (Pre-Phase 2 Features)

- **Retroactive category rules** — "Apply to existing" button
- **API auth 401 for `/api/*` routes** — proper error responses
- **Server-side uncategorized filter + pagination totals** — data integrity

### Phase 2 Core

- **Background scheduler / cron sync** — auto-fetch without manual trigger
- **AI-based transaction classification** — Claude API or local Ollama
- **Recurring expense detection** — pattern recognition for subscriptions
- **Credit card balance** — alternative scraping approach

### Phase 2 Polish

- **Dark mode** — Shadcn theming
- **Budgeting & goals** — monthly budget per category
- **Reports & export** — CSV/PDF generation

### Phase 3+

- Multi-user support, additional banks, cloud deployment, investment tracking
