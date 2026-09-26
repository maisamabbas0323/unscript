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
  landing/help/version/planned rewiring, `src/cli/ui/input.ts` multiline editor
  (projected `EditState` + full-region repaint; lone `.` ends; **Ctrl+D
  finishes** the whole buffer; other Ctrl chords are a no-op; Esc cancels;
  pure `reducePrompt` reducer is unit-tested), `src/cli/ui/menu.ts`
  rectangle-boxed choice items (┌─┐│└┘) with a height-budgeted scrolling
  viewport, and `src/cli/ui/screen.ts` region renderer (absolute cursor +
  erase-below, so nothing can ghost). Input is collected and validated
  **before** any service call: cancel/empty input never touches Sanity or
  Gemini. The result page opens with ORIGINAL | REWORKED side-by-side boxes,
  then `KNOWLEDGE APPLIED` and `SOURCES` from real retrieval provenance.
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

| Check                                        | Result                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx unscript doctor`                        | exit 0 · Context MCP live check `4 tool(s), initial_context + groq_query ok` · Gemini live check pass                                                                                                               |
| `npx unscript humanize` (pty, real services) | exit 0 · input → wizard selects → real retrieval (9 rules, 5-6 patterns) → Gemini `gemini-3.1-flash-lite` (finishReason STOP) → REWORKED page with real sources/URLs                                                |
| Multiline input w/ blank line (pty)          | exit 0 · blank line preserved end-to-end                                                                                                                                                                            |
| Ctrl+D full submit (pty)                     | exit 0 · whole buffer (incl. trailing blank lines) processed                                                                                                                                                        |
| Esc cancel / empty Ctrl+D (pty)              | exit 0 · "Cancelled." · **zero** "Connecting to the Context MCP" lines (no Sanity/Gemini contact)                                                                                                                   |
| Empty-dot submit (pty)                       | exit 1 · "No text was entered." · no service contact                                                                                                                                                                |
| `npx unscript humanize` full result page     | ORIGINAL \| REWORKED side-by-side boxes, then KNOWLEDGE APPLIED / SOURCES (Google Technical Writing Courses, Microsoft Writing Style Guide, Plain Language Guide Series — real URLs) / VALIDATION PASS / elapsed ms |

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
- Finish is **Ctrl+D**. The editor reads raw keypress events, so ^D flows
  through as `ctrl:d` (no readline line-mode swallowing) and submits the
  whole buffer; Ctrl+D on an empty buffer exits cleanly ("Cancelled."). Every
  other Ctrl chord is neutralized up front so it can never type a stray
  character. Esc cancels; a lone `.` line still terminates.
- MCP responses may arrive as JSON, a JSON batch, or SSE; the client parses all
  three and validates the request id before accepting.

### Dependency notes

- Runtime dependencies: unchanged (still none added — `fetch` is built in).
- Dev dependencies added: `eslint`, `@eslint/js`, `typescript-eslint`.

## UI/UX refinement (Step 5.5) — lean incremental rendering + new key contract

Polish pass on the interactive flows (input editor, selection menus, result
page) that also **fixed a real rendering bug found with a pty trace harness**.

### The bug that started this round

- A pty repro ("type `UNSCRIPlllllfdsjlfjsd`, backspace to `UNSCRIP`") left
  stale characters on screen, and a full-pour flow could hang. Diagnosis had
  two separate causes:
  1. **Terminal buffer overflow**: the editor repainted its full region on
     every keystroke (tens of KB per key). On a pty whose master side isn't
     drained continuously, the synchronous `write()` blocks and the event loop
     stalls before the Context MCP `fetch` ever runs — a hang that had no
     timeout and looked like "selecting all options produced no result screen".
     The fix is lean output (below); real terminals always drain, so the
     overflow cannot occur.
  2. **Off-by-one ghost accumulation**: `updateRegion` addressed region row _i_
     at 1-based terminal row `top + i + 1` while `renderRegion` (the initial
     paint) put row _i_ at `top + i`. Every incremental repaint therefore
     landed one row lower than the original paint — menus accumulated stale
     selections on ↑ ↓, and the editor left a ghost ` ›` row after the first
     keystroke. Verified before/after with an ANSI byte-trace pty harness
     (`INITIAL FRAME` vs `AFTER DOWN1/AFTER DOWN2`).

### The fix

- **Shared coordinate convention**: region row _i_ ⇔ absolute 1-based terminal
  row `top + i`; region-relative cursor `{row, col}` ⇔ `(top + row, col + 1)`.
  `renderRegion`, `updateRegion` (screen.ts) and the editor cursor escape
  (input.ts `cursorEscape`) now all use it. Recorded in AGENTS.md so it is
  never "fixed" inconsistently again.
- **Lean incremental rendering**: `screen.ts` gains `updateRegion` (diff-based
  — only the changed tail is erased-to-EOL and redrawn), `paintLineAt`
  (single-line absolute update), `eraseTerminalLine`. Per-keystroke editor
  output dropped to ~2.5 KB for a 33-char + 10-backspace session (was tens of
  KB); arrow presses repaint only the changed item rows. No spinners, no fake
  progress — just real elapsed ms.

### New input contract (`promptMultiline`)

- **Enter = Continue** (submits the whole buffer, one trailing empty line
  dropped) — Enter no longer inserts a newline. A lone `.` terminator line
  still submits the lines above it; an empty document submits an empty value so
  the caller reports "No text was entered." (OperationalError, exit 1), never a
  cancel.
- **Ctrl+J and Alt+Enter** insert newlines — multiline is explicit, and the
  hint line signposts it (`Enter · continue   Ctrl+J · new line   Ctrl+D ·
