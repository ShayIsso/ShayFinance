---
name: Always run npm run format before committing
description: Workers keep failing CI because they don't run Prettier before committing
type: feedback
---

Every worker PR has been failing the CI formatting check on first push. They then have to fix and push again, wasting a round-trip.

**Why:** CI runs `prettier --check .` and rejects unformatted code. Workers forget to format.

**How to apply:** Every agent prompt must include "Run `npm run format` before committing" in the gotchas section. This is now also documented in CLAUDE.md under Git Workflow.
