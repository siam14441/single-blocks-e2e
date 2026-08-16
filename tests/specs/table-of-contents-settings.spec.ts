/**
 * Table Of Contents Block -- Tier 2 regression suite: settings behaviour.
 *
 * Tier 1 (table-of-contents.spec.ts) proves the block registers, inserts,
 * detects headings and renders on the frontend. This file proves the General
 * tab's settings actually do what they claim, in the editor AND on a
 * published page -- see the README's "Not covered yet" list, which this
 * file closes out: list style, presets, collapsible, sticky, copy-link,
 * scroll-to-top, plus item-collapse, title display and smooth-scroll/offset.
 *
 * COVERAGE STRATEGY: one inspector-driven (UI) test per setting proves the
 * control renders and writes the right attribute. Every value/behaviour
 * combination after that is driven by attributes directly -- either via a
 * REST-created fixture post (tocBlock()'s attributes argument) or, where the
 * frontend needs per-post generated CSS that only the editor produces (the
 * sticky position:fixed test), via TocEditor.setAttributes(). Testing every
 * combination through real clicks would multiply run time for no extra
 * confidence once the control-to-attribute link is proven once.
 *
 * SIX NEW DEFECTS (D3-D8), continuing the D1/D2 numbering in the README.
 * Each was reproduced LIVE in a real browser against the shipped v1.5.0
 * build (not just inferred from reading minified JS) before being encoded
 * here -- see KNOWN_BUGS in selectors.ts for the exact confirmed error text.
 * Each is asserted as CORRECT behaviour and marked test.fail(), so the suite
 * stays green and reports an unexpected pass the day one is fixed.
 *
 * AUTHORING ORDER: every editor-driven test below writes headings BEFORE
 * inserting the block, for the same reason Tier 1 does -- inserting the
 * block first and typing headings afterward trips the D1 defect (first
 * heading silently excluded), which would masquerade as a Tier 2 failure.
 *
 * CLIPBOARD: navigator.clipboard is unavailable on this suite's test sites --
 * confirmed live, window.isSecureContext is false on plain http://, and
 * wp-env's CI default (http://localhost:8889) is equally insecure. Copy-link
 * tests instrument document.execCommand instead (TocFrontend.
 * instrumentCopyAttempts()), which is what ClipboardJS itself falls back to
 * for exactly this reason.
 */

import { test, expect, expectNoBrowserErrors } from '../support/table-of-contents/test';
import {
	CONTAINER_CLASS,
	DEFAULTS,
	FRONTEND,
	KNOWN_BUGS,
	SETTINGS,
	STATE_CLASS,
	VALUES,
} from '../support/table-of-contents/selectors';
import type { TocEditor } from '../support/table-of-contents/TocEditor';
import type { TocFrontend } from '../support/table-of-contents/TocFrontend';
import {
	STANDARD_HEADINGS,
	createFixturePost,
	headingBlock,
	joinBlocks,
	paragraphBlock,
	spacerBlock,
	tocBlock,
} from '../support/shared/content';

/** Same guard as Tier 1 -- a null post id here would make every subsequent
 *  assertion report an unrelated symptom instead of the real cause. */
async function requirePostId( postId: number | null ): Promise< number > {
	expect( postId, 'Publishing the post did not return an id.' ).not.toBeNull();
	return postId as number;
}

/**
 * Authoring order matters -- see the file docblock. Duplicated from Tier 1
 * rather than shared, matching that file's own choice to keep it local.
 */
async function writeHeadingsThenInsertBlock(
	tocEditor: TocEditor,
	headings: ReadonlyArray< { content: string; level: number } >
) {
	for ( const heading of headings ) {
		await tocEditor.insertHeading( heading.content, heading.level );
	}
	await tocEditor.insert();
}

/** Resolves a heading's TEXT to the fragment slug the frontend actually
 *  assigned it, by reading it back off the rendered link -- avoids
 *  hardcoding a slug computed by logic this file isn't testing. */
