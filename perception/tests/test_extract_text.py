"""T-098 -- stage 3b, text extraction bound to detected regions.

CONTRACT.md sections 12, 10 and 3.

doneWhen, and where each clause is tested:

  "Text is extracted per detected region and attached to that region, not to the
   page"                                     -> test_binding_*, test_nested_*
  "its absence degrades to regions-without-text rather than failing the stage"
                                             -> test_degrades_*
  "OCR confidence is carried through as the element confidence, never replaced by
   a constant"                               -> test_confidence_*

NO FIXTURE FILES AND NO PADDLEOCR. Images are drawn here, and the reader is a stub
returning canned output in PaddleOCR's own shapes. That is deliberate: the whole
point of section 12's degradation rule is that this pipeline runs on a machine with
no GPU and no heavy dependency, so its test suite must too. A test that skips when
PaddleOCR is missing tests nothing on the machine most likely to be wrong.

The stub also lets the version-tolerance code be exercised, which a real reader
never could -- no single installed version emits both 2.x and 3.x shapes.
"""

from __future__ import annotations

import os

import cv2
import numpy as np
import pytest

from perception.stages.detect_regions import Region
from perception.stages.extract_text import (
    Extraction,
    SubprocessReader,
    RegionText,
    TextLine,
    bind_lines,
    extract_text,
    load_reader,
    read_lines,
)


# --- helpers ---------------------------------------------------------------


def region(x, y, w, h, *, confidence=0.7, kind="rect"):
    return Region(bbox=(x, y, w, h), kind=kind, confidence=confidence)


def line(text, x, y, w, h, confidence=0.9):
    return TextLine(text=text, bbox=(x, y, w, h), confidence=confidence)


def poly(x, y, w, h):
    """A 4-point polygon in PaddleOCR's order."""
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]


class StubReaderV2:
    """PaddleOCR 2.x: .ocr() -> [[ [poly, (text, score)], ... ]]."""

    def __init__(self, items):
        self._items = items
        self.calls = 0

    def ocr(self, image, cls=None):
        self.calls += 1
        return [[[poly(*box), (text, score)] for text, box, score in self._items]]


class StubReaderV3:
    """PaddleOCR 3.x: .predict() -> [ {rec_texts, rec_scores, rec_polys} ]."""

    def __init__(self, items):
        self._items = items
        self.calls = 0

    def predict(self, image):
        self.calls += 1
        return [
            {
                "rec_texts": [t for t, _, _ in self._items],
                "rec_scores": [s for _, _, s in self._items],
                "rec_polys": [poly(*b) for _, b, _ in self._items],
            }
        ]


BLANK = np.full((200, 400, 3), 255, dtype=np.uint8)


# ---------------------------------------------------------------------
# doneWhen 1 -- text is attached to a REGION, never to the page
# ---------------------------------------------------------------------


def test_binding_attaches_each_line_to_its_own_region():
    regions = [region(0, 0, 100, 40), region(200, 0, 100, 40)]
    lines = [line("HEADLINE", 10, 10, 60, 20), line("SUBSCRIBE", 210, 10, 70, 20)]

    bound, unbound = bind_lines(lines, regions)

    assert [rt.text for rt in bound] == ["HEADLINE", "SUBSCRIBE"]
    assert unbound == []


def test_binding_returns_one_entry_per_region_in_input_order():
    """The caller must be able to zip the result against its detections."""
    regions = [region(0, 0, 100, 40), region(200, 0, 100, 40), region(0, 100, 50, 20)]
    bound, _ = bind_lines([line("X", 10, 10, 20, 20)], regions)

    assert len(bound) == len(regions)
    assert [rt.region.bbox for rt in bound] == [r.bbox for r in regions]


def test_a_region_with_no_text_carries_none_not_empty_string():
    """Section 10's reasoning applied to strings: "" is a claim we did not make."""
    bound, _ = bind_lines([], [region(0, 0, 100, 40)])

    assert bound[0].text is None
    assert bound[0].text != ""
    assert bound[0].confidence is None


