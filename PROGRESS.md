# Unscript — Step 1 progress

> Note: requested as `progress.ms`; written as `progress.md` (Markdown). Rename if preferred.

## Goal

Production-ready TypeScript CLI foundation for Unscript. Step 1 only — no
Sanity, no MCP, no Gemini, no transformation engine.

## Status: COMPLETE (Step 1)

### Scaffolded

- `package.json` — ESM (`"type": "module"`), bin `unscript` -> `dist/cli/index.js`,
  engines `node >= 20`, npm scripts for dev/typecheck/build/test/format.
- `tsconfig.json` (strict, NodeNext, `verbatimModuleSyntax`,
  `noUncheckedIndexedAccess`) + `tsconfig.build.json` (emits to `dist/`).
- `vitest.config.ts`, `.prettierrc.json`, `.gitignore`, `.env.example`.

### Source layout

```
src/
  cli/index.ts           entry point (shebang, EPIPE guard, dispatch)
  cli/args.ts            strict arg parser (subcommands + flags + planned)
  cli/commands/          help, version, doctor, landing, planned
  cli/ui/                theme, banner, menu, terminal (rendering)
  config/index.ts        dotenv .env loading + validated UNSCRIPT_DEBUG
  core/errors.ts         exit codes, printError (hidden stacks), renderCheck
  utils/colors.ts        ANSI colors, auto-off for non-TTY / NO_COLOR
  utils/text.ts          terminal-width wrap, ANSI-aware measure/center
  utils/package-info.ts  version + engines from package.json
  types/config.ts        shared types
tests/                   6 files, 46 tests (unit + CLI integration)
```

### Commands executed

| Command                           | Result                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `npm install` (+dev deps)         | ok                                                                                  |
| `npm install -D vitest@^5.0.1`    | ok — cleared 2 moderate audit advisories (vitest <= 4.1.10) → **0 vulnerabilities** |
| `npm run format` / `format:check` | pass                                                                                |
| `npm run typecheck`               | pass                                                                                |
| `npm run build`                   | pass (shebang preserved in `dist/cli/index.js`)                                     |
| `npm test`                        | **33/33 pass** (5 files)                                                            |

### CLI manually verified

- `unscript --help` — exit 0
- `unscript --version` — prints `0.1.0` (from package.json), exit 0
- `unscript doctor` — PASS Node/npm/config, WARN terminal in non-TTY, exit 0
- `unscript` — interactive home screen (menu) via pseudo-TTY
- Ctrl+C — prints "Interrupted.", exit 130 (verified with a pty harness)
- Unknown command / unknown option — actionable error, exit 2
- No-TTY home screen — clear message, exit 1
- `doctor | head -3` — no EPIPE crash (fixed; guarded in entry point)
- `UNSCRIPT_DEBUG=banana` (invalid) — doctor warns, exit 0
- .env with `UNSCRIPT_DEBUG=true` — honored (debug stack on errors), `.env` removed after test

### Bugs found & fixed during validation

1. dotenv returns ENOENT for a **missing** `.env`; config check failed. Fixed by
   only loading when `.env` exists.
2. Unhandled `EPIPE` when piping into `head`. Fixed with an EPIPE guard in
   `src/cli/index.ts` (+ integration test).
3. Debug config from `.env` was not honored for usage errors raised before
   `.env` loaded. Moved env loading ahead of arg parsing.
4. TS errors on first typecheck (discriminated-union access, `process.exitCode`
   typing) — fixed.

### Dependencies

- Runtime: `dotenv` (`.env` loading).
- Dev: `typescript`, `tsx` (dev runner), `vitest@5` (tests), `@types/node`,
  `prettier` (formatting). No linter yet — decision: keep Step 1 lean; add
  ESLint when the codebase grows.

### Limitations / notes

- No ESLint configured (see above).
- Config layer is foundation-only; Gemini/Sanity/MCP settings arrive in later
  steps.
- `.env` is resolved relative to the working directory (standard behavior).
- Interactive home screen is TTY-only by design.

## Next steps (Step 2+)

- Agent module and CLI command skeleton
- Sanity client + structured knowledge model
- Sanity Context MCP server
- Gemini 3.1 Flash-Lite integration (credentials via `.env` only)
- Transformation pipeline + output validation

