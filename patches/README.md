# Patches

Local fixes applied via [`patch-package`](https://github.com/ds300/patch-package).
A `postinstall` hook in `package.json` reapplies them automatically on every
`npm install` (local, CI, Docker).

## Current patches

### `israeli-bank-scrapers-core+6.7.4.patch`

**What:** Adds `https://start.telebank.co.il/apollo/retail3/` and
`https://start.telebank.co.il/apollo/retail3/#/MY_ACCOUNT_HOMEPAGE` to the
Discount scraper's `Success` URL list in `getPossibleLoginResults`.

**Why:** Discount migrated their post-login route from `/apollo/retail{,2}/`
to `/apollo/retail3/`. Without the patch the library classifies the (actually
successful) login as `UnknownError` → returns `GENERAL_ERROR` and the Discount
sync fails. Diagnosed in #75; upstream tracking is
[eshaham/israeli-bank-scrapers#1110](https://github.com/eshaham/israeli-bank-scrapers/issues/1110).

**Drop it when:** upstream merges
[#1111](https://github.com/eshaham/israeli-bank-scrapers/pull/1111) or
[#1113](https://github.com/eshaham/israeli-bank-scrapers/pull/1113) and
publishes a new `israeli-bank-scrapers-core` release. Bump the dep, delete
this patch file, and remove `patch-package` from devDependencies and the
`postinstall` hook if no other patches remain.

## Adding a new patch

```bash
# 1. Edit node_modules/<pkg>/...
# 2. Generate the patch
npx patch-package <pkg>
# 3. Commit the file in patches/ and document it in this README
```
