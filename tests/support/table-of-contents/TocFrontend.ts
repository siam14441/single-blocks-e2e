/**
 * Page object for the Table of Contents block on a published page.
 *
 * The frontend is rendered by PHP (save() returns null), independently of the
 * React editor component, so its markup is NOT the editor's markup. It gains
 * .eb-toc-header, the data-* attributes, and -- when sticky -- .eb-toc-close
 * and .eb-toc-button, none of which exist in the editor. Keep the two page
 * objects separate rather than sharing a "TOC block" abstraction that would
 * quietly paper over the difference.
 */

import type { Locator, Page } from '@playwright/test';
import { CONTAINER_DATA_ATTR, DATA_ATTR, FRONTEND } from './selectors';

export class TocFrontend {
	constructor( private readonly page: Page ) {}

	container(): Locator {
		return this.page.locator( FRONTEND.container );
	}

	listWrapper(): Locator {
		return this.container().locator( FRONTEND.listWrapper );
	}

	links(): Locator {
		return this.container().locator( FRONTEND.links );
	}

	listItems(): Locator {
		return this.container().locator( FRONTEND.listItems );
	}

	title(): Locator {
		return this.container().locator( FRONTEND.title );
	}

	/**
	 * The top-level entry list -- the direct child of .eb-toc__list-wrap, as
	 * opposed to FRONTEND.list which also matches nested sublists sharing the
	 * same class. `:scope >` is what makes this specifically the outermost one.
	 */
	list(): Locator {
		return this.listWrapper()
			.locator( FRONTEND.listWrap )
			.locator( `:scope > ${ FRONTEND.list }` );
	}

	/** 'UL' or 'OL' -- the tag listStyle actually produced. */
	async listTagName(): Promise< string > {
		return this.list().evaluate( ( el ) => el.tagName );
	}

	/**
	 * The scroll-to-top button is appended to document.body, outside the block
	 * wrapper, so this queries the page rather than the container.
	 */
	goTop(): Locator {
		return this.page.locator( FRONTEND.goTop );
	}

	/** Sticky "close" button -- inside .eb-toc-header, inside the container.
	 *  Only present when isSticky is true. */
	closeButton(): Locator {
		return this.container().locator( FRONTEND.close );
	}

	/** Sticky "reopen" button -- a sibling of .eb-toc-header and
	 *  .eb-toc-wrapper inside the container (verified against
	 *  table-of-contents-block.php's markup order), not outside it despite
	 *  looking detached in the rendered layout. Also where D8 shows up: it
	 *  carries the title text even when Display Title is off. */
	reopenButton(): Locator {
		return this.container().locator( FRONTEND.button );
	}

	async linkTexts(): Promise< string[] > {
		return ( await this.links().allInnerTexts() ).map( ( t ) => t.trim() );
	}

	/** Raw fragment targets, e.g. ['#intro', '#setup']. */
	async linkHrefs(): Promise< string[] > {
		return ( await this.links().evaluateAll( ( els ) =>
			els.map( ( el ) => ( el as HTMLAnchorElement ).getAttribute( 'href' ) ?? '' )
		) ) as string[];
	}