## Verify the foundation

```sh
npm install
npm run typecheck
npm test
npm run build
node dist/cli/index.js help
node dist/cli/index.js doctor
node dist/cli/index.js        # interactive home screen; ↑/↓, Enter, Esc, Ctrl+C
```

## UI/UX refinement (Step 1.5) — terminal product feel

Made the CLI feel like a designed terminal product, not a flag dump. **No new
dependencies** (interactive menu is built on `node:readline` raw mode; prudent
per "prefer a reliable library over a fragile custom loop" once the Node 20
keypress gotcha below is known).

### What changed

- **Home screen** (`src/cli/commands/landing.ts`, replaces `shell.ts`): hand-set
  ASCII wordmark `UNSCRIPT` (6x6 block letters, 55 cols), tagline
  _writing, reworked._, live version + truthful "Foundation ready" status, and a
  keyboard menu: Humanize text _(later step)_, Inspect environment, Help,
  Version, Exit. Honest only — no fake integrations.
- **`src/cli/ui/` layer**: `theme` (semantic palette + symbols), `banner`
  (wordmark, page headers, rules), `terminal` (frame width, cursor, key hints),
  `menu` (`promptSelect` + `promptAnyKey`).
- **Readable subcommands**: `unscript help`, `unscript version`, `unscript
doctor` (flags `-h`/`-v` still work; `--version` stays machine-friendly/bare).
  Future names `humanize`/`file`/`config` parse to a polite "later step" page,
  exit 1.
- **Redesigned pages**: grouped help (Getting started / Home screen /
  Environment / Diagnostics), `UNSCRIPT / DOCTOR` with aligned `✓ PASS` rows,
  real elapsed ms, `Foundation ready`; polished version page.
- **Error page**: `UNSCRIPT / ERROR` + "What to do next" hint; stacks only under
  `--debug`/`UNSCRIPT_DEBUG`.
- **Responsive**: full wordmark only at >= 59 cols (compact `UNSCRIPT`
  otherwise); interactive frames bounded to the real `process.stdout.columns`
  (redraw cursor math stays correct at 30 cols); long hints wrap, never
  truncate; `NO_COLOR` and non-TTY output keep the same layout without ANSI.

### Files

- New: `src/cli/ui/{theme,banner,menu,terminal}.ts`,
  `src/cli/commands/{landing,planned}.ts`, `tests/text-ui.test.ts`.
- Changed: `src/cli/{index,args}.ts`, `src/cli/commands/{help,version,doctor}.ts`,
  `src/core/errors.ts`, `src/utils/{colors,text}.ts`, integration tests.
- Removed: `src/cli/commands/shell.ts`, `src/core/output.ts` (superseded by `ui/`
  helpers), `progress.md` (renamed to `PROGRESS.md` by user).

### Verified (all actually run)

| Check                   | Result                                         |
| ----------------------- | ---------------------------------------------- |
| `npm run format:check`  | pass                                           |
| `npm run typecheck`     | pass                                           |
| `npm run build`         | pass                                           |
| `npm test`              | 46/46 pass (6 files; integration builds first) |
| pty: arrows/Enter/Esc   | selection moves, pages render, returns to menu |
| pty: Ctrl+C             | "Interrupted.", exit 130                       |
| pty: Esc                | "Bye.", exit 0                                 |
| Nav: Help→back→Doctor→… | pages render once, menu redraws cleanly        |
| 30-col pty              | compact wordmark, no overflow, redraw correct  |
| NO_COLOR / piped        | no ANSI, same layout, PASS/WARN text labels    |
| `unscript --bogus`      | error page, exit 2; `--debug` shows stack      |
| `unscript humanize`     | "not implemented yet", exit 1                  |

### Gotcha recorded for future agents

Node >= 20 emits readline `keypress` events on the **input stream**
(`process.stdin`), not on the interface — `rl.on('keypress')` silently fires
never. Both interactive prompts listen on `process.stdin.on('keypress', …)`.
(Also: `TIOCSWINSZ` needs `struct.pack('HHHH', …)`, 8 bytes, in pty harnesses.)

## UI/UX refinement (Step 1.6) — full-screen, colorful, pinned logo

Polish pass on the home screen's first impression and navigation feel. **No new
dependencies**, same constraints.

