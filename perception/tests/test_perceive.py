"""T-101 -- /perceive runs the pipeline instead of answering with the template.

CONTRACT.md sections 12, 11, 10 and 6.

WHAT THIS TASK WAS, so a reader knows what these tests defend. The board read 100 of
100 while `POST /perceive` was still the T-054 scaffold: it read the upload, validated
it, threw it away, and returned the deterministic template with stages 2, 3 and 4
marked `skipped` and every element at `sourceOf: "default"`, `bbox: null`. Stages
T-055, T-056, T-098 and T-057 were all done, tested and unreachable from the endpoint,
because the seam between them belonged to no task at all.

So the tests below are mostly about the SEAM, not about the stages. Whether contour
detection works is T-056's question and B-003 answers it; whether fusion assigns slots
correctly is T-100's and B-004 answers it. What is tested here is that the endpoint
runs them, reports honestly what happened, and cannot be made to fail in a way section
12 does not define.

NO REAL OCR IN THE DEFAULT PATH. Same discipline as test_extract_text and test_fuse:
the reader is injected, so these run on a machine with no PaddleOCR, no GPU and no
network. EC-015 makes that more than a portability nicety -- the OCR worker on this
repository's own GPU machine dies intermittently, so a suite that depended on it would
fail at random and teach everyone to ignore it. The one test that does use the real
thing skips when it cannot run, and says so.
"""

from __future__ import annotations

import base64
import io as _io
import pathlib

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from perception.app import create_app, perceive_image
from perception.stages.normalise import NormalisationError

REFERENCE_SET = [
    "heroImage", "brandBadge", "headlineMain", "headlineSub",
    "description", "statBadges", "ctaButton",
]

# The same 1x1 PNG test_health uses: real enough to decode, empty enough to detect
# nothing in.
PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
)

WIREFRAME = pathlib.Path(__file__).resolve().parents[2].parent / "gpu-test" / "wireframe.png"


def a_drawn_wireframe() -> bytes:
    """A synthetic split-hero: a media panel left, blocks right, a row of three.

    Drawn rather than loaded so these tests need no fixture file and no photograph.
    It is not a hand-drawn wireframe and is not pretending to be one -- it exists to
    make stage 3 return SOMETHING, so the seam can be tested with a non-empty result.
    """
    canvas = np.full((760, 1200, 3), 255, dtype=np.uint8)
    cv2.rectangle(canvas, (60, 80), (560, 660), (0, 0, 0), 3)        # media panel
    cv2.rectangle(canvas, (640, 100), (900, 150), (0, 0, 0), 3)      # a block
    cv2.rectangle(canvas, (640, 200), (1120, 300), (0, 0, 0), 3)     # a bigger block
    for i in range(3):                                                # a regular series
        x = 640 + i * 110
        cv2.rectangle(canvas, (x, 380), (x + 80, 440), (0, 0, 0), 3)
    cv2.rectangle(canvas, (640, 520), (860, 590), (0, 0, 0), 3)      # a button
    ok, buffer = cv2.imencode(".png", canvas)
    assert ok
    return buffer.tobytes()


class NoText:
    """A reader that runs and finds nothing. Not the same as no reader at all."""

    def ocr(self, image, cls=None):  # noqa: ARG002
        return [[]]


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


def upload(client: TestClient, data: bytes, content_type: str = "image/png"):
    return client.post(
        "/perceive",
        files={"image": ("wireframe.png", _io.BytesIO(data), content_type)},
        data={"hints": "{}"},
    )


# ---------------------------------------------------------------------
# The defect this task existed for
# ---------------------------------------------------------------------


def test_the_image_is_actually_looked_at() -> None:
    """The whole task in one assertion.

    Before T-101 this returned the identity transform and `width: None` -- the tell
    that stage 2 never ran, since §6 requires the normaliser to record what it did.
    """
    body = perceive_image(a_drawn_wireframe(), reader=NoText())

    transform = body["normalisation"]
    assert transform["width"] == 1024 and transform["height"] == 1024
    assert transform["scale"] != 1.0, (
        "an identity transform means stage 2 did not run -- the scaffold's tell"
    )


