import { describe, expect, it } from 'vitest';
import { extractProtectedItems, validatePreservation } from '../src/transformation/preservation.js';

describe('extractProtectedItems', () => {
  it('extracts numbers, dates, urls, identifiers, and quotes', () => {
    const original =
      'Call +1 about $1,234.50 before 2024-05-01 at https://example.com/release ' +
      '(v2.3.0, INT-404). It says "ship it now" — 45% done.';
    const items = extractProtectedItems(original);
    const kinds = items.map((item) => item.kind);
    expect(kinds).toContain('number');
    expect(kinds).toContain('date');
    expect(kinds).toContain('url');
    expect(kinds).toContain('identifier');
    expect(kinds).toContain('quotation');
  });

  it('extracts explicit requirements and uncertainty markers', () => {
    const items = extractProtectedItems('The service must scale; 50 users may need it.');
    expect(items).toEqual(
      expect.arrayContaining([
        { kind: 'requirement', value: 'must' },
        { kind: 'uncertainty', value: 'may' },
      ]),
    );
  });
});

describe('validatePreservation', () => {
  it('passes when protected items are kept', () => {
    const original = 'Deploy 2024-05-01 to https://example.com; the cost is $1,234.50.';
    const transformed =
      'Roll out the deployment on 2024-05-01 per https://example.com; the total cost is $1,234.50.';
    const report = validatePreservation(original, transformed);
    expect(report.passed).toBe(true);
    expect(report.changedProtectedItems).toEqual([]);
  });

  it('fails and surfaces every changed protected item', () => {
    const original =
      'Version 2.3.0 ships on 2024-05-01. The plan says "deploy to prod" for 42 users.';
    const transformed =
      'Version 9.9.9 ships on 2030-01-01. The plan says "roll out everywhere" for 1 user.';
    const report = validatePreservation(original, transformed);
    expect(report.passed).toBe(false);
    expect(report.changedProtectedItems.length).toBeGreaterThan(0);
    const values = report.changedProtectedItems.map((item) => item.value);
    expect(values).toEqual(expect.arrayContaining(['2.3.0', '2024-05-01', 'deploy to prod', '42']));
  });

  it('treats number rewording to words as preserved', () => {
    const report = validatePreservation('45% of users', '45 percent of users');
    expect(report.passed).toBe(true);
  });

  it('treats missing proper nouns as warnings, not failures', () => {
    const report = validatePreservation(
      'The plan was reviewed by Adele Winters.',
      'The plan was reviewed.',
    );
    expect(report.passed).toBe(true);
    expect(report.changedProtectedItems).toEqual([]);
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('drops changed uncertainty markers into the failure list', () => {
    const report = validatePreservation(
      'The service likely needs 3 replicas.',
      'The service definitely needs 10 replicas.',
    );
    expect(report.passed).toBe(false);
    expect(report.changedProtectedItems.map((item) => item.kind)).toContain('uncertainty');
  });
});
