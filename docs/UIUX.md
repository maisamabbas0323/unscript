# Unscript UI/UX contract

The enforceable standard every interactive screen and every UI change must
satisfy. "Perfect" here is not a taste judgment — it is a checklist, and
most of it is enforced automatically by `npm run uicheck` (pty snapshots
plus structural invariants) and the unit suite.

## 1. Honesty

- Every string implies exactly what exists. Nothing on the home screen,
  help pages, or error pages may suggest an unimplemented feature.
  `file` reports "not implemented yet" (exit 1); `config` is a real local
  status page (exit 0) whose rows and hints describe exactly what is set.
- Status is never color-only: PASS / WARN / FAIL carry text labels, so
  NO_COLOR readers get the same information.
- Timers show real elapsed time only; step labels change only at real
  phase boundaries. No fake progress, no spinners, no animations.
- Config state shown on the home screen is real: the status line is built
  by `statusChips()` from `loadRuntimeConfig()` — "Context MCP unset" names
  the literal missing variable. Nothing is invented.

## 2. Color and symbols

- Color only through the semantic `theme` / `colors` helpers — never raw
  ANSI assembled in a command. Success is green, warning yellow, error red,
  brand is the logo's red, muted gray. Roles do not change meaning.
- Symbols only through `sym` (› ✓ ! ✗ ─ ·). No emoji.
- Everything inherits the base policy: auto-disable when the stream is not
  a TTY or when `NO_COLOR` is set.

## 3. Geometry and rendering

- A region's row _i_ is painted at absolute 1-based terminal row `top + i`.
  `renderRegion` (full paint) and `updateRegion` (incremental repaint)
  obey this exactly; one row of drift silently accumulates ghost rows.
- Every rendered line is bounded to a measured width so it can never wrap
  and break redraw math:
  - menus and interactive frames use `frameWidth()` (max 60 columns);
  - the home identity block measures `process.stdout.columns` directly
    (`identityWidth()`), and `promptSelect` fits its pinned `top` block
    with `fitFrame(topLines, realWidth())`;
  - result/knowledge pages and doctor/help/version fit every line to
    `realWidth()` / `terminalWidth()`.
- Home identity tiers by height: ≥ 34 rows the full 10-row logo; 28–33
  rows the 6-row block wordmark (`introBlock(..., { compact: true })`);
  below that the compact `UNSCRIPT` brand line. The tier is never taller
  than the terminal, so the menu below never scrolls off screen.
- Interactive screens clear the screen once at start and own it; moving
  into a page clears again and renders that page alone. Nothing stacks.

## 4. Interaction

- Exactly one indicator per menu row: `›` accents the active item, and
  inactive items keep the same indent so the column never jumps. Below the
  list a live detail pane shows the active choice's heading, its full
  description, and a one-line human aside (`Choice.aside`) — an honest
  behavior note, never an invented promise. Heading and hint rows share the
  menu's left margin; the pane's rule-headed divider separates it without
  stealing a row from the choice list.
- Esc semantics are explicit in every menu (`back` for wizard steps,
  `exit` on the home screen). Ctrl+C interrupts (exit 130).
- Editor (`promptMultiline`): Enter continues (whole buffer), Ctrl+J /
  Alt+Enter insert newlines, Ctrl+D finishes, Esc cancels cleanly, SIGINT
  interrupts. Multiline is explicit, never accidental.
- Every interactive screen detaches its own keypress / SIGINT / close /
  resize listeners in its `cleanup()` before closing — repeated screens in
  one session never accumulate listeners (no
  `MaxListenersExceededWarning`; asserted by `uicheck --live`).
- Results, knowledge pages, and the doctor page stay visible until the
  user returns; the return gate (`promptAnyKey`) is an overlay pinned to
  the bottom row — it never wipes the page beneath it.

## 5. The `uicheck` gate

`npm run uicheck` builds `dist/` then drives the real CLI on a pty
(`tests/pty/run.py`), asserting on every screen:

- no line wider than the real terminal width, no content past the bottom
  row;
- exactly one elapsed `<n>s` token on live-status lines;
- `NO_COLOR` frames contain zero color codes;
- Esc on the landing exits with code 0;
- `--live`: landing → doctor → return → exit works, and no
  `MaxListenersExceededWarning` appears across the session.

Golden snapshots under `tests/pty/snapshots/` cover the identity tiers
(100×34 logo, 80×28 wordmark, 80×24 compact) plus a NO_COLOR variant.
Refresh them deliberately with `npm run uicheck:record` after an intended
visual change — never to hide a regression.

## 6. Scope

This contract is binding for interactive UI work. Non-interactive pages
(help/version/planned/errors) follow the same honesty, color, and width
rules with `terminalWidth()` clamping.
