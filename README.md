# single-blocks-e2e

Playwright end-to-end regression framework for standalone WordPress
single-block plugins. It runs in CI during release prep and blocks a release
when a block is broken.

The framework is block-agnostic by design: one block is fully wired up today
as the reference implementation (**Table of Contents**), and adding a second
is meant to be a matter of copying one folder and one config file, not
touching the framework itself. See [Adding a new block](#adding-a-new-block).

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
anywhere. See [Adding a new block](#adding-a-new-block) for what changes once
there are two.

### Local environment

Docker is not required locally. Point `.env` at any WordPress install that
has the plugin under test active and no conflicting plugin active (see
[The plugin-conflict guard](#the-plugin-conflict-guard) below):

```
WP_BASE_URL=http://your-site.local
WP_USERNAME=...
WP_PASSWORD=...
```

To install a plugin build on a local site:

```bash
unzip <plugin-slug>.zip -d "/path/to/site/wp-content/plugins"
npm run activate-plugin
```

CI uses `wp-env` (Docker) instead. Both paths run the same tests -- only
`WP_BASE_URL` and the credentials differ.

### Which plugin build gets tested

Resolved by `scripts/prepare-plugin.mjs`, in priority order (first one set
wins):

1. `PLUGIN_ZIP` -- a local path or URL. Use for release candidates not yet
   published.
2. `PLUGIN_VERSION` -- a published version from the plugin's wp.org listing.
3. Nothing set -- the latest published release, via the wp.org plugin API.

---

## The plugin-conflict guard

Another plugin can register a block under the same name as the one under
test; if that plugin is active, the block under test never registers, and
every assertion passes while testing nothing.

Each block declares its own list of such conflicts in
`blocks/<slug>.config.mjs` (`conflictingBlocks`). `npm run verify-env` checks
every declared conflict for the block under test and refuses to continue if
one is active.

---

## Layout

```
blocks/
  <slug>.config.mjs          the ONE file a new block copies and edits --
                              plugin slug, block name, known-broken versions,
                              conflicting blocks

scripts/
  lib/block-config.mjs       resolves --block=<slug> / $BLOCK to a config;
                              auto-picks the only block when there's just one
  prepare-plugin.mjs         resolve + unpack the build under test, validate it
  generate-wp-env.mjs        writes .wp-env.json for one block (wp-env/CI only)
  activate-plugin.mjs        local-site convenience; wp-env does this itself
  verify-environment.mjs     preflight; REST-based so it works local and in CI
  verify-suite.mjs           negative control (see below)
  list-blocks.mjs            lists configured blocks; feeds the CI matrix

tests/
  global-setup.ts            authenticate once, reset the site
  specs/
    <slug>.spec.ts             core coverage: registration, insertion,
                                inspector tabs, heading/content detection,
                                frontend rendering
    <slug>-settings.spec.ts    settings behaviour, as a separate file rather
                                than growing the first one
  support/
    shared/                  block-agnostic: base test fixture, console
                              errors, content builders
    <slug>/                  block-specific: selectors, page objects, and
                              that block's own extended test fixture (test.ts)

reporters/
  qa-markdown-reporter.ts    emits a QA report per run; reads which block ran
                              from scripts/verify-environment.mjs's output
```

---

## Adding a new block

1. Copy `blocks/table-of-contents.config.mjs` to `blocks/<new-slug>.config.mjs`
   and edit every field -- plugin slug, block name, known-broken versions, and
   what conflicts with it (or an empty array if nothing does).
2. Copy `tests/support/table-of-contents/` to `tests/support/<new-slug>/`.
   Rewrite `selectors.ts` and the page objects for the new block; rewrite
   `test.ts`'s fixture names and imports to match.
3. Write `tests/specs/<new-slug>.spec.ts`, importing `test`/`expect` from your
   new `tests/support/<new-slug>/test.ts`, not from `shared/test.ts` (which
   exports only what's true of every block).

`scripts/list-blocks.mjs` picks the new config up automatically, so the CI
matrix does too -- no edit to `.github/workflows/e2e.yml`. Every script takes
`--block=<slug>` (or `$BLOCK`); it becomes required once a second block is
configured.

---

## Negative control

```bash
# Prepare an environment running a known-broken build, then:
npm run verify:suite
```

This runs the registration tests against a build a block's own config
declares to be known-broken, and inverts the exit code: the tests failing
means the suite works. If they pass, the suite is blind. The versions
treated as known-broken come from `knownBrokenVersions` in the block's own
config.

---

## CI

`.github/workflows/e2e.yml`. Two jobs:

1. **List blocks** -- reads `blocks/*.config.mjs` and builds the matrix. A
   `workflow_dispatch` `block` input narrows it to one block; otherwise every
   configured block runs.
2. **E2E** -- one isolated `wp-env` per matrix cell (block × WordPress
   version × PHP version). By default each block runs against this repo's
   WordPress floor and latest, plus the WordPress floor paired with this
   repo's PHP floor. `workflow_dispatch` can pin `wp_version` and/or
   `php_version` to a single value the same way `block` narrows the block
   matrix.

Also runs on PRs to `main` and nightly, both against the full matrix. Every
step validates:

| Step | Gate |
|---|---|
| List blocks | reads `blocks/*.config.mjs`, or narrows to one via the `block` input |
| Prepare plugin | archive valid, main PHP file present, version echoed to the log |
| Generate wp-env config | writes `.wp-env.json` scoped to exactly one block's plugin, at the matrix cell's WP/PHP versions |
| Start wp-env | HTTP 200 within 60s or fail fast |
| Verify environment | plugin active, no declared conflict active, block registered, apiVersion 3 |
| Run tests | filtered to the matrix block's spec file |
| Upload artifacts | report, traces, `wp-debug.log` -- always, including on failure, namespaced per block/WP/PHP |

A confirmed bug the team has decided not to block a release on is marked
`test.fail()` in its spec rather than deleted or skipped, so a run stays
green without hiding the defect from the report. If a `test.fail()` case
starts passing, Playwright reports an unexpected pass -- the signal it's
been fixed and the marker should come out.

---

## Scope

Block registration, insertion and persistence, inspector tabs,
heading/content detection and nesting, frontend rendering, link resolution,
scroll-to-section, empty-page safety, a mobile viewport, and full settings
behaviour -- verified in the editor and on the published page. One
inspector-driven test per setting proves the control writes the right
attribute; value and behaviour combinations are then driven by attributes
directly rather than through repeated UI interaction. CI also runs every
block against a WordPress-version and PHP-version breadth matrix, not just
one fixed combination.
