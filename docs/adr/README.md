# Architecture Decision Records

One file per binding architectural decision. Format: `NNNN-kebab-title.md`, numbered sequentially in decision order.

## Index

| ADR                                                               | Title                                                                    | Status                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| [0001](./0001-drizzle-over-prisma.md)                             | Drizzle ORM over Prisma                                                  | Accepted                                       |
| [0002](./0002-aes-256-gcm-with-hex-decoded-key.md)                | AES-256-GCM with hex-decoded key for credentials and sessions            | Accepted                                       |
| [0003](./0003-sequential-bank-scraping-with-failure-isolation.md) | Sequential bank scraping with per-bank failure isolation                 | Accepted                                       |
| [0004](./0004-feature-branches-only.md)                           | Feature branches only — never commit to main                             | Accepted                                       |
| [0005](./0005-defer-ai-categorization-to-phase-3.md)              | Defer AI categorization to Phase 3                                       | Accepted; local-only clause superseded by 0008 |
| [0006](./0006-db-push-until-phase-2-stabilises.md)                | Use `db:push` for schema changes until Phase 2 stabilises                | Superseded by 0009                             |
| [0007](./0007-deep-modules-with-store-pattern.md)                 | Deep modules with pure functional core + Store pattern                   | Accepted                                       |
| [0008](./0008-redaction-gated-external-categorization.md)         | Redaction-gated external AI categorization                               | Accepted                                       |
| [0009](./0009-generated-migrations-from-baseline.md)              | Generated migrations from a marked-applied baseline                      | Accepted                                       |
| [0010](./0010-categorization-precedence-and-merchant-memory.md)   | Categorization precedence, merchant memory, and the single overwrite law | Accepted                                       |

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