def test_stages_report_what_ran_rather_than_skipped() -> None:
    body = perceive_image(a_drawn_wireframe(), reader=NoText())
    by_stage = {s["stage"]: s for s in body["stages"]}

    assert sorted(by_stage) == [2, 3, 4], "§11.0: stages 2-4 belong to this service"
    assert by_stage[2]["status"] == "ok"
    assert by_stage[3]["status"] in {"ok", "degraded"}
    assert by_stage[4]["status"] == "ok"
    for stage in by_stage.values():
        assert stage["status"] != "skipped", "a stage that ran must not report skipped"


def test_a_detection_claims_its_elements_and_says_where_they_came_from() -> None:
    """§6: `sourceOf` is what keeps conflict resolution auditable."""
    body = perceive_image(a_drawn_wireframe(), reader=NoText())
    claimed = [e for e in body["elements"] if e["sourceOf"] == "wireframe"]

    assert claimed, "a wireframe with drawn boxes in it must claim at least one element"
    for element in claimed:
        assert element["bbox"] is not None
        assert element["confidence"] is not None


# ---------------------------------------------------------------------
# §10 -- measured, never fabricated
# ---------------------------------------------------------------------


def test_an_unclaimed_element_carries_null_and_not_zero() -> None:
    """§10: elements that did not come from an image carry null, "not a fabricated
    number". null and 0.0 mean opposite things -- did not look, versus looked and saw
    nothing -- and the escalate band would treat the filler as urgent."""
    body = perceive_image(a_drawn_wireframe(), reader=NoText())

    for element in body["elements"]:
        if element["sourceOf"] == "default":
            assert element["confidence"] is None, element["elementName"]
            assert element["bbox"] is None, element["elementName"]


def test_every_confidence_is_a_real_number_in_range() -> None:
    body = perceive_image(a_drawn_wireframe(), reader=NoText())
    scores = [e["confidence"] for e in body["elements"] if e["confidence"] is not None]

    assert scores
    for score in scores:
        assert 0.0 < score <= 1.0


def test_confidences_vary_because_they_are_measured() -> None:
    """§10 forbids a constant, and identical scores across elements are its
    signature.

    THE SYNTHETIC WIREFRAME CANNOT SHOW THIS, which is worth stating because the first
    version of this test used it and failed. Its rectangles are drawn by cv2, so all
    four sides of every box are perfectly inked and the geometric confidence is a
    genuine, measured 1.0 for every one of them. That is the measurement being right,
    not a constant -- and a test that cannot tell those apart is not testing §10.

    So this one uses the hand-drawn reference wireframe, where the ink wanders and the
    scores do not agree. It needs no OCR: stage 3a's confidence is geometric, so this
    runs anywhere the file is present.
    """
    if not WIREFRAME.exists():
        pytest.skip(f"reference wireframe not present at {WIREFRAME}")

    body = perceive_image(WIREFRAME.read_bytes(), reader=NoText())
    scores = [e["confidence"] for e in body["elements"] if e["confidence"] is not None]

    assert len(set(scores)) > 1, f"every element scored the same: {scores}"


def test_bboxes_are_in_normalised_space_not_upload_space() -> None:
    """§6. A bbox outside the canvas means someone returned original-image pixels,
    which is the error the client cannot detect and will silently draw wrong."""
    body = perceive_image(a_drawn_wireframe(), reader=NoText())
    width = body["normalisation"]["width"]
    height = body["normalisation"]["height"]

    for element in body["elements"]:
        if element["bbox"] is None:
            continue
        x, y, w, h = element["bbox"]
        assert 0 <= x and 0 <= y, element["elementName"]
        assert x + w <= width and y + h <= height, element["elementName"]