def test_nested_regions_the_smallest_containing_box_wins():
    """A card inside a container: the text belongs to the card."""
    container = region(0, 0, 400, 200)
    card = region(10, 10, 120, 50)
    bound, unbound = bind_lines([line("2000+", 20, 20, 40, 20)], [container, card])

    assert bound[0].text is None, "the container must not claim the card's text"
    assert bound[1].text == "2000+"
    assert unbound == []


def test_text_outside_every_region_is_reported_not_dropped_and_not_page_level():
    regions = [region(0, 0, 100, 40)]
    stray = line("caption", 250, 150, 60, 20)
    bound, unbound = bind_lines([line("IN", 10, 10, 30, 20), stray], regions)

    assert bound[0].text == "IN"
    assert [ln.text for ln in unbound] == ["caption"], "must survive as unbound"
    # And the Extraction must not fold it into any region.
    assert all("caption" not in (rt.text or "") for rt in bound)


def test_a_line_only_partly_overlapping_a_region_is_not_bound_to_it():
    regions = [region(0, 0, 100, 40)]
    # 80% of this line lies outside the region.
    bound, unbound = bind_lines([line("mostly out", 80, 10, 100, 20)], regions)

    assert bound[0].text is None
    assert len(unbound) == 1


def test_lines_within_a_region_are_joined_in_reading_order():
    r = region(0, 0, 300, 200)
    lines = [
        line("WITHOUT", 100, 10, 60, 20),
        line("LIMITS", 10, 60, 50, 20),
        line("TRAIN", 10, 10, 50, 20),
    ]
    bound, _ = bind_lines(lines, [r])

    assert bound[0].text == "TRAIN WITHOUT LIMITS"


def test_reading_order_is_total_and_independent_of_input_order():
    r = region(0, 0, 300, 200)
    lines = [line("A", 10, 10, 20, 20), line("B", 40, 10, 20, 20), line("C", 10, 60, 20, 20)]

    first, _ = bind_lines(lines, [r])
    second, _ = bind_lines(list(reversed(lines)), [r])

    assert first[0].text == second[0].text == "A B C"


# ---------------------------------------------------------------------
# doneWhen 3 -- OCR confidence is carried, never replaced by a constant
# ---------------------------------------------------------------------


def test_confidence_comes_from_the_ocr_score():
    bound, _ = bind_lines([line("HI", 10, 10, 30, 20, confidence=0.83)], [region(0, 0, 100, 40)])

    assert bound[0].confidence == pytest.approx(0.83)
    assert bound[0].effective_confidence == pytest.approx(0.83)


def test_confidence_is_not_a_constant_across_different_readings():
    """The value must track the input, which a hardcoded number would not."""
    seen = set()
    for score in (0.31, 0.62, 0.94):
        bound, _ = bind_lines(
            [line("WORD", 10, 10, 30, 20, confidence=score)], [region(0, 0, 100, 40)]
        )
        seen.add(round(bound[0].confidence, 6))

    assert len(seen) == 3, f"confidence collapsed to a constant: {seen}"


def test_confidence_is_length_weighted_not_a_plain_mean():
    """A long confident reading must dominate a one-character mis-read."""
    lines = [
        line("SUBSCRIBE", 10, 10, 90, 20, confidence=1.0),
        line("l", 10, 40, 5, 20, confidence=0.0),
    ]
    bound, _ = bind_lines(lines, [region(0, 0, 200, 100)])

    plain_mean = 0.5
    assert bound[0].confidence > plain_mean
    assert bound[0].confidence == pytest.approx(9 / 10)


