"""Pipeline stages owned by the perception service — CONTRACT.md section 11.0.

This package owns stages 2, 3 and 4 only. Stage 1 (input acquisition) and stages
5 to 7 (code generation, validation, output) belong to Node.

Every stage in here obeys section 11 rule 3: a pure function from a persisted
input to a persisted output, reaching around the trace for nothing. And section
11.2: none of them writes a file. Outputs are returned inline and Node persists
them, because a relative path written on this laptop resolves to nothing on the
machine running the API.
"""

__all__ = ["normalise"]
