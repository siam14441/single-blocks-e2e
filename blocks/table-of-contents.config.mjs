/**
 * Everything that makes the Table of Contents suite specific to THIS plugin.
 *
 * This is the one file a new block copies and edits. Every script under
 * scripts/ and the QA reporter read from this instead of hardcoding a plugin
 * slug or block name -- see scripts/lib/block-config.mjs for how it's loaded.
 *
 * File is named `<slug>.config.mjs`; the slug ("table-of-contents") is also
 * the spec filename convention (`tests/specs/table-of-contents.spec.ts`) and
 * the support folder (`tests/support/table-of-contents/`). Keep all three in
 * sync -- scripts/list-blocks.mjs and the CI matrix derive the slug from this
 * filename.
 */

export default {
	/** Shown in QA report headings and CI job names. */
	displayName: 'Table Of Contents',

	/** Directory name inside the plugin zip, and its wp.org slug. */
	pluginSlug: 'table-of-contents-block',

	/** Full registered block name, namespace/slug. */
	blockName: 'table-of-contents-block/table-of-contents-block',

	/**
	 * Versions known to be broken, used by verify-suite.mjs as the negative
	 * control. v1.3.4 is the release that shipped with the block silently
	 * failing to register on WP 6.5+ -- see the README.
	 */
	knownBrokenVersions: [ '1.3.4', '1.3.5', '1.3.6' ],

	/**
	 * Other plugins that, if active, make this block's own registration a
	 * no-op -- so testing "against" this block would silently test nothing.
	 *
	 * `pluginMatch` identifies the conflicting plugin among /wp/v2/plugins
	 * results. `evidence` is shown in the preflight failure so the message
	 * states a proven consequence, not a hypothetical one -- see the
	 * verify-environment.mjs commit history for how this was confirmed.
	 */
	conflictingBlocks: [
		{
			pluginMatch: /essential-?blocks/i,
			blockName: 'essential-blocks/table-of-contents',
			evidence:
				`Essential Blocks ships its own "Table of Contents" block under the\n` +
				`same display name. Verified: with Essential Blocks active, the\n` +
				`inserter check in this suite PASSES -- against Essential Blocks'\n` +
				`block, not the plugin under test. A release could be signed off on\n` +
				`evidence that never touched the plugin being shipped.`,
		},
	],
};
