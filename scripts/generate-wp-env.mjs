#!/usr/bin/env node
/**
 * Writes `.wp-env.json` for one block.
 *
 * `.wp-env.json` is a static file, but which plugin it should boot is not --
 * that's a per-block, per-run decision (see the "one block per CI run"
 * choice this repo made: each CI job runs an isolated wp-env with exactly one
 * block's plugin active, rather than every block's plugin loaded together).
 * So the file is generated immediately before `wp-env start`, not committed.
 *
 * Only relevant to the wp-env (CI/Docker) path. LocalWP mode doesn't use
 * `.wp-env.json` at all -- see scripts/activate-plugin.mjs.
 *
 * BLOCK SELECTION: --block=<slug> or $BLOCK. With one block configured, it's
 * picked automatically.
 *
 * WordPress version: --wp-version=<x.y> or $WP_VERSION. Omit for wp-env's
 * default (latest).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveBlockConfig } from './lib/block-config.mjs';

function readFlag( name ) {
	return (
		process.argv.find( ( arg ) => arg.startsWith( `--${ name }=` ) )?.slice( name.length + 3 ) ||
		null
	);
}

const config = await resolveBlockConfig();
const { slug, root, pluginSlug } = config;

const wpVersion = readFlag( 'wp-version' ) || process.env.WP_VERSION || null;

const wpEnvConfig = {
	$schema: 'https://schemas.wp.org/trunk/wp-env.json',
	core: wpVersion ? `WordPress/WordPress#${ wpVersion }` : null,
	// Exactly one plugin -- the block under test, and nothing else. Adding a
	// second block's plugin here would silently move this repo away from
	// per-block isolation without anyone deciding to.
	plugins: [ `./.plugin-under-test/${ slug }/${ pluginSlug }` ],
	themes: [ 'WordPress/twentytwentyfive' ],
	config: {
		WP_DEBUG: true,
		WP_DEBUG_LOG: true,
		// PHP warnings must never leak into a REST response body -- one did,
		// during development, and corrupted JSON for every request after it.
		// See tests/support/shared/content.ts for the reproduction.
		WP_DEBUG_DISPLAY: false,
		SCRIPT_DEBUG: false,
	},
	env: {
		tests: {
			port: 8889,
		},
	},
};

const destination = path.join( root, '.wp-env.json' );
await fs.writeFile( destination, JSON.stringify( wpEnvConfig, null, '\t' ) + '\n' );

console.log(
	`[generate-wp-env:${ slug }] Wrote .wp-env.json ` +
		`(plugin: ${ pluginSlug }, core: ${ wpVersion ?? 'latest' })`
);
