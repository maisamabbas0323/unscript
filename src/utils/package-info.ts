import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageManifest {
  name: string;
  version: string;
  engines?: { node?: string };
  description?: string;
}

let cached: PackageManifest | undefined;

function packagePath(): string {
  // Both `src/utils` and `dist/utils` sit two levels below the project root,
  // so `../../package.json` resolves in dev (tsx) and in the built CLI.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'package.json');
}

export function readPackageJson(): PackageManifest {
  if (cached) return cached;
  const raw = readFileSync(packagePath(), 'utf8');
  cached = JSON.parse(raw) as PackageManifest;
  return cached;
}

/** The Node.js minimum version declared in package.json "engines". */
export function requiredNodeVersion(): string {
  const pkg = readPackageJson();
  return pkg.engines?.node?.replace(/^>=/, '') ?? '';
}

/** Numeric compare of dotted semver-ish versions ("22.14.0" >= "20.0.0"). */
export function satisfiesMinimum(current: string, minimum: string): boolean {
  const parse = (value: string): number[] =>
    value
      .replace(/^v/, '')
      .split('-')[0]!
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);

  const a = parse(current);
  const b = parse(minimum);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left < right) return false;
    if (left > right) return true;
  }
  return true;
}
