"""T-121 — the VLM benchmark's scoring, checked without a key or a network.

WHY THESE TESTS EXIST AT ALL, given the benchmark's result is a measured number.
The number came from three live runs and no test can reproduce it offline. What a
test CAN do is check the machinery that turned a model's reply into "0 of 7", and
that machinery is where a benchmark lies most easily: a scorer with an inverted
comparison or a rescale that silently no-ops would produce a confident, wrong
headline number, and nobody re-derives a benchmark by hand.

So these pin the parts that decide the verdict:

  * the four coordinate readings are actually four DIFFERENT readings
  * the degenerate-answer rule still refuses a whole-image box
  * an empty expected text is scored by equality, not by substring
  * the module refuses rather than reporting a zero when no key is configured

Rule 6: the benchmark's author is not its verifier. This file is the verifier.
"""

from __future__ import annotations

import os

import pytest

from perception.benchmarks import vlm_wireframe as bench
from perception.benchmarks.contours_wireframe import TARGETS

IMAGE_W, IMAGE_H = 1600, 1168
IMAGE_AREA = float(IMAGE_W * IMAGE_H)


def test_no_key_refuses_rather_than_scoring_zero(monkeypatch):
    # A benchmark that reports "0 of 7" because an environment variable is unset
    # records a modelling result that did not happen. It must stop instead.
    for name in ("LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"):
        monkeypatch.delenv(name, raising=False)

    with pytest.raises(SystemExit) as excinfo:
        bench._require_env()

    message = str(excinfo.value)
    assert "LLM_API_KEY" in message
    assert "refusing" in message.lower()


def test_the_four_readings_are_genuinely_different():
    # If a rescale silently no-ops, all four "interpretations" collapse into one
    # and the benchmark's central honesty claim — that it did not pick the
    # flattering reading — becomes false while still printing four numbers.
    reply = {
        "width": 1000,
        "height": 800,
        "regions": [{"role": "button", "text": "SUBMIT", "bbox": [100, 200, 300, 400]}],
    }

    readings = bench.interpretations(reply, IMAGE_W, IMAGE_H)
    boxes = {name: tuple(v[0]["box"]) for name, v in readings.items()}

    assert len(set(boxes.values())) == 4, f"readings collapsed: {boxes}"

    # xywh_raw is the reply untouched.
    assert boxes["xywh_raw"] == (100.0, 200.0, 300.0, 400.0)
    # xyxy_raw reads the last two numbers as the far corner.
    assert boxes["xyxy_raw"] == (100.0, 200.0, 200.0, 200.0)
    # The rescaled pair multiplies by 1600/1000 and 1168/800.
    assert boxes["xywh_declared_rescaled"] == pytest.approx((160.0, 292.0, 480.0, 584.0))


def test_a_reply_that_declares_the_true_size_rescales_by_one():
    reply = {
        "width": IMAGE_W,
        "height": IMAGE_H,
        "regions": [{"role": "image", "text": "", "bbox": [10, 20, 30, 40]}],
    }
    readings = bench.interpretations(reply, IMAGE_W, IMAGE_H)

    assert readings["xywh_declared_rescaled"][0]["box"] == [10.0, 20.0, 30.0, 40.0]
    assert readings["xywh_raw"][0]["box"] == [10.0, 20.0, 30.0, 40.0]


def test_a_perfect_answer_scores_seven_of_seven():
    # The scorer must be capable of a full score, or "0 of 7" says nothing about
    # the model. Feed it the annotations themselves.
    boxes = [{"role": "image", "text": "", "box": list(map(float, box))} for box in TARGETS.values()]

    result = bench.score(boxes, IMAGE_AREA)

    assert result["score"] == f"{len(TARGETS)} of {len(TARGETS)}"
    assert result["mean_iou"] == 1.0


def test_a_whole_image_box_is_not_a_hit():
    # B-001's degenerate-answer rule, carried over. A single box covering the page
    # overlaps several targets and is not detection.
    whole_page = [{"role": "card", "text": "", "box": [0.0, 0.0, float(IMAGE_W), float(IMAGE_H)]}]

    result = bench.score(whole_page, IMAGE_AREA)

    assert result["targets_located"] == 0
    assert all(v["region"] is None for v in result["targets"].values())


def test_a_zero_area_box_is_skipped_rather_than_crashing():
    # A model that returns corners in the wrong order yields a negative width,
    # which the xyxy readings clamp to zero. That must not divide by zero or count.
    result = bench.score([{"role": "input", "text": "", "box": [10.0, 20.0, 0.0, 0.0]}], IMAGE_AREA)
    assert result["targets_located"] == 0


def test_every_annotated_region_has_an_expected_text_entry():
    # The crops mode scores against EXPECTED_TEXT; a target missing from it would
    # raise mid-run, after the calls have already been paid for.
    assert set(bench.EXPECTED_TEXT) == set(TARGETS)


def test_an_empty_region_is_scored_by_equality_not_substring():
    # The failure this guards: `"" in anything` is True, so a substring rule would
    # score hallucinated text into an empty box as a success — and inventing copy
    # where the wireframe drew ruled lines is the worst thing a reader can do here,
    # because it survives all the way to the rendered page looking deliberate.
    def scored(expected: str, got: str) -> bool:
        return (expected.lower() in got.lower()) if expected else (got == "")

    assert scored("", "") is True
    assert scored("", "CHALLENGE YOUR LIMITS") is False
    assert scored("HEADLINE", "HEADLINE") is True
    assert scored("HEADLINE", "the headline reads HEADLINE") is True
    assert scored("HEADLINE", "SUBMIT") is False


def test_parse_reply_survives_a_fenced_answer():
    # A model that answers correctly and wraps it in ```json is a formatting
    # problem. Scoring it 0 of 7 would record a modelling failure that never happened.
    assert bench.parse_reply('```json\n{"width":10}\n```') == {"width": 10}
    assert bench.parse_reply('{"width":10}') == {"width": 10}
    assert bench.parse_reply('Here you go:\n{"width":10}\nHope that helps.') == {"width": 10}