	/**
	 * Every TOC entry whose target does not exist in the document.
	 *
	 * This is the block's core promise -- a table of contents whose links go
	 * nowhere is worse than no table of contents. Anchors are injected at
	 * runtime by the frontend bundle, matched by NORMALISED HEADING TEXT rather
	 * than by any id authored in the post, so a link can break without anything
	 * in the saved markup looking wrong.
	 *
	 * Resolution is checked with getElementById against the live document, not
	 * by comparing strings, so it reflects what a reader's browser would do.
	 */
	async brokenLinks(): Promise< Array< { text: string; href: string } > > {
		return this.links().evaluateAll( ( els ) =>
			els
				.map( ( el ) => {
					const a = el as HTMLAnchorElement;
					const href = a.getAttribute( 'href' ) ?? '';
					const id = decodeURIComponent( href.replace( /^#/, '' ) );
					const resolves = id !== '' && document.getElementById( id ) !== null;
					return { text: ( a.textContent ?? '' ).trim(), href, resolves };
				} )
				.filter( ( link ) => ! link.resolves )
				.map( ( { text, href } ) => ( { text, href } ) )
		);
	}

	/** ids of the anchor spans the frontend bundle injected into headings. */
	async injectedAnchorIds(): Promise< string[] > {
		return this.page
			.locator( FRONTEND.headingAnchor )
			.evaluateAll( ( els ) => els.map( ( el ) => el.id ) );
	}

	/** Parsed `data-headers` payload -- what PHP handed the frontend runtime. */
	async headerData(): Promise< Array< Record< string, unknown > > > {
		const raw = await this.listWrapper().getAttribute( DATA_ATTR.headers );
		return raw ? JSON.parse( raw ) : [];
	}

	/**
	 * True when the BLOCK overflows sideways. Catches the responsive failure
	 * this suite actually owns: a fixed width or a long unbroken heading
	 * pushing the table of contents wider than the screen.
	 *
	 * Scoped to the block on purpose. This used to measure the whole document
	 * (`documentElement.scrollWidth > clientWidth`), which made the assertion
	 * fail for things the plugin does not own and cannot fix: at 375px the
	 * default test theme's comment-form textarea renders 403px wide, and the
	 * admin bar -- present because the suite browses while authenticated --
	 * pushes its own chrome past the viewport too. Neither involves the block,
	 * so a page-level check reported "the block breaks on mobile" when the
	 * block was laid out correctly. Measure the subject under test, not the
	 * page it happens to sit on.
	 */
	async hasHorizontalOverflow(): Promise< boolean > {
		return this.container().evaluate( ( el ) => {
			const viewportWidth = document.documentElement.clientWidth;
			const rect = el.getBoundingClientRect();

			// Sub-pixel layout rounding is not a responsive bug, so allow 1px.
			return (
				rect.left < -1 ||
				rect.right > viewportWidth + 1 ||
				el.scrollWidth > el.clientWidth + 1
			);
		} );
	}

	// -----------------------------------------------------------------
	// Copy link
	//
	// The icon lives INSIDE the post's heading elements, injected by _run()
	// in the frontend bundle -- NOT inside .eb-toc-container. Scoping these
	// to the block, the way most of this page object does, would find
	// nothing. They query `page` on purpose.
	// -----------------------------------------------------------------

	/** Every copy-link icon on the page, one per heading when the setting is
	 *  on. Query by this, not by data-clipboard-text -- the frontend writes
	 *  that attribute onto every heading anchor regardless of the setting,
	 *  only the icon itself is conditional on enableCopyLink. */
	copyIcons(): Locator {
		return this.page.locator( FRONTEND.tooltip );
	}

	/** The copy-link icon for one heading, addressed by its slug (the id the
	 *  frontend runtime assigned its anchor span, e.g. "first-section"). */
	copyIconFor( slug: string ): Locator {
		return this.page.locator( `#${ slug }` ).locator( FRONTEND.tooltip );
	}

	/** The "Copied!" text inside a copy-link icon. */
	copiedTooltip( slug: string ): Locator {
		return this.copyIconFor( slug ).locator( FRONTEND.tooltipText );
	}

	/** `data-clipboard-text` of every injected heading anchor, in document
	 *  order -- what a successful copy would actually place on the
	 *  clipboard, independent of whether the copy button is visible. */
	async clipboardTargets(): Promise< string[] > {
		return this.page
			.locator( FRONTEND.headingAnchor )
			.evaluateAll( ( els ) => els.map( ( el ) => el.getAttribute( 'data-clipboard-text' ) ?? '' ) );
	}

	/**
	 * Wraps `document.execCommand` so a copy click's actual effect can be
	 * observed. Necessary because `navigator.clipboard` is unavailable on
	 * this suite's test sites -- confirmed live, `window.isSecureContext` is
	 * false on plain http://, and ClipboardJS (what the plugin bundles)
	 * falls back to `execCommand('copy')` specifically to work without one.
	 * Call before the click; read results with copyAttempts().
	 */
	async instrumentCopyAttempts() {
		await this.page.evaluate( () => {
			window.__copyAttempts = [];
			const original = document.execCommand.bind( document );
			document.execCommand = ( commandId: string, showUI?: boolean, value?: string ): boolean => {
				window.__copyAttempts?.push( commandId );
				return original( commandId, showUI, value );
			};
		} );
	}

	/** Commands recorded since instrumentCopyAttempts() was called -- a real
	 *  copy shows up as one `'copy'` entry; D6 shows up as zero. */
	async copyAttempts(): Promise< string[] > {
		return this.page.evaluate( () => window.__copyAttempts ?? [] );
	}

	// -----------------------------------------------------------------
	// Item collapse
	// -----------------------------------------------------------------

	/**
	 * The <li> for one entry, addressed by its own link text.
	 *
	 * `:scope > a` -- NOT plain `a` -- is what makes this the entry's OWN
	 * link. `has: a:text-is(...)` alone (without the scope combinator)
	 * matches any ANCESTOR li too, since a parent li contains its nested
	 * children's links as descendants; `.first()` would then resolve to the
	 * outermost ancestor instead of the entry itself. Confirmed live: this
	 * bug made entry('Installation') resolve to "Getting started"'s <li>.
	 */
	entry( text: string ): Locator {
		return this.listItems().filter( {
			has: this.page.locator( `:scope > a:text-is("${ text }")` ),
		} );
	}

	/**
	 * The item-collapse chevron for one entry, if it has one.
	 * `TOC_Helper::generate_toc()` only emits the <svg> for an entry that has
	 * children, as a direct child of its <li> -- `:scope > svg` is what keeps
	 * this from also matching a descendant's own chevron.
	 */
	collapseToggle( entryText: string ): Locator {
		return this.entry( entryText ).locator( ':scope > svg' );
	}

	// -----------------------------------------------------------------
	// Misc
	// -----------------------------------------------------------------

	/** The container's own classes, split into an array -- for asserting a
	 *  preset or state class is present (or, as important, absent). */
	async containerClassList(): Promise< string[] > {
		const raw = await this.container().getAttribute( 'class' );
		return raw ? raw.split( /\s+/ ).filter( Boolean ) : [];
	}

	/** A data-* attribute on the CONTAINER -- see CONTAINER_DATA_ATTR in
	 *  selectors.ts. A different element, and a different attribute set,
	 *  from headerData()'s DATA_ATTR on the wrapper. */
	async containerData(
		attr: ( typeof CONTAINER_DATA_ATTR )[ keyof typeof CONTAINER_DATA_ATTR ]
	): Promise< string | null > {
		return this.container().getAttribute( attr );
	}

	async scrollY(): Promise< number > {
		return this.page.evaluate( () => window.scrollY );
	}

	/** A computed style property of an element's own ::before pseudo-element
	 *  -- used to tell Style 1 and Style 2's nested-item markers apart. */
	async beforeStyle( locator: Locator, property: string ): Promise< string > {
		return locator.evaluate(
			( el, prop ) => getComputedStyle( el, '::before' ).getPropertyValue( prop ),
			property
		);
	}
}
