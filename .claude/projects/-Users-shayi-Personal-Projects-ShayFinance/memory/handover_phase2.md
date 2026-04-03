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

### Writing Worker Prompts

Worker prompts are self-contained briefings — the worker has zero prior context. Every prompt includes:

1. **"Read CLAUDE.md first, then read:"** — list exact file paths the worker needs
2. **"Known Gotchas"** section — CI rules, format requirement, Zod mandate, security rules
3. **Task description** — what to build, with code sketches for interfaces and types
4. **Exact module locations** — `src/lib/{module}/index.ts`, not discovery instructions
5. **Acceptance criteria** — what "done" looks like (`npm test`, `npm run build`, specific behaviors)
6. **Branch name** — `feature/{name}` or `fix/{name}`
7. **"Commit when done using /generate-commit-message skill"**
8. **"What NOT to do"** section — prevents scope creep

For TDD issues, include test cases as numbered comments in the prompt. For UI issues, include Hebrew text mappings and Shadcn component names.

### Reviewing PRs

Every PR is reviewed before merge. The review process:

1. **`git fetch origin {branch}` + `git diff main...origin/{branch}`** — read the full diff
2. **Run locally:** `git checkout origin/{branch} -- .` then `npm test` + `npm run build`
3. **Audit focus areas** (specified per PR):
   - Security: zero-leak policy, path traversal, credential exposure
   - Logic: trace data flow end-to-end (SQL → module → API → UI)
   - Types: check for `any`, `@ts-ignore`, unsafe casts
   - Hebrew/RTL: verify text, direction, chevron icons
   - Patterns: Zod validation, error handling, existing code consistency
4. **Use `sequential-thinking` MCP** for complex async flows (OTP bridge, dedup logic)
5. **Verdict:** Approve (safe to merge), or Request Changes with specific code examples
6. **Restore:** `git checkout -- .` after review

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

## Known Issues & Phase 2 Priorities (From User)

These are direct requirements from Shay — not suggestions. The next agent must address them.

### 1. Code Quality (Moving Beyond MVP)

- **Form Management:** Replace manual `useState` forms with **React Hook Form + Zod** integration. Current credentials, categories, and rules forms all use manual state — fragile and verbose.
- **State & Data Fetching:** Too many `useState` + `useEffect` + `fetch` patterns. Move to **Server Actions** and **Mutations** for data synchronization. Reduce client-side state.
- **Architecture Pass:** Run `improve-codebase-architecture` skill before Phase 2 features. Refine directory structure and separation of concerns.

### 2. UI/UX (Critical — Not Optional)

- **Visual Identity:** The B&W MVP look must be replaced with a **sophisticated, modern aesthetic**. Introduce a professional green palette (subtle, not garish). Avoid generic "AI-generated" UI patterns. This is a high-end personal finance tool, not a template.
- **Chart Readability:** Current spending-by-category chart has overlapping text and categories. Needs proper truncation, tooltips, responsive sizing. Still using Shadcn Charts (Recharts) but needs refinement.
- **UX is Top Priority:** Every feature must feel fluid and intuitive. Loading states, transitions, empty states — all polished.

### 3. Financial Logic (Accounting Engine — Critical)

- **Credit Card Double-Counting ("The Paradox"):** When a credit card charges on "יום החיוב" (settlement day), the bank shows both the individual transactions AND the total monthly charge as a deduction. Both get imported, doubling the expense total. The system must detect and exclude the settlement-day lump charge (mark as `ignore` or `transfer`).
- **Transfer Reconciliation (Bit/Internal):** Bit payments and inter-account transfers appear as separate entries in each bank. E.g., sending money via Bit shows as an expense in the sender's account and income in the receiver's — but it's the same money. Need detection logic to match and neutralize these pairs.
- **Net Analytics Accuracy:** The analytics engine must produce clean income vs. expenses without "noise" from double-counting, internal transfers, or settlement charges. This is the core value proposition — if the numbers are wrong, nothing else matters.

## User Profile

Shay is a security-conscious developer and investor. Hebrew-speaking. Prefers clean, minimal UI. Methodical workflow (plan before code). Uses feature branches exclusively. Cares deeply about savings rate and investment tracking. Lives with a roommate (reason for password gate). Local/Docker deployment only — no cloud.
