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
import perception.stages.fuse as fuse_module
from perception.stages.fuse import fuse

W, H = 1000, 600

REFERENCE_SET = [
    "heroImage", "brandBadge", "headlineMain", "headlineSub",
    "description", "statBadges", "ctaButton",
]


def rt(x, y, w, h, *, text=None, conf=0.8, kind="rect", members=1, geo=0.7, axis=None):
    """A stage-3b RegionText: a detected region plus whatever was read in it.

    `axis` mirrors what T-056 records on a group -- 1.0 for a series running down the
    page, 0.0 for one running across it. Left unset by default so every test written
    before T-100 describes a group whose direction was not recorded.
    """
    evidence = {} if axis is None else {"axis": axis}
    return RegionText(
        region=Region(
            bbox=(x, y, w, h), kind=kind, confidence=geo, members=members,
            evidence=evidence,
        ),
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


# ---------------------------------------------------------------------
# T-100 -- slots are claimed by what the wireframe SAYS, before by where it sits
# ---------------------------------------------------------------------


def _slot(result, name):
    return next(e for e in result["elements"] if e["elementName"] == name)


def a_labelled_wireframe():
    """The reference wireframe's shape: a hero panel that says "Image", and content
    blocks that name themselves. Deliberately stacked in an order that does NOT match
    CONTENT_SLOTS, so a positional rule cannot pass these tests by accident."""
    return [
        rt(20, 20, 420, 560, text=None, geo=0.9),                    # the panel
        rt(120, 250, 90, 30, text="Image", conf=0.86),               # its label
        rt(520, 40, 180, 44, text="SUBMIT", conf=0.92),              # ctaButton, first
        rt(520, 120, 400, 60, text="HEADLINE", conf=0.99),
        rt(520, 200, 380, 40, text="SUB HEADLINE", conf=0.95),
        rt(520, 260, 120, 24, text="LABEL", conf=0.97),
    ]


def test_a_slot_is_claimed_by_its_keyword_not_by_its_position():
    """SUBMIT sits at the TOP of the content column here. Position would make it
    brandBadge; the word makes it the button."""
    result = run(a_labelled_wireframe())

    assert _slot(result, "ctaButton")["default"] == "SUBMIT"
    assert _slot(result, "brandBadge")["default"] == "LABEL"
    assert _slot(result, "headlineMain")["default"] == "HEADLINE"


def test_sub_headline_beats_headline_on_the_same_string():
    """"SUB HEADLINE" contains "HEADLINE". The more specific phrase must win, or the
    subheading takes the main slot and the real headline is pushed out."""
    result = run(a_labelled_wireframe())

    assert _slot(result, "headlineMain")["default"] == "HEADLINE"
    assert _slot(result, "headlineSub")["default"] == "SUB HEADLINE"


def test_the_word_image_points_at_the_panel_and_claims_no_slot_itself():
    """The measured bug: "Image" is the hero panel's own caption, and letting it claim
    a content slot put the word "Image" in headlineSub."""
    result = run(a_labelled_wireframe())

    hero = _slot(result, "heroImage")
    assert hero["bbox"] == [20, 20, 420, 560], "the panel, not the word inside it"
    for name in ("headlineSub", "headlineMain", "brandBadge", "description"):
        assert _slot(result, name)["default"] != "Image"


def test_the_media_panel_is_the_smallest_box_containing_its_label():
    """A detected outer frame contains the label too -- and everything else. Choosing
    the largest container is how the frame became the hero image."""
    frame = rt(0, 0, 990, 590, text=None, geo=0.6)
    result = run([frame] + a_labelled_wireframe())

    assert _slot(result, "heroImage")["bbox"] == [20, 20, 420, 560]


def test_a_reading_below_the_escalate_band_does_not_claim_a_slot():
    """Bleed-through from the reverse of a sheet reads as low-confidence noise. Text
    the contract would stop and ask a human about is not text that silently overrides
    position."""
    regions = [
        rt(20, 20, 420, 560, text=None, geo=0.9),
        rt(520, 40, 180, 44, text="SUBMIT", conf=0.30),
    ]
    result = run(regions)

    assert _slot(result, "ctaButton")["default"] != "SUBMIT"


def test_one_region_claims_at_most_one_slot():
    result = run(a_labelled_wireframe())
    claimed = [tuple(e["bbox"]) for e in result["elements"] if e["sourceOf"] == "wireframe"]

    assert len(claimed) == len(set(claimed))


def test_position_still_places_whatever_the_wireframe_did_not_label():
    """The fallback is demoted, not deleted. A wireframe that names nothing must
    behave exactly as it did before T-100."""
    result = run(a_split_hero())

    assert _slot(result, "brandBadge")["default"] == "PULSE FIT"
    assert _slot(result, "headlineMain")["default"] == "CHALLENGE YOUR LIMITS"


# --- which series is which, by which way it runs ---------------------------


def test_a_series_running_down_the_page_is_the_description():
    """Measured on the reference wireframe: a 4-member vertical series (the ruled
    lines) and a 3-member horizontal one (the badges). Taking the first group in
    reading order gave statBadges the paragraph."""
    regions = [
        rt(20, 20, 420, 560, text=None, geo=0.9),
        rt(520, 100, 170, 90, kind="group", members=4, axis=1.0, geo=0.69),
        rt(520, 300, 230, 52, kind="group", members=3, axis=0.0, geo=0.90),
    ]
    result = run(regions)

    assert _slot(result, "description")["bbox"] == [520, 100, 170, 90]
    assert _slot(result, "statBadges")["bbox"] == [520, 300, 230, 52]


def test_the_card_count_follows_the_horizontal_series_not_the_vertical_one():
    """§4 rule 4: the card count is whatever the IR says. Handing statBadges the
    4-line paragraph would report four cards for a three-badge row."""
    regions = [
        rt(20, 20, 420, 560, text=None, geo=0.9),
        rt(520, 100, 170, 90, kind="group", members=4, axis=1.0, geo=0.69),
        rt(520, 300, 230, 52, kind="group", members=3, axis=0.0, geo=0.90),
    ]
    result = run(regions)

    assert result["cards"]["count"] == 3


def test_a_series_with_no_axis_recorded_still_goes_to_statbadges():
    """The conservative direction. statBadges is what the §9 store-liveness assertion
    patches, so where the geometry is silent, the slot that must not be empty wins."""
    regions = [
        rt(20, 20, 420, 560, text=None, geo=0.9),
        rt(520, 100, 230, 52, kind="group", members=3, geo=0.9),
    ]
    result = run(regions)

    assert _slot(result, "statBadges")["bbox"] == [520, 100, 230, 52]


def test_slot_assignment_is_deterministic_across_input_orderings():
    """Section 11 rule 3. Two regions matching the same keyword must resolve the same
    way whichever order stage 3 happened to emit them in."""
    regions = a_labelled_wireframe()
    first = run(regions)
    second = run(list(reversed(regions)))

    assert [e["bbox"] for e in first["elements"]] == [e["bbox"] for e in second["elements"]]
    assert [e["default"] for e in first["elements"]] == [e["default"] for e in second["elements"]]



# ---------------------------------------------------------------------------
# T-132 — an UNSCORED reading is not a reading scored zero.
# ---------------------------------------------------------------------------


def _unscored(candidate):
    """The shape T-122's hosted reader produces: text, and no confidence.

    §10 makes null the honest value for a transcription that carries no score,
    and the reader sets it deliberately rather than inventing a 1.0 that would
    sit on the Glass Box beside measured numbers.
    """
    return RegionText(region=candidate.region, text=candidate.text, confidence=None)


def test_a_reading_with_no_score_still_claims_its_slot():
    """THE DEFECT, and it silently disabled the entire keyword path.

    `_readable` was `(candidate.confidence or 0.0) >= KEYWORD_FLOOR`. `None or 0.0`
    is zero, so every unscored reading fell below the floor and none was ever
    readable — `_keyword_assignments` matched nothing at all and every slot fell
    through to position.

    Measured end to end through /perceive with the hosted reader on: the run read
    HEADLINE, SUB HEADLINE, LABEL and SUBMIT correctly off the page, and
    `headlineMain` still came back "TV", `description` "ago", and `brandBadge` and
    `ctaButton` from the reference template. Overall confidence 0.68, against 0.85
    for the path it was supposed to improve.
    """
    scored = [
        rt(400, 560, 230, 45, text="HEADLINE"),
        rt(240, 620, 550, 66, text="SUB HEADLINE"),
        rt(740, 290, 160, 28, text="LABEL"),
        rt(790, 520, 160, 45, text="SUBMIT"),
    ]
    unscored = [_unscored(c) for c in scored]

    # Every one of them really does carry no score of its own.
    assert all(c.confidence is None for c in unscored)

    result = run(unscored)
    by_name = {e["elementName"]: e for e in result["elements"]}

    assert by_name["headlineMain"]["default"] == "HEADLINE"
    assert by_name["headlineSub"]["default"] == "SUB HEADLINE"
    assert by_name["brandBadge"]["default"] == "LABEL"
    assert by_name["ctaButton"]["default"] == "SUBMIT"


def test_an_unscored_reading_is_judged_on_the_region_it_came_from():
    """`effective_confidence`'s rule, applied at the floor.

    The geometric score is a real measurement — it is what §10's bands are applied
    to for a region with no text — so a reading with no score of its own is judged
    on the confidence of the box it was read out of, not discarded for a number it
    never claimed to have.
    """
    # A region the detector was sure about. Its reading should be acted on.
    confident = _unscored(rt(400, 560, 230, 45, text="HEADLINE", geo=0.95))
    assert fuse_module._readable(confident) is True

    # A region the detector itself doubted. §10's escalate boundary is the floor,
    # and it still applies — the point of T-132 is that null is not zero, not that
    # the floor is gone.
    doubtful = _unscored(rt(400, 560, 230, 45, text="HEADLINE", geo=0.20))
    assert fuse_module._readable(doubtful) is False


def test_a_scored_reading_is_still_judged_on_its_own_score():
    """The PaddleOCR path must be unchanged by this.

    Where a reading HAS a score, that score is the better evidence and stays the
    one the floor is applied to — a weak reading inside a confidently detected box
    is still a weak reading.
    """
    weak_text_strong_box = rt(400, 560, 230, 45, text="HEADLINE", conf=0.10, geo=0.99)
    assert fuse_module._readable(weak_text_strong_box) is False

    strong_text_weak_box = rt(400, 560, 230, 45, text="HEADLINE", conf=0.95, geo=0.10)
    assert fuse_module._readable(strong_text_weak_box) is True
