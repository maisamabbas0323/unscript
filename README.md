<p align="center">
  <img src="assets/logo.png" alt="UNSCRIPT — writing, reworked.">
</p>

<h1 align="center">UNSCRIPT</h1>

<p align="center">
  <strong>writing, reworked.</strong><br>
  A terminal writing transformation agent whose behavior is grounded in
  structured Sanity knowledge, retrieved through Context MCP, applied with
  Gemini 3.1 Flash-Lite, and validated before the result reaches you.
</p>

<p align="center">
  by <a href="https://github.com/maisamabbas0323">Maisam Abbas</a>
  · <a href="https://github.com/maisamabbas0323/unscript">github.com/maisamabbas0323/unscript</a>
  · Sanity project <code>b209xsoi</code>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-e5534b" alt="License: MIT"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D%2020-3fb950" alt="Node.js >= 20"></a>
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6" alt="TypeScript (strict)">
  <img src="https://img.shields.io/badge/Sanity-Context%20MCP-F03E2F" alt="Built on Sanity Context MCP">
</p>

---

## About

Unscript is an interactive terminal application for reworking your own
writing. You paste or type text, choose a content type, a tone, and a
humanization level, and Unscript rewrites it — but it does not let a model
decide what good writing is.

Instead, every writing rule that guides the rewrite lives in a **Sanity
knowledge base**: content types, tone rules, humanization levels, writing
patterns, transformation rules, preservation rules, sources, and user
decisions. At runtime Unscript retrieves the subset of that knowledge
relevant to your request through **Sanity Context MCP**, composes a prompt
from the retrieved documents, asks **Gemini 3.1 Flash-Lite** to do the
rewriting, then runs a deterministic **validation** pass over the result.

Sanity is the policy layer. Gemini is the language engine. Unscript is the
terminal around them.

## Why a terminal?

Writing happens in the terminal for the same reason it happens in an editor:
no login, no web page, no account ceremony. `unscript` opens a home screen
with a keyboard-navigated menu, the transform flow guides you through a
handful of choices, and the result appears as a dashboard — original and
rework side by side, with the applied knowledge and its sources right below —
all in the place you already work. It is deliberately a small, focused tool with
explicit keyboard controls and honest exit codes.

## The Sanity story

Unscript was built for the **Sanity Challenge, Path One — “Ship an Agent That
Queries Real Content.”** The architecture deliberately is _not_:

```text
User ──▶ Gemini ──▶ rewritten text
```

It is:

```text
User
  │  paste or type text, choose content type · tone · level
  ▼
Unscript CLI
  │  interactive terminal flow
  ▼
Sanity Context MCP
  │  read-only GROQ endpoint — initial_context, then groq_query
  ▼
Structured writing knowledge
  │  only the documents relevant to this request
  ▼
Gemini 3.1 Flash-Lite
  │  rewrites language against the retrieved rules
  ▼
Validation
  │  deterministic preservation checks + rule-conflict report
  ▼
Result
```

Every writing rule the model sees arrives in the prompt with a provenance
tag (`[sanity:<document-id>]`). If the knowledge is missing, the tool fails
with setup instructions — it never improvises a rule and never fakes a
source. Retrieval happens through the hosted Context MCP endpoint in GROQ
mode; the MCP session is read-only.

## How the runtime works

1. **Preflight.** The CLI connects to the Context MCP: `initialize` →
   `initial_context` → `tools/list`, in that protocol order (the endpoint
   requires `initial_context` before any query).
2. **Retrieve.** A bounded set of targeted GROQ queries fetches the content
   type, tone, humanization level, writing patterns, and the transformation
   and preservation rules that apply to them — plus their documented sources.
   Only relevant documents are fetched, never the whole dataset.
3. **Assemble.** Rules are merged in documented priority order (higher first)
   into an agent context; explicit `conflictsWith` references become a
   conflict report resolved by documented priority (or flagged unresolved).
4. **Transform.** Gemini `gemini-3.1-flash-lite` receives a system instruction
   assembled entirely from that retrieved context and rewrites the text. A
   malformed JSON response triggers one safe retry; the final fallback is
   plain text plus a note.
