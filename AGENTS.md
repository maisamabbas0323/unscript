# AGENTS.md

Unscript: a terminal-based writing transformation agent. The runtime agent
layer (Step 5) is built: a TypeScript CLI that retrieves writing rules from a
Sanity Knowledge Base through the hosted **Sanity Context MCP**, transforms
text with **Gemini**, and validates the result deterministically. Still
planned: `file` and `config` commands.

## Hard constraints (do not violate)

- **Never fake integrations**: no fabricated AI responses, no pretend MCP
  connectivity, no invented Sanity docs, no hardcoded endpoints or keys. The
  MCP client, Gemini client, and retrieval queries are real code paths; when
  configuration is missing, commands fail honestly with setup instructions.
- **Never put secrets in code or commits.** `.env` is git-ignored; only
  `.env.example` is committed (name-only placeholders). Never log environment
  variable values (tokens, keys, URLs with embedded credentials), never embed
  them in error messages, and only ever display redacted labels via
  `redactSecret` in `src/utils/secrets.ts`.
- **Tell the truth in output**: `doctor` runs real local checks and, when
  credentials are configured, clearly labeled live checks; `--help`, the home
  screen, and error pages must not imply unimplemented features exist. `file`
  and `config` are recognized but exit 1 with "not implemented yet".
- **Exit codes**: `0` success, `1` operational, `2` usage, `130` Ctrl+C.

## Commands

```sh
npm run dev          # run CLI from source (tsx, interactive home screen)
npm run dev:doctor   # tsx src/cli/index.ts doctor
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # eslint . (flat config)
npm run build        # tsc -p tsconfig.build.json -> dist/
npm test             # build, THEN vitest run (integration tests need dist/)
npm run test:watch   # vitest (fails integration suite if dist/ is stale)
npm run format       # prettier --write .
npm run format:check # prettier --check .
```

Note: `npm test` builds first because `tests/cli.integration.test.ts` spawns the
real `dist/cli/index.js`. Running bare `vitest` with a stale/absent `dist/` will
skip or fail integration coverage.

## Architecture

- Entry: `src/cli/index.ts` (shebang, bin `dist/cli/index.js`). Arg parsing in
  `src/cli/args.ts`; commands under `src/cli/commands/` (`help`, `version`,
  `doctor`, `landing`, `planned`, `transform` — which hosts both `humanize` and
  `knowledge`).
- UI layer: `src/cli/ui/` — `theme.ts` (semantic palette + symbols), `banner.ts`
  (hand-set ASCII wordmark, page headers), `terminal.ts` (frame width/cursor/key
  hint helpers), `menu.ts` (interactive select + any-key prompts on
  node:readline raw mode), `input.ts` (multiline text entry).
- Config: `src/config/index.ts` — dotenv `.env` loading + typed validation
  (`UnscriptConfig` shape is pinned by tests; do not break it).
  **A missing `.env` is normal, not an error.** Runtime vars
  (`SANITY_CONTEXT_MCP_URL`, `SANITY_ORGANIZATION_TOKEN`, `GEMINI_API_KEY`) are
  handled by `src/config/env.ts` (`loadRuntimeConfig`, `missingRuntimeConfig`,
  `runtimeSetupMessage`).
- Runtime wiring: `src/cli/runtime.ts` (`connectRuntime`,
  `preflightContextMcp` — initialize + initial_context + tools/list + require
  GROQ-mode tools).
- MCP layer: `src/mcp/` — `client.ts` (JSON-RPC 2.0 streamable-HTTP: initialize,
  notifications/initialized, tools/list, tools/call; parses JSON, JSON batches,
  and SSE; resolves `MCP-Session-Id`; timeouts), `contextMcp.ts` (Context MCP
  facade: `initial-context` HTTP endpoint, `groq_query`, `schema_explorer`,
  `parseGroqPayload`), `errors.ts` (connection/authentication/protocol/tool),
  `types.ts`.
- Knowledge layer: `src/knowledge/` — `types.ts` (typed docs mirroring the
  Sanity schemas + `RuleConflict`), `retrieval.ts` (targeted GROQ queries with
  inline slugs, normalization, provenance), `ranking.ts` (higher priority
  first), `errors.ts`.
- Gemini layer: `src/gemini/` — `client.ts` (`generateContent` REST via built-in
  `fetch`, `x-goog-api-key`, `GEMINI_MODEL = 'gemini-3.1-flash-lite'`, no
  fallback model, bounded retries for transient failures only, `ping()` for
  doctor), `errors.ts`, `types.ts`.
- Transformation layer: `src/transformation/` — `transform.ts` (prompt assembly
  from retrieved knowledge, single safe retry on malformed JSON, plain-text
  fallback with a note), `validation.ts` (strict output shape), `preservation.ts`
  (deterministic extraction + validation of numbers, dates, URLs, identifiers,
  quotes, requirements, uncertainty; names are warnings).
- Agent layer: `src/agent/` — `context.ts` (assemble context, detect conflicts
  from `conflictsWith` refs — never invented; priority or unresolved),
  `agent.ts` (`runTransformation` orchestration), `errors.ts`, `types.ts`.
- Core: `src/core/errors.ts` (exit codes + `printError`, which hides stack
  traces unless debug is on; `renderCheck` renders doctor rows).
  `src/utils/` — `colors.ts` (auto-disable on non-TTY/NO_COLOR), `secrets.ts`
  (`redactSecret`, `stripSecrets`), `log.ts` (`debugLog`, self-gated by
  `--debug`/`UNSCRIPT_DEBUG`), `text.ts`, `package-info.ts`.

