import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/cli/args.js';

describe('parseArgs', () => {
  it('defaults to the interactive shell', () => {
    expect(parseArgs([])).toEqual({ parsed: { command: 'shell', debug: false } });
  });

  it('parses the doctor command', () => {
    expect(parseArgs(['doctor'])).toEqual({ parsed: { command: 'doctor', debug: false } });
  });

  it('parses --help and -h', () => {
    expect(parseArgs(['--help'])).toEqual({ parsed: { command: 'help', debug: false } });
    expect(parseArgs(['-h'])).toEqual({ parsed: { command: 'help', debug: false } });
  });

  it('parses --version and -v', () => {
    expect(parseArgs(['--version'])).toEqual({ parsed: { command: 'version', debug: false } });
    expect(parseArgs(['-v'])).toEqual({ parsed: { command: 'version', debug: false } });
  });

  it('parses --debug with any command', () => {
    expect(parseArgs(['doctor', '--debug'])).toEqual({
      parsed: { command: 'doctor', debug: true },
    });
    expect(parseArgs(['--debug', '--version'])).toEqual({
      parsed: { command: 'version', debug: true },
    });
  });

  it('help wins over other flags', () => {
    expect(parseArgs(['doctor', '--help'])).toEqual({ parsed: { command: 'help', debug: false } });
  });

  it('rejects unknown commands', () => {
    expect(parseArgs(['frobnicate'])).toEqual({ error: "Unknown command 'frobnicate'." });
  });

  it('rejects unknown options', () => {
    expect(parseArgs(['--bogus'])).toEqual({ error: "Unknown option '--bogus'." });
  });

  it('rejects extra positional arguments', () => {
    expect(parseArgs(['doctor', 'extra'])).toEqual({ error: "Unexpected argument 'extra'." });
  });
});
