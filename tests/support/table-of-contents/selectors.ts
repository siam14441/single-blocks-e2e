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
 * Inspector control labels, all under the General tab. Verified against a
 * live editor session. Grouped by PanelBody, in source order.
 *
 * Several are CONDITIONALLY rendered -- not simply hidden, absent from the
 * DOM -- which is itself worth asserting:
 *   - collapsible, collapsedInitially: only when Display Title is on AND the
 *     block is not sticky (`displayTitle && !isSticky`)
 *   - stickyPosition, hideOnMobile: only when Sticky contents is on
 *   - listStyle: only when Enable List Style is on
 *   - displayTitle: only when the block is not sticky
 *   - scrollTarget: only when Scroll To Top is on AND the block is not sticky
 */
export const SETTINGS = {
	panels: {
		contentSettings: 'Content Settings',
		title: 'Title',
		scroll: 'Scroll',
	},
	contentSettings: {
		preset: 'Preset',
		displayUnderline: 'Display Underline',
		collapsible: 'Collapsible',
		collapsedInitially: 'Collapsed initially',
		stickyContents: 'Sticky contents',
		stickyPosition: 'Sticky Position',
		hideOnMobile: 'Hide on Mobile',
		enableItemCollapsed: 'Enable Item Collapsed',
		enableCopyLink: 'Enable Copy Link',
		offsetTop: 'Offset Top',
		enableListStyle: 'Enable List Style',
		listStyle: 'List Style',
	},
	title: {
		displayTitle: 'Display Title',
		titleText: 'Title Text',
	},
	scroll: {
		smoothScroll: 'Smooth Scroll',
		scrollToTop: 'Scroll To Top',
		scrollTarget: 'Scroll Target',
	},
} as const;

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

	/** The top-level entry list, one level inside listWrapper. Distinct from
	 *  `list` below because nested sublists share the same `.eb-toc__list`
	 *  class -- this scopes to the outermost one only. */
	listWrap: '.eb-toc__list-wrap',

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

	/** Sticky "close" button -- collapses the sidebar. Only rendered when
	 *  isSticky is true. Lives inside .eb-toc-header. */
	close: '.eb-toc-close',

	/**
	 * Sticky "reopen" button. Rendered as a sibling of .eb-toc-wrapper, NOT
	 * inside .eb-toc-header -- see table-of-contents-block.php's markup order.
	 * Also carries the title text even when Display Title is off (D8).
	 */
	button: '.eb-toc-button',

	/** Copy-link icon, injected into each heading anchor span by _run() in
	 *  the frontend bundle. display:none until its heading is hovered --
	 *  see _tooltip() in dist/frontend/index.js. */
	tooltip: '.eb-tooltip',

	/** The "Copied!" text inside the icon. Starts visibility:hidden; a click
	 *  handler set in _tooltip() (NOT the ClipboardJS instance itself) makes
	 *  it visible regardless of whether a copy actually happened -- see D6. */
	tooltipText: '.eb-tooltiptext',

	/** Item-collapse chevron. Only emitted by TOC_Helper::generate_toc() for
	 *  an entry that has children, one per such entry. */
	collapseIcon: '.eb-toc__list-wrap svg',
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
 * Attributes read by the frontend runtime, on FRONTEND.container -- a
 * DIFFERENT element from DATA_ATTR above. Verified against
 * table-of-contents-block.php's markup: these all sit on the same div as
 * .eb-toc-container, one level above .eb-toc-wrapper.
 */
export const CONTAINER_DATA_ATTR = {
	scrollTop: 'data-scroll-top',
	scrollTopIcon: 'data-scroll-top-icon',
	collapsible: 'data-collapsible',
	stickyHideMobile: 'data-sticky-hide-mobile',
	sticky: 'data-sticky',
	scrollTarget: 'data-scroll-target',
	copyLink: 'data-copy-link',
	hideDesktop: 'data-hide-desktop',
	hideTab: 'data-hide-tab',
	hideMobile: 'data-hide-mobile',
	/** Note the camelCase in the attribute name itself -- not a typo, PHP
	 *  literally emits `data-itemCollapsed`, not `data-item-collapsed`. */
	itemCollapsed: 'data-itemCollapsed',
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
	collapsible: false,
	initialCollapse: false,
	isSticky: false,
	stickyPosition: 'left',
	stickyHideOnMobile: false,
	enableCopyLink: false,
	scrollToTop: false,
	scrollToTopIcon: 'fas fa-angle-up',
	scrollTarget: 'scroll_to_toc',
	itemCollapsed: false,
	enableListStyle: false,
	topOffset: '-50',
} as const;

/**
 * Option values for the settings' SelectControls, verified against the
 * source literals in dist/index.js.
 */
export const VALUES = {
	preset: { style1: 'style-1', style2: 'style-2' } as const,
	listStyle: { unordered: 'ul', ordered: 'ol' } as const,
	stickyPosition: { left: 'left', right: 'right' } as const,
	scrollTarget: { toc: 'scroll_to_toc', page: 'scroll_to_page' } as const,
} as const;

/**
 * Classes the frontend attaches at runtime (not present in the initial PHP
 * render), from dist/frontend/index.js and dist/style.css.
 */
