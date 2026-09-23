import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Spawns the real built CLI (dist/cli/index.js). `npm test` builds
 * first, so these run against the production artifact.
 */

const BIN = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));
const HAS_BUILD = existsSync(BIN);

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], stdin = ''): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [BIN, ...args],
      { timeout: 30_000 },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as { code?: unknown }).code === 'number'
            ? ((error as { code?: unknown }).code as number)
            : error
              ? 1
              : 0;
        resolve({ code, stdout, stderr });
      },
    );
    if (stdin !== '') child.stdin?.write(stdin);
    child.stdin?.end();
  });
}

describe.skipIf(!HAS_BUILD)('unscript CLI (built)', () => {
  it('prints the version from package.json', async () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    const result = await runCli(['--version']);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(manifest.version);
  });

  it('shows help and exits 0', async () => {
    const result = await runCli(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('GETTING STARTED');
    expect(result.stdout).toContain('unscript doctor');
  });

  it('supports the readable help subcommand', async () => {
    const result = await runCli(['help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('UNSCRIPT');
    expect(result.stdout).toContain('DIAGNOSTICS');
  });

  it('shows a polished version page via subcommand', async () => {
    const result = await runCli(['version']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Version');
    expect(result.stdout).toContain('Foundation release');
  });

  it('runs doctor and exits 0 (passes or warns, never fails locally)', async () => {
    const result = await runCli(['doctor']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('DOCTOR');
    expect(result.stdout).toContain('Node.js');
  });

  it('rejects an unknown command with exit code 2', async () => {
    const result = await runCli(['frobnicate']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unknown command 'frobnicate'");
  });

  it('reports planned-but-unimplemented commands honestly', async () => {
    const result = await runCli(['humanize']);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('not implemented');
    expect(result.stdout).toContain('later step');
  });

  it('rejects an unknown option with exit code 2', async () => {
    const result = await runCli(['--bogus']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unknown option '--bogus'");
  });

  it('refuses the interactive home screen without a TTY', async () => {
    const result = await runCli([], '');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('needs a terminal');
  });

  it('does not leak config values in errors', async () => {
    const result = await runCli(['--bogus'], '');
    expect(result.stderr).not.toMatch(/UNSCRIPT_DEBUG|process\.env/i);
  });

  it('honors NO_COLOR and drops ANSI codes', async () => {
    const child = spawn(process.execPath, [BIN, 'doctor'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });
    let stdout = '';
    child.stdout!.on('data', (chunk) => {
      stdout += String(chunk);
    });
    const [code] = await once(child, 'close');
    expect(code).toBe(0);
    expect(stdout).not.toContain('\u001b[');
    expect(stdout).toContain('PASS');
  });

  it('exits quietly when stdout is closed early (EPIPE)', async () => {
    // Simulates piping into `head`: the reader closes the pipe mid-output.
    const child = spawn(process.execPath, [BIN, 'doctor'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout!.once('data', () => {
      child.stdout!.destroy();
    });
    const [code] = await once(child, 'close');
    expect(code).toBe(0);
  });
});