5. **Validate.** A deterministic preservation check compares the rework with
   the original and reports any protected item that changed: numbers, dates,
   URLs, technical identifiers, quoted text, explicit requirements, and
   uncertainty markers (names produce warnings, not failures).
6. **Present.** The result is a dashboard: your original and the rework as two
   panels of equal size (sized to the contents), with KNOWLEDGE APPLIED and
   SOURCES cards visible below them, copy-to-clipboard from the first paint,
   and a details view for the full provenance document.

## The knowledge model

The knowledge base is a Sanity dataset (project `b209xsoi`, dataset
`production`) with schemas defined in [`unscript-knowledge/schemaTypes/`](unscript-knowledge/schemaTypes/). The Content
Studio for it lives in [`unscript-knowledge/`](unscript-knowledge/). The eight document types:

| Type                 | Role in a transformation                                                                |
| -------------------- | --------------------------------------------------------------------------------------- |
| `contentType`        | What you are writing — email, documentation, article… defines audience and structure    |
| `humanizationLevel`  | How strongly to transform — Light / Natural / Human / Deep, each with an intensity 1–10 |
| `toneRule`           | A tone to write in — characteristics, preferred/avoided language, sentence rhythm       |
| `writingPattern`     | A recognizable habit in the original text (e.g. passive-voice stacking) with severity   |
| `transformationRule` | A concrete instruction applied when a trigger matches, in documented priority order     |
| `preservationRule`   | What must always survive the rewrite — values, structure, requirements                  |
| `source`             | Provenance for rules and patterns — real references, never invented                     |
| `userDecision`       | Recurring editorial decisions captured so the agent makes them consistently             |

Rules reference content types, tones, and patterns; preservation and
transformation rules can be attached to levels, tones, and content types;
transformation rules may declare which other rules they _conflict_ with.
Slugs are validated `[a-z0-9-]+` and are inlined into GROQ queries.

## Gemini’s role

Unscript calls the Google AI `generativelanguage` REST API
(`gemini-3.1-flash-lite`) with a `systemInstruction` built from the
retrieved knowledge — applicable transformation rules (priority order, with
provenance), preservation rules (“these always stay in force”), documented
conflicts, and user decisions. The client:

- authenticates with `x-goog-api-key` (value read from `GEMINI_API_KEY`),
- never falls back to another model,
- retries transient failures with bounded backoff; auth and invalid-request
  failures fail immediately,
- strips any echoed secret from error messages via `stripSecrets`.

The model has no other source of writing rules. Remove Sanity from the
pipeline and there is nothing left to prompt with — nothing is hard-coded.

## Features

- **Terminal-first workflow** — full-screen interactive UI, keyboard driven,
  with a pinned brand identity and a single live status line during work.
- **Structured content classification** — content type, tone, and
  humanization level lists are fetched _live_ from Sanity at runtime.
- **Grounded retrieval** — every rule comes from a real `groq_query`;
  provenance (`[sanity:<id>]`) is carried into the prompt and shown back.
- **Deterministic validation** — numbers, dates, URLs, identifiers, quotes,
  requirements, and uncertainty are checked before the result is shown.
- **Rule-conflict handling** — documented `conflictsWith` references are
  surfaced with their priority resolution instead of being applied blindly.
- **Result dashboard** — original and rework as equal panels sized to the
  contents, KNOWLEDGE APPLIED + SOURCES cards on screen, terminal clipboard
  copy (OSC 52) from the first paint, and a details view.
- **Diagnostics** — `unscript doctor` runs real local checks, plus clearly
  labeled live service checks when credentials are configured.
- **Honest failure** — missing credentials, endpoints, or knowledge produce
  actionable messages; nothing is fabricated or silently skipped.

## Project structure

```text
src/
  agent/          orchestration: retrieval → context → model → validation
  cli/            entry, args, commands (landing, humanize, knowledge,
                  doctor, config, help, version), runtime wiring, ui
  config/         .env loading + typed runtime configuration
  core/           errors and exit codes (0, 1, 2, 130)
  gemini/         REST client for gemini-3.1-flash-lite
  knowledge/      typed Sanity docs, GROQ retrieval, priority ranking
  mcp/            JSON-RPC (streamable HTTP) client + Context MCP facade
  transformation/ prompt assembly, output validation, preservation checks
  utils/          colors, secret redaction, debug logging, text helpers
tests/             unit + integration tests (vitest); pty UI harness
unscript-knowledge/  Sanity Content Studio — the knowledge model schemas
assets/            UNSCRIPT logo (README banner)
```

