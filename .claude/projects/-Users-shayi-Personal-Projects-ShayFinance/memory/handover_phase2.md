---
name: Phase 2 Handover
description: Complete context for the next agent session — MVP is done, Phase 2 begins with backlog review and new PRD
type: project
---

## Why This Fresh Start

The Phase 1 session built the entire ShayFinance MVP (9 modules, 4 pages, 58 tests, production Docker). Context saturation reached ~36%. A fresh session provides full context budget for Phase 2's architectural decisions.

## Immediate Actions

1. **Read these files first:**
   - `CLAUDE.md` — full development guidelines (updated for Phase 2)
   - `docs/phase2-kickoff.md` — architecture snapshot, strategic debt, journey summary
   - `BACKLOG.md` — all deferred features and tech debt items
   - `docs/PRD-v1.md` — original PRD for reference

2. **Lead a Phase 2 Grill Me session** based on `BACKLOG.md`. Key decisions needed:
   - Scope: which backlog items make Phase 2 vs Phase 3?
   - Background sync: how to handle OTP for unattended runs?
   - AI categorization: Claude API vs local Ollama vs hybrid?
   - Recurring detection: algorithm design for pattern matching
   - Credit card balances: alternative scraping approach since futureDebits is empty

3. **Generate a Phase 2 PRD** via the `write-a-prd` skill, submit as GitHub issue.

4. **Break into issues** via `prd-to-issues` skill with vertical slices.

## How We Work

- **Opus orchestrates, Sonnet implements.** Orchestrator writes prompts, reviews PRs, makes architectural decisions. Workers execute from self-contained prompts.
- **TDD for logic modules.** Pure functions tested without DB. Store pattern for DB abstraction.
- **Zod on all API inputs.** Hebrew error messages.
- **`sequential-thinking` MCP** for complex async/logic design.
- **`improve-codebase-architecture`** before features touching multiple modules.
- **`git worktree`** for parallel worker tasks — prevents branch conflicts.
- **`npm run format` before every commit.** CI rejects unformatted code.
- **PR descriptions must include `Closes #N`.** Issues auto-close on merge.

## Current State

- **58 tests passing** (crypto 5, rules 14, import 11, analytics 13, screenshots 15)
- **Build clean** on `npm run build`
- **CI pipeline:** format check → lint → type check → test → build
- **Production Docker verified** — multi-stage, Chromium bundled, non-root, ARM64-aware
- **Live tested** with real Cal and Max accounts — 400+ transactions imported

## Known Strategic Debt

See `docs/phase2-kickoff.md` for full table. Top items:
- `as unknown as ScraperBrowser` type cast (pin puppeteer-core version)
- API auth returns HTML redirect for /api/* routes (should be 401 JSON)
- Client-side uncategorized filter (should be server-side)
- No retroactive category rule application
- Credit card balances always null (futureDebits not populated by library)

## User Profile

Shay is a security-conscious developer and investor. Hebrew-speaking. Prefers clean, minimal UI. Methodical workflow (plan before code). Uses feature branches exclusively. Cares deeply about savings rate and investment tracking. Lives with a roommate (reason for password gate). Local/Docker deployment only — no cloud.
