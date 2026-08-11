#!/usr/bin/env node
/**
 * Negative control -- proves the suite can actually fail.
 *
 * A test suite that has never failed is not evidence of anything. This script
 * points the registration tests at a build KNOWN to be broken (v1.3.4, where
 * the block silently stopped registering on WP 6.5+) and inverts the exit code:
 *
 *   tests FAIL -> exit 0   the suite detects the regression. Trustworthy.
 *   tests PASS -> exit 1   the suite is blind. Fix it before relying on it.
 *
 * SETUP: this does not swap plugin versions for you -- that would mean writing
 * into a WordPress install behind your back. Prepare the environment first:
 *
 *   wp-env:  TOC_PLUGIN_VERSION=1.3.4 npm run prepare-plugin && npm run env:start
 *   LocalWP: install table-of-contents-block 1.3.4 on the target site
 *
 * Then:  npm run verify:suite
 */

// Side-effect import: populates process.env from .env.
import './load-env.mjs';

import { spawnSync } from 'node:child_process';
import { request } from '@playwright/test';
import { RequestUtils } from '@wordpress/e2e-test-utils-playwright';

// Versions where the block is known not to register. v1.3.4 is the one that
// shipped and generated the "Does not work since WordPress 6.5" reports.
const KNOWN_BROKEN = [ '1.3.4', '1.3.5', '1.3.6' ];

const baseURL = process.env.WP_BASE_URL || 'http://localhost:8889';

async function activePluginVersion() {
	const ctx = await request.newContext( { baseURL, ignoreHTTPSErrors: true } );
	try {
		const requestUtils = new RequestUtils( ctx, {
			user: {
				username: process.env.WP_USERNAME || 'admin',
				password: process.env.WP_PASSWORD || 'password',
			},
		} );
		await requestUtils.setupRest();
		const plugins = await requestUtils.rest( { path: '/wp/v2/plugins' } );
		return (
			plugins.find(
				( p ) => p.status === 'active' && p.plugin.includes( 'table-of-contents-block' )
			)?.version ?? null
		);
	} catch {
		return null;
	} finally {
		await ctx.dispose();
	}
}

const version = await activePluginVersion();

console.log( `\n[verify-suite] Negative control against ${ baseURL }` );
console.log( `[verify-suite] Active plugin version: ${ version ?? 'unknown' }\n` );

if ( version && ! KNOWN_BROKEN.includes( version ) ) {
	console.error(
		`[verify-suite] REFUSING TO RUN.\n\n` +
			`The active build is v${ version }, which is expected to WORK. Running the\n` +
			`negative control against a good build proves nothing.\n\n` +
			`Install a known-broken version first (one of: ${ KNOWN_BROKEN.join( ', ' ) })\n` +
			`and re-run. See the comment at the top of this file.\n`
	);
	process.exit( 1 );
}

// Registration tests only. The rest of the suite depends on the block existing,
// so on a broken build it would fail for uninteresting downstream reasons.
const run = spawnSync(
	'npx',
	[ 'playwright', 'test', 'table-of-contents', '--grep', '@registration' ],
	{ stdio: 'inherit', env: { ...process.env, SKIP_QA_REPORT: '1' } }
);

console.log( '\n' + '-'.repeat( 70 ) );

if ( run.status === 0 ) {
	console.error(
		`[verify-suite] FAILED -- the suite is not trustworthy.\n\n` +
			`The registration tests PASSED against a build where the block does not\n` +
			`register. They are not actually checking what they claim to check.\n\n` +
			`Fix the tests before relying on this suite to gate a release.\n`
	);
	process.exit( 1 );
}

console.log(
	`[verify-suite] PASSED -- the suite correctly detects the regression.\n\n` +
		`The registration tests failed against the known-broken build, which is the\n` +
		`expected outcome. This suite would have caught the v1.3.4 release.\n`
);
process.exit( 0 );
