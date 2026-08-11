#!/usr/bin/env node
/**
 * Preflight. Runs before Playwright and refuses to continue unless the
 * environment can produce a meaningful result.
 *
 * This is the highest-value step in the whole pipeline. Without it, the single
 * most likely misconfiguration -- Essential Blocks being active -- produces a
 * suite that passes while testing nothing at all:
 *
 *   if ( ! WP_Block_Type_Registry::get_instance()
 *          ->is_registered( 'essential-blocks/table-of-contents' ) ) {
 *
 * The standalone plugin skips its own registration when EB free has already
 * claimed that block name. Every "block renders" assertion would then be
 * asserting against nothing, and the run would be green and worthless.
 *
 * Deliberately REST-based rather than wp-cli, so the identical script runs
 * against a LocalWP site (no Docker) and against wp-env in CI.
 */

// Side-effect import: populates process.env from .env.
import './load-env.mjs';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from '@playwright/test';
import { RequestUtils } from '@wordpress/e2e-test-utils-playwright';

const __dirname = path.dirname( fileURLToPath( import.meta.url ) );
const ROOT = path.resolve( __dirname, '..' );

const BLOCK_NAME = 'table-of-contents-block/table-of-contents-block';
const PLUGIN_SLUG = 'table-of-contents-block';

// The block name EB free registers. If this exists, our plugin stands down.
const CONFLICTING_BLOCK = 'essential-blocks/table-of-contents';

const baseURL = process.env.WP_BASE_URL || 'http://localhost:8889';

const results = [];
const record = ( ok, label, detail ) => {
	results.push( { ok, label, detail } );
	console.log( `  ${ ok ? 'OK  ' : 'FAIL' }  ${ label }${ detail ? ` -- ${ detail }` : '' }` );
};

function bail( heading, body ) {
	console.error( `\n[verify-environment] BLOCKED: ${ heading }\n\n${ body }\n` );
	process.exit( 1 );
}

/** WP does not expose its version over REST; the generator meta is the cheapest source. */
async function detectWpVersion( ctx ) {
	try {
		const html = await ( await ctx.get( '/' ) ).text();
		return html.match( /name="generator" content="WordPress ([\d.]+)"/ )?.[ 1 ] ?? null;
	} catch {
		return null;
	}
}