async function slugFor( tocFrontend: TocFrontend, text: string ): Promise< string > {
	const texts = await tocFrontend.linkTexts();
	const hrefs = await tocFrontend.linkHrefs();
	const index = texts.indexOf( text );
	expect( index, `"${ text }" is not among the rendered entries.` ).toBeGreaterThanOrEqual( 0 );
	return hrefs[ index ].replace( /^#/, '' );
}

/** Two plain ASCII H2s -- used wherever a test needs *a* heading but not
 *  STANDARD_HEADINGS' nesting. */
const TWO_HEADINGS = [
	{ content: 'First section', level: 2 },
	{ content: 'Second section', level: 2 },
];

test.describe( 'Table Of Contents Block', () => {
	test.afterEach( async ( { requestUtils } ) => {
		await requestUtils.deleteAllPosts();
	} );

	/**
	 * List style: the TAG (`listStyle`) and whether markers show
	 * (`enableListStyle`) are independent attributes -- easy to conflate.
	 */
	test.describe( 'Settings: list style', () => {
		test( 'defaults to an unordered list with markers suppressed', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'List style defaults',
				content: joinBlocks( tocBlock(), ...STANDARD_HEADINGS.map( headingBlock ) ),
			} );
			await page.goto( `/?p=${ post.id }` );

			expect( await tocFrontend.listTagName() ).toBe( 'UL' );
			expect( await tocFrontend.containerClassList() ).toContain(
				CONTAINER_CLASS.listStyleNone
			);
			await expect( tocFrontend.list() ).toHaveCSS( 'list-style-type', 'none' );
		} );

		test( 'listStyle "ol" plus Enable List Style renders an ordered list with visible markers', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Ordered list style',
				content: joinBlocks(
					tocBlock( { listStyle: 'ol', enableListStyle: true } ),
					...STANDARD_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			expect( await tocFrontend.listTagName() ).toBe( 'OL' );
			expect( await tocFrontend.containerClassList() ).not.toContain(
				CONTAINER_CLASS.listStyleNone
			);
			await expect( tocFrontend.list() ).toHaveCSS( 'list-style-type', 'decimal' );
			// Nesting is level-skipping (H2/H3/H3/H4/H2) -- confirms the tag
			// choice applies at every depth, not just the outermost list.
			await expect( tocFrontend.list().locator( 'ol' ).first() ).toHaveCount( 1 );
		} );

		test( 'Enable List Style off keeps the configured tag but suppresses markers', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Ordered tag without markers',
				content: joinBlocks(
					tocBlock( { listStyle: 'ol', enableListStyle: false } ),
					...TWO_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			// The tag is still "ol" -- listStyle drives the tag independently
			// of whether enableListStyle shows its markers.
			expect( await tocFrontend.listTagName() ).toBe( 'OL' );
			expect( await tocFrontend.containerClassList() ).toContain(
				CONTAINER_CLASS.listStyleNone
			);
			const firstEntry = tocFrontend.entry( 'First section' );
			expect( await tocFrontend.beforeStyle( firstEntry, 'content' ) ).toBe( 'none' );
		} );

		test( 'the editor preview and the published page render the same list tag', async ( {
			admin,
			editor,
			tocEditor,
			tocFrontend,
			page,
		} ) => {
			await admin.createNewPost();
			await writeHeadingsThenInsertBlock( tocEditor, TWO_HEADINGS );
			await tocEditor.setAttributes( { listStyle: 'ol', enableListStyle: true } );

			expect( await tocEditor.listTagName() ).toBe( 'OL' );

			const postId = await requirePostId( await editor.publishPost() );
			await page.goto( `/?p=${ postId }` );

			expect( await tocFrontend.listTagName() ).toBe( 'OL' );
		} );

		test( 'shows the List Style control only after Enable List Style is on, and writes listStyle', async ( {
			admin,
			tocEditor,
		} ) => {
			await admin.createNewPost();
			await writeHeadingsThenInsertBlock( tocEditor, TWO_HEADINGS );
			await tocEditor.openInspector();

			await expect(
				tocEditor.selectControl( SETTINGS.contentSettings.listStyle )
			).toHaveCount( 0 );

			await tocEditor.setToggle( SETTINGS.contentSettings.enableListStyle, true );
			const select = tocEditor.selectControl( SETTINGS.contentSettings.listStyle );
			await expect( select ).toBeVisible();

			await select.selectOption( { label: 'Ordered' } );
			expect( ( await tocEditor.attributes() ).listStyle ).toBe( VALUES.listStyle.ordered );
		} );

		// KNOWN DEFECT D3 -- see KNOWN_BUGS in selectors.ts for the confirmed
		// error. Reproduced live: clicking "Ordered" writes `listType`, which
		// nothing reads; the rendered tag never changes from <ul>.
		test.fail(
			"the toolbar's Ordered button changes the rendered list tag",
			async ( { admin, tocEditor, page } ) => {
				await writeHeadingsThenInsertBlock( tocEditor, TWO_HEADINGS );
				await tocEditor.block().click();

				expect( await tocEditor.listTagName() ).toBe( 'UL' );
				await page.getByRole( 'button', { name: 'Ordered', exact: true } ).click();

				expect( await tocEditor.listTagName() ).toBe( 'OL' );
			}
		);
	} );

	/**
	 * Presets bundle a set of style attributes under one name. Style 2's
	 * defining visual feature -- a vertical guide line on nested entries --
	 * is what distinguishes "the preset applied" from "the class changed".
	 */
	test.describe( 'Settings: presets', () => {
		test( 'defaults to Style 1, in the editor and on the page', async ( {
			admin,
			tocEditor,
			tocFrontend,
			requestUtils,
			page,
		} ) => {
			await admin.createNewPost();
			await writeHeadingsThenInsertBlock( tocEditor, TWO_HEADINGS );
			expect( await tocEditor.containerClassList() ).toContain( VALUES.preset.style1 );

			const post = await createFixturePost( requestUtils, {
				title: 'Preset defaults',
				content: joinBlocks( tocBlock(), ...TWO_HEADINGS.map( headingBlock ) ),
			} );
			await page.goto( `/?p=${ post.id }` );
			expect( await tocFrontend.containerClassList() ).toContain( VALUES.preset.style1 );
		} );

		test( 'Style 2 replaces Style 1 rather than adding to it', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Style 2 preset',
				content: joinBlocks(
					tocBlock( { preset: VALUES.preset.style2 } ),
					...TWO_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			const classes = await tocFrontend.containerClassList();
			expect( classes ).toContain( VALUES.preset.style2 );
			expect( classes ).not.toContain( VALUES.preset.style1 );
		} );

		test( 'Style 2 draws a guide line on nested entries that Style 1 does not', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const style1 = await createFixturePost( requestUtils, {
				title: 'Style 1 nested guide line',
				content: joinBlocks( tocBlock(), ...STANDARD_HEADINGS.map( headingBlock ) ),
			} );
			await page.goto( `/?p=${ style1.id }` );
			const nestedStyle1 = tocFrontend.entry( 'Installation' );
			expect( await tocFrontend.beforeStyle( nestedStyle1, 'background-color' ) ).not.toBe(
				'rgb(213, 219, 228)'
			);

			const style2 = await createFixturePost( requestUtils, {
				title: 'Style 2 nested guide line',
				content: joinBlocks(
					tocBlock( { preset: VALUES.preset.style2 } ),
					...STANDARD_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ style2.id }` );
			const nestedStyle2 = tocFrontend.entry( 'Installation' );
			expect( await tocFrontend.beforeStyle( nestedStyle2, 'background-color' ) ).toBe(
				'rgb(213, 219, 228)'
			);
		} );

		test( 'choosing a preset rewrites its companion style attributes', async ( {
			admin,
			tocEditor,
		} ) => {
			await admin.createNewPost();
			await writeHeadingsThenInsertBlock( tocEditor, TWO_HEADINGS );
			await tocEditor.openInspector();

			// NOT A TYPO -- source spells this attribute "seperator".
			const select = tocEditor.selectControl( SETTINGS.contentSettings.preset );
			await select.selectOption( { label: 'Style 2' } );
			expect( ( await tocEditor.attributes() ).seperator ).toBe( true );

			await select.selectOption( { label: 'Style 1' } );
			expect( ( await tocEditor.attributes() ).seperator ).toBe( false );
		} );
	} );

	/**
	 * Collapsible governs whether clicking the title hides the list. It only
	 * applies when the block is not sticky -- sticky uses the close/reopen
	 * button instead, covered in its own group below.
	 */
	test.describe( 'Settings: collapsible', () => {
		test( 'is not collapsible by default -- clicking the title does nothing', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Not collapsible by default',
				content: joinBlocks( tocBlock(), ...TWO_HEADINGS.map( headingBlock ) ),
			} );
			await page.goto( `/?p=${ post.id }` );

			expect( await tocFrontend.containerClassList() ).toContain(
				CONTAINER_CLASS.notCollapsible
			);
			await tocFrontend.title().click();
			await expect( tocFrontend.list() ).toBeVisible();
		} );

		test( 'starts open; clicking the title hides the list, clicking again restores it', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Collapsible toggle',
				content: joinBlocks(
					tocBlock( { collapsible: true } ),
					...TWO_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			await expect( tocFrontend.listWrapper() ).not.toHaveClass(
				new RegExp( STATE_CLASS.hideContent )
			);
			await tocFrontend.title().click();
			await expect( tocFrontend.listWrapper() ).toHaveClass(
				new RegExp( STATE_CLASS.hideContent )
			);
			await tocFrontend.title().click();
			await expect( tocFrontend.listWrapper() ).not.toHaveClass(
				new RegExp( STATE_CLASS.hideContent )
			);
		} );

		test( 'Collapsed initially starts closed and opens on click', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Collapsed initially',
				content: joinBlocks(
					tocBlock( { collapsible: true, initialCollapse: true } ),
					...TWO_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			await expect( tocFrontend.listWrapper() ).toHaveClass(
				new RegExp( STATE_CLASS.hideContent )
			);
			await tocFrontend.title().click();
			await expect( tocFrontend.listWrapper() ).not.toHaveClass(
				new RegExp( STATE_CLASS.hideContent )
			);
		} );

		// KNOWN DEFECT D4. Reproduced live: `ReferenceError: setVisible is
		// not defined` at the title's own onClick.
		test.fail(
			'clicking the title in the editor with Collapsible on produces no browser errors',
			async ( { admin, tocEditor, consoleErrors } ) => {
				await admin.createNewPost();
				await writeHeadingsThenInsertBlock( tocEditor, TWO_HEADINGS );
				await tocEditor.setAttributes( { collapsible: true } );

				consoleErrors.clear();
				await tocEditor.title().click();

				expectNoBrowserErrors( consoleErrors, 'Clicking the collapsible title' );
			}
		);

		// KNOWN DEFECT D5 -- the highest-impact of the six. Reproduced live:
		// Collapsible on + Display Title off throws `TypeError: Cannot read
		// properties of null (reading 'addEventListener')` in
		// _toggleCollapse(), which aborts init() before _scrollToTop, _hide,
		// _show, _hideOnDevice, _tooltip and _itemCollapsed ever run --
		// confirmed live that the scroll-to-top button never appears and the
		// copy-link icon stays permanently display:none. Reachable because
		// the Collapsible toggle itself vanishes from the inspector once
		// Display Title is off (gated on displayTitle && !isSticky), so an
		// author can reach this combination without ever seeing a warning.
		test.fail(
			'Collapsible with Display Title off does not break the rest of the frontend script',
			async ( { admin, editor, tocEditor, page, consoleErrors } ) => {
				await admin.createNewPost();
				await writeHeadingsThenInsertBlock( tocEditor, TWO_HEADINGS );
				await tocEditor.setAttributes( { collapsible: true, displayTitle: false } );

				const postId = await requirePostId( await editor.publishPost() );
				consoleErrors.clear();
				await page.goto( `/?p=${ postId }` );

				expectNoBrowserErrors(
					consoleErrors,
					'Loading a page with Collapsible on and Display Title off'
				);
			}
		);
	} );

	/**
	 * Sticky pins the block and swaps the title-click interaction for an
	 * explicit close/reopen button pair.
	 */
	test.describe( 'Settings: sticky', () => {
		test( 'renders no sticky chrome when off', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Not sticky',
				content: joinBlocks( tocBlock(), ...TWO_HEADINGS.map( headingBlock ) ),
			} );
			await page.goto( `/?p=${ post.id }` );

			expect( await tocFrontend.containerClassList() ).toContain( CONTAINER_CLASS.notSticky );
			await expect( tocFrontend.closeButton() ).toHaveCount( 0 );
			await expect( tocFrontend.reopenButton() ).toHaveCount( 0 );
		} );

		test( 'renders the close button visible and the reopen button hidden', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Sticky chrome',
				content: joinBlocks(
					tocBlock( { isSticky: true } ),
					...TWO_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			expect( await tocFrontend.containerClassList() ).toContain( CONTAINER_CLASS.sticky );
			await expect( tocFrontend.closeButton() ).toBeVisible();
			await expect( tocFrontend.reopenButton() ).toBeHidden();
		} );

		test( 'clicking close hides the list and reveals the reopen button', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Sticky close',
				content: joinBlocks(
					tocBlock( { isSticky: true } ),
					...TWO_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			await tocFrontend.closeButton().click();

			expect( await tocFrontend.containerClassList() ).toContain(
				STATE_CLASS.contentHidden
			);
			await expect( tocFrontend.listWrapper() ).toBeHidden();
			await expect( tocFrontend.reopenButton() ).toBeVisible();
		} );

		test( 'clicking reopen restores the list and hides the button again', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Sticky reopen',
				content: joinBlocks(
					tocBlock( { isSticky: true } ),
					...TWO_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			await tocFrontend.closeButton().click();
			await expect( tocFrontend.reopenButton() ).toBeVisible();

			await tocFrontend.reopenButton().click();

			expect( await tocFrontend.containerClassList() ).toContain(
				STATE_CLASS.contentVisible
			);
			await expect( tocFrontend.listWrapper() ).toBeVisible();
			await expect( tocFrontend.reopenButton() ).toBeHidden();
		} );

		test( 'stickyPosition "right" positions both the container and the close button', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Sticky position right',
				content: joinBlocks(
					tocBlock( { isSticky: true, stickyPosition: VALUES.stickyPosition.right } ),
					...TWO_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			expect( await tocFrontend.containerClassList() ).toContain(
				CONTAINER_CLASS.stickyRight
			);
			await expect( tocFrontend.closeButton() ).toHaveClass(
				new RegExp( CONTAINER_CLASS.stickyRight )
			);
		} );

		test( 'sticky with Collapsed initially starts closed, showing only the reopen button', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Sticky collapsed initially',
				content: joinBlocks(
					tocBlock( { isSticky: true, collapsible: true, initialCollapse: true } ),
					...TWO_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			await expect( tocFrontend.closeButton() ).toBeHidden();
			await expect( tocFrontend.list() ).toBeHidden();
			await expect( tocFrontend.reopenButton() ).toBeVisible();
		} );

		/**
		 * Sticky positioning is `position: fixed`, applied by CSS generated
		 * from the `blockMeta` attribute -- which only the EDITOR writes
		 * (see EbStyleHandler in the plugin's style-handler lib). A REST
		 * fixture post has no blockMeta and therefore no generated
		 * stylesheet, so a REST-built sticky block would pass this check
		 * vacuously (no position:fixed rule to apply, and none expected).
		 * This test must go through the editor and a real publish.
		 */
		test( 'is pinned with position:fixed once published', async ( {
			admin,
			editor,
			tocEditor,
			tocFrontend,
			page,
		} ) => {
			await admin.createNewPost();
			await writeHeadingsThenInsertBlock( tocEditor, TWO_HEADINGS );
			await tocEditor.setAttributes( {
				isSticky: true,
				stickyPosition: VALUES.stickyPosition.right,
			} );

			const postId = await requirePostId( await editor.publishPost() );
			await page.goto( `/?p=${ postId }` );

			await expect( tocFrontend.container() ).toHaveCSS( 'position', 'fixed' );
		} );

		test.describe( 'Hide on Mobile', () => {
			// _hideOnMobileView() reads window.screen.width, NOT the
			// viewport -- `screen` must be emulated explicitly. Re-stating
			// reducedMotion/strictSelectors here because test.use() replaces
			// the whole contextOptions object rather than merging it with
			// the config's.
			test.use( {
				viewport: { width: 375, height: 800 },
				contextOptions: {
					screen: { width: 375, height: 800 },
					reducedMotion: 'reduce',
					strictSelectors: true,
				},
			} );

			test( 'hides a sticky block below 420px of screen width', async ( {
				requestUtils,
				page,
				tocFrontend,
			} ) => {
				const post = await createFixturePost( requestUtils, {
					title: 'Sticky hide on mobile',
					content: joinBlocks(
						tocBlock( { isSticky: true, stickyHideOnMobile: true } ),
						...TWO_HEADINGS.map( headingBlock )
					),
				} );
				await page.goto( `/?p=${ post.id }` );

				const screenWidth = await page.evaluate( () => window.screen.width );
				expect(
					screenWidth,
					'Screen emulation did not take effect -- this test would pass vacuously.'
				).toBeLessThan( 420 );

				await expect( tocFrontend.container() ).toBeHidden();
			} );
		} );
	} );

	/**
	 * Copy link injects an icon into each heading that, on click, copies the
	 * section's URL. The icon lives INSIDE the post's headings, not inside
	 * the TOC block itself.
	 */
	test.describe( 'Settings: copy link', () => {
		test( 'is off by default -- no icon anywhere', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			// Not asserting dashicons absence here: this suite's storage
			// state is always an authenticated admin, and the logged-in
			// admin bar enqueues dashicons on every frontend page regardless
			// of this block's own conditional enqueue -- confirmed live,
			// that assertion failed against a stylesheet the plugin never
			// touched. .eb-tooltip's absence is the real, unconfounded signal.
			const post = await createFixturePost( requestUtils, {
				title: 'Copy link off',
				content: joinBlocks( tocBlock(), ...STANDARD_HEADINGS.map( headingBlock ) ),
			} );
			await page.goto( `/?p=${ post.id }` );

			await expect( tocFrontend.copyIcons() ).toHaveCount( 0 );
		} );

		test( 'gives every listed heading an icon whose target is its own section URL', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Copy link targets',
				content: joinBlocks(
					tocBlock( { enableCopyLink: true } ),
					...STANDARD_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			await expect( tocFrontend.copyIcons() ).toHaveCount( STANDARD_HEADINGS.length );

			const targets = await tocFrontend.clipboardTargets();
			const hrefs = await tocFrontend.linkHrefs();
			const expected = hrefs.map( ( href ) => `${ page.url() }${ href }` );
			expect( targets ).toEqual( expected );
		} );

		test( 'the icon stays hidden until its heading is hovered', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Copy link hover reveal',
				content: joinBlocks(
					tocBlock( { enableCopyLink: true } ),
					...TWO_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			const slug = await slugFor( tocFrontend, 'First section' );
			const icon = tocFrontend.copyIconFor( slug );
			await expect( icon ).toBeHidden();

			await page.locator( 'h2', { hasText: 'First section' } ).hover();
			await expect( icon ).toBeVisible();
		} );

		test( 'clicking the icon copies the section URL and shows "Copied!"', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Copy link click',
				content: joinBlocks(
					tocBlock( { enableCopyLink: true } ),
					...TWO_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );
			await tocFrontend.instrumentCopyAttempts();

			await page.locator( 'h2', { hasText: 'First section' } ).hover();
			const slug = await slugFor( tocFrontend, 'First section' );
			await tocFrontend.copyIconFor( slug ).click();

			expect( await tocFrontend.copyAttempts() ).toContain( 'copy' );
			await expect( tocFrontend.copiedTooltip( slug ) ).toBeVisible();
		} );

		// KNOWN DEFECT D6. Reproduced live by instrumenting execCommand: a
		// heading starting with a digit records ZERO copy attempts, yet the
		// "Copied!" tooltip is shown anyway by a separate click listener
		// that never checks whether ClipboardJS actually ran.
		test.fail(
			'a heading whose slug starts with a digit actually copies its URL',
			async ( { requestUtils, page, tocFrontend } ) => {
				const post = await createFixturePost( requestUtils, {
					title: 'Copy link digit-led slug',
					content: joinBlocks(
						tocBlock( { enableCopyLink: true } ),
						headingBlock( { content: '2024 Roadmap', level: 2 } )
					),
				} );
				await page.goto( `/?p=${ post.id }` );
				await tocFrontend.instrumentCopyAttempts();

				const slug = await slugFor( tocFrontend, '2024 Roadmap' );
				expect(
					slug,
					'Fixture heading no longer produces a digit-led slug -- test premise broken.'
				).not.toMatch( KNOWN_BUGS.clipboardTargetPattern );

				await page.locator( 'h2', { hasText: '2024 Roadmap' } ).hover();
				await tocFrontend.copyIconFor( slug ).click();

				expect( await tocFrontend.copyAttempts() ).toContain( 'copy' );
			}
		);
	} );

	/**
	 * Scroll to top adds a floating button that appears once the reader has
	 * scrolled past a threshold.
	 */
	test.describe( 'Settings: scroll to top', () => {
		test( 'is off by default -- no button on the page', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Scroll to top off',
				content: joinBlocks( tocBlock(), ...TWO_HEADINGS.map( headingBlock ) ),
			} );
			await page.goto( `/?p=${ post.id }` );

			await expect( tocFrontend.goTop() ).toHaveCount( 0 );
		} );

		test( 'exists but hidden at the top of the page, then appears once scrolled', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Scroll to top appears',
				content: joinBlocks(
					tocBlock( { scrollToTop: true } ),
					...TWO_HEADINGS.map( headingBlock ),
					spacerBlock( 2000 )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			await expect( tocFrontend.goTop() ).toBeHidden();

			await page.mouse.wheel( 0, 500 );

			await expect( tocFrontend.goTop() ).toBeVisible();
		} );

		test( 'scroll_to_toc returns the reader to the table of contents, not the page top', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Scroll target: toc',
				content: joinBlocks(
					spacerBlock( 1500 ),
					tocBlock( { scrollToTop: true, scrollTarget: VALUES.scrollTarget.toc } ),
					...TWO_HEADINGS.map( headingBlock ),
					spacerBlock( 1500 )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			await page.mouse.wheel( 0, 2500 );
			await expect( tocFrontend.goTop() ).toBeVisible();
			// Not in viewport yet -- the whole point is proving the click is
			// what brings it there, not that it was already visible.
			await expect( tocFrontend.container() ).not.toBeInViewport();

			await tocFrontend.goTop().click();

			await expect( tocFrontend.container() ).toBeInViewport();
			// A page-top landing would also happen to be "in viewport" on a
			// short page, so also rule that reading out directly.
			expect( await tocFrontend.scrollY() ).toBeGreaterThan( 0 );
		} );

		test( 'scroll_to_page returns the reader to the very top', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Scroll target: page',
				content: joinBlocks(
					spacerBlock( 1500 ),
					tocBlock( { scrollToTop: true, scrollTarget: VALUES.scrollTarget.page } ),
					...TWO_HEADINGS.map( headingBlock ),
					spacerBlock( 1500 )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			await page.mouse.wheel( 0, 2500 );
			await expect( tocFrontend.goTop() ).toBeVisible();

			await tocFrontend.goTop().click();

			await expect.poll( () => tocFrontend.scrollY() ).toBe( 0 );
		} );

		test( 'renders the configured icon', async ( { requestUtils, page, tocFrontend } ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Scroll to top icon',
				content: joinBlocks(
					tocBlock( { scrollToTop: true } ),
					...TWO_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			await expect(
				tocFrontend.goTop().locator( `i.${ DEFAULTS.scrollToTopIcon.split( ' ' ).join( '.' ) }` )
			).toHaveCount( 1 );
		} );

		// KNOWN DEFECT D7 -- same shape as D5. Reproduced live: hide-on-desktop
		// with scroll-to-top off throws `TypeError: Cannot read properties of
		// null (reading 'style')` in _hideOnDevice(), which aborts init()
		// before _tooltip and _itemCollapsed run -- confirmed live that the
		// copy-link icon stays permanently display:none as a result.
		test.fail(
			'hide-on-desktop with scroll-to-top off does not break copy-link',
			async ( { requestUtils, page, tocFrontend } ) => {
				const post = await createFixturePost( requestUtils, {
					title: 'Hide on desktop crash',
					content: joinBlocks(
						tocBlock( { scrollToTop: false, hideOnDesktop: true, enableCopyLink: true } ),
						...TWO_HEADINGS.map( headingBlock )
					),
				} );
				await page.goto( `/?p=${ post.id }` );

				const screenWidth = await page.evaluate( () => window.screen.width );
				expect(
					screenWidth,
					'hideOnDesktop requires screen.width > 1024 to be reachable.'
				).toBeGreaterThan( 1024 );

				await page.locator( 'h2', { hasText: 'First section' } ).hover();
				const slug = await slugFor( tocFrontend, 'First section' );
				await expect( tocFrontend.copyIconFor( slug ) ).toBeVisible();
			}
		);
	} );

	/**
	 * Item collapse adds a chevron to entries that have children, letting a
	 * reader fold a section's sub-entries. Only TOP-LEVEL entries get the
	 * chevron -- generate_toc() emits it only when the parsing stack is
	 * empty, which is deliberately re-tested below via "Installation" (has
	 * a child, but is itself nested, so gets none).
	 */
	test.describe( 'Settings: item collapse', () => {
		test( 'is off by default -- no chevron on any entry', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Item collapse off',
				content: joinBlocks( tocBlock(), ...STANDARD_HEADINGS.map( headingBlock ) ),
			} );
			await page.goto( `/?p=${ post.id }` );

			await expect( tocFrontend.container().locator( FRONTEND.collapseIcon ) ).toHaveCount(
				0
			);
		} );

		test( 'shows a chevron only on top-level entries that have children', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Item collapse chevrons',
				content: joinBlocks(
					tocBlock( { itemCollapsed: true } ),
					...STANDARD_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			// Top-level, has children -> chevron.
			await expect( tocFrontend.collapseToggle( 'Getting started' ) ).toHaveCount( 1 );
			// Top-level, no children -> no chevron.
			await expect( tocFrontend.collapseToggle( 'Troubleshooting' ) ).toHaveCount( 0 );
			// Has a child ("Advanced options") but is NOT top-level -> no
			// chevron. This is the subtlety a naive "has children" check
			// would get wrong.
			await expect( tocFrontend.collapseToggle( 'Installation' ) ).toHaveCount( 0 );
		} );

		test( 'clicking a chevron collapses its children, clicking again restores them', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Item collapse toggle',
				content: joinBlocks(
					tocBlock( { itemCollapsed: true } ),
					...STANDARD_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			await tocFrontend.collapseToggle( 'Getting started' ).click();
			await expect( tocFrontend.entry( 'Getting started' ) ).toHaveClass(
				new RegExp( STATE_CLASS.hideItems )
			);
			await expect( tocFrontend.links().filter( { hasText: 'Installation' } ) ).toBeHidden();

			await tocFrontend.collapseToggle( 'Getting started' ).click();
			await expect( tocFrontend.entry( 'Getting started' ) ).not.toHaveClass(
				new RegExp( STATE_CLASS.hideItems )
			);
			await expect( tocFrontend.links().filter( { hasText: 'Installation' } ) ).toBeVisible();
		} );

		// KNOWN DEFECT D9 -- see KNOWN_BUGS in selectors.ts. Reproduced live:
		// document.elementFromPoint() at the chevron's own rendered center
		// resolves to its parent <li>, not the <svg> the plugin's listener is
		// bound to, because WordPress core's own block-editor stylesheet sets
		// `.wp-block svg:not([draggable]){pointer-events:none}` and the
		// chevron has no draggable attribute. Not a race condition and not
		// something a real click could ever outrun -- Playwright's own
		// actionability check independently refuses a plain (non-forced)
		// click for the same reason, before any test code intervenes.
		test.fail(
			'clicking the chevron in the editor preview collapses its children',
			async ( { admin, tocEditor } ) => {
				await admin.createNewPost();
				await writeHeadingsThenInsertBlock( tocEditor, STANDARD_HEADINGS );
				await tocEditor.setAttributes( { itemCollapsed: true } );
				await tocEditor.block().click();

				await tocEditor.collapseToggle( 'Getting started' ).click();

				await expect(
					tocEditor.nestedLinkUnder( 'Getting started', 'Installation' )
				).toBeHidden();
			}
		);
	} );

	/**
	 * Title governs whether .eb-toc-title renders and what text it shows --
	 * except on the sticky reopen button, where D8 lives.
	 */
	test.describe( 'Settings: title', () => {
		test( 'renders with the default text by default, in the editor and on the page', async ( {
			admin,
			tocEditor,
			tocFrontend,
			requestUtils,
			page,
		} ) => {
			await admin.createNewPost();
			await writeHeadingsThenInsertBlock( tocEditor, TWO_HEADINGS );
			await expect( tocEditor.title() ).toContainText( DEFAULTS.title );

			const post = await createFixturePost( requestUtils, {
				title: 'Title defaults',
				content: joinBlocks( tocBlock(), ...TWO_HEADINGS.map( headingBlock ) ),
			} );
			await page.goto( `/?p=${ post.id }` );
			await expect( tocFrontend.title() ).toContainText( DEFAULTS.title );
		} );

		test( 'Display Title off removes the title from the published page entirely', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Display title off',
				content: joinBlocks(
					tocBlock( { displayTitle: false } ),
					...TWO_HEADINGS.map( headingBlock )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			await expect( tocFrontend.title() ).toHaveCount( 0 );
		} );

		test( 'custom title text typed in the inspector reaches the published page', async ( {
			admin,
			editor,
			tocEditor,
			tocFrontend,
			page,
		} ) => {
			await admin.createNewPost();
			await writeHeadingsThenInsertBlock( tocEditor, TWO_HEADINGS );
			await tocEditor.openInspector();
			await tocEditor.expandPanel( SETTINGS.panels.title );

			const customTitle = 'Chapters';
			await tocEditor.textField( SETTINGS.title.titleText ).fill( customTitle );

			const postId = await requirePostId( await editor.publishPost() );
			await page.goto( `/?p=${ postId }` );

			await expect( tocFrontend.title() ).toContainText( customTitle );
		} );

		// KNOWN DEFECT D8. Reproduced live: the sticky reopen button's title
		// guard checks the STRING 'true'/'false', which is always truthy --
		// the title leaks into the button even with Display Title off.
		test.fail(
			'a sticky block with Display Title off does not show the title inside its reopen button',
			async ( { requestUtils, page, tocFrontend } ) => {
				const post = await createFixturePost( requestUtils, {
					title: 'Sticky title leak',
					content: joinBlocks(
						tocBlock( { isSticky: true, displayTitle: false } ),
						...TWO_HEADINGS.map( headingBlock )
					),
				} );
				await page.goto( `/?p=${ post.id }` );

				await expect( tocFrontend.title() ).toHaveCount( 0 );
				await expect( tocFrontend.reopenButton() ).not.toContainText( DEFAULTS.title );
			}
		);
	} );

	/**
	 * Smooth Scroll and Offset Top change what happens when an entry is
	 * clicked -- Tier 1 already proves clicking scrolls at all; this covers
	 * the animated-vs-native distinction and the landing position.
	 */
	test.describe( 'Settings: scroll behaviour', () => {
		test( 'Smooth Scroll off still lands on the section, but does not mark it active', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Smooth scroll off',
				content: joinBlocks(
					tocBlock( { isSmooth: false } ),
					...TWO_HEADINGS.map( headingBlock ),
					spacerBlock( 1500 )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			await tocFrontend.links().filter( { hasText: 'Second section' } ).click();

			const target = page.locator( 'h2', { hasText: 'Second section' } );
			await expect( target ).toBeInViewport();
			await expect( tocFrontend.entry( 'Second section' ) ).not.toHaveClass(
				new RegExp( STATE_CLASS.active )
			);
		} );

		test( 'Smooth Scroll on marks the clicked entry and its ancestors active', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const post = await createFixturePost( requestUtils, {
				title: 'Smooth scroll active state',
				content: joinBlocks( tocBlock(), ...STANDARD_HEADINGS.map( headingBlock ) ),
			} );
			await page.goto( `/?p=${ post.id }` );

			await tocFrontend.links().filter( { hasText: 'Advanced options' } ).click();

			await expect( tocFrontend.entry( 'Advanced options' ) ).toHaveClass(
				new RegExp( STATE_CLASS.active )
			);
			await expect( tocFrontend.entry( 'Advanced options' ) ).toHaveClass(
				new RegExp( STATE_CLASS.recent )
			);
			await expect( tocFrontend.entry( 'Configuration' ) ).toHaveClass(
				new RegExp( STATE_CLASS.active )
			);
			await expect( tocFrontend.entry( 'Getting started' ) ).toHaveClass(
				new RegExp( STATE_CLASS.active )
			);
		} );

		test( 'Offset Top lands the heading that far below the viewport top', async ( {
			requestUtils,
			page,
			tocFrontend,
		} ) => {
			const offset = 100;
			const post = await createFixturePost( requestUtils, {
				title: 'Offset top',
				content: joinBlocks(
					tocBlock( { topOffset: String( offset ) } ),
					headingBlock( { content: 'First section', level: 2 } ),
					// Pushes the target well below the fold, so a passing
					// test means a real scroll happened, not that the
					// heading was already near the top.
					spacerBlock( 1500 ),
					headingBlock( { content: 'Second section', level: 2 } ),
					spacerBlock( 300 )
				),
			} );
			await page.goto( `/?p=${ post.id }` );

			const target = page.locator( 'h2', { hasText: 'Second section' } );
			await expect( target ).not.toBeInViewport();

			await tocFrontend.links().filter( { hasText: 'Second section' } ).click();

			// A ONE-SIDED bound here would be trivially true before the
			// scroll even starts -- the heading's pre-click position (far
			// below the fold) already satisfies ">  offset - 40". Both
			// bounds have to hold AT ONCE, which is why this polls a single
			// boolean rather than two separate assertions.
			await expect
				.poll(
					async () => {
						const y = ( await target.boundingBox() )?.y ?? -9999;
						return y > offset - 40 && y < offset + 150;
					},
					{ message: 'heading did not settle near the configured offset' }
				)
				.toBe( true );
		} );
	} );

	/**
	 * Round-trip and combination coverage -- the settings surface treated as
	 * a whole rather than one control at a time.
	 */
	test.describe( 'Settings: round-trip and combinations', () => {
		test( 'every setting changed through the inspector survives publish and reload', async ( {
			admin,
			editor,
			tocEditor,
		} ) => {
			await admin.createNewPost();
			await writeHeadingsThenInsertBlock( tocEditor, TWO_HEADINGS );
			await tocEditor.openInspector();

			await tocEditor
				.selectControl( SETTINGS.contentSettings.preset )
				.selectOption( { label: 'Style 2' } );
			await tocEditor.setToggle( SETTINGS.contentSettings.displayUnderline, true );
			await tocEditor.setToggle( SETTINGS.contentSettings.collapsible, true );
			await tocEditor.setToggle( SETTINGS.contentSettings.collapsedInitially, true );
			await tocEditor.setToggle( SETTINGS.contentSettings.enableItemCollapsed, true );
			await tocEditor.setToggle( SETTINGS.contentSettings.enableCopyLink, true );
			await tocEditor.numberField( SETTINGS.contentSettings.offsetTop ).fill( '75' );
			await tocEditor.setToggle( SETTINGS.contentSettings.enableListStyle, true );
			await tocEditor
				.selectControl( SETTINGS.contentSettings.listStyle )
				.selectOption( { label: 'Ordered' } );

			await tocEditor.expandPanel( SETTINGS.panels.title );
			const customTitle = 'Round-trip title';
			await tocEditor.textField( SETTINGS.title.titleText ).fill( customTitle );

			await tocEditor.expandPanel( SETTINGS.panels.scroll );
			await tocEditor.setToggle( SETTINGS.scroll.smoothScroll, false );
			await tocEditor.setToggle( SETTINGS.scroll.scrollToTop, true );
			await tocEditor
				.selectControl( SETTINGS.scroll.scrollTarget )
				.selectOption( { label: 'Scroll to the top of page' } );

			const relevantKeys = [
				'preset',
				'hasUnderline',
				'collapsible',
				'initialCollapse',
				'itemCollapsed',
				'enableCopyLink',
				'topOffset',
				'enableListStyle',
				'listStyle',
				'title',
				'isSmooth',
				'scrollToTop',
				'scrollTarget',
			] as const;

			const before = await tocEditor.attributes();

			const postId = await requirePostId( await editor.publishPost() );
			await admin.editPost( postId );

			const after = await tocEditor.attributes();

			for ( const key of relevantKeys ) {
				expect( after[ key ], `"${ key }" did not round-trip` ).toEqual( before[ key ] );
			}
			expect( after.title ).toBe( customTitle );
		} );

		test( 'a post with every non-conflicting setting enabled loads without browser errors', async ( {
			requestUtils,
			page,
			tocFrontend,
			consoleErrors,
		} ) => {
			// Deliberately avoids the two combinations already covered as
			// known defects above -- collapsible + !displayTitle (D5), and
			// hideOnDesktop + !scrollToTop (D7) -- since this test asserts
			// the suite is clean, not that it reproduces a known crash.
			const post = await createFixturePost( requestUtils, {
				title: 'Every setting at once',
				content: joinBlocks(
					tocBlock( {
						preset: VALUES.preset.style2,
						collapsible: true,
						displayTitle: true,
						enableCopyLink: true,
						scrollToTop: true,
						hideOnDesktop: true,
						itemCollapsed: true,
						enableListStyle: true,
						listStyle: VALUES.listStyle.ordered,
						isSmooth: true,
						topOffset: '50',
					} ),
					...STANDARD_HEADINGS.map( headingBlock ),
					paragraphBlock( 'Filler content.' )
				),
			} );

			await page.goto( `/?p=${ post.id }` );

			expectNoBrowserErrors( consoleErrors, 'Loading a post with every setting enabled' );
			await expect( tocFrontend.links() ).toHaveText(
				STANDARD_HEADINGS.map( ( h ) => h.content )
			);
		} );
	} );
} );
