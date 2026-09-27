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
    expect(result.stdout).toContain('unscript humanize');
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
    expect(result.stdout).toContain('Runtime release');
  });

  it('runs doctor and exits 0 (passes or warns, never fails locally)', async () => {
    const result = await runCli(['doctor']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('DOCTOR');
    expect(result.stdout).toContain('Node.js');
  }, 90_000);

  it('rejects an unknown command with exit code 2', async () => {
    const result = await runCli(['frobnicate']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unknown command 'frobnicate'");
  });

  it('reports planned-but-unimplemented commands honestly', async () => {
    const result = await runCli(['file']);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('not implemented');
    expect(result.stdout).toContain('later step');
  });

  it('refuses the transform flow without a TTY', async () => {
    const result = await runCli(['humanize']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('needs a terminal');
  });

  it('refuses the knowledge inspector without a TTY', async () => {
    const result = await runCli(['knowledge']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('needs a terminal');
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
  }, 90_000);

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
  }, 90_000);

  /** Spawn the CLI with a specific environment; returns stdout+stderr. */
  function spawnCli(args: string[], env: NodeJS.ProcessEnv): Promise<SpawnResult> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [BIN, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      });
      let stdout = '';
      let stderr = '';
      child.stdout!.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr!.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('close', (code) => resolve({ code, stdout, stderr }));
    });
  }

  it('reports local config status without a terminal or network', async () => {
    const result = await spawnCli(['config'], {
      ...process.env,
      SANITY_CONTEXT_MCP_URL: '',
      SANITY_ORGANIZATION_TOKEN: '',
      GEMINI_API_KEY: '',
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('UNSCRIPT / CONFIG');
    expect(result.stdout).toContain('SANITY_CONTEXT_MCP_URL unset');
    expect(result.stdout).toContain('SANITY_ORGANIZATION_TOKEN unset');
    expect(result.stdout).toContain('GEMINI_API_KEY unset');
    expect(result.stdout).toContain('Setup needed');
  }, 90_000);

  it('config shows redacted labels and never prints configured secrets', async () => {
    const result = await spawnCli(['config'], {
      ...process.env,
      SANITY_CONTEXT_MCP_URL: 'https://api.sanity.io/v1/context/organizations/org/mcp/main',
      SANITY_ORGANIZATION_TOKEN: 'sk-org-super-secret-1234',
      GEMINI_API_KEY: 'AIza-alpha-beta-9876',
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Runtime ready');
    expect(result.stdout).toContain('sk-o');
    expect(result.stdout).toContain('AIza');
    const all = result.stdout + result.stderr;
    expect(all).not.toContain('super-secret');
    expect(all).not.toContain('alpha-beta');
  }, 90_000);
});
