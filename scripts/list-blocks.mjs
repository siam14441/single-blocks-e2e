#!/usr/bin/env node
/**
 * Lists every configured block, by reading blocks/*.config.mjs.
 *
 * This is what makes CI matrix over blocks automatically instead of needing a
 * YAML edit every time a block is added -- see .github/workflows/e2e.yml,
 * which pipes --json straight into a GitHub Actions matrix.
 *
 *   node scripts/list-blocks.mjs          human-readable, one per line
 *   node scripts/list-blocks.mjs --json   '["table-of-contents"]'
 */

import { listBlockSlugs } from './lib/block-config.mjs';

const slugs = await listBlockSlugs();

if ( process.argv.includes( '--json' ) ) {
	console.log( JSON.stringify( slugs ) );
} else {
	console.log( slugs.join( '\n' ) );
}
