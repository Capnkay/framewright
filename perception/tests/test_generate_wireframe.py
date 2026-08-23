"""T-150's verification. CONTRACT.md sections 10 and 12.

No `verify` command is set on T-150 -- "it's open-ended, decided by the
measurement itself" -- but the generator this task actually produces has a
concrete, checkable contract of its own, independent of whatever the GPU
teammate later measures about a trained detector:

    DETERMINISM (task spec)        Same seed -> byte-identical image, identical
                                    ground truth, every time.
    WELL-FORMED GROUND TRUTH       Positive width and height, inside the
                                    canvas, no degenerate (0,0,0,0) duplicate.
    REAL INK                       detect_regions.ink_mask() -- the same
                                    function stage 3a runs on a real upload --
                                    finds non-trivial ink on a generated image,
                                    and detect_regions() itself returns a
                                    non-trivial number of regions.
    SHAPE COMPATIBILITY (§10)      Every ground-truth record carries
                                    Region.to_dict()'s exact keys, so the
                                    existing benchmark harnesses can score
                                    against this dataset unmodified.
"""

from __future__ import annotations

import numpy as np
import pytest

from perception.stages.detect_regions import detect_regions, ink_mask
from perception.synthetic.generate_wireframe import (
    CANVAS_SIZE,
    generate,
    ground_truth,
    sample_layout,
)

SEEDS = [0, 1, 7, 42, 12345]


# --- determinism -------------------------------------------------------------


@pytest.mark.parametrize("seed", SEEDS)
def test_same_seed_produces_byte_identical_image(seed: int) -> None:
    first = generate(seed)
    second = generate(seed)
    assert np.array_equal(first.image, second.image), f"seed {seed} produced different pixels on two runs"


@pytest.mark.parametrize("seed", SEEDS)
def test_same_seed_produces_identical_ground_truth(seed: int) -> None:
    first = generate(seed)
    second = generate(seed)
    assert first.regions == second.regions, f"seed {seed} produced different ground truth on two runs"


def test_different_seeds_produce_different_images() -> None:
    a = generate(1)
    b = generate(2)
    assert not np.array_equal(a.image, b.image)


def test_different_seeds_vary_layout_composition() -> None:
    """Not 1000 copies of one layout: body line count and stat count vary
    across seeds, and hero side takes both values somewhere in a modest
    sample."""
    sides = set()
    line_counts = set()
    stat_counts = set()
    for seed in range(20):
        rng = np.random.RandomState(seed)
        layout = sample_layout(rng)
        sides.add(layout.hero_side)
        line_counts.add(len(layout.body_line_bboxes))
        stat_counts.add(len(layout.stat_bboxes))

    assert sides == {"left", "right"}, f"hero side did not vary: {sides}"
    assert len(line_counts) > 1, f"body line count never varied: {line_counts}"
    assert len(stat_counts) > 1, f"stat badge count never varied: {stat_counts}"


def test_no_time_or_global_random_state_leakage() -> None:
    """A pure function of its seed must not drift if something else has
    already spun the global RNG or the clock has moved on between calls."""
    np.random.seed(999)  # pollute global numpy state
    np.random.rand(500)  # and consume some of it

    first = generate(3).regions
    np.random.rand(500)  # consume more, between calls
    second = generate(3).regions

    assert first == second


# --- well-formed ground truth -------------------------------------------------


@pytest.mark.parametrize("seed", SEEDS)
def test_ground_truth_boxes_are_well_formed(seed: int) -> None:
    sample = generate(seed)
    assert len(sample.regions) == 7, f"expected the 7 reference elements, got {len(sample.regions)}"

    for region in sample.regions:
        x, y, w, h = region["bbox"]
        assert w > 0, f"{region['elementName']} has non-positive width {w}"
        assert h > 0, f"{region['elementName']} has non-positive height {h}"
        assert x >= 0 and y >= 0, f"{region['elementName']} has a negative origin {(x, y)}"
        assert x + w <= CANVAS_SIZE, f"{region['elementName']} right edge {x + w} exceeds canvas"
        assert y + h <= CANVAS_SIZE, f"{region['elementName']} bottom edge {y + h} exceeds canvas"


@pytest.mark.parametrize("seed", SEEDS)
def test_no_two_elements_share_a_degenerate_box(seed: int) -> None:
    sample = generate(seed)
    boxes = [tuple(r["bbox"]) for r in sample.regions]
    assert (0, 0, 0, 0) not in boxes
    assert len(boxes) == len(set(boxes)), "two elements share the exact same bbox"


@pytest.mark.parametrize("seed", SEEDS)
def test_ground_truth_matches_region_to_dict_shape(seed: int) -> None:
    """Same keys detect_regions.Region.to_dict() produces, so the existing
    benchmark harnesses need no change to read this dataset."""
    for region in generate(seed).regions:
        assert set(region) >= {"bbox", "kind", "confidence", "evidence", "depth", "members"}
        assert isinstance(region["bbox"], list) and len(region["bbox"]) == 4
        assert region["kind"] in {"rect", "mark", "group"}
        assert region["confidence"] == 1.0
        assert isinstance(region["evidence"], dict)
        assert isinstance(region["depth"], int)
        assert isinstance(region["members"], int) and region["members"] >= 1


def test_kinds_cover_all_three_shapes() -> None:
    """Across the fixed vocabulary, all three of detect_regions's shapes
    should appear: rect (heroImage/ctaButton), mark (badge/headlines), group
    (description/statBadges)."""
    kinds = {r["kind"] for r in generate(0).regions}
    assert kinds == {"rect", "mark", "group"}


def test_group_members_match_declared_counts() -> None:
    sample = generate(5)
    by_name = {r["elementName"]: r for r in sample.regions}
    assert by_name["description"]["members"] >= 3
    assert by_name["statBadges"]["members"] >= 2


# --- real ink, real detections -------------------------------------------------


@pytest.mark.parametrize("seed", SEEDS)
def test_ink_mask_finds_ink_on_a_generated_image(seed: int) -> None:
    """The same ink_mask() stage 3a runs on a real photograph must find
    non-trivial ink here too, or nothing downstream has anything to detect."""
    sample = generate(seed)
    mask = ink_mask(sample.image)
    ink_fraction = float((mask > 0).mean())
    assert ink_fraction > 0.001, f"seed {seed}: only {ink_fraction:.4%} of the canvas is ink"
    assert ink_fraction < 0.5, f"seed {seed}: {ink_fraction:.4%} ink looks like a filled canvas, not a wireframe"


@pytest.mark.parametrize("seed", SEEDS)
def test_detect_regions_finds_a_non_trivial_number_of_regions(seed: int) -> None:
    """An integration sanity check, not a scoring benchmark: the real detector,
    run against a generated image with no modification, must find more than a
    couple of regions. B-003 found 35 regions on the real 7-target wireframe;
    this only asserts the generated image is not blank or degenerate."""
    sample = generate(seed)
    regions = detect_regions(sample.image)
    assert len(regions) >= 5, f"seed {seed}: detector found only {len(regions)} regions on a 7-element layout"

    kinds = {r.kind for r in regions}
    assert kinds, "detector returned regions with no kind at all"


def test_ground_truth_helper_is_pure_given_a_layout() -> None:
    """ground_truth() itself takes no randomness -- same layout in, same
    records out. Isolates the ground-truth step from the rendering step."""
    rng = np.random.RandomState(77)
    layout = sample_layout(rng)
    assert ground_truth(layout) == ground_truth(layout)
