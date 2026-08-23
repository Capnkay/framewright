"""perception/load_env_file.py -- read `.env` at the repo root into os.environ.

Why this exists: `python -m perception.server` starts a bare interpreter, so a key
sitting in `.env` never reached it. `stages/read_regions.py`'s `load_region_reader`
checks `os.environ` and silently falls back to PaddleOCR (and from there to "no
reader at all") -- correct behaviour when there is genuinely no key, and completely
invisible when there is one sitting on disk. The result, measured on this machine:
`/perceive` reported "PaddleOCR is unavailable; regions were detected but not read"
on every wireframe even with a real, working key in `.env`, because nothing ever
read the file into this process's environment.

This is the same gap `server/src/loadEnvFile.js` closes on the Node side (T-151,
B-012's ".env never loaded" story) -- one process down. The two loaders are
deliberately kept in step: same parsing rules, same non-destructive merge, same
"missing file is not an error" behaviour, so the two languages describe one fact
about the repository rather than two slightly different ones.

Deliberately dependency-free: `python-dotenv` is not installed in `perception/.venv`
(section 12's CPU-only, no-extra-dependency constraint), and this parser is a dozen
lines. Deliberately non-destructive: a variable already present in the real
environment always wins, so a shell export or a test harness overrides the file
rather than fighting it.

AGENTS.md rule 5 is unaffected. A missing file is not an error, and a missing key
still lands on the deterministic path (PaddleOCR, or no reader) exactly as before.
"""

from __future__ import annotations

import os
import pathlib

DEFAULT_ENV_PATH = pathlib.Path(__file__).resolve().parent.parent / ".env"


def parse_env(text: str) -> dict[str, str]:
    """Parse `.env` text. Returns a plain dict; never raises on a malformed line."""
    out: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        eq = line.find("=")
        if eq < 1:
            continue
        key = line[:eq].strip()
        if key.startswith("export "):
            key = key[len("export "):].strip()
        if not key or not (key[0].isalpha() or key[0] == "_"):
            continue
        if not all(c.isalnum() or c == "_" for c in key):
            continue
        value = line[eq + 1:].strip()
        if len(value) >= 2 and value[0] in "\"'" and value[-1] == value[0]:
            value = value[1:-1]
        out[key] = value
    return out


def load_env_file(
    env_path: pathlib.Path | str = DEFAULT_ENV_PATH,
    env: "os._Environ[str] | dict[str, str]" = os.environ,
) -> list[str]:
    """Load `.env` into `env` (defaults to `os.environ`) without overwriting anything
    already set. Returns the names of the keys it applied -- names only, so a caller
    can log what was loaded without logging a secret.
    """
    try:
        text = pathlib.Path(env_path).read_text(encoding="utf-8")
    except OSError:
        return []  # no file is the normal case, not a failure

    applied = []
    for key, value in parse_env(text).items():
        if not env.get(key):
            env[key] = value
            applied.append(key)
    return applied
