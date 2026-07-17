# ADR-0011: Hierarchical categories — one level, typed links, leaf-only assignment

**Status:** Accepted (Phase 3).
**Date:** 2026-07-17 (decided in grilling session, GitHub issue [#106](https://github.com/ShayIsso/ShayFinance/issues/106))
**Context:** issue #133 (taxonomy v2 — 17 flat categories designed as future leaves), issue #105 (budgets assume hierarchy-ready subtree semantics), [ADR-0010](./0010-categorization-precedence-and-merchant-memory.md) (assignment surfaces and provenance).

## Context

Taxonomy v2 (#133) deliberately shipped 17 flat categories as "future leaves" and deferred hierarchy to #106. A 15-slice expense breakdown is noise at dashboard altitude; budgets (#105) already locked subtree semantics; reports (#107) need a grouping level. The question was the shape of the hierarchy, not whether one exists.

## Decision

### 1. Exactly one level, same table

Categories gain a nullable self-referencing `parent_id`. Depth is capped at one — a parent must itself be a root — enforced at write time, not left as convention. No separate groups table: groups are full category rows (name, icon, color, type), so every existing FK and consumer seam survives unchanged.

### 2. Typed symmetrically: the matching-types link

There is no "parent type" concept. Every category has a `type` (the load-bearing five-way enum); a parent-child link requires both ends to have the same type. Group totals are therefore always well-typed, and #105's subtree budgets stay coherent expense caps. A category's type cannot change while it participates in a link.

### 3. Leaf-only assignment, derived from "has children"

A category with children is not assignable — no flag, purely derived. This binds every assignment surface: the transaction picker, category rules, merchant memory, AI answers, and retroactive application. Rejected alternative: parents assignable as a fallback ("nothing more specific fits"). That splits every group total into subtree-sum vs directly-assigned residue forever; the honest home for a catch-all is an explicit general leaf inside the group, created deliberately (the #133 מזומן ומשיכות precedent), never auto-created.

### 4. Hierarchy is an aggregation lens — never a financial semantic

Net Savings, Total Expenses, and every type-driven total are computed exactly as before, from leaves. A group's total is _defined_ as the sum of its leaves' totals, so double-counting is structurally impossible. Breakdowns (dashboard, trends, reports) present group-first with drill-down; root leaves appear at top level beside groups.

### 5. Populated leaves cannot gain children: block + guided path

Adding a child to a category with any assignments (transactions, rules, memory entries, pending suggestions, a budget) is rejected. The supported reshape is the reverse direction: create a new group and move existing leaves under it — gaining a parent is always safe because nothing references the link. Rejected alternative: auto-split (silently minting a same-named child and rewriting references across five tables) — exactly the class of silent data movement the overwrite law exists to prevent. Name uniqueness stays global, so a group and a leaf cannot share a name; the forced rename is honest friction.

### 6. The AI stays blind to hierarchy

The categorization prompt keeps its benchmark-locked shape; group names and structure are not rendered into it. The category feed for prompt assembly and review-flow pickers filters to assignable (childless) categories, so creating a group can never silently widen the AI's answer space. Revisit only if leaves get finer-grained (e.g. a בריאות group splitting into תרופות / רופא / ביטוח בריאות), and only through a full benchmark re-run per ADR-0005's gate — prompt shape is validated evidence, not a config knob.

### 7. Seeded default grouping

Discoverability beats purity: hierarchy that exists only as an empty Settings affordance is a feature nobody meets. The migration seeds three expense groups and backfills `parent_id` by name — for the live DB and fresh installs alike:

- **אוכל** ← מזון וסופר, מסעדות וקפה
- **בית וחשבונות** ← דיור ושכירות, חשבונות ושירותים, מנויים
- **פנאי וקניות** ← בילויים ופנאי, קניות וביגוד, מתנות ואירועים
- Root leaves: תחבורה, בריאות וטיפוח, מזומן ומשיכות

A group must earn ≥2 leaves; groups-of-one are noise. Income, investment, transfer, and ignore stay flat. The leaf set of 17 (#133, benchmark-reconfirmed in #139) is untouched.

### 8. Groups delete by detaching

Deleting a group detaches its children back to root leaves; no financial data is touched. Blocking until empty was rejected — manual detach-then-delete produces the identical end state with added friction. Caveat carried to the budgets slice: a budget may sit on a group, so the budgets schema must choose its category-FK behavior deliberately — `ON DELETE CASCADE` guarded by the delete-confirm dialog is the pre-accepted default; anything else needs its own handling story.

### 9. UI shape

One grouped single Select (non-selectable group labels, leaves beneath, root leaves at top level) — a two-step drill-down picker taxes the highest-frequency action to save nothing at this taxonomy size. Exact visual treatment is decided at implementation via a `/prototype` sandbox.

## Consequences

- Migration: one nullable self-FK column + write-time invariants + seeded groups/backfill. Zero touches to `transactions`, `category_rules`, or memory tables.
- `ai-categorization` and every picker consume "assignable categories" instead of "all categories" — the only cross-module code change this ADR forces.
- Analytics gains a group roll-up layer; its type-driven totals are untouched.
- The corrections log's name snapshots remain unambiguous because name uniqueness stays global.
