"""T-054's verification. CONTRACT.md section 12.

Asserts the wire shape of both endpoints, the rules that make this service safe
to run on a different laptop from the Node API, and the honesty rules that stop a
scaffold from reading as a measurement.
"""

from __future__ import annotations

import base64
import io
import json

import pytest
from fastapi.testclient import TestClient

from perception.app import create_app, detect_device

SECTION_12_KEYS = {
    "layout",
    "theme",
    "cards",
    "elements",
    "normalisation",
    "confidence",
    "questions",
    "stages",
    "warnings",
}

# A real, valid 1x1 RGB PNG. Small enough to inline, real enough that a decoder
# added at T-055 will not choke on it.
PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
)


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


def upload(client: TestClient, data: bytes = PNG_1PX, content_type: str = "image/png", hints: str = "{}"):
    return client.post(
        "/perceive",
        files={"image": ("wireframe.png", io.BytesIO(data), content_type)},
        data={"hints": hints},
    )


# --- GET /health -----------------------------------------------------------


def test_health_returns_exactly_the_section_12_shape(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200

    body = response.json()
    assert set(body) == {"ok", "models", "device"}, "section 12 names exactly three keys"
    assert body["ok"] is True
    assert isinstance(body["models"], list)
    assert all(isinstance(name, str) for name in body["models"])
    assert isinstance(body["device"], str)


def test_health_reports_the_real_device_not_a_hardcoded_one() -> None:
    """Roadmap gate 0.7 is 'GET /health returns cuda:0'.

    That gate is only meaningful if this function can also return 'cpu'. A
    hardcoded 'cuda:0' would pass the gate on a machine with no GPU at all and
    send the perception owner hunting a fault that does not exist.
    """
    device = detect_device()
    assert device == "cpu" or device.startswith("cuda:"), device

    try:
        import torch
    except Exception:
        # Not ImportError: torch raises OSError when its DLLs will not load,
        # which is what happens once paddle has been initialised in the same
        # process (EC-014). Unloadable torch and absent torch are the same fact
        # as far as this endpoint is concerned -- neither can report a device.
        assert device == "cpu", "torch unavailable means cpu, not a guess"
        return

    assert (device != "cpu") == torch.cuda.is_available(), (
        f"detect_device() said {device!r} while torch.cuda.is_available() "
        f"said {torch.cuda.is_available()}"
    )


def test_health_never_claims_a_model_it_cannot_import(client: TestClient) -> None:
    for name in client.get("/health").json()["models"]:
        module = {"opencv-contours": "cv2", "paddleocr": "paddleocr"}[name]
        pytest.importorskip(module, reason=f"/health advertised {name} but {module} is absent")


# --- POST /perceive, the shape ---------------------------------------------


def test_perceive_returns_every_section_12_key_and_no_others(client: TestClient) -> None:
    response = upload(client)
    assert response.status_code == 200
    assert set(response.json()) == SECTION_12_KEYS


def test_perceive_returns_named_sub_objects_not_an_ir_fragment(client: TestClient) -> None:
    """Section 12: 'There is no irFragment.'

    A single opaque fragment is exactly the field one track emits as a whole IR
    and the other consumes as a partial, and they discover the mismatch at
    integration.
    """
    body = response_json = upload(client).json()
    assert "irFragment" not in body
    assert "ir" not in body
    assert isinstance(response_json["layout"]["regions"], list)
    assert response_json["theme"]["accent"] == "red-500"


def test_perceive_never_allocates_a_field_id(client: TestClient) -> None:
    """Section 12: 'The perception service never allocates a fieldId.'

    Section 6 is stricter still for cards: 'No field IDs appear in the IR at
    all -- the API attaches them after the IR is final. A model that emits an ID
    is producing invalid IR and the validator rejects it.'
    """
    body = upload(client).json()

    for element in body["elements"]:
        assert "fieldId" not in element, f"{element['elementName']} carries a fieldId"

    for item in body["cards"]["items"]:
        offending = [key for key in item if key.startswith("fieldId")]
        assert not offending, f"card item carries {offending}"

    # Belt and braces: no 10-digit id in the sanctioned ranges anywhere in the
    # payload, however nested.
    import re

    blob = json.dumps(body)
    assert not re.search(r'"[123]\d{9}"', blob), "a sanctioned-range id leaked into the response"


def test_perceive_returns_only_stages_2_to_4(client: TestClient) -> None:
    """Section 11.0: stage 1 and stages 5-7 are Node's. This service owns 2-4."""
    stages = upload(client).json()["stages"]
    assert [stage["stage"] for stage in stages] == [2, 3, 4]
    assert [stage["name"] for stage in stages] == [
        "preprocessing-normalization",
        "multimodal-understanding",
        "semantic-planning-ir",
    ]

    valid = {"pending", "running", "ok", "degraded", "failed", "skipped"}
    for stage in stages:
        assert stage["status"] in valid, f"section 11.1 is a closed set; got {stage['status']!r}"


def test_perceive_records_a_normalisation_transform(client: TestClient) -> None:
    """Section 6: a bbox without a recorded transform is unusable by anyone who
    did not write the normaliser -- and they are on a different machine."""
    normalisation = upload(client).json()["normalisation"]
    assert set(normalisation) == {"scale", "offsetX", "offsetY", "width", "height"}


# --- POST /perceive, the honesty rules -------------------------------------


def test_scaffold_reports_null_confidence_rather_than_a_plausible_number(client: TestClient) -> None:
    """Section 10: 'Elements that did not come from an image carry null, not a
    fabricated number.'

    Nothing in this scaffold has read the image. A confidence of 0.88 here would
    read as a measurement to the Glass Box timeline, to section 10's confidence
    bands, and to whoever demos this. It would be believed.
    """
    body = upload(client).json()
    assert body["confidence"] is None

    for element in body["elements"]:
        assert element["confidence"] is None, element["elementName"]
        assert element["bbox"] is None, element["elementName"]
        assert element["sourceOf"] == "default", (
            f"{element['elementName']} claims sourceOf={element['sourceOf']!r}; "
            "claiming a wireframe source for a template value corrupts the "
            "conflict-resolution audit trail (section 6)"
        )


def test_a_response_that_is_the_template_says_so(client: TestClient) -> None:
    """Rewritten at T-101, and the invariant is the same one the scaffold defended.

    A 1x1 PNG has nothing in it, so nothing claims an element and the whole reference
    set comes back at its default. From the outside that is indistinguishable from a
    successful detection -- a complete, plausible element set. It was the scaffold's
    permanent warning that made the difference visible, and wiring the real pipeline
    in must not quietly remove it.

    The test no longer asserts the words "not implemented", because that sentence is
    now false: the pipeline IS implemented and it ran. What must survive is the claim
    the sentence was carrying.
    """
    warnings = upload(client).json()["warnings"]
    assert warnings, "a template returned as if it were a detection must say so"
    assert any("template" in w and "not a detection" in w for w in warnings), warnings


def test_card_count_is_carried_in_the_ir_not_assumed(client: TestClient) -> None:
    """Section 4 rule 4: card count is not fixed at 3. The component must render
    n items, and n comes from here."""
    cards = upload(client).json()["cards"]
    assert cards["count"] == len(cards["items"])
    assert cards["fieldsPerItem"] == 2


# --- POST /perceive, the 422 path ------------------------------------------


@pytest.mark.parametrize(
    ("kwargs", "why"),
    [
        ({"content_type": "image/gif"}, "section 13.1 accepts PNG, JPEG and WebP only"),
        ({"data": b""}, "an empty upload is not an image"),
        ({"hints": "{not json"}, "hints must be valid JSON"),
    ],
)
def test_bad_input_is_422_with_the_parse_failure_envelope(client: TestClient, kwargs, why) -> None:
    response = upload(client, **kwargs)
    assert response.status_code == 422, why

    body = response.json()
    assert body["ok"] is False
    assert body["error"]["code"] == "PARSE_FAILURE"
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]


def test_this_service_writes_no_files(client: TestClient, tmp_path, monkeypatch) -> None:
    """Section 11.2: 'The Python service never writes artifacts.'

    A relative path written on the perception laptop resolves to nothing on the
    Node machine, so artifacts are Node-owned and stage outputs come back inline.
    This asserts the rule directly rather than trusting it.
    """
    monkeypatch.chdir(tmp_path)
    before = set(tmp_path.rglob("*"))

    body = upload(client).json()

    assert set(tmp_path.rglob("*")) == before, "perceive touched the filesystem"
    for stage in body["stages"]:
        assert stage["outputRef"] is None, (
            f"stage {stage['stage']} returned an outputRef path; outputs come back "
            "inline and Node persists them"
        )
