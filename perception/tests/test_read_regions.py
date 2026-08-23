"""T-122 — stage 3b's hosted reader, driven without a network.

WHAT B-006 DECIDED, and what these tests hold in place. The model scores 0 of 7
placing boxes and 0 of 7 labelling boxes it is handed, against 7 of 7 reading
crops. So it is given no coordinates: `detect_regions` keeps every box, each box
is cropped, and the model answers one question about one picture.

RULE 5 IS THE PROPERTY UNDER TEST AS MUCH AS THE READER IS. With no key, no
network and no GPU, stage 3b must do exactly what it did before this existed —
and "exactly" is asserted rather than assumed, because a second reader is
precisely the kind of change that quietly alters the first one's behaviour.
"""

from __future__ import annotations

import numpy as np
import pytest

from perception.stages.detect_regions import Region
from perception.stages.extract_text import extract_text
from perception.stages.read_regions import (
    RegionReader,
    _parse_text,
    crop_png,
    load_region_reader,
)


def a_region(x=10, y=20, w=120, h=60, confidence=0.8, kind="rect"):
    return Region(bbox=(x, y, w, h), kind=kind, confidence=confidence)


def a_canvas(width=400, height=300):
    # Mid-grey so a crop is never uniformly zero, which would make a broken crop
    # indistinguishable from a working one.
    return np.full((height, width, 3), 128, dtype=np.uint8)


def reader_returning(*answers: str, model="test-vlm"):
    """A reader whose transport replays fixed replies, then repeats the last."""
    queue = list(answers)

    def transport(_png: bytes) -> str:
        return queue.pop(0) if len(queue) > 1 else queue[0]

    return RegionReader(model=model, transport=transport)


def reader_that_fails(model="test-vlm"):
    def transport(_png: bytes) -> str:
        raise RuntimeError("connection reset")

    return RegionReader(model=model, transport=transport)


# --- rule 5 ----------------------------------------------------------------


def test_no_configuration_means_no_reader():
    # The whole module is unreachable on the path the demo runs on, and that is
    # by design. Each variable is removed in turn so a partial configuration
    # cannot half-enable it.
    full = {
        "LLM_API_KEY": "k",
        "LLM_BASE_URL": "https://example.com/v1",  # never called; the transport is not built here
        "VLM_MODEL": "m",
    }
    assert load_region_reader(full) is not None

    for missing in full:
        partial = {k: v for k, v in full.items() if k != missing}
        assert load_region_reader(partial) is None, f"{missing} alone enabled the reader"

    assert load_region_reader({}) is None
    # Whitespace is not configuration.
    assert load_region_reader({**full, "LLM_API_KEY": "   "}) is None


def test_without_a_region_reader_the_paddle_path_is_untouched():
    # The exact behaviour before T-122: no reader at all degrades to
    # regions-without-text, and says which reader it was.
    result = extract_text(a_canvas(), [a_region()], reader=None)

    assert result.ocr_available is False
    assert result.reader_name == "paddleocr"
    assert result.model_calls == ()
    assert len(result.regions) == 1
    assert result.regions[0].text is None
    assert any("PaddleOCR is unavailable" in w for w in result.warnings)


# --- the hosted path -------------------------------------------------------


def test_a_configured_reader_is_the_one_that_runs():
    # Reachability, not just correctness. Rule 9's corollary: a module with a
    # passing unit test that nothing calls is the defect this project keeps
    # finding, so this asserts the choice through extract_text rather than by
    # calling RegionReader directly.
    reader = reader_returning('{"text":"SUBMIT"}')
    result = extract_text(a_canvas(), [a_region()], reader=None, region_reader=reader)

    assert result.reader_name == "vlm:test-vlm"
    assert result.ocr_available is True
    assert result.regions[0].text == "SUBMIT"


def test_the_hosted_reader_wins_over_a_paddle_reader():
    # Both configured. The hosted one is the better reader by measurement, so it
    # is the one that runs; the fallback exists for its absence, not beside it.
    def paddle_stub(*_args, **_kwargs):
        raise AssertionError("PaddleOCR ran while a hosted reader was configured")

    result = extract_text(
        a_canvas(),
        [a_region()],
        reader=paddle_stub,
        region_reader=reader_returning('{"text":"HEADLINE"}'),
    )

    assert result.regions[0].text == "HEADLINE"