async function main() {
	console.log( `\n[verify-environment] Target: ${ baseURL }\n` );

	// --- 1. Site reachable ------------------------------------------------
	const ctx = await request.newContext( { baseURL, ignoreHTTPSErrors: true } );
	try {
		const res = await ctx.get( '/wp-json/' );
		if ( ! res.ok() ) {
			bail(
				`REST API returned HTTP ${ res.status() }`,
				`${ baseURL }/wp-json/ is not serving the REST API.\n` +
					`Check the site is running and permalinks are not set to "Plain".`
			);
		}
		record( true, 'Site reachable, REST API responding' );
	} catch ( error ) {
		bail(
			`Cannot reach ${ baseURL }`,
			`${ error.message }\n\n` +
				`If using wp-env, start it first:  npm run env:start\n` +
				`If using LocalWP, confirm the site is running in the Local app.`
		);
	}

	// --- 2. Admin authentication -----------------------------------------
	const requestUtils = new RequestUtils( ctx, {
		user: {
			username: process.env.WP_USERNAME || 'admin',
			password: process.env.WP_PASSWORD || 'password',
		},
	} );

	try {
		await requestUtils.setupRest();
		record( true, 'Authenticated as administrator' );
	} catch ( error ) {
		bail(
			'Could not authenticate',
			`WP_USERNAME / WP_PASSWORD did not log in at ${ baseURL }.\n\n` +
				`Copy .env.example to .env and fill in a valid admin account.\n\n` +
				`Original error: ${ error.message }`
		);
	}

	// --- 3. Plugin under test is active ----------------------------------
	let plugins = [];
	try {
		plugins = await requestUtils.rest( { path: '/wp/v2/plugins' } );
	} catch ( error ) {
		bail(
			'Could not list plugins',
			`GET /wp/v2/plugins failed. The account may not be an administrator.\n\n` +
				`Original error: ${ error.message }`
		);
	}

	const active = plugins.filter( ( p ) => p.status === 'active' );
	const activeNames = active.map( ( p ) => p.plugin );

	const toc = active.find( ( p ) => p.plugin.includes( PLUGIN_SLUG ) );
	if ( ! toc ) {
		bail(
			'The plugin under test is not active',
			`No active plugin matching "${ PLUGIN_SLUG }".\n\n` +
				`Active plugins: ${ activeNames.join( ', ' ) || '(none)' }\n\n` +
				`Install and activate the release build on this site first.`
		);
	}
	record( true, 'Plugin under test is active', `v${ toc.version }` );

	// --- 4. THE GUARD: Essential Blocks must not be active ----------------
	const eb = active.find(
		( p ) => /essential-?blocks/i.test( p.plugin ) || /essential blocks/i.test( p.name )
	);
	if ( eb ) {
		bail(
			'Essential Blocks is active -- results would be meaningless',
			`Found active plugin: ${ eb.name } (${ eb.plugin })\n\n` +
				`Essential Blocks registers "${ CONFLICTING_BLOCK }". The standalone\n` +
				`plugin checks for exactly that and skips its own registration when it\n` +
				`is present, so the block under test never loads at all.\n\n` +
				`This is worse than a broken run. Essential Blocks ships its own\n` +
				`"Table of Contents" block, so parts of the suite go GREEN against the\n` +
				`WRONG block -- verified: the inserter check passes, because it finds\n` +
				`Essential Blocks' block under the same name. A release could be signed\n` +
				`off on evidence that never touched the plugin being shipped.\n\n` +
				`Deactivate Essential Blocks on this site and re-run.`
		);
	}
	record( true, 'Essential Blocks not active (no registration conflict)' );

	// --- 5. Block actually registered ------------------------------------
	// The real assertion. Steps 3 and 4 can both pass while the block still
	// fails to register -- that is precisely what shipped in v1.3.4.
	let blockType;
	try {
		blockType = await requestUtils.rest( { path: `/wp/v2/block-types/${ BLOCK_NAME }` } );
	} catch {
		bail(
			'The block is not registered',
			`The server does not know about "${ BLOCK_NAME }".\n\n` +
				`The plugin is active but registered no block type. This is the exact\n` +
				`failure mode that shipped in v1.3.4 -- the editor script's dependency\n` +
				`chain broke, window.EBTOCControls was undefined, and the block never\n` +
				`reached the inserter.\n\n` +
				`If you are intentionally testing a broken build, this is the expected\n` +
				`outcome -- see "npm run verify:suite" in the README.`
		);
	}

	record( true, 'Block registered server-side', BLOCK_NAME );

	// apiVersion 3 is what makes the editor canvas iframed. Every editor
	// selector in the suite depends on it, so a silent drop to 2 would be
	// confusing rather than obvious.
	if ( blockType.api_version !== 3 ) {
		bail(
			`Block reports api_version ${ blockType.api_version }, expected 3`,
			`apiVersion 3 is what iframes the editor canvas. The suite queries the\n` +
				`canvas through editor.canvas on that assumption, so a change here needs\n` +
				`the selectors revisited, not just this check relaxed.`
		);
	}
	record( true, 'Block reports api_version 3 (iframed canvas)' );

	// --- Informational ----------------------------------------------------
	const wpVersion = await detectWpVersion( ctx );
	const phpVersion = process.env.PHP_VERSION || null;

	console.log( '\n[verify-environment] Environment' );
	console.log( `  Site        : ${ baseURL }` );
	console.log( `  WordPress   : ${ wpVersion ?? 'unknown (generator meta not exposed)' }` );
	console.log( `  PHP         : ${ phpVersion ?? 'unknown (not exposed via REST)' }` );
	console.log( `  Plugin      : ${ PLUGIN_SLUG } v${ toc.version }` );
	console.log( `  Other active: ${ activeNames.filter( ( n ) => ! n.includes( PLUGIN_SLUG ) ).join( ', ' ) || '(none)' }` );

	// Handed to the QA markdown reporter so the report describes the real run
	// rather than repeating whatever was configured.
	const artifactsDir = process.env.WP_ARTIFACTS_PATH || path.join( ROOT, 'artifacts' );
	fs.mkdirSync( artifactsDir, { recursive: true } );
	fs.writeFileSync(
		path.join( artifactsDir, 'environment.json' ),
		JSON.stringify(
			{
				baseURL,
				wpVersion,
				phpVersion,
				pluginSlug: PLUGIN_SLUG,
				pluginVersion: toc.version,
				otherActivePlugins: activeNames.filter( ( n ) => ! n.includes( PLUGIN_SLUG ) ),
				verifiedAt: new Date().toISOString(),
			},
			null,
			2
		)
	);

	console.log( `\n[verify-environment] ${ results.length } checks passed. Safe to run the suite.\n` );
	await ctx.dispose();
}

main().catch( ( error ) => {
	console.error( `\n[verify-environment] Unexpected error\n\n${ error.stack }\n` );
	process.exit( 1 );
} );
