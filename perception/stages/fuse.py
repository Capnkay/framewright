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

# --- what the wireframe SAYS, not merely where it sits (T-100) --------------
#
# WHY THIS TABLE EXISTS. Measured on gpu-test/wireframe.png with stage 3b working:
# PaddleOCR read HEADLINE at 0.99, LABEL at 0.97, SUBMIT at 0.92 and Image at 0.86,
# and the purely positional rule below placed 0 of 7 of them in the right slot --
# headlineSub took "Image", heroImage took a bleed-through string, and ctaButton kept
# its template default while still reporting sourceOf "wireframe". Every one of those
# is answered by the string the OCR had already returned.
#
# The previous docstring's defence was that the alternative "needs a model this stage
# deliberately does not have". That was true of the alternative it had in mind, which
# was inferring semantics from font size. It is not true of this one: the words are
# already in hand, free, and they were being thrown away.
#
# ORDER IS LOAD-BEARING. "SUB HEADLINE" contains "HEADLINE", so the more specific
# phrase is tested first and the first slot to match claims the region. Reordering
# these tuples silently changes which slot wins.
SLOT_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("headlineSub", ("SUB HEADLINE", "SUBHEADLINE", "SUB HEAD", "SUBTITLE", "TAGLINE")),
    ("headlineMain", ("HEADLINE", "HEADING", "TITLE")),
    ("ctaButton", ("SUBMIT", "SIGN UP", "GET STARTED", "BUY NOW", "CTA", "BUTTON")),
    ("brandBadge", ("LABEL", "BADGE", "BRAND", "LOGO")),
    ("description", ("DESCRIPTION", "PARAGRAPH", "BODY COPY", "LOREM")),
)

# The media panel is named the same way, but it does NOT work the same way, and the
# difference is the whole reason it is a separate constant. "Image" is written INSIDE
# the hero panel as a label for it; the region carrying that word is a small
# handwriting cluster, not the panel. Letting it claim heroImage directly would set
# the hero's bbox to the size of the word. So it is used as a POINTER -- the media
# panel is the box that contains it -- and the word itself claims nothing.
MEDIA_KEYWORDS = ("IMAGE", "IMG", "PHOTO", "PICTURE", "HERO")

# A reading this weak does not get to claim a slot unasked. This is section 10's own
# escalate boundary rather than a number fitted here: text the contract would stop and
# ask a human about is not text confident enough to silently override position.
#
# On the reference wireframe the two junk readings -- bleed-through from the reverse of
# the sheet, at 0.67 and 0.57 -- were in fact excluded by matching no keyword at all
# rather than by this floor. The floor is here for the case where they DO match one,
# which is a coincidence away.
KEYWORD_FLOOR = ESCALATE_BELOW


def _centre(bbox: tuple[int, int, int, int]) -> tuple[float, float]:
    x, y, w, h = bbox
    return (x + w / 2.0, y + h / 2.0)


def _area(bbox: tuple[int, int, int, int]) -> int:
    return bbox[2] * bbox[3]


def _normalised_text(text: str | None) -> str:
    """Upper-cased, with every run of non-alphanumerics collapsed to one space.

    So `"SUBMIT."`, `"Sub-Headline"` and `"SUB  HEADLINE"` all reduce to something a
    plain substring test can match. Matching the raw string instead means the table
    has to enumerate punctuation, which is a table that is always one wireframe out
    of date.
    """
    if not text:
        return ""
    out = []
    for ch in text.upper():
        out.append(ch if ch.isalnum() else " ")
    return " ".join("".join(out).split())


def _contains(outer: tuple[int, int, int, int], inner: tuple[int, int, int, int]) -> bool:
    ox, oy, ow, oh = outer
    ix, iy, iw, ih = inner
    return ox <= ix and oy <= iy and ox + ow >= ix + iw and oy + oh >= iy + ih


