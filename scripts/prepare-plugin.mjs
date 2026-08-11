#!/usr/bin/env node
/**
 * Resolves the plugin build under test and unpacks it to `.plugin-under-test/`,
 * where `.wp-env.json` picks it up.
 *
 * WHY WE TEST A ZIP RATHER THAN THE SOURCE TREE
 * ---------------------------------------------
 * The plugin repo gitignores `dist/index.js`, `dist/style.css` and
 * `dist/frontend/`, and pulls `controls` + `lib/style-handler` from private SSH
 * submodules that need an EB_PAT. A fresh clone does not even boot -- the main
 * PHP file throws if `dist/index.asset.php` is missing. Release zips ship
 * pre-built, so testing the zip both sidesteps the submodule problem entirely
 * and tests the exact artifact users install.
 *
 * RESOLUTION ORDER (first match wins)
 *   1. TOC_PLUGIN_ZIP      -- local path or URL. Use for release candidates.
 *   2. TOC_PLUGIN_VERSION  -- a published wp.org version.
 *   3. (nothing set)       -- latest release, via the wp.org plugin API.
 *
 * Every step validates and reports, so the CI log always states exactly which
 * build was tested. Guessing is never silent.
 */

// Side-effect import: populates process.env from .env.
import './load-env.mjs';

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname( fileURLToPath( import.meta.url ) );
const ROOT = path.resolve( __dirname, '..' );

const PLUGIN_SLUG = 'table-of-contents-block';
const DEST_DIR = path.join( ROOT, '.plugin-under-test' );
const WP_ORG_API = `https://api.wordpress.org/plugins/info/1.0/${ PLUGIN_SLUG }.json`;

const log = ( msg ) => console.log( `[prepare-plugin] ${ msg }` );

function fail( msg ) {
	console.error( `\n[prepare-plugin] FAILED\n\n${ msg }\n` );
	process.exit( 1 );
}

/** Downloads to a temp file and returns its path. */
async function download( url ) {
	log( `Downloading ${ url }` );

	const response = await fetch( url, { redirect: 'follow' } );
	if ( ! response.ok ) {
		fail(
			`Download returned HTTP ${ response.status } for:\n  ${ url }\n\n` +
				`If this is a version number, check it exists on wp.org.`
		);
	}

	const tmp = path.join(
		await fsp.mkdtemp( path.join( os.tmpdir(), 'sbe2e-' ) ),
		`${ PLUGIN_SLUG }.zip`
	);
	await fsp.writeFile( tmp, Buffer.from( await response.arrayBuffer() ) );
	return tmp;
}

/** Resolves the zip to use, downloading if needed. Returns a local path. */
async function resolveZip() {
	const { TOC_PLUGIN_ZIP, TOC_PLUGIN_VERSION } = process.env;

	if ( TOC_PLUGIN_ZIP ) {
		if ( /^https?:\/\//.test( TOC_PLUGIN_ZIP ) ) {
			return { zip: await download( TOC_PLUGIN_ZIP ), source: TOC_PLUGIN_ZIP };
		}

		// Relative paths resolve against the repo root, not the cwd, so the
		// same value works whether invoked from npm or directly.
		const local = path.resolve( ROOT, TOC_PLUGIN_ZIP );
		if ( ! fs.existsSync( local ) ) {
			fail( `TOC_PLUGIN_ZIP points at a file that does not exist:\n  ${ local }` );
		}
		return { zip: local, source: local };
	}

	if ( TOC_PLUGIN_VERSION ) {
		const url = `https://downloads.wordpress.org/plugin/${ PLUGIN_SLUG }.${ TOC_PLUGIN_VERSION }.zip`;
		return { zip: await download( url ), source: url };
	}

	log( 'No zip or version specified -- resolving latest from wp.org.' );
	const info = await fetch( WP_ORG_API ).then( ( r ) => r.json() );
	if ( ! info?.download_link ) {
		fail( `wp.org API returned no download_link for "${ PLUGIN_SLUG }".` );
	}
	log( `Latest published version is ${ info.version }.` );
	return { zip: await download( info.download_link ), source: info.download_link };
}

/**
 * Reads `Version:` out of the plugin header. This is the single most useful
 * line in the whole CI log -- it is the difference between "the suite passed"
 * and "the suite passed against the build we are about to ship".
 */
async function readPluginVersion( mainPhpPath ) {
	const header = ( await fsp.readFile( mainPhpPath, 'utf8' ) ).slice( 0, 4096 );
	return header.match( /^\s*\*?\s*Version:\s*(.+)$/m )?.[ 1 ].trim() ?? null;
}

async function main() {
	const { zip, source } = await resolveZip();

	// Always start clean. A stale build left over from a previous run is the
	// exact failure mode this whole script exists to prevent.
	await fsp.rm( DEST_DIR, { recursive: true, force: true } );
	await fsp.mkdir( DEST_DIR, { recursive: true } );

	log( `Unpacking into ${ path.relative( ROOT, DEST_DIR ) }/` );
	try {
		execFileSync( 'unzip', [ '-q', zip, '-d', DEST_DIR ], { stdio: 'inherit' } );
	} catch {
		fail( `Could not unzip:\n  ${ zip }\n\nIs it a valid zip archive?` );
	}

	// --- Validation gate -------------------------------------------------
	const pluginDir = path.join( DEST_DIR, PLUGIN_SLUG );
	if ( ! fs.existsSync( pluginDir ) ) {
		const found = ( await fsp.readdir( DEST_DIR ) ).join( ', ' ) || '(empty)';
		fail(
			`Expected the archive to contain a "${ PLUGIN_SLUG }/" directory.\n` +
				`Found instead: ${ found }`
		);
	}

	const mainPhp = path.join( pluginDir, `${ PLUGIN_SLUG }.php` );
	if ( ! fs.existsSync( mainPhp ) ) {
		fail( `Archive is missing the plugin's main file:\n  ${ PLUGIN_SLUG }.php` );
	}

	/**
	 * The main PHP file throws on load if this is absent, which surfaces as an
	 * inscrutable WSOD rather than a test failure. Catch it here instead.
	 */
	const assetPhp = path.join( pluginDir, 'dist', 'index.asset.php' );
	if ( ! fs.existsSync( assetPhp ) ) {
		fail(
			`Archive is missing dist/index.asset.php.\n\n` +
				`This means it is an unbuilt source checkout, not a release build.\n` +
				`The plugin throws on activation without it. Use a release zip.`
		);
	}

	const version = await readPluginVersion( mainPhp );
	if ( ! version ) {
		fail( `Could not parse a "Version:" header from ${ PLUGIN_SLUG }.php.` );
	}

	log( '' );
	log( `  Plugin under test : ${ PLUGIN_SLUG }` );
	log( `  Version           : ${ version }` );
	log( `  Source            : ${ source }` );
	log( '' );
	log( 'OK.' );

	// Consumed by the QA markdown reporter so the report states the version.
	await fsp.writeFile(
		path.join( DEST_DIR, 'plugin-under-test.json' ),
		JSON.stringify( { slug: PLUGIN_SLUG, version, source }, null, 2 )
	);
}

main().catch( ( error ) => fail( error.stack || error.message ) );
