# ShayFinance

Private, self-hosted personal finance dashboard for Israeli banks.

Automatically fetches transactions from **Bank Discount**, **Max**, and **Cal**, categorizes them with user-defined rules, and tracks savings and investment deployment — all in a clean Hebrew RTL interface.

## Status & Roadmap

| Phase             | Status          | Scope                                                                                                                                                   |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MVP (Phase 1)** | **Shipped**     | End-to-end import, dedup, rule-based categorization, savings analytics, encrypted credentials, Docker                                                   |
| **Phase 2**       | **In progress** | Accounting Engine (reconciliation) · automation (scheduler, retroactive rule application) · production craft (RHF+Zod, Server Actions, visual overhaul) |
| **Phase 3+**      | Planned         | Dark mode · budgeting & goals · reports & export · push notifications                                                                                   |

- **Phase 1 PRD:** [docs/PRD-v1.md](docs/PRD-v1.md) — [closed GitHub issue #1](https://github.com/ShayIsso/ShayFinance/issues/1)
- **Phase 2 PRD:** [docs/PRD-phase2.md](docs/PRD-phase2.md) — [GitHub issue #35](https://github.com/ShayIsso/ShayFinance/issues/35) (approved, 23 slice issues open)
- **Phase 2 Kickoff:** [docs/phase2-kickoff.md](docs/phase2-kickoff.md) — inheritance doc, strategic debt, architecture snapshot
- **Backlog:** [BACKLOG.md](BACKLOG.md)

## Features (Phase 1 — shipped)

- Automated bank scraping via `israeli-bank-scrapers-core`
- Real-time sync progress with inline OTP/MFA support
- AES-256-GCM encrypted credential storage
- Rule-based auto-categorization (21 pre-seeded Hebrew categories)
- Savings dashboard: Net Savings, Savings Rate (%), investment tracking
- Transaction management with filters, search, and inline editing
- Installment and multi-currency support
- Mobile responsive, Hebrew RTL interface
- 58 tests across 5 suites

## Features (Phase 2 — in progress)

- **Reconciliation Engine** — detects credit-card settlement double-counting, debit/Bit 1:1 mirrors, and inter-account transfers; confidence-threshold split (auto-apply ≥0.95, inbox 0.70–0.95)
- **Retroactive rule application** — apply new categorization rules to historical transactions
- **Daily background sync** — node-cron scheduler with attempt-and-skip OTP handling
- ~~**AI-assisted categorization**~~ — **deferred to Phase 3** per Spike #42 NO-GO. Both candidate Ollama models scored below the 70% threshold (qwen2.5-coder:7b 26%, llama3.1:8b 50%, human baseline 84%). See [docs/ai-categorization-spike.md](docs/ai-categorization-spike.md). Retroactive rule application carries the workflow instead.
- **Recurring expense detection** — subscription tracking with anomaly alerts (price changes, missed payments, newly detected)
- **Production craft** — React Hook Form + Zod, Next.js Server Actions, Monarch + Linear visual identity
- **Tech debt cleanup** — API 401 JSON, pagination totals, log sanitization, credit card balance fix

## Tech Stack

| Layer     | Technology                             |
| --------- | -------------------------------------- |
| Framework | Next.js (App Router) + TypeScript      |
| Styling   | Tailwind CSS + Shadcn UI               |
| Database  | PostgreSQL + Drizzle ORM               |
| Scraping  | israeli-bank-scrapers-core + Puppeteer |
| Forms     | React Hook Form + Zod (Phase 2)        |
| Mutations | Next.js Server Actions (Phase 2)       |
| Charts    | Shadcn Charts (Recharts)               |
| Testing   | Vitest                                 |

## Prerequisites

- Node.js >= 22.12.0
- Docker & Docker Compose
- Google Chrome / Chromium (for development)

## Getting Started

```bash
# Clone the repo
git clone git@github.com:ShayIsso/ShayFinance.git
cd ShayFinance

# Copy environment variables
cp .env.example .env
# Edit .env with your ENCRYPTION_KEY and APP_PASSWORD

# Start PostgreSQL
docker compose up db -d

# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

| Variable         | Description                           |
| ---------------- | ------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string          |
| `ENCRYPTION_KEY` | 256-bit key for credential encryption |
| `APP_PASSWORD`   | Bcrypt-hashed password for app access |

See `.env.example` for the full template.

## Project Structure

```
src/
  app/              # Next.js App Router pages
  lib/
    crypto/         # AES-256-GCM encryption service
    credentials/    # Bank credential management
    scraper/        # israeli-bank-scrapers-core wrapper
    sync/           # Sync orchestrator + SSE
    transactions/   # Import, deduplication, CRUD
    categories/     # Rule engine + category management
    analytics/      # Financial metrics (pure functional)
    auth/           # Password gate + session middleware
    screenshots/    # Failure screenshot management
    # --- Phase 2 additions (in progress) ---
    transaction-matching/  # Shared primitives (fuzzy merchant, amount/date matching)
    reconciliation/        # Credit card / Bit / inter-account de-duplication engine
    recurring-detection/   # Subscription and fixed-expense pattern detection
    scheduler/             # Daily automated sync (node-cron, attempt-and-skip OTP)
    # ai-categorization/   # NOT BUILT — deferred to Phase 3 per Spike #42 NO-GO
    logging/               # Redacted logger wrapper (zero-leak guardrail)
  components/       # Shared UI components
  db/               # Drizzle schema + migrations
```

## How This Project Is Built — AI-Assisted Development

ShayFinance is developed with a structured human + agent workflow. Every phase moves through the same pipeline:

```
 Grill Me  →  write-a-prd  →  PRD as GitHub Issue  →  prd-to-issues  →  feature branches  →  review  →  merge
```

### Roles

- **Orchestrator (Opus):** designs architecture, runs `grill-me` interviews, writes the PRD, reviews every PR, makes architectural calls, writes self-contained worker prompts.
- **Workers (Sonnet):** implement one issue at a time from the orchestrator's prompt. Never see prior conversation context — the prompt is the briefing.
- **Human (Shay):** approves architectural decisions, validates PRDs, reviews PRs, runs manual verification against real bank data.

### Skills used

Project-local skills under `.claude/skills/` encode repeatable workflows:

| Skill                                | Role                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `grill-me`                           | Interview the user to lock architectural decisions before coding               |
| `write-a-prd`                        | Turn decisions into a PRD submitted as a GitHub issue                          |
| `prd-to-issues`                      | Slice the PRD into tracer-bullet vertical GitHub issues                        |
| `improve-codebase-architecture`      | Find shallow modules, recommend deepening, produce `ARCHITECTURE.md`           |
| `tdd`                                | Red-green-refactor loop for pure computation modules                           |
| `generate-commit-message`            | Produce concise, why-focused commit messages from staged diffs (mandatory)     |
| `simplify`                           | Post-implementation review for code reuse, quality, and efficiency             |
| `obsidian-cli` / `obsidian-markdown` | Mirror PRDs and decisions to an Obsidian vault for long-term knowledge capture |
| `json-canvas`                        | Planned: visualize module dependency graphs and phase milestones (future)      |

### Core rules enforced by the workflow

- **Deep modules:** pure functional cores testable without the DB; Store pattern for DB boundaries.
- **TDD for computation:** analytics, rule engine, reconciliation, recurring detection — all test-first.
- **Zod at every API boundary** with Hebrew error messages.
- **Zero-leak logging:** no credentials, OTP codes, or raw scraper output in logs.
- **Feature branches only:** never commit directly to `main`.
- **PRs include `Closes #N`** so issues auto-close on merge.
- **`npm run format` before every commit** — CI rejects unformatted code.

### Knowledge capture

- Every PRD and kickoff doc lives in `/docs`.
- Every PRD is mirrored to an Obsidian vault (`Self_projects/ShayFinance/`) with frontmatter, wikilinks, and callouts.
- Planned enrichments: JSON Canvas module graphs, inline screenshots, workflow walkthrough videos.

## Documentation

- [PRD v1 (MVP)](docs/PRD-v1.md) — Phase 1 product requirements
- [PRD Phase 2](docs/PRD-phase2.md) — Reconciliation, automation, production craft
- [Phase 2 Kickoff](docs/phase2-kickoff.md) — Architecture snapshot, strategic debt, journey notes
- [BACKLOG.md](BACKLOG.md) — Deferred features and roadmap
- [CLAUDE.md](CLAUDE.md) — Development guidelines, agent protocols, security rules

## Security

- All bank credentials encrypted at rest (AES-256-GCM, unique IV per record)
- Password-protected access (bcrypt + HMAC session cookie)
- Zero-leak policy: no credentials or sensitive data in logs
- Failure screenshots auto-delete after 24 hours
- Local/Docker deployment only — no cloud exposure
- Privacy-first: no transaction data to third-party APIs (Claude/OpenAI excluded by policy). AI categorization deferred to Phase 3 — when revisited, local Ollama or local Hebrew embeddings only.

## License

Private. Not for distribution.
