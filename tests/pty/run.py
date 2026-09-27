#!/usr/bin/env python3
"""tests/pty/run.py — pty UI regression harness for the Unscript CLI.

Drives the real built CLI (`dist/cli/index.js`) on a pty at fixed
terminal sizes, renders the final frame, and checks it against both
committed golden snapshots and structural invariants. stdlib only.

Hermetic by design: the three runtime credentials are scrubbed to empty
strings in the child environment, so this never leaks secrets and never
touches the network — snapshots show the honest, deterministic unset
state. dotenv does not override existing env vars, so even a local
`.env` cannot re-inject credentials.

Usage:
  python3 tests/pty/run.py --check   # compare + assert (default)
  python3 tests/pty/run.py --record  # (re)write golden snapshots
  python3 tests/pty/run.py --live    # landing->doctor->return flow, extra invariants
"""

import argparse
import difflib
import fcntl
import json
import os
import pty
import re
import select
import struct
import sys
import termios
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAP = ROOT / "tests" / "pty" / "snapshots"
CLI = ROOT / "dist" / "cli" / "index.js"

# Scrub real credentials so snapshots are hermetic and no secrets leak.
SCRUB = {
    "SANITY_CONTEXT_MCP_URL": "",
    "SANITY_ORGANIZATION_TOKEN": "",
    "GEMINI_API_KEY": "",
}

ANCHOR_LANDING = "What would you like to do?"
ANCHOR_DOCTOR = "UNSCRIPT / DOCTOR"


def log(msg: str) -> None:
    print(f"uicheck: {msg}")


# ---------------------------------------------------------------- pty driver

def set_size(fd: int, rows: int, cols: int) -> None:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def spawn_cli(rows: int, cols: int, nocolor: bool = False):
    env_extra = dict(SCRUB)
    if nocolor:
        env_extra["NO_COLOR"] = "1"
    pid, fd = pty.fork()
    if pid == 0:  # child
        os.environ["TERM"] = "xterm-256color"
        for key, value in env_extra.items():
            os.environ[key] = value
        os.chdir(str(ROOT))
        os.execvp("node", ["node", "dist/cli/index.js"])
    set_size(fd, rows, cols)
    return pid, fd


def drain(fd: int, timeout: float = 0.8) -> bytes:
    data = b""
    deadline = time.time() + timeout
    while time.time() < deadline:
        ready, _, _ = select.select([fd], [], [], 0.1)
        if ready:
            try:
                chunk = os.read(fd, 65536)
            except OSError:  # child exited / EIO
                break
            if not chunk:
                break
            data += chunk
            deadline = time.time() + timeout
    return data


ANSI_RE = re.compile(rb"\x1b\[[0-9;?]*[A-Za-z]")


def plain(data: bytes) -> bytes:
    """Bytes with CSI sequences removed, so plain-text anchors match
    even when the app paints them bold/colored."""
    return ANSI_RE.sub(b"", data)


def capture(fd: int, anchor: str, timeout: float = 10.0, seed: bytes = b"") -> bytes:
    """Read until the anchor appears (ANSI-stripped), then drain until
    the frame settles. `seed` carries bytes already drained by `send`,
    so a page painted during that drain is still seen — and an anchor
    already present in the seed returns immediately."""
    data = seed
    deadline = time.time() + timeout
    while time.time() < deadline:
        if anchor.encode("utf-8") in plain(data):
            return data + drain(fd)
        ready, _, _ = select.select([fd], [], [], 0.1)
        if ready:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                break
            if not chunk:
                break
            data += chunk
    if anchor.encode("utf-8") in plain(data):
        return data + drain(fd)
    raise RuntimeError(f"anchor not seen within {timeout}s: {anchor!r}")


def send(fd: int, keys: bytes, settle: float = 0.25) -> bytes:
    os.write(fd, keys)
    time.sleep(settle)
    return drain(fd)


