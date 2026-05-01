---
name: Worktree Setup Hygiene
description: Avoid empty-Compose pitfalls and DB duplication when creating git worktrees for parallel workers
type: feedback
---

When creating a new git worktree for a worker, the worktree inherits **tracked** files only. Anything `.gitignore`d (`.env`, `node_modules`, `pgdata/`) is missing from the new directory.

**Why:** verified during R1 (#46/PR#66). User ran `docker compose up db -d` in the worktree and Compose created a brand-new EMPTY Postgres named after the worktree directory (project `reconciliation-schema`), separate from the real `shayfinance` Postgres in the main repo. Same image, separate volume, zero data. `db:push` could have hit the empty DB instead of the real one.

**Why:** Compose names projects after the working directory. Different dir → different project → different volume → different data.

## How to apply — every worktree creation

When orchestrator creates a worktree, the setup commands must include:

```bash
git worktree add "../ShayFinance-worktrees/<name>" -b feature/<name> origin/main

# MANDATORY: copy .env from main repo (gitignored, so worktree doesn't have it)
cp "/Users/shayi/Personal Projects/ShayFinance/.env" "../ShayFinance-worktrees/<name>/.env"

# Worker can then `cd` in and run `claude code` — DB is already up from the main repo's compose project
```

## Worker prompt rules (going forward)

- **Never instruct workers to `docker compose up db -d` from a worktree.** The DB is already running in the main repo's `shayfinance` Compose project. The worker's `.env` (copied above) points at `localhost:5434` which connects to it.
- **Always tell workers the DB is shared with main.** Add a Gotcha line: "Postgres is already running from the main repo's Compose project. Do NOT run `docker compose up` from this worktree — it would create a duplicate empty DB."
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