# ---------------------------------------------------------------------
# T-112 -- the normalised canvas travels inline, because nothing else can carry it
# ---------------------------------------------------------------------


def test_stage_2_carries_the_normalised_canvas_as_well_as_the_transform() -> None:
    """§11.2: the service "returns its stage outputs inline in the response body, and
    Node persists them". The canvas IS stage 2's output, and until T-112 only the
    transform was sent -- so the raster existed nowhere outside this process and the
    human-in-the-loop overlay drew its bbox over a 404."""
    body = perceive_image(a_drawn_wireframe(), reader=NoText())
    artifact = next(s for s in body["stages"] if s["stage"] == 2)["artifact"]

    assert artifact["width"] == 1024, "the transform must survive alongside the raster"
    raster = artifact["raster"]
    assert raster["contentType"] == "image/jpeg"
    assert raster["extension"] == "jpg"
    assert raster["bytes"] > 0


def test_the_raster_is_a_real_decodable_image() -> None:
    """Base64 that decodes to something is not the same as an image. A backdrop that
    the browser refuses to render fails silently, which is the failure this replaces."""
    import base64 as _b64

    body = perceive_image(a_drawn_wireframe(), reader=NoText())
    raster = next(s for s in body["stages"] if s["stage"] == 2)["artifact"]["raster"]
    raw = _b64.b64decode(raster["base64"])

    assert len(raw) == raster["bytes"], "the reported size must match the payload"
    assert raw[:2] == bytes([0xFF, 0xD8]), "not a JPEG"
    decoded = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert decoded is not None and decoded.shape[:2] == (1024, 1024)


def test_the_raster_is_a_path_free_payload() -> None:
    """§11.2 again: this service runs on a different machine, so a path written here
    resolves to nothing there. The bytes travel; a filename would not."""
    body = perceive_image(a_drawn_wireframe(), reader=NoText())
    raster = next(s for s in body["stages"] if s["stage"] == 2)["artifact"]["raster"]

    assert "path" not in raster and "ref" not in raster
    assert set(raster) == {"contentType", "extension", "bytes", "base64"}


# ---------------------------------------------------------------------
# Degradation -- §12 makes it supported, not a failure
# ---------------------------------------------------------------------


def test_no_ocr_engine_degrades_stage_3_rather_than_failing_it() -> None:
    """§12 requires this pipeline to run with the GPU and the OCR engine absent."""
    body = perceive_image(a_drawn_wireframe(), reader=None)
    stage3 = next(s for s in body["stages"] if s["stage"] == 3)

    assert stage3["status"] == "degraded"
    assert stage3["model"] == "opencv-contours", "paddleocr must not be claimed"
    assert [e["elementName"] for e in body["elements"]] == REFERENCE_SET


def test_the_reference_set_survives_every_condition() -> None:
    """AGENTS.md rule 5. The emitter downstream builds a section from this set, so a
    missing ctaButton is a missing button in the demo."""
    for label, payload, reader in (
        ("a drawn wireframe", a_drawn_wireframe(), NoText()),
        ("no ocr engine", a_drawn_wireframe(), None),
        ("a blank 1x1", PNG_1PX, NoText()),
    ):
        body = perceive_image(payload, reader=reader)
        assert [e["elementName"] for e in body["elements"]] == REFERENCE_SET, label


def test_a_stage_that_raises_is_a_failed_stage_not_a_failed_request(monkeypatch) -> None:
    """§12 defines a 200 and a 422 for this endpoint. It does not define a 500, and a
    perception service that dies takes the generation with it."""
    import perception.app as app_module

    def boom(*args, **kwargs):
        raise RuntimeError("contours exploded")

    monkeypatch.setattr(app_module, "detect_regions", boom)
    body = perceive_image(a_drawn_wireframe(), reader=NoText())

    stage3 = next(s for s in body["stages"] if s["stage"] == 3)
    assert stage3["status"] == "failed"
    assert any("contours exploded" in w for w in stage3["warnings"])
    assert [e["elementName"] for e in body["elements"]] == REFERENCE_SET
    assert body["confidence"] is None, "a failed run must not report a confidence"
    assert all(e["sourceOf"] == "default" for e in body["elements"])


