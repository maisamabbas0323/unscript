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
npm run uicheck        # build, then pty snapshot + invariant checks; -live drives landing->doctor
npm run uicheck:record # (re)write the golden pty snapshots under tests/pty/snapshots/
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
  (the red shadow-style "UNSCRIPT" logo + branded wordmark fallback, page headers), `terminal.ts` (frame width/cursor
  helpers), `screen.ts` (absolute-row region paint/update, cursor helpers),
  `menu.ts` (interactive select + any-key prompts on node:readline raw mode),
  `pager.ts` (scrollable full-screen document page for results), `input.ts`
  (multiline text entry), `status.ts` (config status chips), `live.ts` (single
  elapsed live status line).
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

The full enforcement checklist lives in `docs/UIUX.md` and is exercised by
`npm run uicheck` (pty snapshots + invariants); the rules below are the
load-bearing details.

- The home screen (`landing`) and the transform/knowledge flows run only when
  stdin+stdout are TTYs; non-TTY usage exits 1 with a message (covered by
  tests).
- **Node >= 20 emits `keypress` events on the input stream, not on the readline
  interface.** Listen on `process.stdin.on('keypress', (str, key) => …)`, not
  `rl.on('keypress', …)`, after creating the interface with `terminal: true`.
- **Full-screen app, not a scrolling frame**: the screen is cleared
  (`\x1b[2J\x1b[3J\x1b[H`) once at startup. The identity block has three
  height tiers, all pinned top-left with 1 blank line above and a 2-column
  indent: at ≥ 34 rows the 10-row shadow-style logo (red ink, white
  highlights, dim fill — `logoLines()` in `banner.ts`); at 28–33 rows the
  6-row block wordmark (`introBlock(..., { compact: true })`); below that a
  single `UNSCRIPT` brand line. The wordmark fallback and the brand color
  are the logo's red — one identity everywhere. The identity block measures
  `process.stdout.columns` directly (never the 60-column menu frame) and
  `promptSelect` fits its `top` block to `realWidth()` so nothing wraps.
  `promptSelect` paints
  its static `top` block exactly once and only redraws the choice region below
  it — the logo must never duplicate or re-render on arrow keys. Choices are
  restrained single-row items with exactly **one** indicator (`›` accents the
  active item; inactive items keep the same indent so the column never jumps),
  and `SelectOptions.escLabel` names Esc as `back` (wizard steps) or `exit`
  (home screen). Below the list a **live detail pane** shows the full
  description of the active choice (re-rendered on every arrow), fed from
  `Choice.description` — the item row itself stays a single clean line.
  The status line under the identity block is real configuration
  (`statusLine` in `status.ts`, from `loadRuntimeConfig`) — chips name
  exactly the variable that is missing when something is unset.
- **One live status line, never a background screen dump.** The former static
  "Connecting to the Context MCP…" line and the multi-stage processing screen
  are replaced by a single-line live status (`UNSCRIPT · SANITY · <step>
<elapsed>s`) painted at row 1 by `liveStatus()` in `src/cli/ui/live.ts`
  (shared prefix `SANITY`, or `DOCTOR` for the environment checks): step
  labels change only at real phase boundaries (`preflightContextMcp` fires
  `onStep` after each completed phase; `runTransformation` fires `onStage` at
  retrieving/reworking/checking; doctor fires a step as each check completes)
  and the time shown is a single real elapsed counter — one number, never
  duplicated. While it runs, the live line owns the whole screen (the flow
  clears first and menus/pages render only after `stop()`), and each paint
  erases everything below it — stray stderr/debug output can never leave
  wrapped remnants next to or under the status (regression guard: agent
  debug logs use compact slug labels, never serialized request objects).
  After the humanize selections finish, the rework collapses into
  that one line and then only the result page remains. `knowledge` has **no
  selection menus** — it inspects the first content type/tone/level straight
  from Sanity and goes directly to its page (writing patterns, transformation
  rules, preservation rules, and sources, with a compact "Inspecting …"
  summary line).
