"""Framewright perception service.

A swappable adapter behind one endpoint, per CONTRACT.md section 12. The Node API
is the only graded backend; this service exists to turn a wireframe image into the
IR's named sub-objects and nothing more.

Three rules bind everything in this package, and all three exist because this code
runs on a different laptop from the Node API:

1. It never allocates a fieldId. Section 1: IDs come from the Node API, are
   persisted there, and are never minted by a model or by this service.
2. It never writes a file. Section 11.2: artifacts are owned by Node. Stage outputs
   come back inline in the /perceive response body and Node persists them, because
   a relative path written here resolves to nothing anywhere else.
3. Its absence is a supported state. Section 12: if this service is unreachable,
   Node records the stage as degraded and continues down the deterministic path.
   Nothing here may become load-bearing for prompt mode.
"""

__all__ = ["app", "server"]
