"""T-057 -- fusion and hierarchy. CONTRACT.md sections 6 and 12.

doneWhen: "Fed the organiser's sample wireframe, the response's elements cover the
reference set -- heroImage, brandBadge, headlineMain, headlineSub, description,
statBadges, ctaButton."

That is tested as an INVARIANT rather than against one image: the reference set must
survive a good wireframe, a blank one, a degraded OCR pass and a wireframe with more
boxes than slots. AGENTS.md rule 5 -- the deterministic path always works -- is what
makes that the right reading. A test that only passed on one lucky photograph would
not defend the guarantee the emitter downstream actually depends on.

Detections are constructed directly rather than run through OpenCV. Stage 4's input is
stage 3's output, so feeding it real pixels would be testing T-056 again, and a failure
would not say which stage broke.
"""

from __future__ import annotations

import pytest

from perception.app import template_cards, template_elements, template_layout, template_theme
from perception.stages.detect_regions import Region
from perception.stages.extract_text import Extraction, RegionText
from perception.stages.fuse import fuse

W, H = 1000, 600

REFERENCE_SET = [
    "heroImage", "brandBadge", "headlineMain", "headlineSub",
    "description", "statBadges", "ctaButton",
]


def rt(x, y, w, h, *, text=None, conf=0.8, kind="rect", members=1, geo=0.7):
    """A stage-3b RegionText: a detected region plus whatever was read in it."""
    return RegionText(
        region=Region(bbox=(x, y, w, h), kind=kind, confidence=geo, members=members),
        text=text,
        confidence=conf if text else None,
    )


def run(regions, *, warnings=(), ocr=True, width=W, height=H):
    return fuse(
        Extraction(regions=tuple(regions), warnings=tuple(warnings), ocr_available=ocr),
        width=width,
        height=height,
        layout=template_layout(),
        theme=template_theme(),
        cards=template_cards(),
        elements=template_elements(),
    )


def a_split_hero():
    """A left-media split hero: big image left, six content blocks right."""
    return [
        rt(20, 20, 420, 560, text=None, geo=0.9),              # hero image
        rt(520, 40, 120, 24, text="PULSE FIT", conf=0.95),     # brandBadge
        rt(520, 90, 400, 60, text="CHALLENGE YOUR LIMITS", conf=0.94),
        rt(520, 170, 380, 34, text="Be a part of the tribe.", conf=0.88),
        rt(520, 220, 400, 70, text="Join trainer-led sessions.", conf=0.86),
        rt(520, 320, 400, 80, kind="group", members=3, text=None, geo=0.77),
        rt(520, 430, 180, 44, text="FIND A WORKOUT", conf=0.91),
    ]


# ---------------------------------------------------------------------
# doneWhen -- the reference set is covered, under every condition
# ---------------------------------------------------------------------


def test_donewhen_a_split_hero_yields_the_reference_set():
    result = run(a_split_hero())
    assert [e["elementName"] for e in result["elements"]] == REFERENCE_SET


def test_donewhen_holds_for_a_blank_image_with_no_regions_at_all():
    """AGENTS.md rule 5: the deterministic path always works."""
    result = run([])
    assert [e["elementName"] for e in result["elements"]] == REFERENCE_SET
    assert all(e["sourceOf"] == "default" for e in result["elements"])
    assert all(e["confidence"] is None for e in result["elements"])


def test_donewhen_holds_when_ocr_degraded_and_no_text_was_read():
    """Section 12's degradation path must still produce a full section."""
    regions = [rt(*r.region.bbox, kind=r.region.kind, members=r.region.members)
               for r in a_split_hero()]
    result = run(regions, ocr=False, warnings=("PaddleOCR is unavailable",))

    assert [e["elementName"] for e in result["elements"]] == REFERENCE_SET
    # Geometry came from the image even though the words did not.
    claimed = [e for e in result["elements"] if e["sourceOf"] == "wireframe"]
    assert len(claimed) == 7
    # Every element except statBadges keeps its template copy. statBadges is a
    # Cards element whose template default is "" by design -- its content lives in
    # cards.items, not in a scalar default -- so requiring copy there would be
    # asserting the wrong shape.
    assert all(
        e["default"] for e in result["elements"] if e["contentType"] != "Cards"
    ), "defaults fill in for missing copy"


def test_donewhen_holds_when_there_are_more_regions_than_slots():
    result = run(a_split_hero() + [rt(520, 500, 100, 20, text="extra", conf=0.9)])
    assert [e["elementName"] for e in result["elements"]] == REFERENCE_SET


# ---------------------------------------------------------------------
# Section 6 -- the sub-objects and their shapes
# ---------------------------------------------------------------------