## Requirements

- Node.js **>= 20**
- npm
- A populated Sanity dataset for the Unscript knowledge model
  (`unscript-knowledge/` contains the Studio that defines it)
- A hosted **Sanity Context MCP** endpoint in **GROQ mode** for that dataset
- A Google AI Studio API key for the transformation model

## Installation

```sh
npm install
npm run build
cp .env.example .env    # then add the three runtime values (below)
npm link                # optional: exposes the `unscript` command globally
```

Without `npm link`, run the built CLI directly:

```sh
node dist/cli/index.js
```

## Configuration

Credentials live only in `.env` (git-ignored). Copy `.env.example`, set the
runtime variables, and never commit the file. `unscript doctor` tells you
exactly what is configured and what is missing.

| Variable                    | Meaning                                                           |
| --------------------------- | ----------------------------------------------------------------- |
| `UNSCRIPT_DEBUG`            | Debug output on (`true`/`false`/`1`/`0`)                          |
| `NO_COLOR`                  | Standard flag; disables terminal colors when set                  |
| `SANITY_CONTEXT_MCP_URL`    | Hosted Context MCP endpoint URL (GROQ mode), e.g.                 |
|                             | `https://api.sanity.io/v1/context/organizations/<org>/mcp/<name>` |
| `SANITY_ORGANIZATION_TOKEN` | Organization API token with Context Viewer permission             |
| `GEMINI_API_KEY`            | Google AI Studio API key (`https://aistudio.google.com/apikey`)   |

Example `.env` with placeholders:

```dotenv
UNSCRIPT_DEBUG=false
SANITY_CONTEXT_MCP_URL=https://api.sanity.io/v1/context/organizations/YOUR_ORG_ID/mcp/YOUR_ENDPOINT
SANITY_ORGANIZATION_TOKEN=your_organization_token_here
GEMINI_API_KEY=your_google_ai_api_key_here
```

## Usage

Run `unscript` to open the home screen:

```text
  █    █ █    █  ████   ████  █████  ██████ █████  ██████
  █    █ ██   █ █      █      █    █   ██   █    █   ██
  █    █ █ █  █ █      █      █    █   ██   █    █   ██
  █    █ █  █ █  ████  █      █████    ██   █████    ██
  █    █ █   ██      █ █      █ █      ██   █        ██
   ████  █    █  ████   ████  █  █   ██████ █        ██

  writing, reworked.
────────────────────────────────────────────────────────────────────────────

  ! Context MCP unset · ! Gemini unset · v0.1.0

  What shall we do today?

  › Humanize text
    Inspect knowledge
    Inspect environment
    Help
    Version
    Exit

  ↑ ↓ · move   Enter · select   Esc · exit   Ctrl+C · interrupt
```

The status chips under the identity block are _real_ configuration — they
name the exact variable that is missing.

### Commands

| Command              | Description                                                     |
| -------------------- | --------------------------------------------------------------- |
| `unscript`           | Interactive home screen                                         |
| `unscript humanize`  | Transform text: content type → tone → level → transform → check |
| `unscript knowledge` | Inspect the Sanity knowledge that would influence a request     |
| `unscript doctor`    | Local checks + live Context MCP / Gemini probes                 |
| `unscript config`    | Local configuration status (no network, exit 0)                 |
| `unscript help`      | Grouped help (`-h` / `--help` also work)                        |
| `unscript version`   | Version page (`-v` / `--version` also work)                     |

`unscript file` is recognized but deliberately not implemented (exit 1) — the
command surface is stable, the feature is not.

### The `humanize` flow

1. **Input** — type or paste your text. `Enter` submits (or a lone `.`
   terminates), `Ctrl+J` / `Alt+Enter` insert newlines, `Ctrl+D` finishes.
