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

- `unscript` — an interactive shell
- `unscript doctor` — real local environment checks (Node, npm, config, terminal)
- `unscript --version` / `unscript --help`
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

| Command                | What it does                                           |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | Run the CLI from source with `tsx` (interactive shell) |
| `npm run dev:doctor`   | Run `unscript doctor` from source                      |
| `npm run typecheck`    | Type-check with `tsc --noEmit` (strict)                |
| `npm run build`        | Compile `src/` to `dist/`                              |
| `npm test`             | Build, then run all tests (vitest)                     |
| `npm run test:watch`   | Run tests in watch mode                                |
| `npm run format`       | Format with Prettier                                   |
| `npm run format:check` | Check formatting                                       |

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

| Command              | Description                                               |
| -------------------- | --------------------------------------------------------- |
| `unscript`           | Start the interactive shell                               |
| `unscript doctor`    | Check the local environment (Node, npm, config, terminal) |
| `unscript --version` | Print the installed version                               |
| `unscript --help`    | Show help                                                 |
| `unscript --debug`   | Show full error details and stack traces                  |

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
  cli/          entry point, argument parsing, commands (help, version, doctor, shell)
  config/       configuration layer (.env loading + validation)
  core/         errors and presentation primitives
  utils/        color, text wrapping, package metadata
  types/        shared types
tests/          unit + integration tests (vitest)
```

## License

MIT