def test_ocr_confidence_replaces_the_geometric_one_only_where_text_was_found():
    """T-056's docstring promises exactly this; both values stay available."""
    r = region(0, 0, 100, 40, confidence=0.55)
    bound, _ = bind_lines([line("HI", 10, 10, 30, 20, confidence=0.91)], [r])
    rt = bound[0]

    assert rt.effective_confidence == pytest.approx(0.91), "OCR wins where text exists"
    assert rt.region.confidence == pytest.approx(0.55), "geometric value is not destroyed"

    d = rt.to_dict()
    assert d["confidence"] == pytest.approx(0.91)
    assert d["geometricConfidence"] == pytest.approx(0.55)


def test_a_region_without_text_keeps_its_geometric_confidence():
    r = region(0, 0, 100, 40, confidence=0.42)
    bound, _ = bind_lines([], [r])

    assert bound[0].confidence is None, "no text means no OCR score to report"
    assert bound[0].effective_confidence == pytest.approx(0.42)


# ---------------------------------------------------------------------
# doneWhen 2 -- absence degrades, it does not fail the stage
# ---------------------------------------------------------------------


def test_degrades_to_regions_without_text_when_paddleocr_is_absent():
    regions = [region(0, 0, 100, 40), region(200, 0, 100, 40)]
    result = extract_text(BLANK, regions, reader=None)

    assert isinstance(result, Extraction)
    assert result.ocr_available is False
    assert len(result.regions) == 2, "regions survive; only the text is missing"
    assert all(rt.text is None for rt in result.regions)
    assert result.warnings, "a degraded stage must say so"


def test_degradation_preserves_every_region_bbox_and_confidence():
    """T-057 must still be able to build a layout from a degraded stage 3b."""
    regions = [region(5, 6, 100, 40, confidence=0.61)]
    result = extract_text(BLANK, regions, reader=None)

    assert result.regions[0].region.bbox == (5, 6, 100, 40)
    assert result.regions[0].effective_confidence == pytest.approx(0.61)


def test_degradation_names_the_install_command_with_the_constraints_flag():
    """EC-013: the -c flag is the whole point; a warning without it invites the bug."""
    result = extract_text(BLANK, [region(0, 0, 10, 10)], reader=None)
    warning = " ".join(result.warnings)

    assert "-c perception/constraints.txt" in warning
    assert "EC-013" in warning


def test_a_reader_that_throws_degrades_rather_than_propagating():
    class Exploding:
        def ocr(self, image, cls=None):
            raise RuntimeError("paddle backend missing")

    result = extract_text(BLANK, [region(0, 0, 100, 40)], reader=Exploding())

    assert result.regions[0].text is None
    assert len(result.regions) == 1


def test_load_reader_in_process_returns_none_when_paddleocr_is_absent(monkeypatch):
    """Absence is a supported state, not an exception.

    Tests the IN-PROCESS path explicitly. load_reader() now defaults to
    out_of_process=True (EC-014), which never imports paddleocr in this
    interpreter, so patching the import would prove nothing about it.
    """
    import builtins

    real_import = builtins.__import__

    def no_paddle(name, *args, **kwargs):
        if name.startswith("paddleocr"):
            raise ImportError("no paddleocr")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", no_paddle)
    assert load_reader(out_of_process=False) is None


def test_load_reader_out_of_process_returns_none_when_the_worker_cannot_run(monkeypatch):
    """The probe asks the worker to read; an unusable worker means no reader."""
    import perception.stages.extract_text as mod

    monkeypatch.setattr(mod, "_worker_is_usable", lambda *a, **k: False)
    assert mod.load_reader() is None


def test_load_reader_probes_by_reading_not_by_importing(monkeypatch):
    """A module that imports but cannot run must not be reported as available.

    This is the exact shape of EC-014 on this machine, so a find_spec-style check
    would return a reader that then reads nothing.
    """
    import perception.stages.extract_text as mod

    calls = []
    monkeypatch.setattr(mod.SubprocessReader, "ocr",
                        lambda self, image, cls=None: calls.append(1) or [None])
    assert mod.load_reader() is None
    assert calls, "availability must be decided by actually running the worker"


# ---------------------------------------------------------------------
# Version tolerance -- the shapes PaddleOCR actually returns
# ---------------------------------------------------------------------