finish   Esc · cancel`).
- **Ctrl+D** submits the buffer or exits cleanly when empty (unchanged); Esc
  cancels; Ctrl+C interrupts.
- **Bracketed paste** (`\x1b[?2004h/l`, readline `paste-start`/`paste-end`):
  everything between the markers is buffered and applied once — pasted blank
  lines and newlines survive verbatim.
- The finish/cancel decisions are pure: `submitEvents`, `terminatorEvents`,
  `enterOutcome`, `finishOutcome` feed the same `reducePrompt` reducer
  (contract untouched, all unit-tested in `tests/input.test.ts`, 167 total).

### Menus

- Single-row items, one `›` indicator, aligned inactive indent, diff-based
  redraw per arrow; `escLabel: 'back' | 'exit'` (landing passes `'exit'`);
  viewport + "N–M of K" position when the list is taller than the screen.
- The processing screen (`runWizard`) updates its three real stages in place
  with `paintLineAt` and appends real elapsed ms; transformation errors
  `clearScreen()` before rethrowing so the error page renders clean.

### Result page

- ORIGINAL (muted) | REWORKED (accent) columns, a `✓ DONE` header line, the
  validation section renamed CHECK, consolidated footer, real provenance only.
  Scrollable document since Step 5.6: any terminal height shows the columns +
  DONE first, with a pinned `↑ ↓ N–M of K · Press Enter or Esc to return`
  footer.

### Verified (all actually run, real services)

| Check                                                | Result                                       |
| ---------------------------------------------------- | -------------------------------------------- |
| `npx tsc --noEmit` / `npx eslint .`                  | pass                                         |
| `npx prettier --check .`                             | pass                                         |
| `npm test` (build-first integration)                 | **167/167 pass** (18 files)                  |
| `npm run build`                                      | pass                                         |
| pty: enter→editor→type→backspace→Enter→wizard→result | full real flow ends on REWORKED/DONE, exit 0 |
| pty: ghost repro (UNSCRIP…→backspace)                | one pointer, no ghosts, line stays put       |
| pty: selection menus (content→tone→level)            | exactly one `›`, in-place repaint            |
| pty: landing ↑↓ trace (raw ANSI replay)              | initial frame and every repaint align        |
| pty: Ctrl+J multiline + Enter submits                | 2-line document processed                    |
| pty: bracketed paste w/ blank line                   | 3 visible rows kept, no collapse             |
| pty: lone `.` + Enter                                | terminates, submits lines above              |
| pty: 60-col terminal                                 | frames ≤ 60 cols; ~2.5 KB per editing burst  |
| pty: ArrowUp + mid-line insert                       | in-place edit, one pointer                   |

### Gotchas recorded

- Any pty test of this app must drain the master side continuously, or the
  queue fills and the CLI blocks in `write()` — a harness artifact, not an app
  hang (the real fix is the lean output above).
- A pty ANSI replay that skips one byte per escape sequence invents ghosts that
  aren't on the terminal — the trace harness must consume escape sequences
  exactly (`i += len(m.group(0))`, no off-by-one).
- `ENTER` arrives as `{name:'return'}`, Ctrl+J / bare LF as `{name:'enter'}`,
  Ctrl+D as `{ctrl:true,name:'d'}` — the switch keeps the three paths distinct.
- Esc from the editor runs the wizard's cancel path (`Cancelled.`, exit 0);
  since Step 5.6 that cancel is acknowledged through the interruptExit overlay
  gate (the landing no longer re-prompts for humanize/knowledge — they are
  self-gating) — cancel is not an app exit.

## Result page fix (Step 5.6) — the return gate must never wipe the page

### Symptom

"Selecting all options produces no result screen." The transformation ran
(real MCP + Gemini, real elapsed ms) and the result page was painted — but the
landing loop then called the menu's `promptAnyKey`, which did `clearScreen()`
and repainted a single "Press Enter or Esc to return" line. The result bytes
were emitted and then wiped in the same synchronous turn, so a human never saw
them; a pty harness that checked the buffered byte stream (not the live screen)
reported success. `runKnowledge` had the same wipe through its own
self-gate, plus a double-prompt with the landing gate.

### Fix

- `promptAnyKey` is now an overlay gate: it pins its label to the bottom row of
  the terminal and never clears the page beneath it. On keypress only the
  label row is erased; the next render paints over the still-live screen.
- The transform **result** and **knowledge** pages are now scrollable documents
  (`src/cli/ui/pager.ts`): the document fills the cleared screen top-down and
  is clipped to the real terminal height, so on any terminal the first viewport
  shows the reworked text, the ORIGINAL|REWORKED columns and `✓ DONE` — the
  primary content is never pushed off a short terminal by later sections. The
  last row is a pinned footer (`↑ ↓ N–M of K … Press Enter or Esc to return`);
  ↑ ↓ PgUp/PgDn Home/End scroll, Enter/Esc finish. Every line is fitted to
  `realWidth()` so colored/unwrapped lines can't overflow and break redraw
  math.
- The landing skips its generic gate for humanize/knowledge (they are
  self-gating); doctor/help/version and cancelled wizard steps still return
  through the overlay `promptAnyKey`.
- `interruptExit` now awaits the overlay gate for non-interrupting cancels, so
  "Cancelled." stays on screen until the user acknowledges.

### Verified (all actually run against the real services, pyte live-screen emulation)

| Check                                                    | Result                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `npx tsc --noEmit` / `npx eslint .`                      | pass                                                                     |
| `npx prettier --check .`                                 | pass                                                                     |
| `npm test` (build-first integration)                     | **167/167 pass** (18 files)                                              |
| pty 80×24: full flow → result pager                      | REWORKED/ORIGINAL columns + `✓ DONE` visible 1st viewport, footer pinned |
| pty 80×24: ↓ scrolls / Enter returns to landing menu     | footer `1–23 of 54` → `2–24 of 54`, menu re-renders                      |
| pty: no `\x1b[2J` between result render and pager footer | no idle wipe (byte-level)                                                |
| pty: `unscript humanize` subcommand                      | result pager shown, Enter exits 0                                        |
| pty: landing → Inspect knowledge → pager                 | page shows, scrolls, Enter returns to menu                               |
| pty: Esc at wizard menu                                  | "Cancelled." + overlay gate, Enter → menu                                |
| pty: landing → doctor → gate                             | doctor checks visible, gate pinned, Enter → menu                         |
