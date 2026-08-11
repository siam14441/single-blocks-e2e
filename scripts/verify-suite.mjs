#!/usr/bin/env node
/**
 * Negative control -- proves the suite can actually fail.
 *
 * A test suite that has never failed is not evidence of anything. This script
 * points the registration tests at a build the block config declares KNOWN to
 * be broken (see `knownBrokenVersions` in blocks/<slug>.config.mjs) and
 * inverts the exit code:
 *
 *   tests FAIL -> exit 0   the suite detects the regression. Trustworthy.
 *   tests PASS -> exit 1   the suite is blind. Fix it before relying on it.
 *
 * SETUP: this does not swap plugin versions for you -- that would mean writing
 * into a WordPress install behind your back. Prepare the environment first:
 *
 *   wp-env:  PLUGIN_VERSION=1.3.4 npm run prepare-plugin -- --block=table-of-contents
 *            npm run env:start
 *   LocalWP: install the known-broken version on the target site
 *
 * Then:  npm run verify:suite -- --block=table-of-contents
 *
 * BLOCK SELECTION: --block=<slug> or $BLOCK. With one block configured, it's
 * picked automatically.
 */

// Side-effect import: populates process.env from .env.
import './load-env.mjs';

import { spawnSync } from 'node:child_process';
import { request } from '@playwright/test';
import { RequestUtils } from '@wordpress/e2e-test-utils-playwright';
import { resolveBlockConfig } from './lib/block-config.mjs';

const baseURL = process.env.WP_BASE_URL || 'http://localhost:8889';

async function activePluginVersion( pluginSlug ) {
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
			plugins.find( ( p ) => p.status === 'active' && p.plugin.includes( pluginSlug ) )
				?.version ?? null
		);
	} catch {
		return null;
	} finally {
		await ctx.dispose();
	}
}

const config = await resolveBlockConfig();
const { slug, pluginSlug, knownBrokenVersions = [] } = config;
const label = slug;

if ( knownBrokenVersions.length === 0 ) {
	console.error(
		`\n[verify-suite:${ label }] No knownBrokenVersions declared in ` +
			`blocks/${ slug }.config.mjs -- nothing to run a negative control against.\n`
	);
	process.exit( 1 );
}

const version = await activePluginVersion( pluginSlug );

console.log( `\n[verify-suite:${ label }] Negative control against ${ baseURL }` );
console.log( `[verify-suite:${ label }] Active plugin version: ${ version ?? 'unknown' }\n` );

if ( version && ! knownBrokenVersions.includes( version ) ) {
	console.error(
		`[verify-suite:${ label }] REFUSING TO RUN.\n\n` +
			`The active build is v${ version }, which is expected to WORK. Running the\n` +
			`negative control against a good build proves nothing.\n\n` +
			`Install a known-broken version first (one of: ${ knownBrokenVersions.join( ', ' ) })\n` +
			`and re-run. See the comment at the top of this file.\n`
	);
	process.exit( 1 );
}

// Registration tests only. The rest of the suite depends on the block existing,
// so on a broken build it would fail for uninteresting downstream reasons.
const run = spawnSync(
	'npx',
	[ 'playwright', 'test', slug, '--grep', '@registration' ],
	{ stdio: 'inherit', env: { ...process.env, SKIP_QA_REPORT: '1' } }
);

console.log( '\n' + '-'.repeat( 70 ) );

if ( run.status === 0 ) {
	console.error(
		`[verify-suite:${ label }] FAILED -- the suite is not trustworthy.\n\n` +
			`The registration tests PASSED against a build where the block does not\n` +
			`register. They are not actually checking what they claim to check.\n\n` +
			`Fix the tests before relying on this suite to gate a release.\n`
	);
	process.exit( 1 );
}

console.log(
	`[verify-suite:${ label }] PASSED -- the suite correctly detects the regression.\n\n` +
		`The registration tests failed against the known-broken build, which is the\n` +
		`expected outcome.\n`
);
process.exit( 0 );
