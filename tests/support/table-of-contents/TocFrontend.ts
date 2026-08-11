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
import { DATA_ATTR, FRONTEND } from './selectors';

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
	 * The scroll-to-top button is appended to document.body, outside the block
	 * wrapper, so this queries the page rather than the container.
	 */
	goTop(): Locator {
		return this.page.locator( FRONTEND.goTop );
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
	 * True when the page scrolls sideways. Catches the common responsive
	 * failure where a fixed width or a long unbroken heading pushes the
	 * viewport wider than the screen.
	 */
	async hasHorizontalOverflow(): Promise< boolean > {
		return this.page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
	}
}
