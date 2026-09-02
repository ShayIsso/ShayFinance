# 0013 — The bank registry is the single source of institution facts

**Status:** accepted (2026-09-02, #110 grilling session)

Every fact about a supported financial institution — its ids, its display names, whether it is a
bank or a card issuer, whether it issues an OTP, which credential fields it needs, and how far we
trust it — lives in **one committed, frozen, DB-free TypeScript module**: the `bank registry`.
No other file may name an institution.

The binding law has two halves:

1. **No bank literal outside the registry.** A bank id or bank name appearing anywhere else — a
   union type, a label map, a Zod enum, a `Set`, a JSX dropdown — is a bug.
2. **No branch on a bank id.** Code that needs different behaviour for cards and bank accounts
   branches on a registry _property_ (`kind`, `issuesOtp`), never on `bankType === "discount"`.

The second half is the load-bearing one. Label drift is cosmetic; behaviour drift is wrong money.

## Context

At the time of this decision the institution triple `discount | max | visaCal` was re-declared in
**17 non-test places**: 14 independent TypeScript union copies, **five** separate `BANK_LABELS`
maps, and a sixth hardcoded English list in the credentials dropdown JSX. They had already
diverged — `visaCal` rendered as "Cal" in two components and "ויזה כאל" in three, and the
credentials `<Select>` showed Hebrew in its trigger and English in its menu.

Worse, four sites hardcoded institution _semantics_: `CARD_BANK_TYPES` sets in both
`reconciliation/detect-p1.ts` and `analytics` (driving settlement matching and the next-debit
estimate), a `bankType === "discount"` fork choosing transfer kinds in AI categorization, and the
OTP fork. An institution added under that regime would land in none of those sets and be silently
invisible to reconciliation and to card-balance estimates.

The bundled scraper library supports **18** institutions; we ship 3. It also already exports
`SCRAPERS[company].loginFields` — a per-company field list that is most of a registry, for free.

## Decision

### 1. Shape: a frozen module, not a table and not a plugin system

The registry is a deep module under `src/lib/` exporting a frozen array of entries keyed by our own
stable `bankType` id. It is **pure and DB-free**, so `analytics` and `reconciliation` can import it
without pulling in the DB barrel.

It is deliberately **not** a database table and **not** a drop-in manifest format. A registry entry
cannot make an institution work — only the bundled scraper library can. Runtime-addable entries
would therefore buy exactly one capability: creating broken rows.

Each entry carries: the stable id; Hebrew and English display names; `kind: "bank" | "card"`;
`issuesOtp`; the scraper company id; the credential field list; and the trust tier.

### 2. Credential fields: curated, cross-checked, closed

Field descriptors are **curated by us and pinned against the library** with an
assertion that our field-key set equals the library's user-entered `loginFields` for that company.
Neither pure derivation nor free-hand declaration is acceptable:

- **Pure derivation fails.** `oneZero`'s `loginFields` include `otpCodeRetriever` (a function) and
  `otpLongTermToken` — not user-entered fields. Derivation also yields no Hebrew labels, no
  password-vs-text distinction, and no way to mark a field secret.
- **Free-hand declaration drifts** the moment the library changes a field name.

Each field names a **kind** from a **closed union** — `text`, `password`, `national-id`,
`account-number`, `card-6-digits` — and each kind maps to exactly one input rendering and one Zod
rule. A generic form renders any institution from its field list; the per-bank form forks and the
five duplicated Zod schema sites collapse into it.

The `password` kind is marked `secret`, and `GET /api/credentials/:id` strips by kind. This is
deliberately the _minimal_ marker: national IDs and account numbers are already covered
structurally by ADR-0008's 5+-digit redaction rule, and two overlapping mechanisms guarding one
invariant is how invariants rot.

**Precluded in the entry:** regexes, conditional or dependent fields, per-field i18n objects, any
validation DSL. A sixth field kind is a code change, and it should be.

### 3. Two tiers, and the instance may overrule the registry

- **Verified** — we have tested this institution against real credentials.
- **Experimental** — the library implements it; we have not tested it.

The tier is **presentational only, never a second code path**: same scraper call, same import, an
honest label, and a failure message that names the institution as unverified rather than implying
an app defect.

The registry's tier is a global default that changes by pull request. Alongside it, each
installation may overrule the label from its own evidence: **once this install has recorded a
successful sync against an institution, its experimental caveat stops showing here.** The
distinction to keep: _the registry states what we have verified; the instance states what it has
observed._

A user-editable tier flag was rejected — it asks the user to assert something the app can already
observe, and it re-opens the registry as mutable state.

`oneZero` is excluded from both tiers. Its login requires a long-term OTP token, and ADR-0003 puts
unattended-MFA tokens out of scope, so listing it would promise what we structurally cannot
deliver.

### 4. `bank_type` stops being a Postgres enum

`bank_credentials.bank_type` and `sync_runs.bank` convert from the `bank_type` enum to `text`, and
the now-unused type is dropped. The registry plus the Zod boundary is the validator.

An enum whose values must match a TypeScript array **is** a second source of truth — precisely the
drift this ADR removes — and it makes enabling one experimental institution cost a schema
migration, which would defeat the tier model. No replacement `CHECK` constraint: a constraint
listing bank ids recreates the same problem in SQL.

Consequence accepted deliberately: a row for an institution later removed from the registry stays
readable and renders as an unknown-bank label rather than violating a constraint. For an open
registry that is the behaviour we want.

## Consequences

- **Locks in:** one place to add an institution; behaviour that follows institution _kind_ rather
  than institution _identity_; a generic credential form; CSV, dashboard, sync and reconciliation
  labels that cannot disagree.
- **Precludes:** user-defined institutions; runtime registry mutation; a DB-level bank constraint;
  per-bank branches anywhere in application code.
- **Requires:** a migration converting two live columns (ADR-0009 — generated, reviewed, owner
  applied backup-first). Drizzle-kit sometimes emits drop-and-recreate for enum changes, which
  would destroy data; that must be caught at SQL review, not at apply time.
- **Inherits:** ADR-0003's protection of the scraper. Adding an institution is a registry entry
  plus a `BANK_COMPANY_MAP` line — the sanctioned additive touch — never a scraper refactor. New
  institutions must fit the existing SSE event protocol.
- **Note:** ADR-0003 records the scrape order as "Discount → Max → Cal". The code iterates
  credential rows by `createdAt`, so that ordering has been only incidentally true for some time.
  The registry does not change it; the openness epic should correct the record.
