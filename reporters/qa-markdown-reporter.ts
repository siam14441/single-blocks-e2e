/**
 * Emits a QA report in the format the team already uses by hand, so an
 * automated run lands in the same review flow as a manual one instead of
 * becoming a second, competing artifact nobody reads.
 *
 * Conventions borrowed from the existing reports in eb-qa-reports/:
 *   - filename  qa-report-<block-slug>-e2e-v<version>-<date>.md
 *   - a Verdict line immediately under the H1
 *   - a borderless metadata table
 *   - result tables of | # | Test | Result |, grouped by describe() block
 *   - status markers pair an emoji WITH text, never emoji alone, so the
 *     reports stay greppable
 *   - short declarative sentences; full paths and error text preserved verbatim
 *
 * Writes to artifacts/. Copying into eb-qa-reports/ stays a human decision --
 * this reporter never writes outside its own repo.
 *
 * BLOCK-AGNOSTIC BY DESIGN: this file names no block. It reads which block ran
 * from scripts/verify-environment.mjs's output (artifacts/environment.<slug>.json)
 * -- see readEnvironment() below for how the slug itself is determined.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
	FullConfig,
	FullResult,
	Reporter,
	Suite,
	TestCase,
	TestResult,
} from '@playwright/test/reporter';

/**
 * Playwright's `outcome` -- NOT `status` -- is what separates a regression from
 * a defect we already knew about. A test.fail() case has status 'failed' and
 * outcome 'expected': it documents a confirmed bug, and its failing is the
 * correct result. Reading `status` alone would report every documented defect
 * as a fresh failure and tell the team not to ship on every single run, which
 * is exactly how a report becomes noise people stop reading.
 */
type Outcome = 'expected' | 'unexpected' | 'flaky' | 'skipped';

interface Row {
	group: string;
	title: string;
	status: TestResult[ 'status' ];
	outcome: Outcome;
	/** status 'failed' + outcome 'expected' => a documented, expected defect. */
	isKnownDefect: boolean;
	error?: string;
	durationMs: number;
}

/** Playwright colourises assertion messages; raw ANSI in markdown is unreadable. */
// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*m/g;

/** Written by scripts/verify-environment.mjs during preflight. */
interface Environment {
	slug?: string;
	displayName?: string;
	baseURL?: string;
	wpVersion?: string | null;
	phpVersion?: string | null;
	pluginSlug?: string;
	pluginVersion?: string;
	otherActivePlugins?: string[];
}

function marker( row: Row ): string {
	if ( row.isKnownDefect ) {
		return '⚠️ KNOWN DEFECT';
	}
	if ( row.outcome === 'flaky' ) {
		return '⚠️ FLAKY';
	}
	switch ( row.status ) {
		case 'passed':
			return '**PASS**';
		case 'timedOut':
			return '❌ FAIL (timeout)';
		case 'interrupted':
			return '🚫 BLOCKED';
		case 'skipped':
			return 'ℹ️ SKIPPED';
		default:
			return '❌ FAIL';
	}
}

export default class QaMarkdownReporter implements Reporter {
	private readonly rows: Row[] = [];
	private artifactsDir = 'artifacts';
	private startedAt = Date.now();

	onBegin( config: FullConfig, _suite: Suite ) {
		this.startedAt = Date.now();
		this.artifactsDir =
			process.env.WP_ARTIFACTS_PATH ||
			path.join( path.dirname( config.configFile ?? process.cwd() ), 'artifacts' );
	}

	onTestEnd( test: TestCase, result: TestResult ) {
		const outcome = test.outcome() as Outcome;

		this.rows.push( {
			// titlePath() is [ '', project, file, ...describes, title ]. The
			// describe chain is everything between the file and the test name.
			group: test.titlePath().slice( 3, -1 ).join( ' > ' ) || 'Ungrouped',
			title: test.title,
			status: result.status,
			outcome,
			isKnownDefect:
				outcome === 'expected' &&
				( result.status === 'failed' || result.status === 'timedOut' ),
			error: result.error?.message
				?.replace( ANSI, '' )
				.split( '\n' )
				.filter( ( line ) => line.trim() )
				.slice( 0, 8 )
				.join( '\n' )
				.trim(),
			durationMs: result.duration,
		} );
	}

