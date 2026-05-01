---
name: Worktree Setup Hygiene
description: Avoid empty-Compose pitfalls and DB duplication when creating git worktrees for parallel workers
type: feedback
---

When creating a new git worktree for a worker, the worktree inherits **tracked** files only. Anything `.gitignore`d (`.env`, `node_modules`, `pgdata/`) is missing from the new directory.

## TL;DR — every worktree starts with these two commands

After `git worktree add ...`:

```bash
cp "/Users/shayi/Personal Projects/ShayFinance/.env" .env
npm install --prefer-offline --no-audit
```

That's it. Both are idempotent, fast (~9 seconds for the install with cache hits), and don't modify any tracked files. Bake them into every worker prompt as the first step under "Environment setup".

---

**Why:** verified during R1 (#46/PR#66). User ran `docker compose up db -d` in the worktree and Compose created a brand-new EMPTY Postgres named after the worktree directory (project `reconciliation-schema`), separate from the real `shayfinance` Postgres in the main repo. Same image, separate volume, zero data. `db:push` could have hit the empty DB instead of the real one.

**Why:** Compose names projects after the working directory. Different dir → different project → different volume → different data.

## How to apply — every worktree creation

When orchestrator creates a worktree, the setup commands must include:

```bash
git worktree add "../ShayFinance-worktrees/<name>" -b feature/<name> origin/main

# MANDATORY 1: copy .env from main repo (gitignored, so worktree doesn't have it)
cp "/Users/shayi/Personal Projects/ShayFinance/.env" "../ShayFinance-worktrees/<name>/.env"

# MANDATORY 2: install node_modules (also gitignored). Worker prompt must remind worker
# to run this themselves on first start, OR orchestrator can pre-run it:
cd "../ShayFinance-worktrees/<name>" && npm install --prefer-offline --no-audit && cd -

# Worker can then `cd` in and run `claude code` — DB is already up from the main repo's compose project
```

## Worker prompt rules (going forward)

- **Always include `npm install --prefer-offline --no-audit` as the first action** in the worker's "Environment setup" section. Without it, `npm test` and `npm run build` fail because worktrees don't inherit `node_modules` (only a `.vite` cache dir is present, which is insufficient).
- **Do NOT suggest symlinking `node_modules`.** Verified failure mode (R2 worker, 2026-05-01): symlinking the worktree's `node_modules` to the main repo's `node_modules` makes `npm test` work but **breaks `npm run build`** — Turbopack explicitly rejects symlinks pointing outside the project root as a security constraint. Cost a worker ~30 minutes of debugging. Always do a real `npm install` instead.
- **Never instruct workers to `docker compose up db -d` from a worktree.** The DB is already running in the main repo's `shayfinance` Compose project. The worker's `.env` (copied above) points at `localhost:5434` which connects to it.
- **Always tell workers the DB is shared with main.** Add a Gotcha line: "Postgres is already running from the main repo's Compose project. Do NOT run `docker compose up` from this worktree — it would create a duplicate empty DB."
- **Orchestrator's own chore worktrees:** previous habit of `cp -R "/Users/shayi/Personal Projects/ShayFinance/node_modules" ./node_modules` works for prettier-only chores but is slow. Prefer `npm install --prefer-offline --no-audit` for consistency with worker pattern.
- **Schema verification** for workers should use `npm run db:push` (confirm-and-apply diff) and `npm run db:seed` against the shared DB.
- **Migration bootstrap** is on the roadmap (BACKLOG.md tech debt). Until then, all schema changes use `db:push`, not `drizzle-kit generate`.

## Recovery if duplication happens

If a worker accidentally created a duplicate Compose project:

```bash
cd "<duplicated worktree dir>"
docker compose down -v   # stops + removes the empty DB + its volume; no data lost since it was empty
```

Verify Docker Desktop now shows only `shayfinance` (plus unrelated projects).

## Why this is durable

This applies to every Phase 2 worker that touches the DB (R1, R2, R3, R4, RD1, S1, RR1 already done). Bake into worktree setup permanently.
