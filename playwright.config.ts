/**
 * Playwright configuration for the single-block E2E suite.
 *
 * Modelled on `@wordpress/scripts/config/playwright.config.js`, which is what
 * Gutenberg core itself extends. We copy the ~60 lines rather than depend on
 * `@wordpress/scripts`, because that package drags in the entire webpack/babel
 * build toolchain for a config file we would immediately override anyway.
 *
 * DUAL-MODE: every environment-specific value is read from an env var, so one
 * suite runs unchanged against a LocalWP site (authoring) and wp-env (CI).
 * Nothing here is hardcoded to either.
 */

// Side-effect import: populates process.env from .env before anything reads it.
import './scripts/load-env.mjs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const __dirname = path.dirname( fileURLToPath( import.meta.url ) );

/**
 * The WP test utils read these two paths from the environment rather than from
 * config, so they must be set before anything imports the package. Playwright
 * evaluates this file first, which makes it the right place.
 */
process.env.WP_ARTIFACTS_PATH ??= path.join( __dirname, 'artifacts' );
process.env.STORAGE_STATE_PATH ??= path.join(
	process.env.WP_ARTIFACTS_PATH,
	'storage-states/admin.json'
);

// Defaults to wp-env's tests environment. Local runs override via .env.
const baseURL = process.env.WP_BASE_URL || 'http://localhost:8889';

const isCI = !! process.env.CI;

export default defineConfig( {
	testDir: './tests/specs',
	outputDir: path.join( process.env.WP_ARTIFACTS_PATH, 'test-results' ),

	globalSetup: './tests/global-setup.ts',

	/**
	 * WordPress is a single shared mutable database. Two workers editing posts
	 * concurrently will corrupt each other's state, so the suite is serial.
	 * This matches Gutenberg core, which also pins workers to 1.
	 */
	workers: 1,
	fullyParallel: false,

	// A `.only` left in a commit would silently skip the rest of the suite.
	forbidOnly: isCI,

	/**
	 * Retries in CI only. Locally a flake should be visible immediately rather
	 * than papered over -- that is how we notice the suite is untrustworthy.
	 */
	retries: isCI ? 2 : 0,

	timeout: 90_000,
	expect: { timeout: 10_000 },
	reportSlowTests: null,

	reporter: [
		[ 'list' ],
		[ './reporters/qa-markdown-reporter.ts' ],
		[ 'html', { outputFolder: 'artifacts/html-report', open: 'never' } ],
		...( isCI ? [ [ 'github' ] as [ string ] ] : [] ),
	],

	use: {
		baseURL,
		headless: true,

		/**
		 * 960x700 matches Gutenberg's own e2e viewport. Wide enough that the
		 * editor sidebar stays open by default -- narrower viewports collapse
		 * it, which would break every inspector-tab test.
		 */
		viewport: { width: 960, height: 700 },

		ignoreHTTPSErrors: true,
		locale: 'en-US',

		/**
		 * `reducedMotion` stops the editor's open/close animations from racing
		 * assertions. `strictSelectors` makes an ambiguous locator throw rather
		 * than silently picking the first match.
		 */
		contextOptions: {
			reducedMotion: 'reduce',
			strictSelectors: true,
		},

		// Written by global-setup, so tests start already logged in as admin.
		storageState: process.env.STORAGE_STATE_PATH,

		actionTimeout: 15_000,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'on-first-retry',
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices[ 'Desktop Chrome' ] },
		},
	],
} );