def test_one_call_per_region_and_each_carries_section_16_2s_shape():
    regions = [a_region(x=10), a_region(x=200), a_region(x=300, y=150)]
    reader = reader_returning('{"text":"A"}', '{"text":"B"}', '{"text":"C"}')

    result = extract_text(a_canvas(), regions, region_reader=reader)

    assert [r.text for r in result.regions] == ["A", "B", "C"]
    assert len(result.model_calls) == 3
    for call in result.model_calls:
        assert set(call) == {"purpose", "model", "ms", "attempts", "ok"}
        assert call["purpose"] == "region-text"
        assert call["model"] == "test-vlm"
        assert call["ok"] is True
        assert call["attempts"] == 1
        assert isinstance(call["ms"], int)


def test_an_empty_region_reads_as_empty_rather_than_invented():
    # The failure a reader is most likely to have, and the one that survives
    # furthest downstream looking deliberate: describing an empty box instead of
    # saying it is empty. B-006 scored the two no-text regions IN rather than
    # excluding them for exactly this reason.
    result = extract_text(
        a_canvas(), [a_region(), a_region(x=200)], region_reader=reader_returning('{"text":""}')
    )

    assert [r.text for r in result.regions] == [None, None]
    # It RAN, though — which is a different fact from never having run.
    assert result.ocr_available is True
    assert any("found no text" in w for w in result.warnings)


def test_section_10_no_confidence_is_invented_for_a_transcription():
    # The model returns text and no score. A 1.0 for "it answered" would put a
    # fabricated number on the Glass Box beside measured ones.
    result = extract_text(a_canvas(), [a_region()], region_reader=reader_returning('{"text":"X"}'))
    assert result.regions[0].confidence is None


def test_geometry_is_never_taken_from_the_model():
    # The whole basis of the design. Whatever the reply contains, the region's
    # box is the detector's.
    region = a_region(x=42, y=84, w=100, h=50)
    reader = reader_returning('{"text":"HI","bbox":[0,0,9999,9999],"regions":[]}')

    result = extract_text(a_canvas(), [region], region_reader=reader)

    assert result.regions[0].region.bbox == (42, 84, 100, 50)


# --- degradation -----------------------------------------------------------


def test_every_call_failing_is_the_same_state_as_never_having_run():
    # Section 12. A page nothing could read and a page with no reader are one
    # state, not two, and the pipeline continues through both.
    result = extract_text(a_canvas(), [a_region(), a_region(x=200)], region_reader=reader_that_fails())

    assert result.ocr_available is False
    assert all(r.text is None for r in result.regions)
    # The geometry survives, which is what makes it degraded rather than failed.
    assert result.regions[0].region.bbox == (10, 20, 120, 60)
    assert any("could not read" in w for w in result.warnings)


def test_a_failed_call_is_retried_once_and_then_recorded_as_failed():
    # Section 16.2's budget is two attempts. A third would turn a slow page into
    # a timeout, and the retry has to be visible in the trace or it is invisible
    # spend.
    result = extract_text(a_canvas(), [a_region()], region_reader=reader_that_fails())

    assert result.model_calls[0]["attempts"] == 2
    assert result.model_calls[0]["ok"] is False


def test_one_region_failing_does_not_lose_the_others():
    calls = {"n": 0}

    def transport(_png: bytes) -> str:
        calls["n"] += 1
        if calls["n"] <= 2:  # the first region, both attempts
            raise RuntimeError("nope")
        return '{"text":"SURVIVED"}'

    result = extract_text(
        a_canvas(),
        [a_region(), a_region(x=200)],
        region_reader=RegionReader(model="test-vlm", transport=transport),
    )

    assert result.regions[0].text is None
    assert result.regions[1].text == "SURVIVED"
    assert result.ocr_available is True


# --- the crop and the reply ------------------------------------------------


