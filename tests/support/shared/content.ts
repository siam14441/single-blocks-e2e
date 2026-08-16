/**
 * Post-content builders and fixtures shared across specs.
 *
 * Block-agnostic on purpose -- headings are core blocks, and a sibling block
 * suite will want the same shapes.
 */

import type { RequestUtils } from '@wordpress/e2e-test-utils-playwright';

/**
 * Creates a published fixture post.
 *
 * Exists to work around an upstream typing bug: `CreatePostPayload` declares
 * `date_gmt` as required, while the REST API treats it as optional and defaults
 * it to now. Rather than casting at six call sites, supply it once here.
 */
export async function createFixturePost(
	requestUtils: RequestUtils,
	{ title, content }: { title: string; content: string }
) {
	return requestUtils.createPost( {
		title,
		content,
		status: 'publish',
		date_gmt: new Date().toISOString(),
	} );
}

export interface HeadingSpec {
	content: string;
	level: number;
}

/**
 * The standard heading shape used across the suite: two top-level sections,
 * two subsections under the first, and one deeper level.
 *
 *   H2  Getting started
 *   H3    Installation
 *   H3    Configuration
 *   H4      Advanced options
 *   H2  Troubleshooting
 *
 * Chosen so a single fixture exercises three things at once: ordering,
 * two-level nesting, and a level-skip that a naive stack-based renderer gets
 * wrong. All-ASCII deliberately -- JS and PHP slugify non-ASCII headings
 * differently, so those belong in their own focused test, not in the fixture
 * every other assertion depends on.
 */
export const STANDARD_HEADINGS: HeadingSpec[] = [
	{ content: 'Getting started', level: 2 },
	{ content: 'Installation', level: 3 },
	{ content: 'Configuration', level: 3 },
	{ content: 'Advanced options', level: 4 },
	{ content: 'Troubleshooting', level: 2 },
];

/** Serializes a core/heading block as post content. */
export function headingBlock( { content, level }: HeadingSpec ): string {
	return [
		`<!-- wp:heading {"level":${ level }} -->`,
		`<h${ level } class="wp-block-heading">${ content }</h${ level }>`,
		`<!-- /wp:heading -->`,
	].join( '\n' );
}

/** Serializes a spacer, used to push a scroll target below the fold. */
export function spacerBlock( heightPx = 1200 ): string {
	return [
		`<!-- wp:spacer {"height":"${ heightPx }px"} -->`,
		`<div style="height:${ heightPx }px" aria-hidden="true" class="wp-block-spacer"></div>`,
		`<!-- /wp:spacer -->`,
	].join( '\n' );
}

/** Joins block markup with the blank line WordPress expects between blocks. */
export function joinBlocks( ...blocks: string[] ): string {
	return blocks.filter( Boolean ).join( '\n\n' );
}

/** Serializes a bare paragraph, used as filler content in scroll/layout
 *  fixtures where a heading isn't wanted. */
export function paragraphBlock( text: string ): string {
	return [
		`<!-- wp:paragraph -->`,
		`<p>${ text }</p>`,
		`<!-- /wp:paragraph -->`,
	].join( '\n' );
}

/**
 * Serializes the Table of Contents block for a REST-created fixture post.
 *
 * WHY blockId IS MANDATORY HERE
 * ----------------------------
 * The PHP renderer reads `$attributes['blockId']` directly, and blockId is not
 * among the defaults it merges in. A block saved without one therefore emits
 *
 *   Warning: Undefined array key "blockId" in table-of-contents-block.php:166
 *
 * which PHP prints into the response body -- corrupting the REST JSON for
 * every subsequent request, not just the page being rendered.
 *
 * Real posts always carry a blockId because the editor generates one on mount,
 * so a fixture without one tests a state users never reach. We supply a
 * realistic id (the editor's own format: `eb-toc-` plus five base36 chars)
 * rather than assert on the warning.
 *
 * The unguarded read is still a genuine robustness gap, worth reporting on its
 * own merits -- but hardening against it belongs in the plugin, not here.
 *
 * `attributes` is the only way a REST-created fixture post carries settings --
 * there is no page-object equivalent of setAttributes() for a block that was
 * never opened in the editor. `blockId` in the second param always wins over
 * a same-named key accidentally included in `attributes`.
 */
export function tocBlock(
	attributes: Record< string, unknown > = {},
	blockId = 'eb-toc-tst01'
): string {
	const json = JSON.stringify( { ...attributes, blockId } );
	return `<!-- wp:table-of-contents-block/table-of-contents-block ${ json } /-->`;
}
