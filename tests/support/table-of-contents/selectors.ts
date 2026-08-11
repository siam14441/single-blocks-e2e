/**
 * Every selector, label and attribute this suite depends on, in one place.
 *
 * WHY CLASS SELECTORS AND NOT getByRole()
 * ---------------------------------------
 * This block emits NO ARIA whatsoever on the frontend -- no <nav>, no role, no
 * aria-label. The rendered output is plain div/ul/li/a/span. Gutenberg core's
 * own Table of Contents wraps itself in role="navigation" with an accessible
 * name, which is why its tests can use getByRole(); ours cannot. Class-based
 * selectors are not a shortcut here, they are the only option.
 *
 * (That absence is a genuine accessibility gap and is worth filing separately.
 * It is not this suite's job to assert it away.)
 *
 * Values below were verified twice, independently: against the shipped v1.5.0
 * zip and against `master` in EssentialBlocks/table-of-contents-block. Where a
 * value looks like a typo, it is not -- see the comments.
 */

export const BLOCK = {
	/** Registered block name. Namespace and slug happen to be identical. */
	name: 'table-of-contents-block/table-of-contents-block',

	/** Exact title in the block inserter. Note the capital "Of". */
	title: 'Table Of Contents',

	/** Editor script handle. Declared in block.json since v1.5.0 -- the fix
	 *  for v1.3.4, where WP auto-generated a handle that carried no
	 *  dependencies, so the controls bundle never loaded. */
	editorScriptHandle: 'create-block-table-of-content-block-editor',

	/** The global the editor bundle needs. Undefined => the block is dead.
	 *  This single value is the clearest signal of the v1.3.4 failure. */
	controlsGlobal: 'EBTOCControls',
} as const;

/**
 * Inspector sidebar tabs.
 *
 * Rendered with @wordpress/components TabPanel, so WP adds role="tab",
 * aria-selected and `components-tab-panel__tabs-item` on top of these custom
 * classes. Verified against a live editor -- the rendered button is:
 *
 *   <button class="components-button components-tab-panel__tabs-item
 *                  eb-tab general active-tab is-next-40px-default-size"
 *           role="tab" aria-selected="true">General</button>
 *
 * So unlike the frontend output, the tabs DO expose proper ARIA. We assert on
 * role for the accessible name and on class for identity -- both, because a
 * refactor that kept one and dropped the other should be caught, not tolerated.
 *
 * IMPORTANT: TabPanel mounts ONLY the active tab's content. The inactive tabs'
 * panel divs are absent from the DOM entirely, not merely hidden. That makes
 * "switching tabs works" testable as presence/absence rather than visibility.
 */
export const TABS = [
	{
		/** TabPanel `name` -- also the suffix of the panel-content class. */
		id: 'general',
		/** Visible label. A plain literal in source, NOT wrapped in __(), so
		 *  it is not translatable and is safe to match on exactly. */
		label: 'General',
		button: 'button.eb-tab.general',
		/**
		 * NOT A TYPO. Source builds this as `"eb-tab-controls" + tab.name`
		 * with no separator, producing `eb-tab-controlsgeneral`. Anyone
		 * "correcting" this to eb-tab-controls-general will break the suite.
		 */
		panel: '.eb-tab-controlsgeneral',
		/** A panel title that only exists under this tab -- proves the click
		 *  actually switched content, not merely toggled a button state. */
		signaturePanel: 'Content Settings',
	},
	{
		id: 'styles',
		/** Label is "Style" (singular) while the internal name is "styles". */
		label: 'Style',
		button: 'button.eb-tab.styles',
		panel: '.eb-tab-controlsstyles',
		signaturePanel: 'Content',
	},
	{
		id: 'advance',
		/** Label is "Advanced" while the internal name is "advance". */
		label: 'Advanced',
		button: 'button.eb-tab.advance',
		panel: '.eb-tab-controlsadvance',
		signaturePanel: 'Margin & Padding',
	},
] as const;

export type TabLabel = ( typeof TABS )[ number ][ 'label' ];

/** Wrapper around the whole tab panel, inside the block inspector. */
export const INSPECTOR_ROOT = 'div.eb-panel-control';

