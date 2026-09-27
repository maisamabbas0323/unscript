# Unscript

A terminal-based writing transformation agent. The runtime (Step 5) is
implemented: a TypeScript CLI that retrieves writing rules from a Sanity
Knowledge Base through a hosted **Sanity Context MCP**, transforms text with
**Gemini**, and validates the result deterministically before showing it.

## Status

- `unscript humanize` — real interactive transformation flow (input → content
  type → tone → humanization level → transform → validate → display).
- `unscript knowledge` — inspect exactly which Sanity knowledge documents
  would influence a transformation.
- `unscript doctor` — local checks plus live service checks when credentials
  are configured (Context MCP + Gemini probes are labeled as live checks).
- `unscript config` — honest local configuration status page (no network,
  exit 0): reports exactly which runtime variables are set (redacted labels
  only) and prints setup guidance when something is missing.
- `file` remains recognized but not implemented (exit 1, honest).

Nothing is fabricated: if `SANITY_CONTEXT_MCP_URL`, `SANITY_ORGANIZATION_TOKEN`,
or `GEMINI_API_KEY` are missing, the transform flow fails with setup
instructions; doctor warns without failing.

## Requirements

- Node.js >= 20
- npm
- A Sanity project with the Unscript Knowledge Base schema populated
  (see `unscript-knowledge/`)
- A hosted Sanity Context MCP endpoint in **GROQ mode** for that dataset
- A Google AI Studio API key

## Installation

```sh
npm install
npm run build
cp .env.example .env   # then fill in the three runtime variables
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
| `npm run lint`         | ESLint (flat config, `eslint .`)                             |
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

### Commands

| Command              | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `unscript`           | Interactive home screen                                  |
| `unscript humanize`  | Transform text (content type → tone → level → transform) |
| `unscript knowledge` | Inspect the Sanity knowledge retrieved for a request     |
| `unscript doctor`    | Local check + live service checks when configured        |
| `unscript help`      | Show grouped help (also `-h` / `--help`)                 |
| `unscript version`   | Show a version page (also `-v` / `--version`)            |
| `unscript config`    | Local config status (no network, exit 0)                 |
| `unscript file`      | Recognized, not implemented (exit 1)                     |

The home screen is keyboard-navigated: `↑ ↓` move, `Enter` selects, `Esc`
exits, `Ctrl+C` interrupts.

### The transformation flow

`unscript humanize` walks you through:

1. **Input** — paste or type text; finish with a lone `.` on its own line.
2. **Content type** — living list retrieved from Sanity (email, documentation,
   article, …).
3. **Tone** — living list of tone rules.
4. **Humanization level** — living list (Light, Natural, Human, Deep, …).
5. **Transform** — retrieval → Gemini (`gemini-3.1-flash-lite`) → deterministic
   preservation validation.
6. **Result** — a split-screen compare of original vs. reworked: each panel
   scrolls independently with its own `[c]`/`[C]` copy buttons (terminal
   clipboard via OSC 52), `d` opens the validation/conflict/notes report, and
   the layout reflows between side-by-side and stacked as you resize the
   terminal.

Exit codes: `0` success, `1` operational error, `2` usage error,
`130` interrupted (Ctrl+C).

## Configuration

Copy `.env.example` to `.env` and adjust. Variables:

| Variable                    | Meaning                                           |
| --------------------------- | ------------------------------------------------- |
| `UNSCRIPT_DEBUG`            | Enable debug output (`true`/`false`/`1`/`0`)      |
| `NO_COLOR`                  | Standard; disables colored output when set        |
| `SANITY_CONTEXT_MCP_URL`    | Hosted Context MCP endpoint URL (GROQ mode)       |
| `SANITY_ORGANIZATION_TOKEN` | Organization API token, Context Viewer permission |
| `GEMINI_API_KEY`            | Google AI Studio API key (transformation model)   |

Secrets belong in `.env` only (git-ignored). Never commit a real `.env`, never
hard-code credentials, and never log a token or key. Doctor displays only
redacted labels (e.g. `abcd••••wxyz`).

The Context MCP endpoint is created in the Sanity Context app, not in the Sanity
CLI. The runtime talks JSON-RPC 2.0 (streamable HTTP) to the endpoint and uses
GROQ-mode tools: `initial_context`, `schema_explorer`, `groq_query`. When the
endpoint serves a Knowledge Base instead, commands fail with a clear message.

## Architecture

```
src/
  agent/          orchestration (retrieval → context → model → validation)
  cli/            entry, args, commands (help, version, doctor, landing,
                  transform/humanize, knowledge, planned), ui + runtime
  config/         .env loading + validation; runtime env (Context MCP/Gemini)
  core/           errors, exit codes, check rendering
  gemini/         real Gemini REST client (generateContent), typed errors
  knowledge/      Sanity knowledge types, GROQ retrieval, priority ranking
  mcp/            JSON-RPC/SSE MCP client + Context MCP facade
  transformation/ prompt assembly, output validation, preservation checks
  utils/          colors, secrets/redaction, debug logging, text wrapping
  types/          shared types
tests/            unit + integration tests (vitest)
```

Sanity is the structured policy layer; Gemini is only the language engine. The
agent never lets the model invent writing rules, never fakes retrieval, and
never claims a source exists without a document id.

## Testing

`npm test` builds first (integration tests spawn `dist/cli/index.js`). The
MCP and Gemini clients are unit-tested with injected fake `fetch`
implementations; live calls require the credentials above.