def test_a_failed_stage_still_reports_the_transform_stage_2_recorded() -> None:
    """The stage that DID run keeps its result. Discarding stage 2's transform because
    stage 3 died would throw away the one thing needed to map any later retry back."""
    import perception.app as app_module

    original = app_module.detect_regions
    try:
        app_module.detect_regions = lambda *a, **k: 1 / 0
        body = perceive_image(a_drawn_wireframe(), reader=NoText())
    finally:
        app_module.detect_regions = original

    assert body["normalisation"]["width"] == 1024
    assert next(s for s in body["stages"] if s["stage"] == 2)["status"] == "ok"


def test_an_undecodable_upload_is_the_one_error_section_12_defines(client: TestClient) -> None:
    body = upload(client, b"this is not a png at all")

    assert body.status_code == 422
    assert body.json()["error"]["code"] == "PARSE_FAILURE"


def test_normalisation_error_is_the_only_exception_that_escapes() -> None:
    with pytest.raises(NormalisationError):
        perceive_image(b"not an image", reader=NoText())


# ---------------------------------------------------------------------
# §11 -- the trace records, and what this service is not allowed to own
# ---------------------------------------------------------------------


def test_artifacts_travel_inline_and_never_as_a_path() -> None:
    """§11.2: artifacts are Node-owned and live on the Node machine. This service runs
    on a different laptop, so a path written here resolves to nothing anywhere else."""
    body = perceive_image(a_drawn_wireframe(), reader=NoText())

    for stage in body["stages"]:
        assert stage["inputRef"] is None, stage["stage"]
        assert stage["outputRef"] is None, stage["stage"]
    ran = [s for s in body["stages"] if s["status"] in {"ok", "degraded"}]
    assert all(s["artifact"] is not None for s in ran), "a stage that ran has an output"


def test_stage_timings_are_measured_not_zero() -> None:
    body = perceive_image(a_drawn_wireframe(), reader=NoText())
    stage2 = next(s for s in body["stages"] if s["stage"] == 2)

    assert stage2["ms"] >= 0
    assert stage2["startedAt"] is not None and stage2["startedAt"].endswith("Z")


def test_no_field_id_appears_anywhere(client: TestClient) -> None:
    """§12: the perception service never allocates a fieldId."""
    raw = upload(client, a_drawn_wireframe()).text

    assert "fieldId" not in raw


def test_the_service_writes_no_file(tmp_path, monkeypatch) -> None:
    """§11.2 again, as behaviour rather than as a claim."""
    monkeypatch.chdir(tmp_path)
    perceive_image(a_drawn_wireframe(), reader=NoText())

    assert list(tmp_path.iterdir()) == []


# ---------------------------------------------------------------------
# The real thing, when the machine can run it
# ---------------------------------------------------------------------


def test_the_reference_wireframe_end_to_end() -> None:
    """The only test that proves the endpoint answers with a real detection.

    Skipped where the OCR worker cannot run (EC-014) or died on this attempt (EC-015),
    because neither says anything about the seam this task built.
    """
    if not WIREFRAME.exists():
        pytest.skip(f"reference wireframe not present at {WIREFRAME}")

    from perception.stages.extract_text import load_reader

    reader = load_reader()
    if reader is None:
        pytest.skip("no usable OCR worker on this machine (EC-014)")

    body = perceive_image(WIREFRAME.read_bytes(), reader=reader)
    claimed = {e["elementName"] for e in body["elements"] if e["sourceOf"] == "wireframe"}

    assert claimed == set(REFERENCE_SET), (
        f"B-004 measured all seven slots claimed; this run claimed {sorted(claimed)}"
    )
    assert body["normalisation"]["scale"] == pytest.approx(0.64)
    assert body["confidence"] is not None
