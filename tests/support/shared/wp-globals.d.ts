/**
 * Ambient `window` additions used by page.evaluate() calls in this suite.
 *
 * `window.wp` is NOT declared here even though TocEditor.attributes()/
 * setAttributes() read and write through it -- @wordpress/e2e-test-utils-
 * playwright already declares `Window.wp: any` globally (see its
 * build-types/types.d.ts). A stronger type on the same property would only
 * merge with, not override, that `any`, so it would be dead weight. Those
 * two call sites type the shape they need locally instead.
 */

export {};

declare global {
	interface Window {
		/**
		 * Populated by TocFrontend.instrumentCopyAttempts(), which wraps
		 * `document.execCommand` before a copy-link icon is clicked. See D6:
		 * navigator.clipboard is unavailable on this suite's http:// test
		 * sites (not a secure context), so this is the only way to observe
		 * whether ClipboardJS's execCommand('copy') fallback actually ran.
		 */
		__copyAttempts?: string[];
	}
}