### What changed

- **Colorful wordmark** (`ui/banner.ts`): each letter of `UNSCRIPT` scrolls
  through a cyan → blue → magenta → red → yellow → green cycle (single line of
  `buildRows()`), auto-disabling under `NO_COLOR`/non-TTY while keeping the
  exact 55-col block layout.
- **Full-screen clear**: `ui/terminal.ts` gains `clearScreen()`
  (`\x1b[2J\x1b[3J\x1b[H`). The landing clears the terminal once, pins the logo
  to the top-left (**3 blank lines above, 2-column left indent** via
  `introBlock(width, { top: 3, left: 2 })`), and `promptSelect` now paints the
  static `top` block **once** — only the choice region redraws on ↑ ↓, so the
  logo never duplicates or scrolls.
- **Clean page navigation**: selecting a category (humanize/doctor/help/version)
  clears the screen again and renders that page alone — no logo, no leftover
  menu. Esc/Ctrl+C also clear before printing `Bye.`/`Interrupted.`. Exit codes
  unchanged (0, 130).

### Verified (all actually run)

| Check                        | Result                                        |
| ---------------------------- | --------------------------------------------- |
| `npm run typecheck`          | pass                                          |
| `npm run build`              | pass                                          |
| `npm test`                   | 46/46 pass (6 files)                          |
| pty 80-col home              | logo top-left, 3-line top / 2-col left margin |
| pty 30-col home              | compact `UNSCRIPT`, no overflow, redraw ok    |
| pty: arrows/Enter            | region redraws only; logo stays put           |
| pty: select→doctor/help→back | screen cleared, page alone, return to menu    |
| pty: Ctrl+C (home & page)    | "Interrupted.", exit 130                      |
| pty: Esc                     | "Bye.", exit 0                                |

### Dependencies added

None. Rationale: readline raw mode + a ~40-line key mapping (↑/↓, Enter, Esc,
Ctrl+C via standardized CSI sequences) covers exactly the keys the UI needs;
adding a menu library would bring its own visual identity and non-TTY behavior
without benefit here.

## Runtime agent layer (Step 5) — knowledge + transformation

### Goal

Real end-to-end runtime on top of the Step 1 CLI and the 58-doc Sanity
Knowledge Base (`b209xsoi` / `production`): retrieve writing rules through a
hosted **Sanity Context MCP** (GROQ mode), transform text with **Gemini**
(`gemini-3.1-flash-lite`), and validate deterministically. No mocks, no
fabricated results, no fake integrations.

### What was built

- **Runtime config** (`src/config/env.ts`): `SANITY_CONTEXT_MCP_URL`,
  `SANITY_ORGANIZATION_TOKEN`, `GEMINI_API_KEY` parsing with redacted labels,
  `runtimeSetupMessage()` with actionable setup steps. `loadConfig` shape
  untouched (pinned by `tests/config.test.ts`).
- **Secrets** (`src/utils/secrets.ts`): `redactSecret`, `stripSecrets`;
  debug logging (`src/utils/log.ts`) writes `[debug]` to stderr, never secrets.
- **MCP client** (`src/mcp/`): JSON-RPC 2.0 / streamable-HTTP client
  (`initialize` → `notifications/initialized` → `tools/list` → `tools/call`),
  JSON + JSON-batch + SSE parsing, session ids, per-request timeouts, typed
  errors (connection/auth/protocol/tool). Context MCP facade: real
  `initial_context` tool call (mandatory before any `groq_query`, per the
  endpoint), `groq_query`/`schema_explorer` with defensive payload parsing.
- **Knowledge retrieval** (`src/knowledge/`): typed docs matching the Sanity
  schemas, targeted GROQ queries (content type, level, tone, patterns, rules by
  pattern/type, user decisions), priority sorting (higher first), dedupe by id,
  source provenance on every item.
- **Gemini client** (`src/gemini/`): real `generateContent` REST calls,
  `x-goog-api-key` header, no fallback model, bounded retries for transient
  failures only, typed errors, `ping()` for doctor.
- **Agent** (`src/agent/`): context assembly + conflict detection from the
  rules' own `conflictsWith` references (never invented; priority or
  unresolved), provenance records, `runTransformation`.
