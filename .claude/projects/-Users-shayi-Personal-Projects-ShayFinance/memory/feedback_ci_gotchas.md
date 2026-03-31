---
name: CI and dependency gotchas
description: npm ci fails on cross-platform lock files; never use .npmrc os/cpu flags; Vitest is the test runner
type: feedback
---

Three hard-won lessons from the crypto module PR:

1. **CI must use `npm install`, not `npm ci`.** The lock file is generated on macOS ARM64. `npm ci` rejects it on the Linux CI runner because platform-specific optional packages are absent. The CI workflow already uses `npm install` — don't change it back.

2. **Never add `os=any` or `cpu=any` to `.npmrc`.** This corrupts `node_modules` on macOS (native bindings like `@rolldown/binding-darwin-arm64` go missing). If the lock file needs regenerating, do `rm -rf node_modules package-lock.json && npm install` — no `.npmrc` flags.

3. **Test runner is Vitest.** `npm test` runs all tests, `npm run test:watch` for watch mode. `vitest.config.ts` is already configured with `@/*` path alias.

**Why:** The crypto module CI kept failing until these were discovered. Cross-platform lock file mismatches are a recurring pain point.

**How to apply:** Include in all agent prompts that touch dependencies or CI. Never suggest `npm ci` in CI config.
