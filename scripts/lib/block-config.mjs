/**
 * Resolves which block's config a script should use.
 *
 * Every script that used to hardcode a plugin slug or block name calls
 * `resolveBlockConfig()` instead. With one block configured, nothing extra is
 * required -- the single entry in blocks/ is picked automatically, so today's
 * workflow (`npm test`, `npm run verify-env`) is unchanged. Add a second
 * blocks/*.config.mjs and every script starts requiring --block=<slug>,
 * because at that point guessing which block you meant would be a worse
 * failure mode than asking.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );
const BLOCKS_DIR = path.join( ROOT, 'blocks' );

/** Reads --block=<slug> off argv, falling back to the BLOCK env var. */
function readRequestedSlug() {
	const fromArgv = process.argv
		.find( ( arg ) => arg.startsWith( '--block=' ) )
		?.slice( '--block='.length );
	return fromArgv || process.env.BLOCK || null;
}

async function availableSlugs() {
	const files = await fs.readdir( BLOCKS_DIR );
	return files
		.filter( ( f ) => f.endsWith( '.config.mjs' ) )
		.map( ( f ) => f.replace( /\.config\.mjs$/, '' ) )
		.sort();
}

/**
 * @returns {Promise<{slug: string, root: string} & import('../../blocks/table-of-contents.config.mjs').default>}
 */
export async function resolveBlockConfig() {
	const slugs = await availableSlugs();

	if ( slugs.length === 0 ) {
		throw new Error(
			`No block configs found in ${ path.relative( ROOT, BLOCKS_DIR ) }/. ` +
				`Expected at least one <slug>.config.mjs.`
		);
	}

	let slug = readRequestedSlug();

	if ( ! slug ) {
		if ( slugs.length === 1 ) {
			slug = slugs[ 0 ];
		} else {
			throw new Error(
				`Multiple blocks are configured (${ slugs.join( ', ' ) }) -- ` +
					`pass --block=<slug> or set BLOCK=<slug> to say which one.`
			);
		}
	}

	if ( ! slugs.includes( slug ) ) {
		throw new Error(
			`Unknown block "${ slug }". Configured blocks: ${ slugs.join( ', ' ) }.`
		);
	}

	const configPath = path.join( BLOCKS_DIR, `${ slug }.config.mjs` );
	const mod = await import( pathToFileURL( configPath ).href );

	return { slug, root: ROOT, ...mod.default };
}

export async function listBlockSlugs() {
	return availableSlugs();
}