def _readable(candidate: RegionText) -> bool:
    """Did this region produce a reading strong enough to act on? See KEYWORD_FLOOR.

    `effective_confidence`, NOT `confidence`, AND T-132 IS WHY. This read
    `(candidate.confidence or 0.0)`, which turns an UNSCORED reading into a
    reading SCORED ZERO — and those are different facts, the same distinction
    §10 makes about confidence generally and `ocr_available` makes about OCR.

    It cost the whole keyword path. T-122's hosted reader returns a
    transcription and no score, and sets `confidence=None` on purpose, because
    §10 makes null the honest value where nothing was measured and a fabricated
    1.0 would sit on the Glass Box beside real numbers. Every one of its readings
    then evaluated to 0.0, fell below the floor, and was never readable — so
    `_keyword_assignments` matched nothing at all and every slot fell through to
    position. Measured end to end: the run read HEADLINE, SUB HEADLINE, LABEL and
    SUBMIT correctly off the page, and `headlineMain` still came back "TV",
    `description` "ago", and `brandBadge` and `ctaButton` from the reference
    template. Overall confidence 0.68, against 0.85 for the path it was meant to
    improve.

    `effective_confidence` already existed and already had the rule: the OCR
    score where there is text, the geometric score where there is not, both real
    measurements and neither a constant. The floor now applies to that, so a
    reading with no score of its own is judged on the confidence of the region it
    came from rather than being discarded for a number it never claimed to have.
    """
    return candidate.text is not None and candidate.effective_confidence >= KEYWORD_FLOOR


def _matches(candidate: RegionText, keywords: Sequence[str]) -> bool:
    normalised = _normalised_text(candidate.text)
    return any(keyword in normalised for keyword in keywords)


def _strongest(candidates: Sequence[RegionText]) -> RegionText:
    """Best-read first; ties fall through to position so the choice is total.

    Two regions can both say HEADLINE -- one of them is the heading and the other is
    a stray reading of the same ink through a larger box. The better-read one is the
    better claim, and a tie must not depend on list order.
    """
    return max(
        candidates,
        key=lambda c: (c.confidence or 0.0, -c.region.bbox[1], -c.region.bbox[0]),
    )


def _media_hint(candidates: Sequence[RegionText]) -> RegionText | None:
    """The region whose text NAMES the media panel, e.g. the word "Image" inside it."""
    named = [c for c in candidates if _readable(c) and _matches(c, MEDIA_KEYWORDS)]
    return _strongest(named) if named else None


def _keyword_assignments(
    candidates: Sequence[RegionText],
) -> dict[str, RegionText]:
    """Slots claimed by what the wireframe says, before anything is claimed by where
    it sits.

    One region claims at most one slot, and one slot is claimed by at most one region.
    Slots are resolved in SLOT_KEYWORDS order, which is what makes "SUB HEADLINE" beat
    "HEADLINE" on the same string.
    """
    assigned: dict[str, RegionText] = {}
    available = list(enumerate(candidates))

    for slot, keywords in SLOT_KEYWORDS:
        matching = [
            (i, c) for i, c in available if _readable(c) and _matches(c, keywords)
        ]
        if not matching:
            continue
        winner_index, winner = max(
            matching,
            key=lambda pair: (
                pair[1].confidence or 0.0,
                -pair[1].region.bbox[1],
                -pair[1].region.bbox[0],
            ),
        )
        assigned[slot] = winner
        available = [(i, c) for i, c in available if i != winner_index]

    return assigned


