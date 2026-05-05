# Architecture Decision Records

One file per binding architectural decision. Format: `NNNN-kebab-title.md`, numbered sequentially in decision order.

## Format

Each ADR has:

- **Status:** Accepted / Superseded by NNNN / Deprecated
- **Date:** ISO date the decision crystallised
- **Context:** what forced the decision — constraints, alternatives considered, evidence
- **Decision:** what we chose, in one or two sentences
- **Consequences:** what this locks in, what it precludes, what future work it implies

Keep ADRs short. If the rationale needs an essay, link to the supporting doc (PRD, spike report, RFC issue) rather than inlining.

## How skills use these

`grill-with-docs`, `improve-codebase-architecture`, `diagnose`, and `tdd` read ADRs that touch the area they're working in. If a new plan contradicts an existing ADR, the skill surfaces it explicitly:

> _Contradicts ADR-0003 (sequential bank scraping with per-bank failure isolation) — but worth reopening because…_

This prevents accidental re-litigation of settled questions and forces explicit override.

## Updating an ADR

Decisions evolve. Two patterns:

- **Status flip:** mark the old ADR `Superseded by NNNN`, then write a new ADR that explains what changed and why.
- **In-place clarification:** only when the original decision stands but the wording was ambiguous. Add a `## Clarification YYYY-MM-DD` section; never rewrite history.
