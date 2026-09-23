import { readPackageJson } from '../../utils/package-info.js';

/**
 * `unscript --version` — reads the version from package.json so it
 * never drifts from the manifest.
 */
export async function runVersion(): Promise<number> {
  const pkg = readPackageJson();
  process.stdout.write(`${pkg.version}\n`);
  return 0;
}
