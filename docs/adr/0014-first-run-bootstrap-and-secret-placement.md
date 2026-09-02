# 0014 — First-run bootstrap: which secrets are environment, which are app state

**Status:** accepted (2026-09-02, #110 grilling session)

A secret lives in the environment **only if the app cannot function well enough to ask for it**.
Everything else is app state, set through the product and stored in the database.

That splits today's three-secret `.env` in two:

| Secret            | Home                   | Why                                                                     |
| ----------------- | ---------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`    | environment, required  | Needed to reach the store at all                                        |
| `ENCRYPTION_KEY`  | environment, required  | Encrypts the credentials **inside** the database — can never live there |
| `APP_PASSWORD`    | **database**           | Nothing depends on it before the user sets it                           |
| AI provider + key | **database**, env-wins | A product choice; the DB already holds far more sensitive material      |

Whether first-run onboarding has happened is recorded by **one explicit flag** —
`onboarding_completed_at` on a single-row settings table — and never inferred from data.

## Context

A new self-hoster had to hand-craft all three secrets before the app would do anything, and the
`APP_PASSWORD` bcrypt hash carried **two** different `$`-escaping traps (`\$` in `.env`, `$$` under
Docker Compose) documented as gotchas precisely because they bite. Nothing in the product ever set
that password.

A blank or invalid value produced no guidance: the env schema is validated lazily inside
`verifyPassword`, so a fresh install reached `/login`, submitted a password, and got an
**unhandled 500** with no explanation and no path forward. Categories were not seeded either — the
seed is a manual script the README never mentions.

Provider configuration was env-only by an implementation decision recorded on #147 (not by
ADR-0008, which is silent on configuration). Under Docker that means editing `.env` and restarting
the container to try a provider — which in practice means never trying it.

## Decision

### 1. Environment secrets fail fast and legibly

`DATABASE_URL` and `ENCRYPTION_KEY` stay environment-only and are validated **at boot**. When
validation fails, every route renders one static diagnostic page naming the missing variable and
the exact command that generates it — never a 500, never a stack trace. That page must render
without a database and without a session, because neither is available in the failure it reports.

### 2. The app password moves into the app

Onboarding's first step sets the app password; it is bcrypt-hashed into the settings row. Both
escaping traps disappear for every new install. The `APP_PASSWORD` environment variable stays
supported as an override that wins when set, so existing installations keep working — documented as
legacy, not the recommended path.

### 3. Provider configuration is database-first, environment-wins

Provider choice and API key move into the database, the key encrypted with the same AES-256-GCM
module as bank credentials (ADR-0002). An environment value, when set, still wins — so existing
installs and container-level configuration are unaffected.

**The zero-egress default must survive this structurally:** nothing configured in either place
resolves to `off`, and onboarding's provider step defaults to `off`. Choosing an external provider
stays an act, never an accident. This changes where configuration is read from; it changes nothing
about ADR-0008's redaction boundary, which is enforced in the type system and is unaffected.

### 4. First-run is an explicit flag, gated where the runtime allows

`onboarding_completed_at` on a single-row settings table (id=1, the `scheduler_config` /
`goals_settings` idiom) is the sole first-run signal. Inferring it from credential count was
rejected: deleting your only bank must not relaunch onboarding.

The middleware runs on the **Edge runtime** — `process.env` and WebCrypto only, no database — so it
cannot consult the flag. Therefore `/setup` is **unconditionally exempt** from the auth gate, as
`/login` already is, and the page itself (a server component, with database access) redirects to
the dashboard once the flag is set. Switching the middleware to the Node runtime was rejected: the
known Next 16 middleware fragility risks leaving every route unprotected, which is a far worse
failure than an extra exempt path.

The real guard is therefore **not** the page. Setup submission is a single conditional write —
upsert the settings row `WHERE onboarding_completed_at IS NULL`, treating zero rows affected as
already-complete and rejecting. A double submit, two open tabs, and a replayed POST after
completion are all harmless **by construction** rather than by check-then-act.

Consequence accepted explicitly: between a valid environment and a set password, `/setup` is
reachable by anyone who can reach the port. This is unavoidable for any first-run flow; the
mitigation is that the window closes the moment the password is set, and it cannot be re-opened
from the product.

### 5. Onboarding is a courtesy path, never a gate

Only the password step is mandatory — it is the auth bootstrap. Every later step is skippable and
lands the user in the app with the corresponding empty state. There is no re-run entry point:
each step's real home already exists in Settings, and a second path to the same setting is drift.

## Consequences

- **Locks in:** a fresh install that explains itself instead of 500-ing; an app password nobody
  hashes by hand; provider configuration reachable without a container restart; one explicit,
  observable first-run signal.
- **Precludes:** storing `ENCRYPTION_KEY` in the database (it encrypts that database); inferring
  first-run from data; a check-then-act setup guard; an onboarding step that blocks use of the app.
- **Requires:** a settings table and migration (ADR-0009 — generated, reviewed, owner applied
  backup-first); boot-time env validation that does not itself require the database; the category
  seed refactored from an exiting CLI script into a callable, exit-free function so onboarding can
  invoke it.
- **Supersedes:** the env-only provider configuration decision recorded on #147. ADR-0008 is
  untouched — it never specified configuration placement.