def wait_exit(pid: int, timeout: float = 6.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            wpid, status = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            return None
        if wpid == pid:
            if os.WIFEXITED(status):
                return os.WEXITSTATUS(status)
            if os.WIFSIGNALED(status):
                return -os.WTERMSIG(status)
            return None
        time.sleep(0.05)
    return None


def finish(pid: int, fd: int) -> None:
    """Best-effort cleanup when the child must not be left behind."""
    try:
        os.kill(pid, 9)
    except ProcessLookupError:
        pass
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass
    try:
        os.close(fd)
    except OSError:
        pass


# ------------------------------------------------------------------- render

def render_frame(text: str, rows: int, cols: int) -> list[str]:
    """Project the raw terminal stream onto a rows x cols grid using only
    absolute cursor moves; returns the final frame, one str per row."""
    grid = [[" "] * cols for _ in range(rows)]
    r, c = 0, 0
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch == "\x1b":
            if text[i + 1 : i + 2] == "]":  # OSC: skip to BEL or ST
                j = text.find("\x07", i)
                if j == -1:
                    j = text.find("\x1b\\", i)
                i = j + 1 if j != -1 else i + 1
                continue
            m = re.match(r"\x1b\[([0-9;?]*)([A-Za-z])", text[i:])
            if m:
                params, final = m.group(1), m.group(2)
                if final in "Hf":
                    parts = params.split(";")
                    rr = int(parts[0]) if parts[0] else 1
                    cc = int(parts[1]) if len(parts) > 1 and parts[1] else 1
                    r, c = rr - 1, cc - 1
                elif final == "K":
                    for x in range(c, cols):
                        grid[r][x] = " "
                elif final == "J":
                    if params == "2":  # full-screen clear
                        for row in range(rows):
                            grid[row] = [" "] * cols
                    else:
                        for x in range(c, cols):
                            grid[r][x] = " "
                        for row in range(r + 1, rows):
                            grid[row] = [" "] * cols
                elif final == "A":
                    r = max(0, r - (int(params) if params else 1))
                elif final == "B":
                    r = min(rows - 1, r + (int(params) if params else 1))
                i += m.end()
                continue
            i += 1
            continue
        if ch in "\n\r":
            if ch == "\n":
                r = min(rows - 1, r + 1)
            else:
                c = 0
            i += 1
            continue
        if ch == "\t":
            c = min(cols - 1, c + 8 - (c % 8))
            i += 1
            continue
        if 0 <= r < rows and 0 <= c < cols:
            grid[r][c] = ch
            c += 1
        i += 1
    return ["".join(row).rstrip() for row in grid]


def normalize_rows(rows: list[str]) -> list[str]:
    out = [row.rstrip() for row in rows]
    while out and out[-1] == "":
        out.pop()
    return out


# --------------------------------------------------------------------------

def version_from_package() -> str:
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    return pkg["version"]


def block_rows(rows: list[str]) -> int:
    return sum(1 for row in rows if any(g in row for g in ("█", "▓", "▒")))


def assert_frame(rows: list[str], data: bytes, case) -> list[str]:
    errors: list[str] = []
    cols, name = case.cols, case.name
    if any(len(row) > cols for row in rows):
        worst = max(len(row) for row in rows)
        errors.append(f"{name}: row wider than {cols} cols (found {worst})")
    if rows and rows[-1]:
        pass
    joined = "\n".join(rows)
    for needle in ("Humanize text", ANCHOR_LANDING, "Context MCP unset", "Gemini unset"):
        if needle not in joined:
            errors.append(f"{name}: missing expected text {needle!r}")
    if f"v{version_from_package()}" not in joined:
        errors.append(f"{name}: version chip missing from status line")
    # identity tier
    blocks = block_rows(rows)
    if case.expect == "compact":
        if blocks != 0:
            errors.append(f"{name}: compact tier should have no block glyphs (found {blocks})")
    elif case.expect == "wordmark":
        if blocks < 4:
            errors.append(f"{name}: wordmark tier should span ~6 block rows (found {blocks})")
        if "writing, reworked." not in joined:
            errors.append(f"{name}: tagline missing on wordmark tier")
    elif case.expect == "logo":
        if blocks < 8:
            errors.append(f"{name}: logo tier should span ~10 block rows (found {blocks})")
        if "writing, reworked." not in joined:
            errors.append(f"{name}: tagline missing on logo tier")
    if case.nocolor:
        if re.search(r"\x1b\[[0-9;]*m", data.decode("utf-8", "replace")):
            errors.append(f"{name}: NO_COLOR frame still contains color codes")
    return errors


class Case:
    def __init__(self, name: str, rows: int, cols: int, expect: str, nocolor: bool = False):
        self.name = name
        self.rows = rows
        self.cols = cols
        self.expect = expect
        self.nocolor = nocolor


CASES = [
    Case("landing-80x24", 24, 80, "compact"),
    Case("landing-80x28", 28, 80, "wordmark"),
    Case("landing-100x34", 34, 100, "logo"),
    Case("landing-100x34-nocolor", 34, 100, "logo", nocolor=True),
]


def snapshot_path(case: Case) -> Path:
    return SNAP / f"{case.name}.txt"


def run_landing_cases(record: bool, live: bool) -> int:
    failed = False
    for case in CASES:
        pid, fd = spawn_cli(case.rows, case.cols, nocolor=case.nocolor)
        try:
            data = capture(fd, ANCHOR_LANDING)
            text = data.decode("utf-8", "replace")
            rows = normalize_rows(render_frame(text, case.rows, case.cols))
            errors = assert_frame(rows, data, case)
            if errors:
                failed = True
                for err in errors:
                    log(f"FAIL {err}")
            snap = snapshot_path(case)
            if record:
                snap.parent.mkdir(parents=True, exist_ok=True)
                snap.write_text("\n".join(rows) + "\n", encoding="utf-8")
                log(f"recorded {snap.name}")
            else:
                if snap.exists():
                    want = normalize_rows(
                        snap.read_text(encoding="utf-8").split("\n")
                    )
                    if want != rows:
                        failed = True
                        diff = difflib.unified_diff(
                            want, rows, fromfile=f"snapshot/{snap.name}", tofile="live"
                        )
                        log(f"FAIL {snap.name} differs from golden snapshot:")
                        for line in list(diff)[:40]:
                            print(f"    {line}")
                else:
                    failed = True
                    log(f"FAIL {snap.name} missing — run `npm run uicheck:record`")
            # exit path: Esc on the landing leaves cleanly with exit code 0
            send(fd, b"\x1b")
            code = wait_exit(pid)
            if code != 0:
                failed = True
                log(f"FAIL {case.name}: Esc exit code {code!r} (want 0)")
        finally:
            try:
                os.close(fd)
            except OSError:
                pass
            try:
                os.waitpid(pid, os.WNOHANG)
            except ChildProcessError:
                pass
    return 1 if failed else 0


def run_live_flow() -> int:
    """One interactive session: landing -> doctor -> return -> exit. Asserts
    navigation works, the doctor page renders with its return gate, no
    listeners leak (no MaxListenersExceededWarning), and Esc exits 0."""
    log("live flow: landing -> doctor -> return -> exit")
    failed = False
    rows, cols = 100, 34
    pid, fd = spawn_cli(rows, cols)
    session = b""
    try:
        data = capture(fd, ANCHOR_LANDING)
        session += data
        data = send(fd, b"\x1b[B")  # -> Inspect knowledge
        session += data
        data = send(fd, b"\x1b[B")  # -> Inspect environment
        session += data
        data = send(fd, b"\r")  # select doctor
        session += data
        data = capture(fd, ANCHOR_DOCTOR, seed=data)
        session += data
        text = plain(data).decode("utf-8", "replace")
        if ANCHOR_DOCTOR not in text:
            failed = True
            log("FAIL live: doctor page did not render")
        if "Press Enter or Esc to return" not in text:
            failed = True
            log("FAIL live: doctor return gate missing")
        data = send(fd, b"\r")  # return to landing
        session += data
        data = capture(fd, ANCHOR_LANDING, seed=data)
        session += data
        if ANCHOR_LANDING not in plain(data).decode("utf-8", "replace"):
            failed = True
            log("FAIL live: did not return to landing after doctor")
        if b"MaxListenersExceededWarning" in session:
            failed = True
            log("FAIL live: MaxListenersExceededWarning after landing -> doctor -> landing")
        send(fd, b"\x1b")
        code = wait_exit(pid)
        if code != 0:
            failed = True
            log(f"FAIL live: Esc exit code {code!r} (want 0)")
    finally:
        finish(pid, fd)
    return 1 if failed else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="compare + assert (default)")
    ap.add_argument("--record", action="store_true", help="(re)write golden snapshots")
    ap.add_argument("--live", action="store_true", help="drive landing->doctor flow")
    args = ap.parse_args()

    if not CLI.exists():
        log("dist/cli/index.js missing — run `npm run build` first.")
        return 1

    log("recording golden snapshots" if args.record else "checking golden snapshots")
    result = run_landing_cases(args.record, args.live)
    if result != 0:
        return result
    if args.live and not args.record:
        result = run_live_flow()
    if result == 0:
        log("all pty UI checks passed.")
    return result


if __name__ == "__main__":
    raise SystemExit(main())