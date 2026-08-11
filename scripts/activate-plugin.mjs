#!/usr/bin/env node
/**
 * Activates the plugin under test on the target site.
 *
 * Only needed in LocalWP mode. wp-env activates everything listed in
 * `.wp-env.json` automatically, so CI never calls this.
 *
 * Refuses to activate into a site where a declared conflicting plugin is
 * active, rather than producing a silently meaningless test environment.
 *
 * BLOCK SELECTION: --block=<slug> or $BLOCK. With one block configured, it's
 * picked automatically.
 */

// Side-effect import: populates process.env from .env.
import './load-env.mjs';

import { request } from '@playwright/test';
import { RequestUtils } from '@wordpress/e2e-test-utils-playwright';
import { resolveBlockConfig } from './lib/block-config.mjs';

const baseURL = process.env.WP_BASE_URL || 'http://localhost:8889';

function fail( label, msg ) {
	console.error( `\n[activate-plugin:${ label }] FAILED\n\n${ msg }\n` );
	process.exit( 1 );
}

const config = await resolveBlockConfig();
const { slug, pluginSlug, conflictingBlocks = [] } = config;
const label = slug;

const ctx = await request.newContext( { baseURL, ignoreHTTPSErrors: true } );

const requestUtils = new RequestUtils( ctx, {
	user: {
		username: process.env.WP_USERNAME || 'admin',
		password: process.env.WP_PASSWORD || 'password',
	},
} );

try {
	await requestUtils.setupRest();
} catch ( error ) {
	fail( label, `Could not authenticate at ${ baseURL }.\n\n${ error.message }` );
}

const plugins = await requestUtils.rest( { path: '/wp/v2/plugins' } );

for ( const conflict of conflictingBlocks ) {
	const found = plugins.find(
		( p ) => p.status === 'active' && conflict.pluginMatch.test( p.plugin )
	);
	if ( found ) {
		fail(
			label,
			`${ found.name } is active on this site (${ found.plugin }).\n\n` +
				`It registers "${ conflict.blockName }", which is expected to make the\n` +
				`plugin under test skip its own registration -- activating into this\n` +
				`site would produce a silently useless test environment.\n\n` +
				`Deactivate ${ found.name } first.`
		);
	}
}

const target = plugins.find( ( p ) => p.plugin.includes( pluginSlug ) );
if ( ! target ) {
	fail(
		label,
		`"${ pluginSlug }" is not installed at ${ baseURL }.\n\n` +
			`Unpack a release zip into wp-content/plugins/ first, then re-run.`
	);
}

if ( target.status === 'active' ) {
	console.log( `[activate-plugin:${ label }] Already active: ${ target.name } v${ target.version }` );
} else {
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/plugins/${ target.plugin.replace( /\.php$/, '' ) }`,
		data: { status: 'active' },
	} );
	console.log( `[activate-plugin:${ label }] Activated: ${ target.name } v${ target.version }` );
}

await ctx.dispose();
