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
  cli/index.ts          entry point (shebang, EPIPE guard, dispatch)
  cli/args.ts           strict arg parser
  cli/commands/help.ts  --help screen
  cli/commands/version.ts  reads version from package.json
  cli/commands/doctor.ts   real local environment checks
  cli/commands/shell.ts    interactive shell (readline)
  config/index.ts       dotenv .env loading + validated UNSCRIPT_DEBUG
  core/errors.ts        exit codes, UnscriptError, printError (hidden stacks)
  core/output.ts        consistent success/warning/error presentation
  utils/colors.ts       ANSI colors, auto-off for non-TTY / NO_COLOR
  utils/text.ts         terminal-width wrap (no hard-coded widths)
  utils/package-info.ts version + engines from package.json
  types/config.ts       shared types
tests/                  5 files, 33 tests (unit + CLI integration)
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
- `unscript` — interactive shell (help/version/doctor/exit + unknown-command hint) via pseudo-TTY
- Ctrl+C — prints "Interrupted.", exit 130 (verified with a pty harness)
- Unknown command / unknown option — actionable error, exit 2
- No-TTY shell — clear message, exit 1
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
- Interactive shell is TTY-only by design.

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
node dist/cli/index.js --help
node dist/cli/index.js doctor
node dist/cli/index.js   # interactive shell; type `doctor`, then `exit`
```
