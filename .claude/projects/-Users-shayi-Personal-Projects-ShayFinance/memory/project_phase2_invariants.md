---
name: Phase 2 Invariants & Orchestrator Mode
description: Architectural decisions locked during Phase 2 Grill Me, doc pointers, and the Lead Architect operating mode. Load on any ShayFinance session that is past Phase 1.
type: project
---

Phase 2 of ShayFinance is underway. Phase 1 MVP shipped (live-tested, 58 tests, production Docker).

## Canonical docs — re-read in this order when starting a session

1. `CLAUDE.md` — protocols, security, agent workflow
2. `README.md` — phase status and AI-assisted workflow overview
3. `docs/PRD-phase2.md` — Phase 2 PRD, source of truth for every slice
4. `docs/phase2-kickoff.md` — inheritance from Phase 1, strategic debt
5. `ARCHITECTURE.md` at repo root (exists once GitHub issue #36 lands) — worker blueprint
6. `BACKLOG.md` — Phase 3+ deferred items

## Your role: Lead Architect / Orchestrator

You do NOT write feature code yourself. Each turn is one of:

- **(a) Worker prompt** for an AFK issue the user selects — self-contained briefing with exact file paths, interface sketches, acceptance criteria, "worker gotchas" (npm run format, Zod + Hebrew errors, zero-leak logging, feature branch name, `Closes #N`).
- **(b) PR review** — fetch branch, diff vs main, run `npm test` + `npm run build`, audit types/Hebrew-RTL/zero-leak/security; verdict = approve or request changes with code examples; restore working tree after review.
- **(c) HITL escalation** — surface HITL-labeled issue outputs (#36 `ARCHITECTURE.md`, #42 Ollama Spike report) for user review.
- **(d) Docs update** — update PRD/ARCHITECTURE/README; mirror to Obsidian vault at `/Users/shayi/Documents/Gini_learning/Self_projects/ShayFinance/` with frontmatter + wikilinks + dated Changelog entry (see [[Obsidian Vault Mirror]] memory).

## Dynamic state — look up fresh, do NOT cache

Phase 2 slices are GitHub issues on `ShayIsso/ShayFinance` labeled `phase-2`. Current state is best queried live:

```bash
gh issue list --repo ShayIsso/ShayFinance --label phase-2 --state open \
  --json number,title,labels,body
```

Each issue body contains its own "Blocked by" field and worker-prompt structure. The parent Phase 2 PRD is the issue titled "Phase 2 PRD: ..." (submitted as issue #35 on 2026-04-24, but verify it's still the active PRD).

## Invariants locked during Grill Me — do NOT re-decide

- **Privacy-first (non-negotiable):** no transaction data leaves the host. Local Ollama only for AI. No Claude API, no OpenAI.
- **Reconciliation storage:** hybrid — reconciliation columns on `transactions` (`reconciliation_group_id`, `reconciliation_role`, `reconciliation_confidence`, `reconciliation_confirmed_at`) + category-flip to seeded transfer categories ("הסדרה - כרטיס אשראי", "העברה פנימית"). Analytics module stays untouched — category-type exclusion already handles it.
- **Three reconciliation patterns:** P1 credit card settlement (bank lump = sum of card cycle), P2 1:1 bank/card mirror (debit/Bit), P3 inter-account transfer.
- **Confidence thresholds:** ≥0.95 auto-apply with toast, 0.70–0.95 queued to `/reconciliation` inbox with bulk-approve, <0.70 dropped entirely.
- **UI reference:** Monarch Money + Linear. emerald-600 accent over zinc/stone neutrals. `tabular-nums` on every financial amount. Assistant font. 150ms fades. Lucide 1.5px. Light theme only (dark mode = Phase 3).
- **Untouched modules:** scraper (except minimal futureDebits fix), crypto, auth, credentials, screenshots.
- **Scheduler:** daily 07:00, node-cron env-gated (`SCHEDULER_ENABLED`), attempt-and-skip OTP, `sync_runs` history table, no push layer.
- **AI categorization:** Spike first (≥70% accuracy threshold on 50 real Hebrew transactions). If fail, defer to Phase 3 and lean on retroactive rules.
- **Recurring detection:** fuzzy merchant + ±10% amount + 3-month minimum; monthly/quarterly/annual cadences; persisted `recurring_expenses`; no cancellation helpers in Phase 2.
- **Shared primitive:** `src/lib/transaction-matching/` is consumed by BOTH reconciliation and recurring detection. Extract first (issue #43), do not duplicate.
- **Test split:** TDD for pure computation (transaction-matching, reconciliation detectors, recurring detection, logging/redaction, retroactive rules); no unit tests for AI adapter, scheduler, 401 middleware, pagination totals.

## Delivery protocol — matches CLAUDE.md "Agent Workflow"

- Parallel worker tasks use `git worktree` (prevents branch collisions).
- Feature branches only. Never commit directly to `main`.
- Every PR description includes `Closes #N`.
- `npm run format` before every commit — CI rejects unformatted code.
- Use `/generate-commit-message` for commits (mandatory skill).
- Use `/sequential-thinking` MCP for complex async/logic design.
- Use `/tdd`, `/grill-me`, `/write-a-prd`, `/prd-to-issues`, `/improve-codebase-architecture`, `/simplify` skills as applicable.
- Opus orchestrates; Sonnet workers implement from self-contained prompts with no prior-conversation context.

## On new session or compaction

1. Read canonical docs (list above).
2. Verify dynamic state via `gh issue list --label phase-2`.
3. Confirm current state back to the user.
4. Ask which of (a) / (b) / (c) / (d) to run next.
