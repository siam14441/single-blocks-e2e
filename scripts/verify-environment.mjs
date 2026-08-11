#!/usr/bin/env node
/**
 * Preflight. Runs before Playwright and refuses to continue unless the
 * environment can produce a meaningful result.
 *
 * This is the highest-value step in the whole pipeline. For Table of
 * Contents, the single most likely misconfiguration is Essential Blocks
 * being active -- see blocks/table-of-contents.config.mjs for why that
 * makes the block under test register nothing while the suite still passes.
 * Each block declares its own list of such conflicts in `conflictingBlocks`;
 * this script does not know or care what they are, only how to check them.
 *
 * Deliberately REST-based rather than wp-cli, so the identical script runs
 * against a LocalWP site (no Docker) and against wp-env in CI.
 *
 * BLOCK SELECTION: --block=<slug> or $BLOCK. With one block configured, it's
 * picked automatically.
 */

// Side-effect import: populates process.env from .env.
import './load-env.mjs';

import fs from 'node:fs';
import path from 'node:path';
import { request } from '@playwright/test';
import { RequestUtils } from '@wordpress/e2e-test-utils-playwright';
import { resolveBlockConfig } from './lib/block-config.mjs';

const baseURL = process.env.WP_BASE_URL || 'http://localhost:8889';

const results = [];
const record = ( ok, label, detail ) => {
	results.push( { ok, label, detail } );
	console.log( `  ${ ok ? 'OK  ' : 'FAIL' }  ${ label }${ detail ? ` -- ${ detail }` : '' }` );
};

function bail( label, heading, body ) {
	console.error( `\n[verify-environment:${ label }] BLOCKED: ${ heading }\n\n${ body }\n` );
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
	const config = await resolveBlockConfig();
	const { slug, root, displayName, pluginSlug, blockName, conflictingBlocks = [] } = config;
	const label = slug;

	console.log( `\n[verify-environment:${ label }] Target: ${ baseURL } (${ displayName })\n` );

	// --- 1. Site reachable ------------------------------------------------
	const ctx = await request.newContext( { baseURL, ignoreHTTPSErrors: true } );
	try {
		const res = await ctx.get( '/wp-json/' );
		if ( ! res.ok() ) {
			bail(
				label,
				`REST API returned HTTP ${ res.status() }`,
				`${ baseURL }/wp-json/ is not serving the REST API.\n` +
					`Check the site is running and permalinks are not set to "Plain".`
			);
		}
		record( true, 'Site reachable, REST API responding' );
	} catch ( error ) {
		bail(
			label,
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
			label,
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
			label,
			'Could not list plugins',
			`GET /wp/v2/plugins failed. The account may not be an administrator.\n\n` +
				`Original error: ${ error.message }`
		);
	}

	const active = plugins.filter( ( p ) => p.status === 'active' );
	const activeNames = active.map( ( p ) => p.plugin );

	const target = active.find( ( p ) => p.plugin.includes( pluginSlug ) );
	if ( ! target ) {
		bail(
			label,
			'The plugin under test is not active',
			`No active plugin matching "${ pluginSlug }".\n\n` +
				`Active plugins: ${ activeNames.join( ', ' ) || '(none)' }\n\n` +
				`Install and activate the release build on this site first.`
		);
	}
	record( true, 'Plugin under test is active', `v${ target.version }` );

	// --- 4. THE GUARD: no conflicting plugin is active ---------------------
	// Each block declares its own conflicts (blocks/<slug>.config.mjs) --
	// this loop is what makes that declaration load-bearing rather than
	// documentation nobody re-checks.
	for ( const conflict of conflictingBlocks ) {
		const found = active.find(
			( p ) => conflict.pluginMatch.test( p.plugin ) || conflict.pluginMatch.test( p.name )
		);
		if ( found ) {
			bail(
				label,
				`${ found.name } is active -- results would be meaningless`,
				`Found active plugin: ${ found.name } (${ found.plugin })\n\n` +
					`It registers "${ conflict.blockName }", which is expected to make\n` +
					`"${ displayName }" skip its own registration.\n\n` +
					`${ conflict.evidence }\n\n` +
					`Deactivate ${ found.name } on this site and re-run.`
			);
		}
	}
	record(
		true,
		'No conflicting plugin active',
		conflictingBlocks.length
			? conflictingBlocks.map( ( c ) => c.blockName ).join( ', ' )
			: '(none declared)'
	);

	// --- 5. Block actually registered ------------------------------------
	// The real assertion. Steps 3 and 4 can both pass while the block still
	// fails to register -- that is precisely what shipped in Table of
	// Contents v1.3.4 (see blocks/table-of-contents.config.mjs).
	let blockType;
	try {
		blockType = await requestUtils.rest( { path: `/wp/v2/block-types/${ blockName }` } );
	} catch {
		bail(
			label,
			'The block is not registered',
			`The server does not know about "${ blockName }".\n\n` +
				`The plugin is active but registered no block type. If you are\n` +
				`intentionally testing a known-broken build, this is the expected\n` +
				`outcome -- see "npm run verify:suite" in the README.`
		);
	}

	record( true, 'Block registered server-side', blockName );

	// apiVersion 3 is what makes the editor canvas iframed. Every editor
	// selector in the suite depends on it, so a silent drop to 2 would be
	// confusing rather than obvious.
	if ( blockType.api_version !== 3 ) {
		bail(
			label,
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

	console.log( `\n[verify-environment:${ label }] Environment` );
	console.log( `  Site        : ${ baseURL }` );
	console.log( `  WordPress   : ${ wpVersion ?? 'unknown (generator meta not exposed)' }` );
	console.log( `  PHP         : ${ phpVersion ?? 'unknown (not exposed via REST)' }` );
	console.log( `  Plugin      : ${ pluginSlug } v${ target.version }` );
	console.log(
		`  Other active: ${ activeNames.filter( ( n ) => ! n.includes( pluginSlug ) ).join( ', ' ) || '(none)' }`
	);

	// Handed to the QA markdown reporter so the report describes the real run
	// rather than repeating whatever was configured. Namespaced by block slug
	// so a local dev who has prepared more than one block doesn't clobber
	// the previous block's environment.json.
	const artifactsDir = process.env.WP_ARTIFACTS_PATH || path.join( root, 'artifacts' );
	fs.mkdirSync( artifactsDir, { recursive: true } );
	fs.writeFileSync(
		path.join( artifactsDir, `environment.${ slug }.json` ),
		JSON.stringify(
			{
				slug,
				displayName,
				baseURL,
				wpVersion,
				phpVersion,
				pluginSlug,
				pluginVersion: target.version,
				otherActivePlugins: activeNames.filter( ( n ) => ! n.includes( pluginSlug ) ),
				verifiedAt: new Date().toISOString(),
			},
			null,
			2
		)
	);

	console.log(
		`\n[verify-environment:${ label }] ${ results.length } checks passed. Safe to run the suite.\n`
	);
	await ctx.dispose();
}

main().catch( ( error ) => {
	console.error( `\n[verify-environment] Unexpected error\n\n${ error.stack }\n` );
	process.exit( 1 );
} );
