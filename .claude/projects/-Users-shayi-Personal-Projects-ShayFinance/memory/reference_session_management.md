---
name: Session Management — Context Thresholds & Compact Prompt
description: When to compact vs end the session, and the canonical paste-in compact prompt for resuming as Lead Architect. Load on every long-running session past ~40% context.
type: reference
---

## Context-window threshold framework

| Context % | What to do | Why |
|---|---|---|
| **0–50%** | Keep going | Plenty of headroom; compacting wastes a fresh cache |
| **50–70%** | Decide based on task: near a logical stopping point? End session. Mid-flight with substantial work left? Compact at 65–70%. | Cache miss cost amortizes only if remaining work justifies it |
| **70–85%** | Compact OR stop | Don't push to 90%+; auto-compaction is worse than user-triggered |
| **85%+** | Compact now or stop | Quality degrades; risk of mid-thought truncation |

## `/clear` vs `/compact` — when to use which

- **`/clear`** — hard reset. Use when starting an *unrelated* task in the same project (e.g., shifting from Phase 2 orchestration to a Phase 1 bug investigation). Memory persists; conversation history goes.
- **`/compact`** — keeps task continuity by auto-summarizing. Use when continuing the *same* task but running low. Compaction has fidelity loss (auto-summary is approximate).

## Anthropic's preferred pattern (verified on this project)

**End the session at a logical break + start a fresh session next time** is strictly better than compacting mid-flight, because:
- No summary loss
- Max cache freshness on next start
- Forces clean state hand-off via memory + canonical docs (which is the design)

Use compact only when you genuinely need same-conversation continuity within one window (e.g., mid-PR-review at 80%).

## Session-end decision tree

```
Are you near a logical stopping point (PR merged, prompt delivered, review complete)?
├── YES → END SESSION. Resume in fresh session next time.
└── NO →
    Are you above 70% context?
    ├── YES → /compact NOW with the prompt below.
    └── NO →
        Is significant heavy-lift work coming (e.g., writing a long worker prompt)?
        ├── YES → Do it now while context is cheap, THEN end session.
        └── NO → Keep going.
```

## Canonical compact prompt — paste into `/compact` or fresh session

This is the working template. Customize the last paragraph based on what's currently open.

```
Resuming as Lead Architect for ShayFinance Phase 2.

Load project memory — especially "Phase 2 Invariants & Orchestrator Mode",
"Worktree Setup Hygiene", and "Session Management". Re-read CLAUDE.md,
README.md, docs/PRD-phase2.md, and ARCHITECTURE.md.

Check dynamic state:
  gh pr list --repo ShayIsso/ShayFinance --state open
  gh issue list --repo ShayIsso/ShayFinance --label phase-2 --state open

[Customize this paragraph: name the open PR(s) needing review, the next ticket
to prep, or any blocked-on-user item. Example: "PR #68 (R2 reconciliation
engine) is open and waiting for orchestrator review." Keep it 1-2 sentences.]

Confirm current state, then proceed.
```

Target length: ~100 words. Anything longer means you're duplicating what memory + docs already carry.

## What this prompt does

1. Re-seats the role (Lead Architect, not implementer)
2. Triggers memory auto-load by naming the most relevant entries
3. Names the canonical doc re-read order (CLAUDE → README → PRD → ARCHITECTURE)
4. Forces a live state check via `gh` (issue numbers and PR states are dynamic — never cache them)
5. Customized last paragraph names the immediate task so the resumed session has a starting move

## Anti-patterns — do NOT do

- **Don't paste a long compact prompt with PRD content inline.** That duplicates docs and bloats every session start. Keep the prompt as pointers; let memory + docs carry content.
- **Don't compact at 50%.** Cache-miss cost not justified.
- **Don't end the session past 80% without compacting first** if substantial work remains. Forces a hard boundary mid-task.
- **Don't skip the `gh pr list` check.** Issue numbers shift, PRs get merged, branches close. Memory captures decisions; only the live API knows current state.

## Why this is durable

Cache-warmth math doesn't change. Anthropic's session-management guidance applies to every future ShayFinance session AND any other project. The compact prompt template is the only project-specific element — and it's structured as pointers to memory entries that themselves auto-evolve as the project does.
