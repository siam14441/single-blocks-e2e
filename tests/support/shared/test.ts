/**
 * The extended `test` every spec imports.
 *
 * Wraps @wordpress/e2e-test-utils-playwright's own extended test (which already
 * supplies the `admin`, `editor`, `page` and `requestUtils` fixtures) with the
 * pieces this repo needs on top:
 *
 *   consoleErrors  block-agnostic; catches the JS exceptions that structural
 *                  assertions cannot see
 *   tocEditor      Table of Contents page objects, pre-wired to the right side
 *   tocFrontend    of the editor's iframe boundary
 *
 * Adding a sibling block later means adding its two page objects here and
 * nothing else -- config, setup, reporter and CI are all block-agnostic.
 */

import { test as base, expect } from '@wordpress/e2e-test-utils-playwright';
import { ConsoleErrorCollector } from './console-errors';
import { TocEditor } from '../table-of-contents/TocEditor';
import { TocFrontend } from '../table-of-contents/TocFrontend';

interface Fixtures {
	consoleErrors: ConsoleErrorCollector;
	tocEditor: TocEditor;
	tocFrontend: TocFrontend;
}

export const test = base.extend< Fixtures >( {
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

	tocEditor: async ( { page, editor }, use ) => {
		await use( new TocEditor( page, editor ) );
	},

	tocFrontend: async ( { page }, use ) => {
		await use( new TocFrontend( page ) );
	},
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