	async onEnd( result: FullResult ) {
		// verify-suite deliberately runs the suite expecting failure; a report
		// from that run would be misleading if filed alongside real ones.
		if ( process.env.SKIP_QA_REPORT ) {
			return;
		}

		const env = this.readEnvironment();
		const date = new Date().toISOString().slice( 0, 10 );
		const version = env.pluginVersion ?? 'unknown';
		const slug = env.slug ?? 'unknown-block';

		const file = path.join(
			this.artifactsDir,
			`qa-report-${ slug }-e2e-v${ version }-${ date }.md`
		);

		fs.mkdirSync( this.artifactsDir, { recursive: true } );
		fs.writeFileSync( file, this.render( result, env, date, version ), 'utf8' );

		console.log( `\n[qa-report] ${ file }` );
	}

	/**
	 * Determines which block ran and loads the environment snapshot
	 * scripts/verify-environment.mjs wrote for it.
	 *
	 * The reporter runs inside `playwright test`, which does not accept the
	 * scripts' `--block=<slug>` flag, so block selection here is: the BLOCK
	 * env var if set; otherwise, if exactly one `environment.*.json` exists in
	 * artifacts/ (true for every CI run, since each matrix job starts from a
	 * fresh checkout and tests one block), use it; otherwise fall back to the
	 * most recently written one and say so, rather than silently guessing.
	 */
	private readEnvironment(): Environment {
		const explicit = process.env.BLOCK;
		if ( explicit ) {
			return this.readEnvironmentFile( explicit );
		}

		let candidates: string[] = [];
		try {
			candidates = fs
				.readdirSync( this.artifactsDir )
				.filter( ( f ) => /^environment\..+\.json$/.test( f ) );
		} catch {
			return {}; // artifacts/ doesn't exist yet -- preflight was skipped.
		}

		if ( candidates.length === 0 ) {
			return {};
		}

		if ( candidates.length > 1 ) {
			candidates.sort(
				( a, b ) =>
					fs.statSync( path.join( this.artifactsDir, b ) ).mtimeMs -
					fs.statSync( path.join( this.artifactsDir, a ) ).mtimeMs
			);
			console.log(
				`[qa-report] Multiple environment files found (${ candidates.join( ', ' ) }); ` +
					`using the most recent: ${ candidates[ 0 ] }. Set $BLOCK to be explicit.`
			);
		}

		try {
			return JSON.parse(
				fs.readFileSync( path.join( this.artifactsDir, candidates[ 0 ] ), 'utf8' )
			);
		} catch {
			return {};
		}
	}

	private readEnvironmentFile( slug: string ): Environment {
		try {
			return JSON.parse(
				fs.readFileSync(
					path.join( this.artifactsDir, `environment.${ slug }.json` ),
					'utf8'
				)
			);
		} catch {
			return {};
		}
	}