Sanity is the structured policy layer; Gemini is only the language engine.
Retrieved rules must influence the transformation with provenance, priorities,
and conflicts preserved.

## Interactive UI rules (keep it honest and robust)

- The home screen (`landing`) and the transform/knowledge flows run only when
  stdin+stdout are TTYs; non-TTY usage exits 1 with a message (covered by
  tests).
- **Node >= 20 emits `keypress` events on the input stream, not on the readline
  interface.** Listen on `process.stdin.on('keypress', (str, key) => …)`, not
  `rl.on('keypress', …)`, after creating the interface with `terminal: true`.
- **Full-screen app, not a scrolling frame**: the screen is cleared
  (`\x1b[2J\x1b[3J\x1b[H`) once at startup with the colorful wordmark pinned to
  the top-left (3 blank lines above, 2-column indent). `promptSelect` paints
  its static `top` block exactly once and only redraws the choice region below
  it — the logo must never duplicate or re-render on arrow keys.
- Moving into a page (humanize/transform/knowledge/doctor/help/version) clears
  the screen again and renders that page alone — no logo, no leftover menu, no
  stacked content. Exiting clears once more and prints `Bye.` / `Interrupted.`
  / `Cancelled.`.
- Interactive frames must never exceed the real terminal width: measure
  `process.stdout.columns` directly (`frameWidth`), not the clamped
  `terminalWidth()`. Every rendered line is bounded so redraw cursor math
  (`\x1b[N A` + `\x1b[J`) stays correct in narrow terminals. (Result pages use
  `terminalWidth()` clamping like doctor/help.)
- `promptMultiline` (text entry) uses a projected editor on a TTY: blank
  lines inside pasted text are kept; a lone `.` on its own line finishes;
  Ctrl+D submits the whole buffer (or exits cleanly when empty); Esc cancels
  cleanly; SIGINT interrupts. Do not collapse pasted content. The
  finish/cancel rule lives in the pure `reducePrompt` reducer (unit-tested)
  with thin readline wiring on top; the keypress handler is detached on
  finish.
- **Input happens before any service call.** `runWizard` collects and
  validates the text first, then connects to the Context MCP. Esc/cancel
  and empty/whitespace-only input never touch Sanity or Gemini and never
  show a fake result.
- Semantic colors via `ui/theme.ts`; the wordmark uses a letter-by-letter color
  cycle that auto-disables with NO_COLOR. Status is never color-only
  (PASS/WARN/FAIL text labels stay). No fake progress, spinners, or animations;
  doctor and the transform flow show real elapsed milliseconds.

## Runtime protocol notes (do not reinvent)

- Context MCP endpoint: created in the Sanity Context app (not the Sanity CLI;
  `sanity context` manages knowledge bases). URL shape:
  `https://api.sanity.io/v1/context/organizations/<org-id>/mcp/<name>`, auth
  `Authorization: Bearer <org token>` (Context Viewer permission), JSON-RPC 2.0
  with `Accept: application/json, text/event-stream`. GROQ-mode tools:
  `initial_context`, `schema_explorer`, `groq_query`. A KB-mode endpoint exposes
  `knowledge_base_read` instead — treat that as a config error.
- **`initial_context` is mandatory before any `groq_query`** ("Always call
  this first"). Every session runs `initialize` → `notifications/initialized`
  → `initial_context` (via `tools/call`) → `tools/list` in
  `preflightContextMcp` before any retrieval; this is asserted by
  `tests/runtime.test.ts`. Do not treat `tools/list` alone as sufficient, and
  never call `groq_query` before `initial_context`.
- GROQ `[0]` projections return a single object; `parseGroqPayload` normalizes
  both arrays and objects, and rejects unexpected shapes (never an empty
  fabrication). Slugs are schema-validated `[a-z0-9-]+`, so inlining them in
  queries is safe.
- Gemini: `POST {base}/v1beta/models/gemini-3.1-flash-lite:generateContent`
  with `x-goog-api-key`. No fallback model, ever.

## ESM / TypeScript gotchas

- `"type": "module"` + `module: NodeNext`: **relative imports need the `.js`
  extension** (`import { x } from './args.js'`), even in `.ts` source.
- `verbatimModuleSyntax`: type-only imports must use `import type`.
- `readPackageJson()` in `src/utils/package-info.ts` reads `package.json` with
  `fs` (no JSON module import). It resolves via `../../package.json`, which
  works in both `src/` and `dist/` layouts — keep that two-level relative path.

## Testing

- Vitest 5. Unit tests import `src/*` directly; integration tests spawn the
  built CLI. New CLI behaviors should get an integration test.
- MCP and Gemini clients are tested with injected fake `fetch` (never real
  network in tests). `createGeminiClient` accepts `fetchImpl`; `createMcpClient`
  accepts `fetchImpl`; `createContextMcp` passes it through.
- The interactive home screen requires a real TTY; non-TTY usage exits 1 with a
  message (that is expected behavior, covered by a test). Interactive keyboard
  behavior is verified manually with a pty harness (arrows, Enter, Esc, Ctrl+C).
- Do not add tests that assert fake integrations or external connectivity.
- `tests/cli.integration.test.ts` asserts `humanize`/`knowledge` in non-TTY mode
  exit 1 with a "needs a terminal" message; `file` still asserts "not
  implemented". Keep those expectations in sync with the commands.
