"""Synthetic wireframe generation -- T-150.

Kept separate from perception/stages/ deliberately: nothing here is a pipeline
stage. It produces training data FOR a future detector; it is not itself in
the /perceive request path, and it must never become an import a stage
depends on (see generate_wireframe.py's own docstring for why the dependency
runs the other way, read-only, into perception/stages/detect_regions.py).
"""