- **Every interactive screen detaches its own listeners on finish.** The
  menu (`promptSelect`), the overlay gate (`promptAnyKey`), and the pager
  (`scrollablePage`) all remove their `keypress` / `SIGINT` / `close` /
  `resize` listeners in `cleanup()` before closing — repeated screens in one
  session never accumulate listeners (no `MaxListenersExceededWarning`).
- `promptMultiline` renders its footer as the hint rows only — the old
  right-side `INPUT` stage tag is gone.
- Moving into a page (humanize/transform/knowledge/doctor/help/version) clears
  the screen again and renders that page alone — no logo, no leftover menu, no
  stacked content. Exiting clears once more and prints `Bye.` / `Interrupted.`
  / `Cancelled.`. The transform **result** and **knowledge** pages are
  scrollable documents (`pager.ts`): they start at the top of the document on
  any terminal height, scroll with ↑ ↓ / PgUp / PgDn / Home / End, and own
  their return gate (footer: "Press Enter or Esc to return"), so the landing
  does not re-prompt for them. Doctor/help/version and cancelled wizard steps
  return through the landing's overlay `promptAnyKey` gate.
- **`promptAnyKey` is an overlay, never a wipe**: it pins its label to the
  bottom row of the terminal and does NOT clear the page beneath it — the
  result/knowledge/doctor page stays readable until the user actually returns.
  On keypress only the label row is erased; the next render re-paints over the
  still-live screen.
- Interactive frames must never exceed the real terminal width: measure
  `process.stdout.columns` directly (`frameWidth`), not the clamped
  `terminalWidth()`. Every rendered line is bounded so redraw cursor math
  (`\x1b[N A` + `\x1b[J`) stays correct in narrow terminals. (Result/knowledge
  pages are paged documents whose every line is also fitted to `realWidth()`;
  doctor/help use `terminalWidth()` clamping.)
- `promptMultiline` (text entry) uses a projected editor on a TTY: the whole
  buffer is live and the terminal is never the source of truth. **Enter =
  Continue**: it submits the whole buffer (one trailing empty line dropped), or
  submits the lines above a lone `.` terminator line, or submits an empty value
  so the caller can report "No text was entered." — it never inserts a newline.
  **Ctrl+J and Alt+Enter insert newlines** (multiline is explicit, not
  accidental); **Ctrl+D submits the buffer** (or exits cleanly when empty);
  **Esc cancels cleanly; SIGINT interrupts**. Bracketed-paste markers
  (`\x1b[?2004h`, plus readline's own `paste-start`/`paste-end` events) are
  buffered and applied once, so pasted blank lines and newlines survive
  verbatim — nothing is collapsed. The finish/cancel _decision_ lives in the
  pure `reducePrompt` reducer via the pure projections `submitEvents`,
  `terminatorEvents`, `enterOutcome` and `finishOutcome` (unit-tested); the
  keypress handler is thin wiring on top and is detached on finish.
- **Region coordinate convention (all screens, never deviate)**: a region's
  row _i_ is painted at absolute 1-based terminal row `top + i`, where `top` is
  the 1-based row where the region starts. `renderRegion` (full paint),
  `updateRegion` (diff-based incremental repaint — only the changed tail is
  erased-to-EOL and redrawn), and the editor's cursor positioning all obey this
  exact mapping, so incremental repaints land on the same rows the initial
  paint used. In-place updates are what make stale selections and ghost
  characters impossible; a one-row mismatch here silently accumulates ghost
  rows (it was found and fixed with a pty trace harness).
- **Input happens before any service call.** `runWizard` collects and
  validates the text first, then connects to the Context MCP. Esc/cancel
  and empty/whitespace-only input never touch Sanity or Gemini and never
  show a fake result.
- Semantic colors via `ui/theme.ts`; the logo paints role→color (`ink` red,
  `light` white, `dim` gray, `block` white-on-red bg via `colors.bgRed`), all
  auto-disabling with NO_COLOR. Status is never color-only
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
