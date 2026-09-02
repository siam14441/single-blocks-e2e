/**
 * Collects browser-side errors for the lifetime of a test.
 *
 * WHY THIS IS THE MOST VALUABLE FIXTURE IN THE SUITE
 * --------------------------------------------------
 * Every headline failure in this plugin's history was a JavaScript exception,
 * not a wrong pixel:
 *
 *   v1.3.4  TypeError: Cannot read properties of undefined
 *           (reading 'generateDimensionsAttributes')
 *           -- editor bundle threw, block never registered, vanished from the
 *              inserter, shipped, and stayed broken for multiple releases.
 *
 *   v1.4.x  container.getAttribute threw on pages with no headings, taking out
 *           the frontend script.
 *
 * None of those change layout in a way a structural assertion would notice.
 * The block "renders" -- it is simply absent, or the page's JS is dead. Reading
 * the console is the only way to see them.
 */

import type { ConsoleMessage, Page } from '@playwright/test';

export interface CapturedError {
	type: 'console' | 'pageerror';
	text: string;
}

/**
 * Messages that are environmental rather than defects. Kept deliberately short:
 * every entry here is a class of real bug the suite can no longer see, so each
 * one needs to earn its place.
 */
const IGNORED = [
	// Local dev sites routinely lack a favicon; WP admin does not ship one.
	/favicon\.ico/i,
	// Chrome's own warning about third-party cookie deprecation.
	/third-party cookie/i,
	// React DevTools nag, printed on every WP admin page load.
	/Download the React DevTools/i,
	// WP core deprecation notices from other subsystems -- not ours to fix,
	// and they would otherwise fail every test on a given WP release.
	/is deprecated since version/i,
];

const isIgnorable = ( text: string ) => IGNORED.some( ( re ) => re.test( text ) );

export class ConsoleErrorCollector {
	private readonly errors: CapturedError[] = [];

	/**
	 * URLs behind "Failed to load resource" console errors.
	 *
	 * Chrome's console message for a failed request carries the status but not
	 * the URL, so on its own it reports "something 404'd" and leaves you with
	 * no way to tell a missing plugin asset from missing core chrome. Watching
	 * responses recovers the URL so the failure names its own cause.
	 */
	private readonly failedRequests: string[] = [];

	constructor( page: Page ) {
		page.on( 'response', ( response ) => {
			if ( response.status() >= 400 ) {
				this.failedRequests.push( `HTTP ${ response.status() } ${ response.url() }` );
			}
		} );

		page.on( 'console', ( message: ConsoleMessage ) => {
			if ( message.type() !== 'error' ) {
				return;
			}
			const text = message.text();
			if ( ! isIgnorable( text ) ) {
				this.errors.push( { type: 'console', text } );
			}
		} );

		// Uncaught exceptions never reach the console listener. This is the
		// channel the v1.3.4 TypeError actually arrived on.
		page.on( 'pageerror', ( error ) => {
			if ( ! isIgnorable( error.message ) ) {
				this.errors.push( { type: 'pageerror', text: error.message } );
			}
		} );
	}

	all(): CapturedError[] {
		return [ ...this.errors ];
	}

	/** Drops everything captured so far -- use to scope a check to one action. */
	clear() {
		this.errors.length = 0;
		this.failedRequests.length = 0;
	}

	/**
	 * Returns a report string when errors were captured, otherwise null.
	 *
	 * Returning rather than asserting keeps Playwright's `expect` out of this
	 * module and lets each test phrase its own failure message, so a failure
	 * reads as "inserting the block threw" rather than a generic console dump.
	 */
	report(): string | null {
		if ( this.errors.length === 0 ) {
			return null;
		}
		const lines = this.errors.map(
			( e, i ) => `  ${ i + 1 }. [${ e.type }] ${ e.text }`
		);

		// Name the URLs behind any "Failed to load resource" line above.
		if ( this.failedRequests.length > 0 ) {
			lines.push(
				'  failed requests:',
				...this.failedRequests.map( ( r ) => `    - ${ r }` )
			);
		}

		return lines.join( '\n' );
	}
}
