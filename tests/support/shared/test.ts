/**
 * The block-agnostic base every block's own `support/<block>/test.ts` extends.
 *
 * This file must never import a block's page objects. It used to -- import
 * TocEditor/TocFrontend directly, which meant every spec file in the repo got
 * Table of Contents fixtures whether it needed them or not, and a second
 * block's spec would have been stuck with the wrong ones. Now this exports
 * only what's true of every block:
 *
 *   consoleErrors  catches the JS exceptions that structural assertions can't
 *
 * A block adds its own page-object fixtures by extending `test` again in its
 * own support folder -- see tests/support/table-of-contents/test.ts for the
 * pattern every new block copies.
 */

import { test as base, expect } from '@wordpress/e2e-test-utils-playwright';
import { ConsoleErrorCollector } from './console-errors';

interface SharedFixtures {
	consoleErrors: ConsoleErrorCollector;
}

export const test = base.extend< SharedFixtures >( {
	/**
	 * `auto: true` so listeners attach before any navigation. A collector
	 * created lazily on first use would miss errors thrown during the page
	 * load that preceded it -- which is exactly when the interesting ones fire.
	 */
	consoleErrors: [
		async ( { page }, use ) => {
			await use( new ConsoleErrorCollector( page ) );
		},
		{ auto: true },
	],
} );

export { expect };

/**
 * Asserts no browser errors were captured, with the captured text inlined.
 *
 * Lives here rather than in the collector so the collector stays free of any
 * test-framework dependency, and so `context` can name the action under test:
 * "Inserting the block produced browser errors" is diagnosable at a glance,
 * where a bare console dump is not.
 */
export function expectNoBrowserErrors(
	consoleErrors: ConsoleErrorCollector,
	context: string
) {
	const report = consoleErrors.report();
	expect(
		report,
		`${ context } produced browser errors:\n${ report ?? '' }`
	).toBeNull();
}
