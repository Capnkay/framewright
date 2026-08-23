"""Process entrypoint for the perception service.

    python -m perception.server

Kept separate from app.py so the app can be constructed and exercised by the
tests without binding a port -- the same split as server/src/server.js on the
Node side, for the same reason.

PORT: 8000, matching PERCEPTION_SERVICE_URL in .env.example. Section 12's
degradation rule means Node treats this service being absent as a supported
state, so nothing breaks if it never starts.

`.env` IS LOADED FIRST, before `.app` -- and before anything else in this file
runs -- for the same reason `server/src/server.js` loads it before its own
imports: `stages/read_regions.py`'s `load_region_reader` reads `LLM_API_KEY` /
`LLM_BASE_URL` / `VLM_MODEL` straight from `os.environ` on every request, with
no loader of its own, so a key sitting in `.env` never reached this process
unless a shell had already exported it. Measured on this machine: `/perceive`
answered "PaddleOCR is unavailable; regions were detected but not read" on every
wireframe with a real, working key on disk, because nothing had ever read the
file into `os.environ`. `load_region_reader` is not cached (see `app.py`'s
`_region_reader`), so loading here, once, before the app is even imported, is
enough -- there is no import-order trap on this side the way `server.js`'s own
comment describes, but doing it first keeps the two entrypoints reading the
same way regardless.
"""

from __future__ import annotations

import json
import os

from .load_env_file import load_env_file

_LOADED_ENV_KEYS = load_env_file()

from .app import app, detect_device, detect_models  # noqa: E402 - .env must load first


def main() -> None:
    import uvicorn

    port = int(os.environ.get("PERCEPTION_PORT", "8000"))

    # One honest line about what this process actually is. If `device` says cpu
    # and you expected cuda:0, you are on the wrong interpreter -- the CUDA torch
    # build lives in the perception venv, not the system Python. Roadmap gate 0.7
    # is exactly this line reading cuda:0.
    print(
        json.dumps(
            {
                "msg": "framewright perception listening",
                "port": port,
                "device": detect_device(),
                "models": detect_models(),
                # Names only, never values -- same discipline as the Node
                # entrypoint's own startup line, and for the same reason: this is
                # the only place that tells you at a glance whether the hosted
                # VLM reader is reachable on this machine, without printing a
                # secret to do it.
                "envFile": _LOADED_ENV_KEYS if _LOADED_ENV_KEYS else "none",
            }
        ),
        flush=True,
    )

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
