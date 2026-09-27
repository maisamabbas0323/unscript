#!/usr/bin/env node
/**
 * `npm run uicheck` — run the pty UI regression harness.
 *
 * Builds first (done by the npm script), then drives the real CLI on a
 * pty and compares the rendered screens against committed golden
 * snapshots plus structural invariants (width/height fit, NO_COLOR, exit
 * codes). The heavy lifting lives in the stdlib-only Python driver
 * `tests/pty/run.py` (a real pty needs a real controlling terminal,
 * which Node cannot allocate headless from `child_process`).
 *
 * When python3 is not installed this prints a skip note and exits 0 —
 * the harness must never gate `npm test`. Real assertion failures from
 * run.py are never masked.
 */
import { spawnSync } from 'node:child_process';

const probe = spawnSync('python3', ['--version'], { encoding: 'utf8' });
if (probe.status !== 0) {
  console.log('uicheck: python3 not found -> pty snapshots unchecked. Install python3 and re-run.');
  process.exit(0);
}

const record = process.argv.slice(2).includes('record');
const args = ['tests/pty/run.py', ...(record ? ['--record'] : [])];

const result = spawnSync('python3', args, { stdio: 'inherit', cwd: process.cwd() });
process.exit(result.status ?? 1);