def test_a_crop_is_a_png_of_the_right_part_of_the_canvas():
    canvas = a_canvas(400, 300)
    canvas[100:160, 50:170] = 255  # a white patch exactly where the region is

    png = crop_png(canvas, (50, 100, 120, 60), pad=0)

    assert png[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"

    from io import BytesIO

    from PIL import Image

    image = Image.open(BytesIO(png))
    assert image.size == (120, 60)
    # The patch was white; if the crop were offset it would be grey.
    assert image.convert("L").getextrema() == (255, 255)


def test_a_crop_at_the_edge_is_clamped_rather_than_wrapping():
    canvas = a_canvas(400, 300)
    png = crop_png(canvas, (380, 280, 100, 100), pad=CROP_PAD_FOR_TEST)
    from io import BytesIO

    from PIL import Image

    width, height = Image.open(BytesIO(png)).size
    assert width <= 400 and height <= 300


CROP_PAD_FOR_TEST = 12


def test_a_zero_area_box_raises_rather_than_sending_an_empty_picture():
    with pytest.raises(ValueError):
        crop_png(a_canvas(), (10, 10, 0, 0), pad=0)


@pytest.mark.parametrize(
    "reply,expected",
    [
        ('{"text":"SUBMIT"}', "SUBMIT"),
        ('```json\n{"text":"SUBMIT"}\n```', "SUBMIT"),
        ('Here you go: {"text":"SUBMIT"}', "SUBMIT"),
        ('{"text":""}', ""),
        ('{"other":"x"}', ""),
        ("SUBMIT", "SUBMIT"),  # not JSON at all; the bare reply is the reading
    ],
)
def test_replies_are_parsed_rather_than_required_to_be_perfect(reply, expected):
    # A model that answers correctly and fences it is a formatting problem.
    # Scoring that as a failed read records a modelling failure that did not
    # happen — which is how a benchmark ends up understating a model.
    assert _parse_text(reply) == expected


# --- which regions are worth a call ----------------------------------------


def test_a_container_is_not_read_but_its_child_is():
    # THE FAILURE THIS PREVENTS, measured on the reference wireframe: the
    # whole-page box came back as "Image\nLABEL\nHEADLINE\nSUB HEADLINE\nSUBMIT"
    # — every word merged into one region, which downstream matches every keyword
    # slot at once and is therefore worse than no text at all.
    from perception.stages.read_regions import readable_regions

    child = a_region(x=100, y=100, w=200, h=60)  # 12,000
    wrapper = a_region(x=50, y=50, w=400, h=200)  # 80,000, contains the child

    kept = readable_regions([wrapper, child])

    assert kept == [1], "the wrapper was read instead of, or as well as, its child"


def test_a_stroke_fragment_is_not_read():
    # "H", "MIT", "LA", "eA" — pieces of a word, each in its own contour. Asking a
    # model to read a sliver with no whole character in it is how a hallucination
    # gets in, and two did.
    from perception.stages.read_regions import MIN_READABLE_AREA, readable_regions

    real = a_region(x=10, y=10, w=160, h=45)  # 7,200
    fragment = a_region(x=20, y=20, w=26, h=34)  # 884

    assert real.bbox[2] * real.bbox[3] >= MIN_READABLE_AREA
    assert fragment.bbox[2] * fragment.bbox[3] < MIN_READABLE_AREA

    kept = readable_regions([real, fragment])
    assert kept == [0]


def test_a_fragment_inside_a_word_does_not_make_that_word_a_container():
    # THE BUG IN THE FIRST VERSION OF THIS FILTER, and the reason the floor does
    # double duty. The real SUB HEADLINE box (36,366) contains a 2,520-area piece
    # of its own lettering. With the fragment floor at 1,200 that piece counted as
    # a child, the real box looked like a wrapper, and the filter kept the
    # fragment — which reads "LINE" — and threw away the region that reads
    # "SUB HEADLINE".
    from perception.stages.read_regions import readable_regions

    word = a_region(x=246, y=622, w=551, h=66)  # 36,366
    piece = a_region(x=531, y=637, w=84, h=30)  # 2,520, below the floor

    kept = readable_regions([word, piece])

    assert kept == [0], "the word was dropped in favour of a piece of itself"


def test_the_filter_keeps_every_region_that_carries_reference_text():
    # The five boxes that actually hold handwriting on the reference wireframe,
    # by their measured coordinates. If a future tuning drops one of these, the
    # pipeline loses a word and this says so by name.
    from perception.stages.read_regions import readable_regions

    named = {
        (143, 399, 294, 57): "Image",
        (427, 561, 233, 45): "HEADLINE",
        (796, 521, 162, 45): "SUBMIT",
        (745, 292, 161, 28): "LABEL",
        (246, 622, 551, 66): "SUB HEADLINE",
    }
    noise = [
        (34, 166, 971, 627),  # the page container
        (75, 269, 618, 270),  # a wrapper
        (912, 538, 31, 18),  # "MIT"
        (427, 573, 26, 34),  # "H"
        (531, 637, 84, 30),  # "LINE"
    ]

    regions = [a_region(*box) for box in list(named) + noise]
    kept = {tuple(regions[i].bbox) for i in readable_regions(regions)}

    for box, word in named.items():
        assert box in kept, f"the region holding {word!r} would not be read"
    for box in noise:
        assert box not in kept, f"{box} is noise and would be read"


def test_a_skipped_region_is_not_counted_as_a_failure():
    # It keeps its geometry and has no text, which is the same state as a region
    # the reader could not read — but it did not cost a call and must not drag
    # `ocr_available` down or produce a failure warning.
    tiny = a_region(x=10, y=10, w=20, h=20)  # below the floor
    real = a_region(x=100, y=100, w=200, h=60)

    result = extract_text(
        a_canvas(), [tiny, real], region_reader=reader_returning('{"text":"HEADLINE"}')
    )

    assert result.ocr_available is True
    assert result.regions[0].text is None
    assert result.regions[1].text == "HEADLINE"
    assert len(result.model_calls) == 1, "a skipped region still cost a model call"
    assert not any("could not read" in w for w in result.warnings)
    assert any("were not sent to the reader" in w for w in result.warnings)




class _PaddleStub:
    """PaddleOCR 2.x's shape: an OBJECT with .ocr(), not a function.

    `read_lines` calls `reader.ocr(image)`; passing a bare function is why the
    first version of the fallback test failed while the fallback itself worked.
    """

    def __init__(self, text="HEADLINE", box=(10, 20, 120, 60), score=0.97):
        x, y, w, h = box
        self._poly = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
        self._text = text
        self._score = score
        self.calls = 0

    def ocr(self, image, cls=None):  # noqa: ARG002 - signature parity
        self.calls += 1
        return [[[self._poly, (self._text, self._score)]]]


# --- the two readers are a chain, not a choice -----------------------------


def test_a_dead_hosted_reader_falls_back_to_the_local_one():
    """T-142, measured by pointing LLM_BASE_URL at a dead port.

    extract_text used to return the hosted result unconditionally, so configuring
    a hosted reader meant the PaddleOCR one was never touched — even when every
    hosted call failed. The real pipeline then took 49.9s, reported stage 3
    degraded, and produced `headlineMain = "CHALLENGE YOUR LIMITS"`, the reference
    template, instead of the wireframe's own "HEADLINE". On screen that is
    indistinguishable from the wireframe having been ignored.

    Rule 5 says the deterministic path always works. A hosted reader that is
    CONFIGURED BUT UNREACHABLE had made it unreachable too, which is the failure
    mode of a demo on a venue's wifi.
    """
    result = extract_text(
        a_canvas(),
        [a_region(x=10, y=20, w=120, h=60)],
        reader=_PaddleStub(),
        region_reader=reader_that_fails(),
    )

    assert result.ocr_available is True, "the local reader was never reached"
    assert result.regions[0].text == "HEADLINE"
    # And it is legible which reader answered.
    assert "paddleocr" in result.reader_name
    assert "failed" in result.reader_name
    assert any("fell back" in w for w in result.warnings), result.warnings


def test_the_failed_hosted_calls_are_still_reported_as_spend():
    # §16.2. Roughly fifty seconds went somewhere, and a trace that shows only the
    # local reader hides it.
    result = extract_text(
        a_canvas(), [a_region()], reader=_PaddleStub(), region_reader=reader_that_fails()
    )

    assert len(result.model_calls) >= 1
    assert all(c["ok"] is False for c in result.model_calls)


def test_a_working_hosted_reader_does_not_touch_the_local_one():
    # The fallback must not become a second call on the happy path — it is for
    # absence, not for belt and braces.
    class _MustNotRun:
        def ocr(self, image, cls=None):  # noqa: ARG002
            raise AssertionError("PaddleOCR ran while the hosted reader was answering")

    result = extract_text(
        a_canvas(),
        [a_region()],
        reader=_MustNotRun(),
        region_reader=reader_returning('{"text":"SUBMIT"}'),
    )

    assert result.regions[0].text == "SUBMIT"
    assert result.reader_name == "vlm:test-vlm"


def test_with_no_local_reader_a_dead_hosted_one_still_degrades_rather_than_raising():
    # §12: the pipeline continues. Nothing to fall back to is a supported state.
    result = extract_text(a_canvas(), [a_region()], reader=None, region_reader=reader_that_fails())

    assert result.ocr_available is False
    assert result.regions[0].text is None
    assert result.regions[0].region.bbox == (10, 20, 120, 60)
