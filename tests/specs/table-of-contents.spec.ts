/**
 * Table Of Contents Block -- Tier 1 regression suite.
 *
 * Organised by user story rather than by code structure, following the
 * convention in Gutenberg core's own test/e2e/specs/editor/blocks/*.spec.js.
 * Each describe() below protects one promise the block makes to somebody.
 *
 * SCOPE: this is deliberately small. It covers the flows whose failure would
 * make a release unshippable, and nothing else. Settings behaviour, sticky
 * mode, FSE placement and third-party heading integrations are Tier 2 -- see
 * the README. A suite people trust beats a suite people learn to ignore.
 *
 * BASELINE: v1.5.0 is a known-good build. Every test here must pass against
 * it. Red on v1.5.0 means the test is wrong, not the plugin.
 */

import { test, expect, expectNoBrowserErrors } from '../support/table-of-contents/test';
import { BLOCK, DEFAULTS, EDITOR, TABS } from '../support/table-of-contents/selectors';
import {
	STANDARD_HEADINGS,
	createFixturePost,
	headingBlock,
	joinBlocks,
	spacerBlock,
	tocBlock,
} from '../support/shared/content';

/**
 * publishPost() is typed as possibly null. A null here means publishing failed,
 * which every subsequent assertion would then report as some unrelated symptom.
 * Fail on the real cause instead.
 */
async function requirePostId( postId: number | null ): Promise< number > {
	expect( postId, 'Publishing the post did not return an id.' ).not.toBeNull();
	return postId as number;
}

