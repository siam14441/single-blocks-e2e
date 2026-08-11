# single-blocks-e2e

Playwright end-to-end regression suite for WPDeveloper's standalone single-block
plugins. First tenant: **Table Of Contents Block**.

The suite runs in GitHub Actions during release prep and blocks a release when
the block is broken.

---

## Why this exists

In **v1.3.4** the Table of Contents block silently stopped registering on WP 6.5+.
The editor bundle threw before registration, `window.EBTOCControls` was never
defined, and the block simply was not in the inserter. Nothing looked broken —
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

The QA report is written to `artifacts/qa-report-toc-e2e-v<version>-<date>.md`.

### Local environment

Docker is not required locally. Point `.env` at any WordPress install that has
the plugin under test active and **Essential Blocks inactive**:

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

CI uses `wp-env` (Docker) instead. Both paths run the same tests — only
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

`npm run verify-env` checks this explicitly and refuses to continue. Do not
remove that check.

---

## Layout

```
scripts/
  prepare-plugin.mjs      resolve + unpack the build under test, validate it
  verify-environment.mjs  preflight; REST-based so it works local and in CI
  activate-plugin.mjs     LocalWP convenience; wp-env does this itself
  verify-suite.mjs        negative control (see below)

tests/
  global-setup.ts         authenticate once, reset the site
  specs/
    table-of-contents.spec.ts    one file per block, Gutenberg convention
  support/
    shared/               block-agnostic: fixtures, console errors, content
    table-of-contents/    block-specific: selectors + page objects

reporters/
  qa-markdown-reporter.ts emits the team's existing qa-report-*.md format
```

### Adding another block

Add `tests/support/<block>/` and `tests/specs/<block>.spec.ts`. Config,
fixtures, preflight, CI and the reporter are block-agnostic and are reused
unchanged. That is why this repo is not named after one block.

---

## Things that look wrong and are not

- **`.eb-tab-controlsgeneral`** — the panel class really is a separator-less
  concatenation of `"eb-tab-controls"` and the tab name. Not a typo.
- **Class selectors instead of `getByRole`** — the block's *frontend* output
  contains no ARIA at all: no `<nav>`, no role, no label. Gutenberg core's own
  ToC has them, which is why its tests can use roles and ours cannot. The
  inspector *tabs* do expose proper roles, and those tests use both.
- **`editor.canvas` everywhere** — the block is `apiVersion: 3`, so the editor
  canvas is an iframe. Querying block markup on `page` finds nothing.
- **Fixtures always set `blockId`** — the PHP renderer reads
  `$attributes['blockId']` with no default, and a block without one emits a PHP
  warning *into the REST response body*, corrupting JSON for every subsequent
  request. Real posts always have one.
- **`WP_DEBUG_DISPLAY: false` in `.wp-env.json`** — same reason. Warnings belong
  in `debug.log`, not in API responses.

---

## Known defects

Two confirmed bugs are recorded as `test.fail()` in the spec. They fail on
purpose; the run stays green and the report lists them separately from
regressions.

If one starts passing, Playwright reports an unexpected pass — that is the
signal it has been fixed and the marker should be removed.

| # | Defect | Impact |
|---|---|---|
| D1 | The first heading added *after* the block is inserted is silently marked excluded (`deleteHeaderList` `isDelete: true`) and disappears once a second heading exists. | A section missing from the published TOC, in an ordinary authoring order, with no feedback to the author. |
| D2 | An empty heading becomes a TOC entry with an empty link. The frontend href is `#eb-table-content-N`, which resolves to nothing — a genuinely broken link. | Empty bullet in the list plus a dead link. Editor and frontend also disagree on the href. |

Full reproductions are in the comments above each test.

---

## Negative control

A suite that has never failed is not evidence of anything.

```bash
# Prepare an environment running a known-broken build (1.3.4), then:
npm run verify:suite
```

This runs the registration tests against a build where the block does not
register and **inverts the exit code**: the tests failing means the suite works.
If they pass, the suite is blind and must be fixed before it is trusted.

---

## CI

`.github/workflows/e2e.yml`. Trigger manually with `workflow_dispatch`, passing
either `plugin_zip_url` (for a release candidate) or `plugin_version` (for a
published version). Also runs on PRs to `main`, and nightly against the current
wp.org release.

Every step validates:

| Step | Gate |
|---|---|
| Prepare plugin | archive valid, main PHP file present, **version echoed to the log** |
| Start wp-env | HTTP 200 within 60s or fail fast |
| Verify environment | plugin active, **EB not active**, block registered, apiVersion 3 |
| Run tests | the suite |
| Upload artifacts | report, traces, `wp-debug.log` — always, including on failure |

---

## Scope

**Covered (Tier 1):** block registration, insertion and persistence, inspector
tabs, heading detection and nesting, frontend rendering, link resolution,
scroll-to-section, empty-page safety, 375px layout.

**Not covered yet:** settings behaviour (list style, presets, collapsible,
sticky, copy-link, scroll-to-top), FSE / site editor placement, headings inside
Group and Columns, multiple blocks on one page, third-party heading
integrations, PHP 7.4, screenshot baselines.

The exclusions are deliberate. A small suite people trust beats a broad suite
people learn to ignore.