def test_reads_paddleocr_2x_output_shape():
    reader = StubReaderV2([("HELLO", (10, 10, 60, 20), 0.97)])
    lines = read_lines(BLANK, reader)

    assert [ln.text for ln in lines] == ["HELLO"]
    assert lines[0].confidence == pytest.approx(0.97)
    assert lines[0].bbox == (10, 10, 60, 20)


def test_reads_paddleocr_3x_output_shape():
    reader = StubReaderV3([("HELLO", (10, 10, 60, 20), 0.97)])
    lines = read_lines(BLANK, reader)

    assert [ln.text for ln in lines] == ["HELLO"]
    assert lines[0].confidence == pytest.approx(0.97)
    assert lines[0].bbox == (10, 10, 60, 20)


def test_an_empty_page_from_2x_is_none_not_an_empty_list():
    """PaddleOCR 2.x returns [None] for a blank page; iterating it would raise."""

    class EmptyPage:
        def ocr(self, image, cls=None):
            return [None]

    assert read_lines(BLANK, EmptyPage()) == []


def test_unrecognisable_output_yields_no_lines_rather_than_raising():
    class Nonsense:
        def ocr(self, image, cls=None):
            return {"unexpected": "shape"}

    assert read_lines(BLANK, Nonsense()) == []


def test_blank_text_entries_are_discarded():
    reader = StubReaderV2([("  ", (10, 10, 20, 20), 0.5), ("REAL", (40, 10, 40, 20), 0.9)])
    lines = read_lines(BLANK, reader)

    assert [ln.text for ln in lines] == ["REAL"]


# ---------------------------------------------------------------------
# End to end, and section 11 rule 3 -- purity
# ---------------------------------------------------------------------


def test_extract_text_end_to_end_binds_a_stub_reading_to_its_region():
    regions = [region(0, 0, 150, 50), region(200, 0, 150, 50)]
    reader = StubReaderV2(
        [("TRAIN WITHOUT LIMITS", (10, 10, 120, 25), 0.93),
         ("JOIN NOW", (210, 10, 100, 25), 0.88)]
    )

    result = extract_text(BLANK, regions, reader=reader)

    assert result.ocr_available is True
    assert result.regions[0].text == "TRAIN WITHOUT LIMITS"
    assert result.regions[1].text == "JOIN NOW"
    assert result.regions[0].confidence == pytest.approx(0.93)
    assert result.unbound == ()
    assert result.warnings == ()


def test_unbound_text_raises_a_warning_naming_stage_3a():
    reader = StubReaderV2([("orphan", (300, 150, 60, 20), 0.9)])
    result = extract_text(BLANK, [region(0, 0, 50, 50)], reader=reader)

    assert len(result.unbound) == 1
    assert any("stage 3a" in w for w in result.warnings)


def test_purity_same_input_same_output(monkeypatch):
    """Section 11 rule 3. No clock, no filesystem, no dict-iteration ordering."""
    regions = [region(0, 0, 150, 50), region(200, 0, 150, 50)]
    items = [("A", (10, 10, 40, 20), 0.9), ("B", (210, 10, 40, 20), 0.8)]

    first = extract_text(BLANK, regions, reader=StubReaderV2(items)).to_dict()
    second = extract_text(BLANK, regions, reader=StubReaderV2(items)).to_dict()

    assert first == second


def test_to_dict_is_json_shaped_for_the_stage_trace():
    """Section 11.2 keeps stage artifacts inline, so this must survive json.dumps."""
    import json

    reader = StubReaderV2([("HI", (10, 10, 30, 20), 0.9)])
    result = extract_text(BLANK, [region(0, 0, 100, 40)], reader=reader)
    payload = json.loads(json.dumps(result.to_dict()))

    entry = payload["regions"][0]
    assert isinstance(entry["bbox"], list), "section 6's bbox is a JSON array"
    assert entry["text"] == "HI"
    assert entry["lines"][0]["text"] == "HI"
    assert payload["ocrAvailable"] is True