/**
 * EDITOR-ONLY selectors.
 *
 * The editor and frontend markups genuinely differ -- this is a dynamic block
 * whose save() returns null, so PHP renders the frontend independently of the
 * React editor component. The editor has NO .eb-toc-header, NO .eb-toc-close,
 * NO .eb-toc-button and NO data-* attributes. Do not reuse these on a
 * published page.
 */
export const EDITOR = {
	/** Outermost wrapper, added via useBlockProps. */
	blockWrapper: '.eb-guten-block-main-parent-wrapper',
	container: '.eb-toc-container',
	title: '.eb-toc-title',
	listWrapper: '.eb-toc-wrapper',
	list: '.eb-toc__list',
	listItems: '.eb-toc__list li',
	links: '.eb-toc__list li > a',

	/** Shown when the post has no headings yet. A bare <p> with no class, and
	 *  a plain literal in source -- not translatable, so matching exact text
	 *  is safe. */
	emptyState: 'Add header to generate table of contents',

	/** Different string, different component: this one renders when headings
	 *  exist but none match the selected heading levels. */
	noVisibleHeadings: 'Add a header to begin generating the table of contents',
} as const;

/**
 * FRONTEND-ONLY selectors (published page, rendered by PHP).
 */
export const FRONTEND = {
	container: '.eb-toc-container',
	header: '.eb-toc-header',
	title: '.eb-toc-title',

	/**
	 * The data-* attributes live on THIS element, not on .eb-toc-container.
	 * Easy to get wrong: the container carries a different set (data-sticky,
	 * data-collapsible, data-scroll-top...), while the heading payload and
	 * scroll settings sit one level in, on the wrapper.
	 */
	listWrapper: '.eb-toc-wrapper',

	list: '.eb-toc__list',
	listItems: '.eb-toc__list li',
	links: '.eb-toc__list li > a[href^="#"]',

	/** Injected into the post's headings at runtime by the frontend bundle.
	 *  The id on this span is what TOC links actually resolve to. */
	headingAnchor: 'span.eb-toc__heading-anchor',

	/**
	 * Scroll-to-top button. Appended to document.body, NOT inside the block
	 * wrapper -- scoping a query to the block will never find it.
	 */
	goTop: 'span.eb-toc-go-top',
} as const;

/**
 * Attributes read by the frontend runtime, on FRONTEND.listWrapper.
 */
export const DATA_ATTR = {
	/** JSON array of { level, content, text, link }. */
	headers: 'data-headers',
	/** JSON array of 6 booleans, H1..H6. */
	visible: 'data-visible',
	smooth: 'data-smooth',
	topOffset: 'data-top-offset',
} as const;

/**
 * Defaults worth asserting against, from src/attributes.js.
 */
export const DEFAULTS = {
	title: 'Table of Contents',
	displayTitle: true,
	/** The list TAG comes from `listStyle`, not `listType` -- see below. */
	listStyle: 'ul',
	preset: 'style-1',
	isSmooth: true,
} as const;

/**
 * KNOWN UPSTREAM BUGS -- do not write assertions that bless current behaviour.
 *
 * 1. `eb-toc-not-scrollToTop` is unreachable. The PHP ternary tests
 *    $scrollToTop, which by then holds the *string* 'false'. Non-empty strings
 *    are truthy in PHP, so the container always gets `eb-toc-scrollToTop`
 *    regardless of the setting. Assert on the data-scroll-top attribute
 *    instead, which carries the real value.
 *
 * 2. The block toolbar's Unordered / Ordered / None buttons write to the
 *    `listType` attribute, but neither list.js nor the PHP renderer reads it --
 *    both use `listStyle`, set by the "List Style" select in the General tab.
 *    Clicking the toolbar therefore changes nothing visible. Real bug; a test
 *    asserting "toolbar does not change the tag" would enshrine it.
 *
 * 3. Non-ASCII headings slug differently in JS and PHP. PHP falls back to
 *    `eb-table-content-{index}` when the slug fails /^[A-Za-z0-9-]+$/; the
 *    editor has no such fallback. Editor and frontend hrefs can diverge for
 *    the same heading. Avoid non-ASCII headings in Tier 1 fixtures.
 */
export const KNOWN_BUGS = {
	unreachableClass: 'eb-toc-not-scrollToTop',
	inertToolbarAttribute: 'listType',
} as const;
