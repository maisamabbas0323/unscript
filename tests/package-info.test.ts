import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPackageJson, requiredNodeVersion } from '../src/utils/package-info.js';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string;
  version: string;
  engines?: { node?: string };
};

describe('package-info', () => {
  it('reads the version from package.json', () => {
    expect(readPackageJson().version).toBe(manifest.version);
  });

  it('reads the package name', () => {
    expect(readPackageJson().name).toBe('unscript');
  });

  it('exposes the engines node minimum without the >= prefix', () => {
    expect(requiredNodeVersion()).toBe(manifest.engines?.node?.replace(/^>=/, ''));
  });
});
