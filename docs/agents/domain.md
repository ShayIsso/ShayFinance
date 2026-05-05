# Domain Docs

How the engineering skills should consume ShayFinance's domain documentation.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — domain glossary, financial invariants, module map.
- **`docs/adr/`** — Architecture Decision Records, one file per binding decision.
- **`ARCHITECTURE.md`** at the repo root — Phase 2 blueprint with module interfaces, test cases, and dependency graph. Tactical, not authoritative; ADRs win on conflict.

If `CONTEXT.md` or specific ADRs don't exist yet, proceed silently. `/grill-with-docs` creates them lazily as terms and decisions get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── ARCHITECTURE.md           ← Phase 2 blueprint (advisory)
├── BACKLOG.md                ← deferred features
├── docs/
│   ├── adr/                  ← binding architectural decisions
│   ├── PRD-v1.md
│   ├── PRD-phase2.md
│   ├── ai-categorization-spike.md
│   └── phase2-kickoff.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (issue title, refactor proposal, test name, hypothesis), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids — e.g. say "transfer" not "internal movement", "ignore" not "excluded", "deep module" not "well-encapsulated module".

If the concept isn't in the glossary, that's a signal: either you're inventing language ShayFinance doesn't use (reconsider), or there's a real gap to flag for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (sequential bank scraping with per-bank failure isolation) — but worth reopening because…_
