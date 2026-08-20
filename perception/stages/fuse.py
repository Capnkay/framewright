"""Stage 4 -- fusion and hierarchy. CONTRACT.md sections 6 and 12.

Stages 3a and 3b answered WHERE (T-056) and WHAT IT SAYS (T-098). Neither named
anything: T-056's docstring is explicit that "naming is fusion's job (T-057), and a
detector that guesses names is a detector whose geometry cannot be checked separately
from its semantics." This is that job -- turn shapes and strings into the IR's named
sub-objects.

WHAT THIS RETURNS is section 12's response body minus the parts Node owns:
`layout`, `theme`, `cards`, `elements`, `confidence`, `questions`, `warnings`. Section
12 is emphatic that there is no `irFragment` -- the service returns the IR's named
sub-objects directly -- so this returns them separately and never wraps them.

NO fieldId APPEARS ANYWHERE IN HERE. Section 12: "The perception service never
allocates a fieldId." Elements come back identified by position and `elementName`.

--------------------------------------------------------------------------------
THE RULE THAT SHAPES THE WHOLE MODULE: the reference set is always covered.

The doneWhen asks that the response's elements cover heroImage, brandBadge,
headlineMain, headlineSub, description, statBadges and ctaButton. That is not a
statement about a lucky wireframe -- it is the deterministic-path guarantee in
AGENTS.md rule 5 applied to stage 4. A blank image, a failed OCR pass and a wireframe
with nine boxes must all produce the same seven named elements, because the emitter
downstream builds a section from that set and a missing `ctaButton` is a missing
button in the demo.

So fusion does not BUILD an element list from detections. It starts from the
reference set and lets detections claim slots. A region that claims a slot supplies
its bbox, its confidence and its text; a slot nothing claimed keeps the template's
default and is honestly marked. The output length is therefore constant, and the
interesting variable is how many entries carry `sourceOf: "wireframe"`.

WHY sourceOf CARRIES THE WEIGHT HERE. Section 6 makes `sourceOf` the field that keeps
conflict resolution auditable. app.py's `_element` already refuses to claim a
wireframe source for a template value, and the same discipline binds harder in this
file, because here the two are mixed in one list. Every entry says exactly where it
came from, so T-061's combined-mode conflict rule has something true to work with.

CONFIDENCE, section 10. An element that claimed a region carries that region's
effective confidence -- the OCR score where text was read, the geometric score where
it was not (T-098 decides which). An element that claimed nothing carries `null`,
never 0.0 and never a filler. Section 10: elements that did not come from an image
carry null, "not a fabricated number". `null` and `0.0` mean opposite things -- one
is "we did not look", the other is "we looked and saw nothing" -- and the escalation
band at < 0.60 would treat the filler as an urgent question about an element nobody
ever examined.

PURITY, section 11 rule 3. A pure function of its inputs. No clock, no filesystem, no
network, and no dependence on dict iteration order.
"""

from __future__ import annotations

from typing import Any, Sequence

from .extract_text import Extraction, RegionText

# Section 10's bands. Below ESCALATE we ask a human (section 11.3); between the two
# we accept but warn. The numbers are the contract's, not tuned here.
ESCALATE_BELOW = 0.60
VERIFY_BELOW = 0.85

# A region must occupy at least this fraction of the canvas to be considered the
# hero image. Below it, a large box is a card or a content panel, not the media half
# of a split hero.
MEDIA_MIN_AREA = 0.12

# How far a region's centre may sit from a lateral edge, as a fraction of width,
# and still count as "that side". 0.5 exactly would make every region belong to a
# side and the classification meaningless.
SIDE_MARGIN = 0.5

# The content slots, in the order they stack down the content column. This IS the
# reference set from section 3, and its order is the `order` field.
CONTENT_SLOTS = (
    "brandBadge",
    "headlineMain",
    "headlineSub",
    "description",
    "statBadges",
    "ctaButton",
)
MEDIA_SLOT = "heroImage"


def _centre(bbox: tuple[int, int, int, int]) -> tuple[float, float]:
    x, y, w, h = bbox
    return (x + w / 2.0, y + h / 2.0)


def _area(bbox: tuple[int, int, int, int]) -> int:
    return bbox[2] * bbox[3]


