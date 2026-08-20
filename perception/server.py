"""Process entrypoint for the perception service.

    python -m perception.server

Kept separate from app.py so the app can be constructed and exercised by the
tests without binding a port -- the same split as server/src/server.js on the
Node side, for the same reason.

PORT: 8000, matching PERCEPTION_SERVICE_URL in .env.example. Section 12's
degradation rule means Node treats this service being absent as a supported
state, so nothing breaks if it never starts.
"""

from __future__ import annotations

import json
import os

from .app import app, detect_device, detect_models


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
            }
        ),
        flush=True,
    )

    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
