/**
 * Table of Contents' own extended `test`.
 *
 * Extends the shared, block-agnostic base (tests/support/shared/test.ts) with
 * this block's page-object fixtures. The spec file imports from HERE, not
 * from shared/test -- that is what keeps a second block's spec from being
 * handed fixtures for a block it has nothing to do with.
 *
 * A new block copies this file into its own support/<block>/ folder, swaps
 * in its own page objects, and that is the entire integration surface.
 */

import { test as base, expect, expectNoBrowserErrors } from '../shared/test';
import { TocEditor } from './TocEditor';
import { TocFrontend } from './TocFrontend';

interface TocFixtures {
	tocEditor: TocEditor;
	tocFrontend: TocFrontend;
}

export const test = base.extend< TocFixtures >( {
	tocEditor: async ( { page, editor }, use ) => {
		await use( new TocEditor( page, editor ) );
	},

	tocFrontend: async ( { page }, use ) => {
		await use( new TocFrontend( page ) );
	},
} );

export { expect, expectNoBrowserErrors };