def test_returns_section_12s_named_sub_objects_and_no_irfragment():
    result = run(a_split_hero())
    assert set(result) == {
        "layout", "theme", "cards", "elements", "confidence", "questions", "warnings"
    }
    assert "irFragment" not in result


def test_no_element_carries_a_fieldid():
    """Section 12: the perception service never allocates a fieldId."""
    result = run(a_split_hero())
    for e in result["elements"]:
        assert "fieldId" not in e
    for item in result["cards"]["items"]:
        assert not any(k.startswith("fieldId") for k in item)


def test_ocr_text_becomes_the_element_default():
    result = run(a_split_hero())
    by_name = {e["elementName"]: e for e in result["elements"]}
    assert by_name["headlineMain"]["default"] == "CHALLENGE YOUR LIMITS"
    assert by_name["brandBadge"]["default"] == "PULSE FIT"
    assert by_name["ctaButton"]["default"] == "FIND A WORKOUT"


def test_a_claimed_region_without_text_keeps_the_template_copy():
    result = run(a_split_hero())
    hero = next(e for e in result["elements"] if e["elementName"] == "heroImage")
    assert hero["default"] == "default/images/hero-placeholder.jpg"
    assert hero["sourceOf"] == "wireframe", "the geometry did come from the image"
    assert hero["bbox"] == [20, 20, 420, 560]


def test_template_only_elements_are_marked_default_not_wireframe():
    """Section 6: sourceOf is what keeps conflict resolution auditable."""
    result = run([rt(20, 20, 420, 560, geo=0.9)])  # media only
    by_name = {e["elementName"]: e for e in result["elements"]}

    assert by_name["heroImage"]["sourceOf"] == "wireframe"
    assert by_name["ctaButton"]["sourceOf"] == "default"
    assert by_name["ctaButton"]["bbox"] is None


# ---------------------------------------------------------------------
# The group -> statBadges rule
# ---------------------------------------------------------------------


def test_a_group_region_always_claims_statbadges_whatever_its_position():
    """Section 9 step 5 patches a statBadges card; the slot must be right."""
    regions = [
        rt(20, 20, 420, 560, geo=0.9),
        rt(520, 40, 300, 80, kind="group", members=3, geo=0.8),   # group FIRST
        rt(520, 140, 300, 40, text="PULSE FIT", conf=0.9),
    ]
    result = run(regions)
    by_name = {e["elementName"]: e for e in result["elements"]}

    assert by_name["statBadges"]["sourceOf"] == "wireframe"
    assert by_name["statBadges"]["bbox"] == [520, 40, 300, 80]
    assert by_name["brandBadge"]["default"] == "PULSE FIT", "the rest still stack in order"


def test_card_count_follows_the_detected_series_not_the_template_three():
    """Section 4 rule 4: the count is whatever the IR says, defaulting to 3."""
    regions = [rt(20, 20, 420, 560, geo=0.9),
               rt(520, 320, 400, 80, kind="group", members=4, geo=0.8)]
    result = run(regions)

    assert result["cards"]["count"] == 4
    assert result["cards"]["gridColumns"] == 4
    assert len(result["cards"]["items"]) == 4


def test_grown_card_slots_are_blank_not_duplicated_template_copy():
    regions = [rt(20, 20, 420, 560, geo=0.9),
               rt(520, 320, 400, 80, kind="group", members=5, geo=0.8)]
    items = run(regions)["cards"]["items"]

    assert len(items) == 5
    assert items[4]["field1"] == "", "a duplicated '1000+' would read as extracted content"


def test_cards_default_to_the_template_when_no_group_was_detected():
    result = run([rt(20, 20, 420, 560, geo=0.9)])
    assert result["cards"]["count"] == template_cards()["count"]


# ---------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------


def test_media_side_follows_the_image_left():
    result = run(a_split_hero())
    regions = {r["role"]: r["side"] for r in result["layout"]["regions"]}
    assert regions["media"] == "left"
    assert regions["content"] == "right"


def test_media_side_follows_the_image_right():
    """A right-media wireframe must not be reported as left-media."""
    mirrored = [
        rt(560, 20, 420, 560, geo=0.9),                       # image on the RIGHT
        rt(60, 40, 120, 24, text="PULSE FIT", conf=0.95),
        rt(60, 90, 400, 60, text="HEADLINE", conf=0.94),
    ]
    result = run(mirrored)
    regions = {r["role"]: r["side"] for r in result["layout"]["regions"]}

    assert regions["media"] == "right"
    assert regions["content"] == "left"


