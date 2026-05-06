---
name: Worktree Cleanup at End of Work
description: After a worker PR merges, immediately propose the full cleanup sequence (DB seed rows, throwaway scripts, dev server, worktree, local branch, prune refs, orphaned ~/.claude/projects/ transcript dirs) without waiting to be asked.
type: feedback
---

When a feature/chore worker PR merges, **proactively run the cleanup sequence as part of the merge confirmation turn** — don't wait for the user to ask.

**Why:** verified 2026-05-05 after R2 merge — user explicitly requested "from now on after we normally finish you will clean up and delete the worktree." Leaving worktrees + orphaned `~/.claude/projects/-Users-shayi-Personal-Projects-ShayFinance-worktrees-<name>/` transcript dirs around accumulates clutter and wastes disk space. Each worker session creates one of those transcript dirs; they become orphaned the moment the worktree is removed.

**How to apply:** the canonical post-merge cleanup checklist:

1. Delete any seeded test rows in the DB by full-shape match (description + amount + date), never description alone — real transactions can collide.
2. Delete any throwaway scripts created in the worktree (e.g. `scripts/verify-r2.ts`).
3. Stop dev server if it's still running (`Ctrl+C`).
4. From main repo: `git checkout main && git pull && gh pr list --state merged --limit 5` to confirm merge.
5. `git worktree remove "../ShayFinance-worktrees/<name>"` (no `--force` unless we know why).
6. `git branch -d <branch>` first; fall back to `-D` only if squash-merge made it not-an-ancestor and we've already verified merged via `gh pr list`.
7. `git fetch --prune` to drop stale remote-tracking refs.
8. `rm -rf /Users/shayi/.claude/projects/-Users-shayi-Personal-Projects-ShayFinance-worktrees-<name>` to drop the orphaned Claude Code transcript dir.
9. Sanity-check: `git status` clean, `git worktree list` shows only main, `git branch` shows no leftover feature/chore branches.

Step 8 is easy to miss because the dir is outside the repo — but it's part of the cleanup the user expects.