def _pick_media(
    candidates: Sequence[RegionText], width: int, height: int
) -> RegionText | None:
    """The hero image: the largest region that is big enough to be a media panel.

    Deliberately NOT "the largest region". On a wireframe whose outer frame was
    detected, the largest region is the frame, and calling the frame the hero image
    puts every other element inside the media half. The area ceiling that would
    exclude a frame lives in T-056 (`MAX_AREA_FRACTION`), so anything reaching here
    is already frame-free; the floor below is the remaining half of the judgement.
    """
    canvas = float(width * height) or 1.0
    viable = [c for c in candidates if _area(c.region.bbox) / canvas >= MEDIA_MIN_AREA]
    if not viable:
        return None
    # Largest first; ties broken on position so the choice is total and stable.
    return max(viable, key=lambda c: (_area(c.region.bbox), -c.region.bbox[1], -c.region.bbox[0]))


def _side_of(bbox: tuple[int, int, int, int], width: int) -> str:
    cx, _ = _centre(bbox)
    return "left" if cx < width * SIDE_MARGIN else "right"


def _reading_order(items: Sequence[RegionText]) -> list[RegionText]:
    """Top to bottom, then left to right. Total: ties fall through to the bbox."""
    return sorted(items, key=lambda c: (c.region.bbox[1], c.region.bbox[0], c.region.bbox[2]))


def _slot_assignments(
    content: Sequence[RegionText],
) -> dict[str, RegionText]:
    """Map content-column regions onto the named slots, in stacking order.

    A GROUP REGION ALWAYS TAKES statBadges, wherever it appears in the stack, and it
    is matched before anything else. T-056 emits `kind == "group"` only for an
    aligned, evenly-spaced series of similar siblings, which is precisely what a row
    of stat badges is and is not what a headline is. Letting the row of badges fall
    into whatever ordinal slot it happened to occupy would put three cards in
    `headlineSub` and leave `statBadges` empty -- and `statBadges` is the element the
    section-9 store-liveness assertion patches at step 5, so getting it wrong breaks
    the one check that catches a dead store.

    Everything else is assigned by position: the remaining slots, in order, take the
    remaining regions, in reading order. It is a simple rule and it is the right kind
    of simple -- the alternative is guessing semantics from font size, which needs a
    model this stage deliberately does not have.
    """
    assigned: dict[str, RegionText] = {}
    remaining = list(_reading_order(content))

    group = next((c for c in remaining if c.region.kind == "group"), None)
    if group is not None:
        assigned["statBadges"] = group
        remaining.remove(group)

    open_slots = [s for s in CONTENT_SLOTS if s not in assigned]
    for slot, item in zip(open_slots, remaining):
        assigned[slot] = item
    return assigned


def _build_element(
    template: dict[str, Any], claim: RegionText | None
) -> dict[str, Any]:
    """One IR element entry: the template, overwritten by what was actually seen.

    The template supplies `tag`, `order`, `classes` and `contentType`, which are
    presentation decisions no wireframe carries. The detection supplies `bbox`,
    `confidence` and -- only where OCR actually read something -- `default`.

    THE TEXT IS ONLY OVERWRITTEN WHEN THERE IS TEXT. A claimed region with no reading
    keeps the template's copy and still reports `sourceOf: "wireframe"`, because the
    geometry genuinely came from the image even though the words did not. That is the
    honest description of a degraded stage 3b, which section 12 makes a supported
    state rather than a failure.
    """
    element = dict(template)
    if claim is None:
        return element  # sourceOf stays "default", confidence stays None

    element["bbox"] = list(claim.region.bbox)
    element["confidence"] = claim.effective_confidence
    element["sourceOf"] = "wireframe"
    if claim.text:
        element["default"] = claim.text
    return element


def _build_cards(
    template: dict[str, Any], claim: RegionText | None
) -> dict[str, Any]:
    """The `cards` sub-object, section 6, sized from the detected series.

    `count` follows the group's member count when a group claimed the slot. Section 4
    rule 4 is explicit that the card count is not fixed at 3 -- it is whatever the IR
    says -- so a wireframe showing four badges must produce four, and the template's
    three are a default rather than a constant.

    `items` carry CONTENT ONLY. Section 6: no field IDs appear in the IR at all,
    because the API attaches them after the IR is final.
    """
    cards = {k: (list(v) if isinstance(v, list) else v) for k, v in template.items()}
    if claim is None or claim.region.kind != "group":
        return cards

    count = max(1, claim.region.members)
    cards["count"] = count
    cards["gridColumns"] = count

    items = [dict(i) for i in cards.get("items", [])]
    if len(items) < count:
        # Grow with blank slots rather than repeating the template's copy. A
        # duplicated "1000+" reads as real extracted content and would be wrong;
        # an empty field reads as "nothing was found here", which is true.
        blank = {k: "" for k in (items[0] if items else {"field1": "", "field2": ""})}
        items.extend(dict(blank) for _ in range(count - len(items)))
    cards["items"] = items[:count]
    return cards