- **Transformation** (`src/transformation/`): prompt assembly from retrieved
  knowledge, strict JSON output validation with a single safe retry, plain-text
  fallback with a note, and deterministic preservation validation (numbers,
  dates, URLs, identifiers, quotes, requirements, uncertainty; names are
  heuristic warnings). Changed protected items are surfaced, never auto-fixed.
- **CLI**: `humanize` (alias `transform`) interactive flow + `knowledge`
  inspector, extended `doctor` (unconfigured runtime creds = WARN; live Context
  MCP + Gemini probes when configured, now including `initial_context`),
  landing/help/version/planned rewiring, `src/cli/ui/input.ts` multiline input
  (readline line mode, lone `.` ends; Ctrl+D submits including a partial line —
  `input.ts` flushes `rl.line` itself; Esc cancels; pure `reducePrompt` reducer
  is unit-tested). Input is collected and validated **before** any service
  call: cancel/empty input never touches Sanity or Gemini. Result page shows
  `KNOWLEDGE APPLIED` and `SOURCES` from real retrieval provenance.
- **ESLint** added at the root (flat config, `eslint @ ^10`,
  `@eslint/js`, `typescript-eslint`); `npm run lint`.
- **Docs**: `.env.example`, `README.md`, `AGENTS.md` updated; this section
  documents honest status.

### Verified in this environment

| Check                      | Result                               |
| -------------------------- | ------------------------------------ |
| `npm run typecheck`        | pass (strict)                        |
| `npm run lint`             | pass                                 |
| `npm run format:check`     | pass                                 |
| `npm run build`            | pass                                 |
| `npm test`                 | pass (build-first integration suite) |
| Doctor without credentials | Context MCP + Gemini WARN, exit 0    |

### Verified LIVE in this environment (.env credentials present)

| Check                                        | Result                                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx unscript doctor`                        | exit 0 · Context MCP live check `4 tool(s), initial_context + groq_query ok` · Gemini live check pass                                                                                       |
| `npx unscript humanize` (pty, real services) | exit 0 · input → wizard selects → real retrieval (9 rules, 5-6 patterns) → Gemini `gemini-3.1-flash-lite` (finishReason STOP) → REWORKED page with real sources/URLs                        |
| Multiline input w/ blank line (pty)          | exit 0 · blank line preserved end-to-end                                                                                                                                                    |
| Ctrl+D mid-line submit (pty)                 | exit 0 · partial line flushed and processed                                                                                                                                                 |
| Esc cancel / empty Ctrl+D (pty)              | exit 0 · "Cancelled." · **zero** "Connecting to the Context MCP" lines (no Sanity/Gemini contact)                                                                                           |
| Empty-dot submit (pty)                       | exit 1 · "No text was entered." · no service contact                                                                                                                                        |
| `npx unscript humanize` full result page     | ORIGINAL / REWORKED / KNOWLEDGE APPLIED / SOURCES (Google Technical Writing Courses, Microsoft Writing Style Guide, Plain Language Guide Series — real URLs) / VALIDATION PASS / elapsed ms |

### Gotchas recorded

- GROQ `[0]` projections return an object, not an array — the Context MCP
  payload parser normalizes both.
- The Context MCP endpoint is created in the Context app/dashboard, NOT via the
  Sanity CLI (`sanity context` manages knowledge bases only). A KB-mode endpoint
  exposes `knowledge_base_read` instead of `groq_query` — preflight fails with a
  clear message naming GROQ mode.
- **`initial_context` must run before any `groq_query`** — preflight calls it as
  the first tool call (`initialize` → `notifications/initialized` →
  `initial_context` → `tools/list`); `tests/runtime.test.ts` asserts the order.
- In readline line mode, Ctrl+D on a **partial line** is swallowed (no `close`
  event) — `input.ts` listens for the `^D` keypress (`ctrl:true, name:'d'`) and
  flushes `rl.line` itself. Ctrl+D on an empty line closes cleanly.
- MCP responses may arrive as JSON, a JSON batch, or SSE; the client parses all
  three and validates the request id before accepting.

### Dependency notes

- Runtime dependencies: unchanged (still none added — `fetch` is built in).
- Dev dependencies added: `eslint`, `@eslint/js`, `typescript-eslint`.