def _pick_media(
    candidates: Sequence[RegionText],
    width: int,
    height: int,
    *,
    hint: RegionText | None = None,
) -> RegionText | None:
    """The hero image: the region big enough to be a media panel, and named as one
    where the wireframe says so.

    Deliberately NOT "the largest region". On a wireframe whose outer frame was
    detected, the largest region is the frame, and calling the frame the hero image
    puts every other element inside the media half. The area ceiling that would
    exclude a frame lives in T-056 (`MAX_AREA_FRACTION`), so anything reaching here
    is already frame-free; the floor below is the remaining half of the judgement.

    THAT WAS NOT ENOUGH, MEASURED. On gpu-test/wireframe.png the frame survives
    T-056's ceiling at 58% of the canvas, so "largest viable" chose it. Its centre
    then sits dead in the middle of the page, `_side_of` called it "right", and every
    genuine element on the left -- including the hero panel's own "Image" label --
    was classified as content on the opposite side. That is the chain that ended with
    headlineSub containing the word "Image".

    So where a region is LABELLED as the media panel, the panel is the SMALLEST viable
    box containing that label. Smallest, not largest, for exactly the frame's sake: the
    frame contains the label too, and it contains everything else as well.
    """
    canvas = float(width * height) or 1.0
    viable = [c for c in candidates if _area(c.region.bbox) / canvas >= MEDIA_MIN_AREA]
    if not viable:
        return None

    if hint is not None:
        holding = [
            c
            for c in viable
            if c is not hint and _contains(c.region.bbox, hint.region.bbox)
        ]
        if holding:
            return min(
                holding,
                key=lambda c: (_area(c.region.bbox), c.region.bbox[1], c.region.bbox[0]),
            )

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
    """Map content-column regions onto the named slots. Three rules, in order.

    ONE: WHAT THE REGION SAYS. A region whose text matches a slot's keywords claims
    that slot outright (T-100). This runs first because it is the only rule of the
    three that reads evidence specific to the element rather than to its neighbours:
    "SUBMIT" is a claim about that box, while "third from the top" is a claim about
    the six boxes around it, and the second is wrong the moment one of them is missed.

    TWO: A GROUP REGION ALWAYS TAKES statBadges, wherever it appears in the stack.
    T-056 emits `kind == "group"` only for an aligned, evenly-spaced series of similar
    siblings, which is precisely what a row of stat badges is and is not what a
    headline is. Letting the row of badges fall into whatever ordinal slot it happened
    to occupy would put three cards in `headlineSub` and leave `statBadges` empty --
    and `statBadges` is the element the section-9 store-liveness assertion patches at
    step 5, so getting it wrong breaks the one check that catches a dead store.

    THREE: POSITION, for whatever is left. The remaining slots, in order, take the
    remaining regions in reading order. It is the same rule this function used to
    apply to everything, demoted to the fallback it should always have been: it is the
    right answer for a wireframe that labels nothing, and it was measurably the wrong
    one for a wireframe that labels most things.

    On the reference wireframe rule one resolves four slots, rule two resolves
    statBadges, and `description` -- four ruled lines with no text in them by design --
    falls out as the only thing left for rule three to place.
    """
    assigned: dict[str, RegionText] = dict(_keyword_assignments(content))
    claimed = {id(c) for c in assigned.values()}
    remaining = [c for c in _reading_order(content) if id(c) not in claimed]

    for slot, group in _group_assignments(remaining).items():
        if slot in assigned:
            continue
        assigned[slot] = group
        remaining.remove(group)

    open_slots = [s for s in CONTENT_SLOTS if s not in assigned]
    for slot, item in zip(open_slots, remaining):
        assigned[slot] = item
    return assigned


def _group_assignments(candidates: Sequence[RegionText]) -> dict[str, RegionText]:
    """Which slot each detected series belongs to, decided by which way it runs.

    A row of stat badges runs ACROSS. A paragraph's ruled lines stack DOWN. T-056
    already measures that and records it as `evidence["axis"]` (1.0 vertical, 0.0
    horizontal), so the distinction costs a lookup rather than a heuristic.

    THIS MATTERS BECAUSE THE REFERENCE WIREFRAME HAS BOTH, measured: a 4-member
    vertical series at [733, 368, 172, 87] and a 3-member horizontal one at
    [687, 460, 233, 52]. The previous rule took the first group in reading order and
    gave it to statBadges unconditionally, which handed statBadges the description's
    four ruled lines and left the actual badge row to be placed by position.

    A series whose axis was not recorded still goes to statBadges. That is the
    conservative direction: statBadges is the element the section-9 store-liveness
    assertion patches, so where the geometry is silent the slot that must not be
    empty is the one that gets filled.
    """
    groups = [c for c in candidates if c.region.kind == "group"]
    assigned: dict[str, RegionText] = {}

    for slot, wanted in (("description", 1.0), ("statBadges", 0.0)):
        matching = [g for g in groups if g.region.evidence.get("axis") == wanted]
        if not matching:
            continue
        # Most members first -- a longer series is the more convincing one -- then
        # position, so the choice is total.
        winner = max(
            matching,
            key=lambda g: (g.region.members, -g.region.bbox[1], -g.region.bbox[0]),
        )
        assigned[slot] = winner
        groups.remove(winner)

    if "statBadges" not in assigned and groups:
        assigned["statBadges"] = groups[0]

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
    # The label that NAMES the panel is found first, because it decides which box the
    # panel is. It then claims nothing itself: it is the panel's caption, not content,
    # and leaving it in the pool is how it ended up as headlineSub's text.
    hint = _media_hint(regions)
    media = _pick_media(regions, width, height, hint=hint)
    content_pool = [c for c in regions if c is not media and c is not hint]

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
