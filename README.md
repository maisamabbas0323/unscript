# Unscript

A terminal-based writing transformation agent. **This is the Step 1 foundation only.**

Unscript's final architecture will be a CLI that drives an agent over Sanity
content through MCP, transforms writing with a language model, validates the
result, and prints polished output. None of that exists yet.

## Step 1 scope

This repository currently contains the **production foundation**: a strict
TypeScript, ESM CLI with a clean structure that later steps can extend with
agent, MCP, Sanity, Gemini, transformation, and validation modules.

Implemented now:

- `unscript` — an interactive home screen (wordmark, version, keyboard menu)
- `unscript doctor` — real local environment checks (Node, npm, config, terminal)
- `unscript help` / `unscript version` — readable subcommands (flags `-h`/`-v` still work)
- configuration layer with `.env` support

**Not implemented (do not assume they work):** Gemini, Sanity, Sanity Context
MCP, the transformation engine, and content validation. No external service is
connected. The CLI says so instead of pretending.

## Requirements

- Node.js >= 20
- npm

## Installation

```sh
npm install
npm run build
```

## Development commands

| Command                | What it does                                                 |
| ---------------------- | ------------------------------------------------------------ |
| `npm run dev`          | Run the CLI from source with `tsx` (interactive home screen) |
| `npm run dev:doctor`   | Run `unscript doctor` from source                            |
| `npm run typecheck`    | Type-check with `tsc --noEmit` (strict)                      |
| `npm run build`        | Compile `src/` to `dist/`                                    |
| `npm test`             | Build, then run all tests (vitest)                           |
| `npm run test:watch`   | Run tests in watch mode                                      |
| `npm run format`       | Format with Prettier                                         |
| `npm run format:check` | Check formatting                                             |

## Using the CLI

```sh
# via npm scripts (dev)
npm run dev

# the built binary
node dist/cli/index.js

# link globally, then use the `unscript` command anywhere
npm link
unscript --help
```

### Supported commands

| Command            | Description                                               |
| ------------------ | --------------------------------------------------------- |
| `unscript`         | Open the interactive home screen                          |
| `unscript help`    | Show grouped help (also `-h` / `--help`)                  |
| `unscript version` | Show a version page (also `-v` / `--version`)             |
| `unscript doctor`  | Check the local environment (Node, npm, config, terminal) |
| `unscript --debug` | Show full error details and stack traces                  |

The home screen is keyboard-navigated: `↑ ↓` move, `Enter` selects, `Esc`
exits, `Ctrl+C` interrupts. `unscript --version` prints the bare version for
scripts; `unscript version` prints the human-facing page.

Future subcommands (`humanize`, `file`, `config`) are recognized but report
"not implemented yet" with exit code `1` — the surface is stable, the features
are not faked.

Exit codes: `0` success, `1` operational error, `2` usage error,
`130` interrupted (Ctrl+C).

## Configuration

Copy `.env.example` to `.env` and adjust. Current variables:

| Variable         | Meaning                                      |
| ---------------- | -------------------------------------------- |
| `UNSCRIPT_DEBUG` | Enable debug output (`true`/`false`/`1`/`0`) |
| `NO_COLOR`       | Standard; disables colored output when set   |

Secrets belong in `.env` only (git-ignored). Never commit a real `.env`, and
never hard-code credentials in source code. Future steps add Gemini, Sanity,
and MCP configuration here.

## Project structure

```
src/
  cli/
    index.ts          entry point, dispatch
    args.ts           strict argument parsing (subcommands + flags)
    commands/         help, version, doctor, landing, planned
    ui/               theme, banner, menu, terminal (rendering)
  config/             configuration layer (.env loading + validation)
  core/               errors, check rendering
  utils/              color, text wrapping, package metadata
  types/              shared types
tests/                unit + integration tests (vitest)
```

## License

MIT