def fuse(
    extraction: Extraction,
    *,
    width: int,
    height: int,
    layout: dict[str, Any],
    theme: dict[str, Any],
    cards: dict[str, Any],
    elements: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    """Stage 4. Detections in, section 12's named sub-objects out.

    The four template arguments are the deterministic split-hero shape from
    `perception/app.py`. They are passed IN rather than imported so this module
    stays a pure function of its inputs and so app.py keeps ownership of the
    reference shape -- one definition, not two that drift.

    Never raises. A degraded or empty extraction produces the full template, which
    is exactly the deterministic path AGENTS.md rule 5 requires to keep working.
    """
    by_name = {e["elementName"]: e for e in elements}
    regions = list(extraction.regions)
    warnings = list(extraction.warnings)

    # --- who is the media panel, and which side is it on ---
    media = _pick_media(regions, width, height)
    content_pool = [c for c in regions if c is not media]

    if media is not None:
        media_side = _side_of(media.region.bbox, width)
        # Only regions on the OTHER side are content. A region sharing the media
        # half is something drawn on top of the image -- a caption, a logo -- and
        # assigning it a content slot would push the real content down one.
        content = [c for c in content_pool if _side_of(c.region.bbox, width) != media_side]
    else:
        media_side = "left"
        content = content_pool
        if regions:
            warnings.append(
                "No region was large enough to be the hero image; heroImage kept its "
                "default and every region was treated as content."
            )

    assigned = _slot_assignments(content)
    if media is not None:
        assigned[MEDIA_SLOT] = media

    # --- elements: the reference set, always, in template order ---
    out_elements = [
        _build_element(template, assigned.get(template["elementName"]))
        for template in elements
    ]

    # --- layout: the template, with the media side corrected to what was seen ---
    out_layout = {
        **layout,
        "regions": [
            {
                **region,
                "side": media_side if region.get("role") == "media"
                else ("right" if media_side == "left" else "left"),
            }
            for region in layout.get("regions", [])
        ],
    }

    # --- theme is NOT inferred, and that is a decision, not an omission ---
    # Reading an accent colour off a pencil wireframe means reading it off graphite.
    # T-056's detector runs on an ink mask precisely because a wireframe carries no
    # colour information worth having. Returning the template theme and marking
    # nothing as wireframe-sourced is the truthful answer; a sampled colour would be
    # a fabricated one, and section 6's sourceOf audit would carry a lie.
    out_theme = dict(theme)

    out_cards = _build_cards(cards, assigned.get("statBadges"))

    # --- confidence and questions, section 10 ---
    scored = [e["confidence"] for e in out_elements if e["confidence"] is not None]
    overall = float(sum(scored) / len(scored)) if scored else None

    questions = [
        {
            "elementName": e["elementName"],
            "question": f"Is {e['elementName']} correct? It was detected with low confidence.",
            "confidence": e["confidence"],
            "bbox": e["bbox"],
        }
        for e in out_elements
        if e["confidence"] is not None and e["confidence"] < ESCALATE_BELOW
    ]
    for e in out_elements:
        c = e["confidence"]
        if c is not None and ESCALATE_BELOW <= c < VERIFY_BELOW:
            warnings.append(f"{e['elementName']} was detected with medium confidence ({c:.2f}).")

    unclaimed = [e["elementName"] for e in out_elements if e["sourceOf"] == "default"]
    if unclaimed and regions:
        warnings.append(
            f"{len(unclaimed)} element(s) kept their default because no region claimed "
            f"them: {', '.join(unclaimed)}."
        )

    return {
        "layout": out_layout,
        "theme": out_theme,
        "cards": out_cards,
        "elements": out_elements,
        "confidence": overall,
        "questions": questions,
        "warnings": warnings,
    }
