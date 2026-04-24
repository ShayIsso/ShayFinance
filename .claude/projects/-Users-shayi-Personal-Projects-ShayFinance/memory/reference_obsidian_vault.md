---
name: Obsidian Vault Mirror
description: Obsidian vault location and ShayFinance mirror conventions - docs sync repo to vault as Phase 2 progresses
type: reference
---

**Vault location:** `/Users/shayi/Documents/Gini_learning`
**ShayFinance folder in vault:** `Self_projects/ShayFinance/`

**Mirror convention:**

- **Source of truth = repo.** Files in `docs/` (PRDs, kickoffs, architecture) are authoritative.
- **Vault = mirror.** When a doc is created or updated in the repo, copy it into the vault's ShayFinance folder.
- **Filename pattern in vault:** `PRD ShayFinance — {phase/name}.md` (em-dash, matches existing Phase 1 PRD naming).
- **Enrich the vault copy** with Obsidian-flavored markdown the repo version doesn't need: frontmatter (title, aliases, tags, status, parent wikilink, related wikilinks, created date), callouts (`> [!info]`, `> [!warning]`, `> [!danger]`, `> [!tip]`), wikilinks between vault notes.
- **Access method:** `/Users/shayi/Documents/Gini_learning/` is read-blocked from the sandbox but writes via `cp` work. Stage enriched content in `/tmp/`, then `cp` into place. Use `obsidian` CLI for read/verify (`obsidian read`, `obsidian properties`, `obsidian files folder=...`, `obsidian reload`).

**CLAUDE.md reference:** "Use the obsidian skills to sync relevant project files, decisions, and module graphs to Obsidian when tracking cross-module changes or phase milestones."

**How to apply:** Any time the orchestrator writes or meaningfully updates a PRD, kickoff doc, architecture doc, or phase milestone under `docs/`, mirror it to the vault. Include a `## Changelog` section at the bottom of the vault copy and append a dated entry each time it syncs.
