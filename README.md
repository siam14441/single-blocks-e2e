# single-blocks-e2e

Playwright end-to-end regression suite for WPDeveloper's standalone single-block
plugins. First tenant: **Table Of Contents Block**.

The suite runs in GitHub Actions during release prep and blocks a release when
a block is broken.

---

## Why this exists

In **v1.3.4** the Table of Contents block silently stopped registering on WP 6.5+.
The editor bundle threw before registration, `window.EBTOCControls` was never
defined, and the block simply was not in the inserter. Nothing looked broken --
there was just nothing there. It shipped, and stayed broken across several
releases, generating "Does not work since WordPress 6.5" support reports.

Five lines of automated smoke test would have caught it on day one. That is the
first thing this suite checks.

---

## Quick start (local)

```bash
npm install
cp .env.example .env          # fill in WP_BASE_URL, WP_USERNAME, WP_PASSWORD
npx playwright install chromium

npm run verify-env            # preflight: is this environment even testable?
npm test                      # run the suite
npm run report                # open the HTML report
```

With one block configured, that's the whole thing -- no `--block` flag needed
anywhere. See "Adding a second block" below for what changes once there are two.

The QA report lands in `artifacts/qa-report-table-of-contents-e2e-v<version>-<date>.md`.

### Local environment

Docker is not required locally. Point `.env` at any WordPress install that has
the plugin under test active and no conflicting plugin active (see "The one
constraint that matters" below):

```
WP_BASE_URL=http://singleblocksautomation.local
WP_USERNAME=...
WP_PASSWORD=...
```

To install the plugin on a LocalWP site:

```bash
unzip table-of-contents-block.1.5.0.zip -d "/path/to/site/wp-content/plugins"
npm run activate-plugin
```

CI uses `wp-env` (Docker) instead. Both paths run the same tests -- only
`WP_BASE_URL` and the credentials differ.

---

## The one constraint that matters

**Essential Blocks must never be active on the test site.**

```php
if ( ! WP_Block_Type_Registry::get_instance()
       ->is_registered( 'essential-blocks/table-of-contents' ) ) {
```

The standalone plugin skips its own registration when Essential Blocks has
already claimed that block name. With EB active, the block under test never
loads and **every assertion passes while testing nothing**.

This is declared in `blocks/table-of-contents.config.mjs` (`conflictingBlocks`),
not hardcoded into the scripts, so a second block with a different conflict
declares its own. `npm run verify-env` checks every declared conflict and
refuses to continue if one is active. Do not remove that check.

---

## Layout

```
blocks/
  table-of-contents.config.mjs   the ONE file a new block copies and edits --
                                  plugin slug, block name, known-broken
                                  versions, conflicting plugins

scripts/
  lib/block-config.mjs      resolves --block=<slug> / $BLOCK to a config;
                             auto-picks the only block when there's just one
  prepare-plugin.mjs        resolve + unpack the build under test, validate it
  generate-wp-env.mjs       writes .wp-env.json for one block (wp-env/CI only)
  activate-plugin.mjs       LocalWP convenience; wp-env does this itself
  verify-environment.mjs    preflight; REST-based so it works local and in CI
  verify-suite.mjs          negative control (see below)
  list-blocks.mjs           lists configured blocks; feeds the CI matrix

tests/
  global-setup.ts            authenticate once, reset the site
  specs/
    table-of-contents.spec.ts    one file per block, Gutenberg convention
  support/
    shared/                block-agnostic: base test fixture, console errors,
                            content builders
    table-of-contents/     block-specific: selectors, page objects, and this
                            block's own extended test fixture (test.ts)

reporters/
  qa-markdown-reporter.ts   emits qa-report-<slug>-e2e-*.md; reads which block
                             ran from scripts/verify-environment.mjs's output
```

### Adding a second block

1. Copy `blocks/table-of-contents.config.mjs` to `blocks/<new-slug>.config.mjs`
   and edit every field -- plugin slug, block name, known-broken versions, and
   what conflicts with it (or an empty array if nothing does).
2. Copy `tests/support/table-of-contents/` to `tests/support/<new-slug>/`.
   Rewrite `selectors.ts` and the page objects for the new block; rewrite
   `test.ts`'s fixture names and imports to match.
3. Write `tests/specs/<new-slug>.spec.ts`, importing `test`/`expect` from your
   new `tests/support/<new-slug>/test.ts` -- not from `shared/test.ts`. That
   file exports only what's true of every block; a spec that imported it
   directly would have no page objects at all.

Nothing else changes. `scripts/list-blocks.mjs` picks the new config up
automatically, which means the CI matrix does too -- no edit to
`.github/workflows/e2e.yml`. Every script now takes `--block=<slug>` (or
`$BLOCK`); with two-plus blocks configured, it becomes required, since at that
point guessing which one you meant would be a worse failure mode than asking.

**What this refactor fixed:** earlier versions of this repo claimed the
scripts, the reporter, and the test fixtures were already block-agnostic. They
were not -- four scripts and the reporter had `table-of-contents-block`
hardcoded, and the shared test fixture imported this block's page objects
directly, which would have handed them to any second block's spec too. The
structure above is what actually makes the claim true.

---

## Things that look wrong and are not

- **`.eb-tab-controlsgeneral`** -- the panel class really is a separator-less
  concatenation of `"eb-tab-controls"` and the tab name. Not a typo.
- **Class selectors instead of `getByRole`** -- the block's _frontend_ output
  contains no ARIA at all: no `<nav>`, no role, no label. Gutenberg core's own
  ToC has them, which is why its tests can use roles and ours cannot. The
  inspector _tabs_ do expose proper roles, and those tests use both.
- **`editor.canvas` everywhere** -- the block is `apiVersion: 3`, so the editor
  canvas is an iframe. Querying block markup on `page` finds nothing.
- **Fixtures always set `blockId`** -- the PHP renderer reads
  `$attributes['blockId']` with no default, and a block without one emits a PHP
  warning _into the REST response body_, corrupting JSON for every subsequent
  request. Real posts always have one.
- **`.wp-env.json` is gitignored** -- it's generated per run by
  `scripts/generate-wp-env.mjs` for whichever block is being tested, with
  `WP_DEBUG_DISPLAY: false` for the same reason as above: warnings belong in
  `debug.log`, not in API responses.
- **`environment.<slug>.json` and `plugin-under-test.<slug>.json`** in
  `artifacts/` -- namespaced by block so a local dev who has prepared more than
  one block doesn't have one overwrite the other.

---

## Known defects

Two confirmed bugs are recorded as `test.fail()` in the spec. They fail on
purpose; the run stays green and the report lists them separately from
regressions.

If one starts passing, Playwright reports an unexpected pass -- that is the
signal it has been fixed and the marker should be removed.

| # | Defect | Impact |
|---|---|---|
| D1 | The first heading added _after_ the block is inserted is silently marked excluded (`deleteHeaderList` `isDelete: true`) and disappears once a second heading exists. | A section missing from the published TOC, in an ordinary authoring order, with no feedback to the author. |
| D2 | An empty heading becomes a TOC entry with an empty link. The frontend href is `#eb-table-content-N`, which resolves to nothing -- a genuinely broken link. | Empty bullet in the list plus a dead link. Editor and frontend also disagree on the href. |

Full reproductions are in the comments above each test.

---

## Negative control

A suite that has never failed is not evidence of anything.

```bash
# Prepare an environment running a known-broken build, then:
npm run verify:suite
```

This runs the registration tests against a build where the block does not
register and **inverts the exit code**: the tests failing means the suite works.
If they pass, the suite is blind and must be fixed before it is trusted. The
versions treated as known-broken come from `knownBrokenVersions` in the
block's own config.

---

## CI

`.github/workflows/e2e.yml`. Two jobs:

1. **List blocks** -- reads `blocks/*.config.mjs` and builds the matrix. If
   `workflow_dispatch` supplied a `block` input, the matrix is just that one
   block; otherwise every configured block runs.
2. **E2E** -- one isolated `wp-env` per block in the matrix. Each job unpacks
   its own plugin, boots its own WordPress, and tears it down independently --
   a bug in one block's plugin cannot affect another's run.

Trigger manually with `workflow_dispatch`, optionally passing `block` plus
either `plugin_zip_url` (a release candidate) or `plugin_version` (a published
version) to test one block's specific build. Also runs on PRs to `main`
(every block, against latest), and nightly (same).

Every step validates:

| Step | Gate |
|---|---|
| List blocks | reads `blocks/*.config.mjs`, or narrows to one via the `block` input |
| Prepare plugin | archive valid, main PHP file present, **version echoed to the log** |
| Generate wp-env config | writes `.wp-env.json` scoped to exactly one block's plugin |
| Start wp-env | HTTP 200 within 60s or fail fast |
| Verify environment | plugin active, **no declared conflict active**, block registered, apiVersion 3 |
| Run tests | filtered to the matrix block's spec file |
| Upload artifacts | report, traces, `wp-debug.log` -- always, including on failure, namespaced per block |

---

## Scope

**Covered (Tier 1, Table of Contents):** block registration, insertion and
persistence, inspector tabs, heading detection and nesting, frontend
rendering, link resolution, scroll-to-section, empty-page safety, 375px
layout.

**Not covered yet:** settings behaviour (list style, presets, collapsible,
sticky, copy-link, scroll-to-top), FSE / site editor placement, headings inside
Group and Columns, multiple blocks on one page, third-party heading
integrations, PHP 7.4, screenshot baselines.

The exclusions are deliberate. A small suite people trust beats a broad suite
people learn to ignore.
