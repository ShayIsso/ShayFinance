# ShayFinance

Private, self-hosted personal finance dashboard for Israeli banks.

Automatically fetches transactions from **Bank Discount**, **Max**, and **Cal**, categorizes them with user-defined rules, and tracks savings and investment deployment — all in a clean Hebrew RTL interface.

## Features

- Automated bank scraping via `israeli-bank-scrapers-core`
- Real-time sync progress with inline OTP/MFA support
- AES-256-GCM encrypted credential storage
- Rule-based auto-categorization (18 pre-seeded Hebrew categories)
- Savings dashboard: Net Savings, Savings Rate (%), investment tracking
- Transaction management with filters, search, and inline editing
- Installment and multi-currency support
- Mobile responsive, Hebrew RTL interface

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS + Shadcn UI |
| Database | PostgreSQL + Drizzle ORM |
| Scraping | israeli-bank-scrapers-core + Puppeteer |
| Charts | Shadcn Charts (Recharts) |

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

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ENCRYPTION_KEY` | 256-bit key for credential encryption |
| `APP_PASSWORD` | Bcrypt-hashed password for app access |

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
  components/       # Shared UI components
  db/               # Drizzle schema + migrations
```

## Documentation

- [PRD v1](docs/PRD-v1.md) — Full product requirements
- [BACKLOG.md](BACKLOG.md) — Deferred features and roadmap
- [CLAUDE.md](CLAUDE.md) — Development guidelines and rules

## Security

- All bank credentials encrypted at rest (AES-256-GCM)
- Password-protected access
- Zero-leak policy: no credentials or sensitive data in logs
- Failure screenshots auto-delete after 24 hours
- Local/Docker deployment only — no cloud exposure

## License

Private. Not for distribution.
