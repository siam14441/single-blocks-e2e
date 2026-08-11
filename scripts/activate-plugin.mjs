#!/usr/bin/env node
/**
 * Activates the plugin under test on the target site.
 *
 * Only needed in LocalWP mode. wp-env activates everything listed in
 * `.wp-env.json` automatically, so CI never calls this.
 *
 * Refuses to touch a site where Essential Blocks is active, rather than
 * activating into a configuration whose test results would be meaningless.
 */

// Side-effect import: populates process.env from .env.
import './load-env.mjs';

import { request } from '@playwright/test';
import { RequestUtils } from '@wordpress/e2e-test-utils-playwright';

const PLUGIN_SLUG = 'table-of-contents-block';
const baseURL = process.env.WP_BASE_URL || 'http://localhost:8889';

function fail( msg ) {
	console.error( `\n[activate-plugin] FAILED\n\n${ msg }\n` );
	process.exit( 1 );
}

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
	fail( `Could not authenticate at ${ baseURL }.\n\n${ error.message }` );
}

const plugins = await requestUtils.rest( { path: '/wp/v2/plugins' } );

const eb = plugins.find(
	( p ) => p.status === 'active' && /essential-?blocks/i.test( p.plugin )
);
if ( eb ) {
	fail(
		`Essential Blocks is active on this site (${ eb.plugin }).\n\n` +
			`The standalone plugin skips registration when EB has claimed the\n` +
			`block name, so activating it here would produce a silently useless\n` +
			`test environment. Deactivate Essential Blocks first.`
	);
}

const target = plugins.find( ( p ) => p.plugin.includes( PLUGIN_SLUG ) );
if ( ! target ) {
	fail(
		`"${ PLUGIN_SLUG }" is not installed at ${ baseURL }.\n\n` +
			`Unpack a release zip into wp-content/plugins/ first, then re-run.`
	);
}

if ( target.status === 'active' ) {
	console.log( `[activate-plugin] Already active: ${ target.name } v${ target.version }` );
} else {
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/plugins/${ target.plugin.replace( /\.php$/, '' ) }`,
		data: { status: 'active' },
	} );
	console.log( `[activate-plugin] Activated: ${ target.name } v${ target.version }` );
}

await ctx.dispose();
