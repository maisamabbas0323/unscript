import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/cli/args.js';

describe('parseArgs', () => {
  it('defaults to the interactive landing', () => {
    expect(parseArgs([])).toEqual({
      parsed: { command: 'landing', debug: false, viaFlag: false },
    });
  });

  it('parses readable subcommands', () => {
    expect(parseArgs(['doctor'])).toEqual({
      parsed: { command: 'doctor', debug: false, viaFlag: false },
    });
    expect(parseArgs(['help'])).toEqual({
      parsed: { command: 'help', debug: false, viaFlag: false },
    });
    expect(parseArgs(['version'])).toEqual({
      parsed: { command: 'version', debug: false, viaFlag: false },
    });
  });

  it('parses help/version flags with viaFlag set', () => {
    expect(parseArgs(['--help'])).toEqual({
      parsed: { command: 'help', debug: false, viaFlag: true },
    });
    expect(parseArgs(['-h'])).toEqual({
      parsed: { command: 'help', debug: false, viaFlag: true },
    });
    expect(parseArgs(['--version'])).toEqual({
      parsed: { command: 'version', debug: false, viaFlag: true },
    });
    expect(parseArgs(['-v'])).toEqual({
      parsed: { command: 'version', debug: false, viaFlag: true },
    });
  });

  it('parses --debug with any command', () => {
    expect(parseArgs(['doctor', '--debug'])).toEqual({
      parsed: { command: 'doctor', debug: true, viaFlag: false },
    });
    expect(parseArgs(['--debug', '--version'])).toEqual({
      parsed: { command: 'version', debug: true, viaFlag: true },
    });
  });

  it('help/version flags win over a positional command', () => {
    expect(parseArgs(['doctor', '--help'])).toEqual({
      parsed: { command: 'help', debug: false, viaFlag: true },
    });
  });

  it('recognizes planned future commands', () => {
    for (const word of ['humanize', 'file', 'config']) {
      expect(parseArgs([word])).toEqual({
        parsed: { command: 'planned', debug: false, viaFlag: false, word },
      });
    }
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
