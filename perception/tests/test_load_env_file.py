"""Pins the perception-service `.env` loader added alongside this test.

QA finding: on a machine with a real, working key sitting in the repo's `.env`,
`perception/.venv/Scripts/python.exe -m perception.server` never saw it --
`stages/read_regions.py`'s `load_region_reader` reads `os.environ` directly and has
no loader of its own, and nothing in `perception/server.py` read `.env` into the
process before that. Every `/perceive` call degraded to "PaddleOCR is unavailable;
regions were detected but not read" even though the hosted VLM reader was fully
configured on disk -- the same failure B-012 already measured one process over, on
the Node server, before `loadEnvFile.js` closed it there. This mirrors that fix and
pins its two load-bearing properties: it parses the same shapes `loadEnvFile.js`
does, and it never overwrites a value the real environment already set.
"""

from __future__ import annotations

from perception.load_env_file import load_env_file, parse_env


def test_parses_key_value_pairs_ignoring_blanks_and_comments() -> None:
    text = (
        "# a comment\n"
        "\n"
        "LLM_API_KEY=abc123\n"
        "  LLM_BASE_URL = https://example.test/openai/v1  \n"
        "export VLM_MODEL=some.model\n"
    )
    parsed = parse_env(text)
    assert parsed == {
        "LLM_API_KEY": "abc123",
        "LLM_BASE_URL": "https://example.test/openai/v1",
        "VLM_MODEL": "some.model",
    }


def test_strips_one_matched_pair_of_surrounding_quotes() -> None:
    parsed = parse_env('A="quoted value"\nB=\'also quoted\'\nC=bare\n')
    assert parsed == {"A": "quoted value", "B": "also quoted", "C": "bare"}


def test_malformed_lines_are_skipped_not_raised() -> None:
    # no '=', a key that is not a valid identifier, an empty line, a bare '#'.
    parsed = parse_env("no-equals-sign\n1BAD=x\n#\nGOOD=1\n")
    assert parsed == {"GOOD": "1"}


def test_a_missing_file_returns_no_keys_and_does_not_raise(tmp_path) -> None:
    missing = tmp_path / "does-not-exist.env"
    env: dict[str, str] = {}
    assert load_env_file(missing, env) == []
    assert env == {}


def test_never_overwrites_a_value_already_present_in_the_real_environment() -> None:
    """The load-bearing property. A shell export, CI, or the test harness must win
    over the file -- exactly the non-destructive merge `loadEnvFile.js` documents
    for the same reason on the Node side.
    """
    env_file = None
    import tempfile
    import pathlib

    with tempfile.TemporaryDirectory() as tmp:
        env_path = pathlib.Path(tmp) / ".env"
        env_path.write_text("LLM_API_KEY=from-file\nLLM_BASE_URL=from-file-url\n", encoding="utf-8")

        env = {"LLM_API_KEY": "already-set"}
        applied = load_env_file(env_path, env)

        assert env["LLM_API_KEY"] == "already-set", "a real value must never be overwritten"
        assert env["LLM_BASE_URL"] == "from-file-url"
        assert applied == ["LLM_BASE_URL"], "only the key actually applied is reported"


def test_an_empty_string_already_in_env_is_treated_as_unset() -> None:
    """An exported-but-empty variable (`LLM_API_KEY=` in a parent shell) must not
    shadow a real value sitting in `.env` -- the same rule `loadEnvFile.js` applies
    with its own `=== ''` check.
    """
    import tempfile
    import pathlib

    with tempfile.TemporaryDirectory() as tmp:
        env_path = pathlib.Path(tmp) / ".env"
        env_path.write_text("LLM_API_KEY=from-file\n", encoding="utf-8")

        env = {"LLM_API_KEY": ""}
        applied = load_env_file(env_path, env)

        assert env["LLM_API_KEY"] == "from-file"
        assert applied == ["LLM_API_KEY"]