2. **Content type, tone, level** — three selections, lists fetched live from
   Sanity (so the available options are whatever the dataset actually holds).
3. **Transform** — a single live status line shows real phases: retrieving →
   reworking → checking.
4. **Result** — a dashboard showing your original and the rework as two panels
   of equal size (sized to the contents), with the KNOWLEDGE APPLIED and
   SOURCES cards visible below. `Tab` / arrows cycle focus across the panels
   and the knowledge cards, `c` copies the focused panel to the terminal
   clipboard (`C` the other), `d` opens the details view, and the layout
   reflows from side-by-side to stacked as the terminal narrows.

Interactive screens require a real terminal; non-TTY usage exits 1 with an
explanation. Exit codes: `0` success, `1` operational error, `2` usage error,
`130` interrupted.

## Development

| Command              | What it does                                                      |
| -------------------- | ----------------------------------------------------------------- |
| `npm run dev`        | Run the CLI from source with `tsx` (interactive home)             |
| `npm run dev:doctor` | Run `unscript doctor` from source                                 |
| `npm run typecheck`  | `tsc --noEmit` (strict)                                           |
| `npm run build`      | Compile `src/` to `dist/`                                         |
| `npm test`           | Build, then run all tests (vitest)                                |
| `npm run test:watch` | Vitest in watch mode                                              |
| `npm run lint`       | ESLint (flat config)                                              |
| `npm run format`     | Prettier (`format:check` to verify)                               |
| `npm run uicheck`    | Pty snapshot + invariant UI harness (`uicheck:record` to refresh) |

## Testing & verification

- **Unit + integration (vitest).** `npm test` builds first because the
  integration suite spawns the real `dist/cli/index.js`.
- **No network in tests.** The MCP and Gemini clients are tested with
  injected fake `fetch` implementations; there are no live-service assertions.
- **UI harness.** `tests/pty/` drives the real CLI on a pty — golden
  snapshots of the landing tiers, structural invariants (no overflow,
  NO_COLOR, exit codes), and a probe of the result dashboard’s scroll/copy/
  knowledge-cards/details behavior.
- **Static checks.** strict `tsc`, ESLint, and Prettier run in CI-style
  scripts (`npm run typecheck`, `lint`, `format:check`).

## Security

- Credentials belong in **environment variables** — never in the repository.
- `.env` and other local environment files are git-ignored; only
  `.env.example` (placeholder values) is committed.
- No API keys, Sanity tokens, or MCP endpoint URLs with embedded credentials
  exist in the codebase or this documentation.
- Doctor and configuration output only ever show redacted labels
  (head/tail masked), and the code strips known secrets from surfaced errors.
- The Sanity **project ID** (`b209xsoi`) is public and safe to share; the
  **organization token** it needs is always supplied at runtime.

## Sanity Challenge — Path One

Unscript was built for **Path One: “Ship an Agent That Queries Real
Content.”** The submission demonstrates the full loop:

1. Sanity stores the structured writing knowledge (project `b209xsoi`).
2. **Sanity Context MCP** (GROQ mode) exposes that knowledge to the agent
   through `initial_context` + `groq_query`.
3. Unscript retrieves only the knowledge relevant to the request.
4. **Gemini 3.1 Flash-Lite** transforms the text using only that retrieved
   context, with provenance preserved.
5. **Validation** checks the result deterministically before it is shown.

Where a judge should look:

- [`src/knowledge/`](src/knowledge/) — typed document model and GROQ retrieval
- [`src/mcp/contextMcp.ts`](src/mcp/contextMcp.ts) — the Context MCP facade
- [`src/agent/agent.ts`](src/agent/agent.ts) — the orchestration flow
- [`unscript-knowledge/schemaTypes/`](unscript-knowledge/schemaTypes/) — the
  knowledge model the retrieval queries run against
- [`unscript-knowledge/sanity.config.ts`](unscript-knowledge/sanity.config.ts) — Studio project `b209xsoi`

To run it live you need the dataset populated and a Context MCP endpoint
(GROQ mode) for it, plus `GEMINI_API_KEY` in `.env` — `unscript doctor`
reports exactly what is missing.

## License

[MIT](LICENSE) © Maisam Abbas
