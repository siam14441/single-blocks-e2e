/**
 * Minimal .env loader.
 *
 * A dependency-free stand-in for `dotenv`. This repo pins every dependency
 * exactly so CI cannot drift, and a 30-line parser is a better trade than one
 * more package in that set for a file format this simple.
 *
 * Real environment variables always win, so CI (which sets them directly) is
 * never overridden by a stray local .env.
 *
 * Import for side effects, before anything reads process.env:
 *   import './scripts/load-env.mjs';
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const ENV_FILE = path.join( ROOT, '.env' );

if ( fs.existsSync( ENV_FILE ) ) {
	for ( const rawLine of fs.readFileSync( ENV_FILE, 'utf8' ).split( '\n' ) ) {
		const line = rawLine.trim();
		if ( ! line || line.startsWith( '#' ) ) {
			continue;
		}

		const eq = line.indexOf( '=' );
		if ( eq === -1 ) {
			continue;
		}

		const key = line.slice( 0, eq ).trim();
		let value = line.slice( eq + 1 ).trim();

		// Strip one matching pair of surrounding quotes, if present.
		if ( value.length >= 2 && /^(".*"|'.*')$/s.test( value ) ) {
			value = value.slice( 1, -1 );
		}

		// Never clobber a variable the environment already set.
		if ( process.env[ key ] === undefined ) {
			process.env[ key ] = value;
		}
	}
}
