# ADR-0004: Feature branches only — never commit to main

**Status:** Accepted
**Date:** 2026-04-01 (Phase 2 kickoff, retroactively recorded 2026-05-05)

## Context

ShayFinance is built primarily by AI agents (Opus orchestrator + Sonnet workers) with the human (Shay) acting as reviewer and architectural authority. Several risks emerge from this workflow:

- A worker hallucinates and pushes a regression directly to `main`, breaking the production app the user actually runs against real bank data.
- Parallel worker tasks cannot share a branch without merge conflicts; agents have no human-style negotiation for resolving them.
- Without forced review, the orchestrator's reasoning trail (PR description, the `Closes #N` link to the issue) is lost.
- CI is the last line of defense for `prettier --check`, type errors, and Vitest regressions — bypassing it on `main` defeats the safety net.

## Decision

- **Feature branches only.** No commits to `main`. Any change — code, docs, skills, config — goes through a branch.
- **PR descriptions must include `Closes #N`** where N is the GitHub issue number, so issues auto-close on merge and the issue ↔ PR link is permanent.
- **Parallel worker tasks use `git worktree`** to avoid branch collisions when multiple agents work simultaneously.
- **`npm run format` runs before every commit.** CI runs `prettier --check` and rejects unformatted code.
- **CI must pass** (`prettier --check`, `npm test`, `npm run build`) before merge. The orchestrator reviews the PR; the human merges.

## Consequences

- **Locks in:** every change is reviewable, traceable, and reversible via `git revert <merge-commit>`.
- **Locks in:** the issue tracker is the canonical record of _why_ a change happened. The PR is the _how_. Both are linked.
- **Precludes:** quick "just push the fix" workflows — every fix gets a branch + PR + review. Acceptable cost for the safety it buys.
- **Implications for skills:** `to-issues`, `to-prd`, and `triage` all assume issues exist and are linked from PRs. The `Closes #N` convention is a hard requirement for the auto-close behaviour these workflows depend on.
- **Worktree hygiene:** copy `.env` into new worktrees; never run `docker compose up` from a worktree (creates a duplicate empty DB). See memory note `feedback_worktree_setup.md`.
