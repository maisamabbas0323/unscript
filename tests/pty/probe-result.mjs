#!/usr/bin/env node
/**
 * tests/pty/probe-result.mjs — pty harness probe for the result page.
 *
 * Drives the REAL `compareResultPage` component (dist/cli/ui/resultPage.js)
 * on a pty with sample content — no network, no transformation, just the
 * interactive UI on real stdio. The Python harness (`tests/pty/run.py`)
 * sends keys and asserts: both panels render, each scrolls independently,
 * Tab switches focus, `c` copies with an honest flash, `d` toggles the
 * details view, a terminal resize switches side-by-side -> stacked, and
 * Enter returns with exit 0.
 *
 * The sample content is long enough that each panel wraps well past its
 * on-screen budget, so scrolling is always exercisable.
 */
import { compareResultPage } from '../../dist/cli/ui/resultPage.js';

const paragraph = (label, n) =>
  `${label} ${n}: the quick brown fox jumps over the lazy dog while the moon ` +
  `rises over the silent hills of the northern valley and the river winds ` +
  `slowly toward the distant sea.`;

const original = Array.from({ length: 12 }, (_, i) => paragraph('Original', i + 1)).join('\n\n');
const reworked = Array.from({ length: 12 }, (_, i) => paragraph('Reworked', i + 1)).join('\n\n');

const details = [
  'KNOWLEDGE APPLIED',
  '  Selection  article · warm · relaxed',
  '  Transformation rules',
  '    · Write in active voice',
  '    · Vary sentence length to a natural rhythm',
  '  Patterns',
  '    · Remove repetitive filler',
  'SOURCES',
  '  • Editorial style guide (rule 12)',
  'CHECK',
  '  PASS Preservation checks passed (9 item(s) verified)',
  'NOTES',
  '  no conflicting rules within this selection',
  'Inspect the retrieved knowledge in depth with `unscript knowledge`.',
];

const page = await compareResultPage({
  original,
  reworked,
  summary: [
    '  DONE  3 rule(s) · 2 pattern(s) · 1 source(s) · 42ms real time',
    '  Selection  article · warm · relaxed',
  ],
  knowledge: {
    rules: [
      { title: 'Write in active voice', source: 'Editorial style guide' },
      { title: 'Vary sentence length to a natural rhythm', source: 'Editorial style guide' },
      { title: 'Prefer concrete nouns over abstract fillers', source: 'Editorial style guide' },
      { title: 'Keep sentences under twenty words', source: 'Editorial style guide' },
    ],
    patterns: [{ title: 'Remove repetitive filler' }, { title: 'Prefer short sentences' }],
    preservationCount: 2,
  },
  sources: [{ name: 'Editorial style guide' }, { name: 'Product writing patterns' }],
  details,
});

process.exit(page.interrupted ? 130 : 0);