def test_a_region_sharing_the_media_half_does_not_take_a_content_slot():
    """A logo drawn on the image must not push the real content down a slot."""
    regions = a_split_hero() + [rt(60, 60, 80, 20, text="on the image", conf=0.9)]
    result = run(regions)
    by_name = {e["elementName"]: e for e in result["elements"]}

    assert by_name["brandBadge"]["default"] == "PULSE FIT"


def test_no_media_candidate_keeps_heroimage_default_and_warns():
    small = [rt(520, 40 + i * 40, 100, 20, text=f"t{i}", conf=0.9) for i in range(3)]
    result = run(small)
    hero = next(e for e in result["elements"] if e["elementName"] == "heroImage")

    assert hero["sourceOf"] == "default"
    assert any("hero image" in w for w in result["warnings"])


# ---------------------------------------------------------------------
# Section 10 -- confidence and questions
# ---------------------------------------------------------------------


def test_unclaimed_elements_carry_null_confidence_never_zero():
    """Section 10: not a fabricated number. null and 0.0 mean opposite things."""
    result = run([rt(20, 20, 420, 560, geo=0.9)])
    cta = next(e for e in result["elements"] if e["elementName"] == "ctaButton")

    assert cta["confidence"] is None
    assert cta["confidence"] is not 0.0  # noqa: F632 - identity is the point


def test_ocr_confidence_is_carried_onto_the_element():
    result = run(a_split_hero())
    headline = next(e for e in result["elements"] if e["elementName"] == "headlineMain")
    assert headline["confidence"] == pytest.approx(0.94)


def test_a_region_without_text_carries_its_geometric_confidence():
    result = run(a_split_hero())
    hero = next(e for e in result["elements"] if e["elementName"] == "heroImage")
    assert hero["confidence"] == pytest.approx(0.9)


def test_confidence_is_not_a_constant():
    seen = set()
    for score in (0.30, 0.65, 0.99):
        r = run([rt(20, 20, 420, 560, geo=0.9),
                 rt(520, 40, 200, 30, text="x", conf=score)])
        badge = next(e for e in r["elements"] if e["elementName"] == "brandBadge")
        seen.add(round(badge["confidence"], 6))
    assert len(seen) == 3


def test_low_confidence_raises_a_question_per_section_10():
    result = run([rt(20, 20, 420, 560, geo=0.9),
                  rt(520, 40, 200, 30, text="???", conf=0.31)])

    assert [q["elementName"] for q in result["questions"]] == ["brandBadge"]
    assert result["questions"][0]["confidence"] == pytest.approx(0.31)


def test_medium_confidence_warns_rather_than_asking():
    result = run([rt(20, 20, 420, 560, geo=0.9),
                  rt(520, 40, 200, 30, text="maybe", conf=0.70)])

    assert result["questions"] == []
    assert any("medium confidence" in w for w in result["warnings"])


def test_high_confidence_neither_asks_nor_warns_about_the_element():
    result = run([rt(20, 20, 420, 560, geo=0.95),
                  rt(520, 40, 200, 30, text="sure", conf=0.97)])
    assert result["questions"] == []
    assert not any("medium confidence" in w for w in result["warnings"])


def test_overall_confidence_is_null_when_nothing_was_detected():
    assert run([])["confidence"] is None


def test_upstream_warnings_are_preserved():
    result = run(a_split_hero(), warnings=("PaddleOCR is unavailable",))
    assert any("PaddleOCR" in w for w in result["warnings"])


# ---------------------------------------------------------------------
# Theme, and section 11 rule 3
# ---------------------------------------------------------------------


def test_theme_is_the_template_and_is_not_invented_from_the_image():
    """A pencil wireframe carries no colour; a sampled accent would be fabricated."""
    assert run(a_split_hero())["theme"] == template_theme()


def test_purity_same_input_same_output():
    first, second = run(a_split_hero()), run(a_split_hero())
    assert first == second


def test_result_is_json_serialisable_for_the_section_12_response():
    import json
    payload = json.loads(json.dumps(run(a_split_hero())))
    assert isinstance(payload["elements"][0]["bbox"], (list, type(None)))


def test_the_template_arguments_are_not_mutated():
    """Fusion must not edit the shape app.py owns -- other requests reuse it."""
    layout, cards = template_layout(), template_cards()
    before_side = layout["regions"][0]["side"]
    before_count = cards["count"]

    fuse(
        Extraction(regions=tuple(a_split_hero())),
        width=W, height=H,
        layout=layout, theme=template_theme(), cards=cards,
        elements=template_elements(),
    )

    assert layout["regions"][0]["side"] == before_side
    assert cards["count"] == before_count
