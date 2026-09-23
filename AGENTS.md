# AGENTS.md

Unscript: a terminal-based writing transformation agent. **Step 1 only** — this
repo is the TypeScript CLI foundation. Future steps add agent, MCP, Sanity,
Gemini, transformation, and validation layers.

## Hard constraints (do not violate)

- **Do not implement or fake later-step systems**: no Sanity, no Sanity MCP,
  no Gemini, no transformation engine. No fabricated AI responses, fake
  integrations, pretend-working features, or claims that an external service is
  connected. Nothing external is wired up.
- **Never put secrets in code or commits.** `.env` is git-ignored; only
  `.env.example` is committed. Never log environment variable values or leak
  them in error messages.
- **Tell the truth in output**: `doctor` performs real local checks only;
  `--help`, the home screen, and error pages must not imply unimplemented
  features exist. Future commands (`humanize`, `file`, `config`) are recognized
  but exit 1 with "not implemented yet".
- **Exit codes**: `0` success, `1` operational, `2` usage, `130` Ctrl+C.

## Commands

```sh
npm run dev          # run CLI from source (tsx, interactive home screen)
npm run dev:doctor   # tsx src/cli/index.ts doctor
npm run typecheck    # tsc --noEmit (strict)
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
  `doctor`, `landing`, `planned`).
- UI layer: `src/cli/ui/` — `theme.ts` (semantic palette + symbols), `banner.ts`
  (hand-set ASCII wordmark, page headers), `terminal.ts` (frame width/cursor/key
  hint helpers), `menu.ts` (interactive select + any-key prompts on
  node:readline raw mode).
- Config: `src/config/index.ts` — dotenv `.env` loading + typed validation.
  **A missing `.env` is normal, not an error** (dotenv's ENOENT must be
  checked for before loading — only a present-but-unparseable file is a `fail`).
- Core: `src/core/errors.ts` (exit codes + `printError`, which hides stack
  traces unless debug is on; `renderCheck` renders doctor rows).
  `src/utils/colors.ts` auto-disables color when not a TTY or `NO_COLOR` is set.
- All future modules (`agent/`, `mcp/`, `sanity/`, `gemini/`, `knowledge/`,
  `transformation/`, `validation/`) are intentionally absent.

## Interactive UI rules (keep it honest and robust)

- The home screen (`landing`) runs only when stdin+stdout are TTYs; non-TTY
  usage exits 1 with a message (covered by a test).
- **Node >= 20 emits `keypress` events on the input stream, not on the readline
  interface.** Listen on `process.stdin.on('keypress', (str, key) => …)`, not
  `rl.on('keypress', …)`, after creating the interface with `terminal: true`.
- Interactive frames must never exceed the real terminal width: measure
  `process.stdout.columns` directly (`frameWidth`), not the clamped
  `terminalWidth()`. Every rendered line is bounded so redraw cursor math
  (`\x1b[N A` + `\x1b[J`) stays correct in narrow terminals.
- Semantic colors via `ui/theme.ts`; status is never color-only (PASS/WARN/FAIL
  text labels stay). No fake progress, spinners, or animations; doctor shows
  real elapsed milliseconds.

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
- The interactive home screen requires a real TTY; non-TTY usage exits 1 with a
  message (that is expected behavior, covered by a test). Interactive keyboard
  behavior is verified manually with a pty harness (arrows, Enter, Esc, Ctrl+C).
- Do not add tests that assert fake integrations or external connectivity.