def test_no_region_is_the_whole_canvas_claim_by_default():
    """A guard mirroring T-056's: binding must not invent a page-level bucket."""
    result = extract_text(BLANK, [], reader=StubReaderV2([("x", (10, 10, 20, 20), 0.9)]))

    assert result.regions == (), "no regions in, no regions out"
    assert len(result.unbound) == 1, "the text is reported, not attached to a page"


# ---------------------------------------------------------------------
# The out-of-process reader -- EC-014
# ---------------------------------------------------------------------


def _worker_payload(monkeypatch, payload, *, returncode=0):
    """Stand in for the subprocess so these stay fast and CI-safe."""
    import subprocess as sp
    import json as js

    class Result:
        stdout = payload if isinstance(payload, str) else js.dumps(payload)
        returncode = 0

    monkeypatch.setattr(sp, "run", lambda *a, **k: Result())


def test_subprocess_reader_translates_worker_output_into_the_2x_shape(monkeypatch):
    """The worker's JSON must arrive as something _lines_from_result already parses."""
    _worker_payload(monkeypatch, {
        "ok": True,
        "lines": [{"text": "HELLO", "bbox": [10, 20, 60, 18], "confidence": 0.96}],
    })
    lines = read_lines(BLANK, SubprocessReader())

    assert [ln.text for ln in lines] == ["HELLO"]
    assert lines[0].bbox == (10, 20, 60, 18)
    assert lines[0].confidence == pytest.approx(0.96)


def test_subprocess_reader_degrades_when_the_worker_reports_failure(monkeypatch):
    _worker_payload(monkeypatch, {"ok": False, "error": "paddle exploded"})
    assert read_lines(BLANK, SubprocessReader()) == []


def test_subprocess_reader_degrades_on_unparseable_worker_output(monkeypatch):
    _worker_payload(monkeypatch, "not json at all")
    assert read_lines(BLANK, SubprocessReader()) == []


def test_subprocess_reader_degrades_when_the_worker_crashes(monkeypatch):
    import subprocess as sp

    def boom(*a, **k):
        raise sp.TimeoutExpired(cmd="worker", timeout=1)

    monkeypatch.setattr(sp, "run", boom)
    assert read_lines(BLANK, SubprocessReader()) == []


def test_subprocess_reader_leaves_no_temp_directory_behind(monkeypatch, tmp_path):
    """It writes a temp image; two identical calls must still be identical."""
    import tempfile

    made = []
    real = tempfile.mkdtemp
    monkeypatch.setattr(tempfile, "mkdtemp", lambda **k: made.append(real(**k)) or made[-1])
    _worker_payload(monkeypatch, {"ok": True, "lines": []})

    read_lines(BLANK, SubprocessReader())

    assert made, "a temp dir was expected"
    assert not os.path.exists(made[0]), "the temp dir must be removed"


# --- the real thing, when the machine can actually run it ------------------

def test_worker_reads_real_text_end_to_end():
    """The only test that proves OCR genuinely works. Skips where it cannot run.

    Deliberately NOT skipped on "paddleocr imports" -- on this repository's GPU
    machine paddleocr imports in-process and then cannot run (EC-014), so an
    import-based skip would run this test exactly where it is guaranteed to fail.
    Availability is what load_reader() reports, which asks the worker.
    """
    reader = load_reader()
    if reader is None:
        pytest.skip("no usable OCR worker on this machine (EC-014)")

    image = np.full((160, 560, 3), 255, dtype=np.uint8)
    cv2.putText(image, "TRAIN WITHOUT LIMITS", (25, 90),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 3)

    result = extract_text(image, [region(15, 40, 520, 70)], reader=reader)

    assert result.ocr_available is True
    assert result.regions[0].text is not None
    assert "LIMITS" in result.regions[0].text.upper()
    assert 0.0 < result.regions[0].confidence <= 1.0