export const STATE_CLASS = {
	/** On .eb-toc-wrapper: collapsed via the Collapsible title click. */
	hideContent: 'hide-content',
	/** On an item-collapse <li>: its nested list is hidden. */
	hideItems: 'hide-items',
	/** On .eb-toc-go-top: visible / not-yet-visible after the scroll threshold. */
	showScroll: 'show-scroll',
	hideScroll: 'hide-scroll',
	/** On .eb-toc-container: the sticky panel's open/closed state, set by
	 *  clicking .eb-toc-close / .eb-toc-button. */
	contentHidden: 'eb-toc-content-hidden',
	contentVisible: 'eb-toc-content-visible',
	/** On the clicked link's <li> and its ancestors, only when isSmooth. */
	active: 'eb-toc-active',
	recent: 'recent',
} as const;

/**
 * Classes PHP writes into the initial render, on .eb-toc-container --
 * table-of-contents-block.php's $container_class array.
 */
export const CONTAINER_CLASS = {
	sticky: 'eb-toc-is-sticky',
	notSticky: 'eb-toc-is-not-sticky',
	stickyLeft: 'eb-toc-sticky-left',
	stickyRight: 'eb-toc-sticky-right',
	collapsible: 'eb-toc-collapsible',
	notCollapsible: 'eb-toc-not-collapsible',
	initiallyCollapsed: 'eb-toc-initially-collapsed',
	initiallyNotCollapsed: 'eb-toc-initially-not-collapsed',
	listStyleNone: 'list-style-none',
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
 * 2. (D3) The block toolbar's Unordered / Ordered / None buttons write to the
 *    `listType` attribute, but neither list.js nor the PHP renderer reads it --
 *    both use `listStyle`, set by the "List Style" select in the General tab.
 *    Clicking the toolbar therefore changes nothing visible. Real bug; a test
 *    asserting "toolbar does not change the tag" would enshrine it.
 *
 * 3. Non-ASCII headings slug differently in JS and PHP. PHP falls back to
 *    `eb-table-content-{index}` when the slug fails /^[A-Za-z0-9-]+$/; the
 *    editor has no such fallback. Editor and frontend hrefs can diverge for
 *    the same heading. Avoid non-ASCII headings in Tier 1 fixtures.
 *
 * 4. (D4) Editor: the block title's onClick reads `collapsible && setVisible(
 *    !visible)`, but `setVisible`/`visible` are never defined anywhere in the
 *    component. Confirmed live: clicking the title with Collapsible on throws
 *    `ReferenceError: setVisible is not defined`.
 *
 * 5. (D5) Frontend `_toggleCollapse()` calls
 *    `container.querySelector('.eb-toc-title').addEventListener(...)` with no
 *    null check. Reachable by enabling Collapsible then turning Display Title
 *    off -- the Collapsible toggle then vanishes from the inspector (it is
 *    gated on `displayTitle && !isSticky`), but the attribute itself stays
 *    true. Confirmed live: `TypeError: Cannot read properties of null
 *    (reading 'addEventListener')`, which aborts init() before
 *    `_scrollToTop`, `_hide`, `_show`, `_hideOnDevice`, `_tooltip` and
 *    `_itemCollapsed` ever run.
 *
 * 6. (D6) `_run()` only constructs a ClipboardJS instance for a heading whose
 *    slug matches `clipboardTargetPattern` below. A heading starting with a
 *    digit fails that pattern, so no copy ever happens -- but the "Copied!"
 *    tooltip is shown by a SEPARATE click listener in `_tooltip()` that does
 *    not check whether ClipboardJS actually ran. Confirmed live by
 *    instrumenting `document.execCommand`: zero 'copy' calls, tooltip shown
 *    anyway.
 *
 * 7. (D7) Frontend `_hideOnDevice()` reads
 *    `document.querySelector('.eb-toc-go-top').style.display` with no null
 *    check. That element only exists when scrollToTop is on. Confirmed live
 *    with hideOnDesktop + scrollToTop off: `TypeError: Cannot read
 *    properties of null (reading 'style')`, which aborts init() before
 *    `_tooltip` and `_itemCollapsed` run.
 *
 * 8. (D8) PHP guards the sticky reopen button's title with
 *    `if ( $displayTitle )`, but by that line `$displayTitle` is the STRING
 *    'true'/'false' (see table-of-contents-block.php), which is always
 *    truthy. Confirmed live: `.eb-toc-title` is correctly absent from the
 *    page, but `.eb-toc-button` still renders the title text inside it.
 *
 * 9. (D9) The item-collapse chevron is unclickable in the editor for ANY
 *    user, in any browser -- not a race condition, not a test artifact.
 *    The plugin binds its click listener directly to the injected <svg>,
 *    but WordPress core's own block-editor stylesheet
 *    (wp-includes/css/dist/block-editor/content.min.css) sets
 *    `.wp-block svg:not([draggable]){pointer-events:none}`, and the
 *    chevron has no `draggable` attribute. A click at the chevron's own
 *    coordinates is delivered to the <li> beneath it instead, which has no
 *    listener of its own. Confirmed live: `document.elementFromPoint()` at
 *    the chevron's rendered center resolves to the <li>, not the <svg>,
 *    and Playwright's own actionability check independently refuses the
 *    click for the same reason ("<li> intercepts pointer events") before
 *    any test code forces it. The frontend has no such issue -- this rule
 *    only targets `.wp-block`, an editor-only ancestor class.
 */
export const KNOWN_BUGS = {
	unreachableClass: 'eb-toc-not-scrollToTop',
	inertToolbarAttribute: 'listType',
	/** The regex `_run()` gates ClipboardJS construction on -- see (6) above. */
	clipboardTargetPattern: /^[A-Za-z][-A-Za-z0-9_:.]*$/,
} as const;
