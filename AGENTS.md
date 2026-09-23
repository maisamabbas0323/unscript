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
  `--help` and the shell must not imply unimplemented features exist.
- **Exit codes**: `0` success, `1` operational, `2` usage, `130` Ctrl+C.

## Commands

```sh
npm run dev          # run CLI from source (tsx, interactive shell)
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
  `doctor`, `shell`).
- Config: `src/config/index.ts` — dotenv `.env` loading + typed validation.
  **A missing `.env` is normal, not an error** (dotenv's ENOENT must be
  checked for before loading — only a present-but-unparseable file is a `fail`).
- Core: `src/core/errors.ts` (exit codes + `printError`, which hides stack
  traces unless debug is on) and `src/core/output.ts` (success/warning/error
  presentation). `src/utils/colors.ts` auto-disables color when not a TTY or
  `NO_COLOR` is set.
- All future modules (`agent/`, `mcp/`, `sanity/`, `gemini/`, `knowledge/`,
  `transformation/`, `validation/`) are intentionally absent.

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
- The interactive shell requires a real TTY; non-TTY usage exits 1 with a
  message (that is expected behavior, covered by a test).
- Do not add tests that assert fake integrations or external connectivity.