test.describe( 'Table Of Contents Block', () => {
	// Posts accumulate across tests and a stale one can make a later frontend
	// assertion pass against the wrong page. Cheaper to reset than to debug.
	test.afterEach( async ( { requestUtils } ) => {
		await requestUtils.deleteAllPosts();
	} );

	/**
	 * The release gate.
	 *
	 * This group exists because of a specific, expensive failure: v1.3.4
	 * shipped with the block silently not registering on WP 6.5+. The editor
	 * bundle threw before registration, `window.EBTOCControls` was never
	 * defined, and the block simply was not in the inserter. Nothing looked
	 * broken -- there was just nothing there. It stayed broken across several
	 * releases and generated "Does not work since WordPress 6.5" reports.
	 *
	 * Tagged @registration so `npm run verify:suite` can run exactly this
	 * group against a known-broken build and confirm it fails.
	 */
	test.describe( 'Block registration @registration', () => {
		test( 'is registered server-side with apiVersion 3', async ( {
			requestUtils,
		} ) => {
			const blockType = await requestUtils.rest( {
				path: `/wp/v2/block-types/${ BLOCK.name }`,
			} );

			expect( blockType.name ).toBe( BLOCK.name );
			// apiVersion 3 is what iframes the editor canvas. A silent drop to 2
			// would not break registration, but would break every editor
			// selector in this file -- so it is worth pinning explicitly.
			expect( blockType.api_version ).toBe( 3 );
		} );

		test( 'exposes the EBTOCControls global in the editor', async ( {
			admin,
			page,
		} ) => {
			await admin.createNewPost();

			// The single clearest signal of the v1.3.4 failure. The editor
			// bundle depends on this global; when the script handle carried no
			// dependencies it was undefined and everything downstream threw.
			const isDefined = await page.evaluate(
				( global ) => typeof ( window as never )[ global ] !== 'undefined',
				BLOCK.controlsGlobal
			);

			expect(
				isDefined,
				`window.${ BLOCK.controlsGlobal } is undefined. The controls bundle ` +
					`did not load, which means the block cannot register.`
			).toBe( true );
		} );

		test( 'appears in the block inserter', async ( { admin, page } ) => {
			await admin.createNewPost();

			// Being registered is not the same as being reachable. In v1.3.4
			// the failure was visible precisely here: an author opened the
			// inserter, searched, and found nothing.
			await page.getByRole( 'button', { name: 'Block Inserter' } ).click();
			await page.getByRole( 'searchbox', { name: /search/i } ).fill( BLOCK.title );

			await expect(
				page.getByRole( 'option', { name: BLOCK.title, exact: true } )
			).toBeVisible();
		} );

		test( 'loads the editor without browser errors', async ( {
			admin,
			consoleErrors,
		} ) => {
			await admin.createNewPost();
			expectNoBrowserErrors( consoleErrors, 'Loading the editor' );
		} );
	} );

	/**
	 * Authoring: can somebody actually put this block in a post and have it
	 * survive a save?
	 *
	 * Block validation is the sharp edge here. A dynamic block whose saved
	 * markup does not round-trip shows "This block contains unexpected or
	 * invalid content" on reload -- the post still renders, so it passes a
	 * casual look, but every author who opens that post sees a warning.
	 */
	test.describe( 'Inserting the block', () => {
		test.beforeEach( async ( { admin } ) => {
			await admin.createNewPost();
		} );

		test( 'renders in the editor canvas without browser errors', async ( {
			tocEditor,
			consoleErrors,
		} ) => {
			await tocEditor.insert();

			await expect( tocEditor.container() ).toBeVisible();
			expectNoBrowserErrors( consoleErrors, 'Inserting the block' );
		} );

		test( 'shows guidance when the post has no headings yet', async ( {
			tocEditor,
		} ) => {
			await tocEditor.insert();

			// An empty TOC is the normal first state -- the block is inserted
			// before the content it summarises exists. Silence here would read
			// as "broken" to an author.
			await expect( tocEditor.container() ).toContainText( EDITOR.emptyState );
		} );

		test( 'stays valid after publish and reload', async ( {
			admin,
			editor,
			page,
			tocEditor,
		} ) => {
			await tocEditor.insert();
			await tocEditor.insertHeading( 'Section one', 2 );

			const postId = await requirePostId( await editor.publishPost() );
			await admin.editPost( postId );

			// Block validation failures surface as a warning notice on the
			// block, not as an error -- easy to miss by eye, trivial to assert.
			await expect(
				editor.canvas.getByText( 'unexpected or invalid content' )
			).toHaveCount( 0 );

			await expect(
				page.getByText( 'unexpected or invalid content' )
			).toHaveCount( 0 );

			await expect( tocEditor.container() ).toBeVisible();
		} );

		test( 'preserves the default title across a reload', async ( {
			admin,
			editor,
			tocEditor,
		} ) => {
			await tocEditor.insert();

			const postId = await requirePostId( await editor.publishPost() );
			await admin.editPost( postId );

			// Attributes not surviving a round-trip is the other half of the
			// validation story: the block can stay "valid" while losing state.
			await expect( tocEditor.container() ).toContainText( DEFAULTS.title );
		} );
	} );

	/**
	 * The settings sidebar.
	 *
	 * Three tabs -- General, Style, Advanced -- each owning a distinct set of
	 * controls. If a tab stops rendering, every setting under it becomes
	 * unreachable while the block itself still looks fine on the page. That is
	 * a silent, total loss of configurability, so it is worth its own group.
	 *
	 * Note TabPanel unmounts inactive panels rather than hiding them, so
	 * "switched tabs" is assertable as presence/absence.
	 */
	test.describe( 'Inspector tabs', () => {
		test.beforeEach( async ( { admin, tocEditor } ) => {
			await admin.createNewPost();
			await tocEditor.insert();
			await tocEditor.openInspector();
		} );

		test( 'shows all three tabs with their expected labels', async ( {
			tocEditor,
		} ) => {
			for ( const tab of TABS ) {
				// By class -- identity survives a label change.
				await expect(
					tocEditor.tabButton( tab.label ),
					`Tab button "${ tab.button }" is missing from the inspector.`
				).toBeVisible();

				// By role and accessible name -- proves it is reachable by
				// assistive technology, not just by CSS.
				await expect( tocEditor.tabByRole( tab.label ) ).toBeVisible();
			}

			// Exactly three, so a fourth appearing (or one duplicating) fails.
			await expect( tocEditor.inspector().getByRole( 'tab' ) ).toHaveCount(
				TABS.length
			);
		} );

		test( 'opens each tab and swaps in its own panel content', async ( {
			tocEditor,
		} ) => {
			for ( const tab of TABS ) {
				await tocEditor.openTab( tab.label );

				await expect( tocEditor.tabByRole( tab.label ) ).toHaveAttribute(
					'aria-selected',
					'true'
				);

				// The active tab's panel is mounted...
				await expect(
					tocEditor.tabPanel( tab.label ),
					`Panel "${ tab.panel }" did not mount after clicking "${ tab.label }".`
				).toBeVisible();

				// ...and every other tab's panel is gone from the DOM entirely.
				for ( const other of TABS.filter( ( t ) => t.id !== tab.id ) ) {
					await expect(
						tocEditor.tabPanel( other.label ),
						`Panel for "${ other.label }" is still mounted while ` +
							`"${ tab.label }" is active.`
					).toHaveCount( 0 );
				}
			}
		} );

		test( 'shows the settings that belong to each tab', async ( {
			tocEditor,
		} ) => {
			// Asserting a tab exists is not enough -- an empty tab would pass
			// that. Each tab is checked for a panel only IT has, which proves
			// the click swapped real content.
			for ( const tab of TABS ) {
				await tocEditor.openTab( tab.label );

				await expect(
					tocEditor.panel( tab.signaturePanel ),
					`Expected the "${ tab.signaturePanel }" panel under the ` +
						`"${ tab.label }" tab.`
				).toBeVisible();
			}
		} );

		test( 'switches between tabs without browser errors', async ( {
			tocEditor,
			consoleErrors,
		} ) => {
			// Scoped to the switching itself -- editor load noise is already
			// covered by its own test and would muddy this one.
			consoleErrors.clear();

			for ( const tab of TABS ) {
				await tocEditor.openTab( tab.label );
			}
			await tocEditor.openTab( 'General' );

			expectNoBrowserErrors( consoleErrors, 'Switching inspector tabs' );
		} );
	} );

	/**
	 * The block's actual job: notice the post's headings and list them.
	 *
	 * Detection is automatic and continuous -- the editor re-parses the whole
	 * post content on every change, with no "refresh" button. So the test is
	 * that the list is simply correct after typing, with no user action at all.
	 */
	test.describe( 'Heading detection', () => {
		test.beforeEach( async ( { admin } ) => {
			await admin.createNewPost();
		} );

		/**
		 * AUTHORING ORDER MATTERS -- headings are written first, then the block
		 * is inserted.
		 *
		 * This is not arbitrary. Inserting the block first and then typing
		 * headings triggers a real defect in v1.5.0 (documented by the
		 * `test.fail` case at the end of this group) where the first heading is
		 * silently excluded. Using the working order here keeps these tests
		 * about detection itself, so a future regression in nesting or ordering
		 * is not masked by a bug we already know about.
		 */
		async function writeHeadingsThenInsertBlock(
			tocEditor: { insertHeading: ( c: string, l: number ) => Promise< void >; insert: () => Promise< void > },
			headings: ReadonlyArray< { content: string; level: number } >
		) {
			for ( const heading of headings ) {
				await tocEditor.insertHeading( heading.content, heading.level );
			}
			await tocEditor.insert();
		}

		test( 'lists every heading, in document order, with no user action', async ( {
			tocEditor,
		} ) => {
			await writeHeadingsThenInsertBlock( tocEditor, STANDARD_HEADINGS );

			// No refresh button exists and none should be needed -- the block
			// re-reads the post content on every change.
			await expect( tocEditor.links() ).toHaveText(
				STANDARD_HEADINGS.map( ( h ) => h.content )
			);
		} );

		test( 'nests subsections inside their parent section', async ( {
			tocEditor,
		} ) => {
			await writeHeadingsThenInsertBlock( tocEditor, STANDARD_HEADINGS );

			// Looking INSIDE the parent <li> is what distinguishes real nesting
			// from a flat list that merely happens to be in the right order.
			await expect(
				tocEditor.nestedLinkUnder( 'Getting started', 'Installation' ),
				'"Installation" (H3) should be nested inside "Getting started" (H2).'
			).toBeVisible();

			await expect(
				tocEditor.nestedLinkUnder( 'Getting started', 'Configuration' )
			).toBeVisible();

			// "Troubleshooting" is a sibling H2, so it must NOT be nested.
			await expect(
				tocEditor.nestedLinkUnder( 'Getting started', 'Troubleshooting' )
			).toHaveCount( 0 );
		} );

		/**
		 * KNOWN DEFECT in v1.5.0 -- expected to fail.
		 *
		 * An empty heading block between two real ones becomes a real entry in
		 * the table of contents: a list item containing an empty link.
		 *
		 * Reproduced on v1.5.0, WP 7.0.3, with H2 "First section", an empty H2,
		 * and H2 "Second section":
		 *
		 *   editor   <li><a href="#"></a></li>
		 *   frontend <li><a href="#eb-table-content-1"></a></li>
		 *
		 * Two problems, one of them serious. The visible one is an empty bullet
		 * in the list. The serious one is that the frontend href points at
		 * `#eb-table-content-1`, an id that exists nowhere on the page -- so it
		 * is a genuinely broken link, confirmed by the same brokenLinks() check
		 * used in the "Reading and navigating" group. The editor and frontend
		 * also disagree on the href, which is its own parity problem.
		 *
		 * Empty headings are an ordinary transient state while writing: press
		 * Enter after a heading and you have one.
		 *
		 * NOTE: the manual QA report for PR #20 records this scenario as
		 * passing ("Blank h2 between two real h2 -> 2 entries, no {} junk").
		 * That check looked at the saved attributes, where the junk `{}` entry
		 * is indeed gone. The rendered list was not checked, and that is where
		 * the defect survives -- a good illustration of why this is automated.
		 */
		test.fail(
			'skips an empty heading without leaving a blank entry',
			async ( { tocEditor } ) => {
				await writeHeadingsThenInsertBlock( tocEditor, [
					{ content: 'First section', level: 2 },
					{ content: '', level: 2 },
					{ content: 'Second section', level: 2 },
				] );

				await expect( tocEditor.links() ).toHaveText( [
					'First section',
					'Second section',
				] );
			}
		);

		/**
		 * KNOWN DEFECT in v1.5.0 -- expected to fail.
		 *
		 * Insert the block into a post, then start writing. The FIRST heading
		 * added afterwards is silently written into `deleteHeaderList` with
		 * `isDelete: true`, i.e. marked as excluded via the "Exclude Headings"
		 * panel, without the author ever touching that panel. Once a second
		 * heading exists, the first disappears from the list.
		 *
		 * Reproduced on v1.5.0, WP 7.0.3:
		 *   insert block -> add H2 "Introduction" -> add H2 "Setup" -> add H2 "Usage"
		 *   editor TOC:   [ "Setup", "Usage" ]
		 *   published TOC: [ "Setup", "Usage" ]     <- readers see it too
		 *   page headings: [ "Introduction", "Setup", "Usage" ]
		 *
		 * Only the first heading is affected; later ones get isDelete: false.
		 * Authoring in the other order (headings first, then the block) is
		 * unaffected, which is why the tests above use that order.
		 *
		 * Severity: a section silently missing from the published table of
		 * contents, in a completely ordinary authoring order, with no feedback
		 * to the author.
		 *
		 * test.fail() rather than a skip on purpose: this asserts the CORRECT
		 * behaviour, so the day the plugin is fixed this test starts passing
		 * and Playwright reports it as an unexpected pass. The suite tells us
		 * the bug is gone instead of quietly continuing to skip it.
		 */
		test.fail(
			'lists the first heading added after the block is inserted',
			async ( { tocEditor, page } ) => {
				await tocEditor.insert();

				for ( const title of [ 'Introduction', 'Setup', 'Usage' ] ) {
					await tocEditor.insertHeading( title, 2 );
					// The block recomputes on a debounce; without a beat between
					// insertions the defect does not reproduce consistently.
					await page.waitForTimeout( 700 );
				}

				await expect( tocEditor.links() ).toHaveText( [
					'Introduction',
					'Setup',
					'Usage',
				] );
			}
		);
	} );

	/**
	 * The reader's experience on the published page.
	 *
	 * Everything above happens in the editor. This group is what a visitor
	 * actually gets -- and the frontend is rendered by PHP independently of the
	 * editor's React component, so passing in the editor guarantees nothing
	 * here.
	 */
	test.describe( 'Reading and navigating', () => {
		test( 'renders the table of contents with all entries', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'TOC frontend rendering',
				content: joinBlocks(
					tocBlock(),
					...STANDARD_HEADINGS.map( headingBlock )
				),
			} );

			await page.goto( `/?p=${ post.id }` );

			await expect( tocFrontend.container() ).toBeVisible();
			await expect( tocFrontend.links() ).toHaveText(
				STANDARD_HEADINGS.map( ( h ) => h.content )
			);
		} );

		test( 'every entry links to a section that exists on the page', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'TOC link resolution',
				content: joinBlocks(
					tocBlock(),
					...STANDARD_HEADINGS.map( headingBlock )
				),
			} );

			await page.goto( `/?p=${ post.id }` );
			await expect( tocFrontend.links() ).toHaveCount( STANDARD_HEADINGS.length );

			// The core promise. Anchors are injected at runtime and matched by
			// normalised heading TEXT, not by any id in the saved markup -- so
			// a link can break without the post content looking wrong at all.
			const broken = await tocFrontend.brokenLinks();

			expect(
				broken,
				`Table of contents entries point at sections that do not exist:\n` +
					broken.map( ( b ) => `  "${ b.text }" -> ${ b.href }` ).join( '\n' )
			).toEqual( [] );
		} );

		test( 'clicking an entry brings its section into view', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'TOC scroll navigation',
				content: joinBlocks(
					tocBlock(),
					// Push the target well below the fold, so a passing test
					// means the reader actually moved -- not merely that the
					// URL hash changed while the section was already visible.
					spacerBlock( 1500 ),
					headingBlock( { content: 'Destination section', level: 2 } )
				),
			} );

			await page.goto( `/?p=${ post.id }` );

			const target = page.locator( 'h2', { hasText: 'Destination section' } );
			await expect( target ).not.toBeInViewport();

			await tocFrontend.links().filter( { hasText: 'Destination section' } ).click();

			await expect( target ).toBeInViewport();
		} );

		test( 'a page with no headings loads without browser errors', async ( {
			requestUtils,
			page,
			consoleErrors,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'TOC with no headings',
				content: joinBlocks(
					tocBlock(),
					'<!-- wp:paragraph --><p>No headings here.</p><!-- /wp:paragraph -->'
				),
			} );

			await page.goto( `/?p=${ post.id }` );
			await page.waitForLoadState( 'domcontentloaded' );

			// Regression: the frontend script used to call getAttribute on a
			// container it had not found, throwing and killing all of the
			// block's frontend behaviour on any page with an empty TOC.
			expectNoBrowserErrors( consoleErrors, 'Loading a page with no headings' );
		} );

		test( 'fits a 375px mobile viewport without sideways scrolling', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'TOC mobile layout',
				content: joinBlocks(
					tocBlock(),
					...STANDARD_HEADINGS.map( headingBlock )
				),
			} );

			await page.setViewportSize( { width: 375, height: 800 } );
			await page.goto( `/?p=${ post.id }` );

			await expect( tocFrontend.container() ).toBeVisible();

			// Structural stand-in for a visual check: cheap, stable, and it
			// catches the gross CSS failures (fixed widths, overflowing text)
			// that a screenshot baseline would flag -- without the flakiness.
			expect(
				await tocFrontend.hasHorizontalOverflow(),
				'The page scrolls horizontally at 375px wide.'
			).toBe( false );
		} );
	} );
} );