	private render(
		result: FullResult,
		env: Environment,
		date: string,
		version: string
	): string {
		const total = this.rows.length;
		const passed = this.rows.filter( ( r ) => r.status === 'passed' ).length;
		const knownDefects = this.rows.filter( ( r ) => r.isKnownDefect );
		const flaky = this.rows.filter( ( r ) => r.outcome === 'flaky' ).length;
		const skipped = this.rows.filter( ( r ) => r.status === 'skipped' ).length;

		// Only UNEXPECTED failures block a release. A known defect failing is
		// the documented, correct result -- it is information, not a blocker.
		const regressions = this.rows.filter( ( r ) => r.outcome === 'unexpected' );

		let verdict: string;
		if ( regressions.length > 0 ) {
			verdict = `**Verdict: ❌ FAIL -- ${ regressions.length } of ${ total } checks regressed. Do not ship.**`;
		} else if ( knownDefects.length > 0 ) {
			verdict =
				`**Verdict: ✅ PASS -- no regressions. ` +
				`${ knownDefects.length } known defect(s) still open, none introduced by this build.**`;
		} else {
			verdict = `**Verdict: ✅ PASS -- ${ passed } of ${ total } checks passed. No blockers.**`;
		}

		const displayName = env.displayName ?? env.slug ?? 'Unknown block';
		const slug = env.slug ?? 'unknown-block';

		const out: string[] = [];

		out.push( `# QA Report: ${ displayName } v${ version } (automated E2E)` );
		out.push( '' );
		out.push( verdict );
		out.push( '' );

		// --- Metadata ---------------------------------------------------
		out.push( '| | |' );
		out.push( '|---|---|' );
		out.push( `| Date | ${ date } |` );
		out.push( `| Suite | \`single-blocks-e2e\` -- \`${ slug }.spec.ts\` |` );
		out.push( `| Site | ${ env.baseURL ?? 'unknown' } |` );
		out.push( `| WP | ${ env.wpVersion ?? 'unknown' } |` );
		out.push( `| PHP | ${ env.phpVersion ?? 'not exposed via REST' } |` );
		out.push( `| Plugin | ${ env.pluginSlug ?? 'unknown' } v${ version } |` );
		out.push(
			`| Other plugins | ${
				env.otherActivePlugins?.length ? env.otherActivePlugins.join( ', ' ) : 'none. Clean site.'
			} |`
		);
		out.push( `| Mode | automated, structural assertions, screenshots on failure only |` );
		out.push( `| Duration | ${ Math.round( ( Date.now() - this.startedAt ) / 1000 ) }s |` );
		out.push( '' );
		out.push(
			`**Coverage: ${ total } automated checks. ${ passed } passed. ` +
				`${ regressions.length } regressed. ${ knownDefects.length } known defect(s). ` +
				`${ flaky } flaky. ${ skipped } skipped.**`
		);
		out.push( '' );
		out.push( '---' );
		out.push( '' );

		// --- Results, grouped by describe() -----------------------------
		out.push( '## Test results' );
		out.push( '' );

		let n = 0;
		for ( const group of [ ...new Set( this.rows.map( ( r ) => r.group ) ) ] ) {
			out.push( `### ${ group }` );
			out.push( '' );
			out.push( '| # | Test | Result |' );
			out.push( '|---|---|---|' );
			for ( const row of this.rows.filter( ( r ) => r.group === group ) ) {
				n += 1;
				out.push( `| ${ n } | ${ row.title } | ${ marker( row ) } |` );
			}
			out.push( '' );
		}

		// --- Regressions: things that broke in THIS build -----------------
		if ( regressions.length ) {
			out.push( '---' );
			out.push( '' );
			out.push( '## Fail detail' );
			out.push( '' );
			out.push( 'These failed unexpectedly. Each is a regression in this build.' );
			out.push( '' );
			for ( const [ i, f ] of regressions.entries() ) {
				out.push( `### F${ i + 1 }: ${ f.title }` );
				out.push( '' );
				out.push( `Group: ${ f.group }` );
				out.push( '' );
				out.push( '```' );
				out.push( f.error ?? '(no error message captured)' );
				out.push( '```' );
				out.push( '' );
			}
		}

		// --- Known defects: documented, still open, not blockers -----------
		if ( knownDefects.length ) {
			out.push( '---' );
			out.push( '' );
			out.push( '## Known defects (expected failures)' );
			out.push( '' );
			out.push( 'Confirmed bugs, marked `test.fail()` in the spec. Failing here is the' );
			out.push( 'expected result and does not block a release. If one of these starts' );
			out.push( 'passing, Playwright reports it as an unexpected pass -- that is the' );
			out.push( 'signal the bug has been fixed and the marker should be removed.' );
			out.push( '' );
			out.push( 'See the comment above each test for the full reproduction.' );
			out.push( '' );
			for ( const [ i, d ] of knownDefects.entries() ) {
				out.push( `### D${ i + 1 }: ${ d.title }` );
				out.push( '' );
				out.push( `Group: ${ d.group }` );
				out.push( '' );
				out.push( '```' );
				out.push( d.error ?? '(no error message captured)' );
				out.push( '```' );
				out.push( '' );
			}
		}

		out.push( '---' );
		out.push( '' );
		out.push( '## Scope note' );
		out.push( '' );
		out.push( `Covers whichever spec files ran for ${ displayName } this pass. Full scope` );
		out.push( `is documented at the top of each file under tests/specs/${ slug }*.spec.ts.` );
		out.push( '' );
		out.push( `Run status: ${ result.status }.` );
		out.push( '' );

		return out.join( '\n' );
	}
}
