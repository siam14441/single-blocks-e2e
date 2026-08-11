/**
 * Runs once before the whole suite.
 *
 * Two jobs:
 *   1. Authenticate as admin and persist the session to disk, so individual
 *      tests never pay the cost of logging in through the UI.
 *   2. Reset the site to a known-empty state, so a leftover post from a
 *      previous run cannot make a test pass (or fail) for the wrong reason.
 *
 * Mirrors Gutenberg's own `test/e2e/config/global-setup.ts`.
 */

import { request } from '@playwright/test';
import type { FullConfig } from '@playwright/test';
import { RequestUtils } from '@wordpress/e2e-test-utils-playwright';

async function globalSetup( config: FullConfig ) {
	const { storageState, baseURL } = config.projects[ 0 ].use;
	const storageStatePath =
		typeof storageState === 'string' ? storageState : undefined;

	const requestContext = await request.newContext( { baseURL } );

	const requestUtils = new RequestUtils( requestContext, {
		storageStatePath,
		user: {
			username: process.env.WP_USERNAME || 'admin',
			password: process.env.WP_PASSWORD || 'password',
		},
	} );

	try {
		// Logs in and writes the cookie jar to STORAGE_STATE_PATH.
		await requestUtils.setupRest();
	} catch ( error ) {
		/**
		 * Auth failure is the single most common setup mistake (empty .env,
		 * wrong site URL, site not running). The raw error is a bare 401 that
		 * tells the reader nothing, so replace it with something actionable.
		 */
		throw new Error(
			[
				`Could not authenticate against ${ baseURL }.`,
				'',
				'Check that:',
				`  - the site is running and reachable at ${ baseURL }`,
				'  - WP_USERNAME and WP_PASSWORD in .env are a valid admin account',
				'  - for wp-env, the environment is started (npm run env:start)',
				'',
				`Original error: ${ ( error as Error ).message }`,
			].join( '\n' )
		);
	}

	// Clean slate. Each of these is independent, so run them concurrently.
	await Promise.all( [
		requestUtils.deleteAllPosts(),
		requestUtils.deleteAllPages(),
		requestUtils.resetPreferences(),
	] );

	await requestContext.dispose();
}

export default globalSetup;
