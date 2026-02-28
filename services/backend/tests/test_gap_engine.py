"""Unit tests for gap_engine (compute_gaps, group_gaps_by_zone, label_zone, zone_description)."""
import pytest

from app.gap_engine import (
    compute_gaps,
    group_gaps_by_zone,
    label_zone,
    zone_description,
)


def _ball(ball_id: str, rg: float, diff: float):
    return {"ball_id": ball_id, "rg": rg, "diff": diff}


def test_empty_catalog_returns_empty():
    assert compute_gaps([], set(), k=5) == []


def test_all_balls_in_arsenal_returns_empty():
    catalog = [
        _ball("A", 2.50, 0.040),
        _ball("B", 2.52, 0.045),
    ]
    assert compute_gaps(catalog, {"A", "B"}, k=5) == []


def test_small_catalog_returns_non_arsenal_sorted_by_gap_score_desc():
    catalog = [
        _ball("A", 2.50, 0.040),
        _ball("B", 2.52, 0.045),
        _ball("C", 2.55, 0.050),
        _ball("D", 2.60, 0.055),
        _ball("E", 2.65, 0.060),
    ]
    result = compute_gaps(catalog, {"A", "B"}, k=2)
    assert len(result) == 2
    ball_ids = [r[0]["ball_id"] for r in result]
    assert set(ball_ids) <= {"C", "D", "E"}
    assert ball_ids[0] != ball_ids[1]
    scores = [r[1] for r in result]
    assert scores == sorted(scores, reverse=True)


def test_empty_arsenal_returns_sorted_by_distance_from_mean():
    catalog = [
        _ball("A", 2.50, 0.040),
        _ball("B", 2.52, 0.045),
        _ball("C", 2.55, 0.050),
        _ball("D", 2.60, 0.055),
    ]
    result = compute_gaps(catalog, set(), k=10)
    assert len(result) == 4
    scores = [r[1] for r in result]
    assert scores == sorted(scores, reverse=True)


def test_duplicate_rg_diff_deterministic():
    catalog = [
        _ball("A", 2.50, 0.040),
        _ball("B", 2.50, 0.040),
        _ball("C", 2.55, 0.050),
        _ball("D", 2.60, 0.055),
    ]
    r1 = compute_gaps(catalog, set(), k=3)
    r2 = compute_gaps(catalog, set(), k=3)
    assert len(r1) == 3 and len(r2) == 3
    for (b1, s1), (b2, s2) in zip(r1, r2):
        assert b1["ball_id"] == b2["ball_id"]
        assert s1 == s2


def test_k_respected():
    catalog = [_ball(f"B{i}", 2.50 + i * 0.02, 0.040 + i * 0.005) for i in range(6)]
    result = compute_gaps(catalog, {"B0"}, k=2)
    assert len(result) <= 2


def test_tie_break_by_ball_id_deterministic():
    """When two balls have the same gap score, order is by ball_id descending."""
    catalog = [
        _ball("A", 2.50, 0.040),
        _ball("B", 2.70, 0.040),
    ]
    result = compute_gaps(catalog, set(), k=2)
    assert len(result) == 2
    ids = [r[0]["ball_id"] for r in result]
    assert ids == ["B", "A"]


def test_fallback_and_main_path_same_ball_set():
    """With few points and no arsenal, both code paths return only non-arsenal balls."""
    catalog = [
        _ball("A", 2.50, 0.040),
        _ball("B", 2.52, 0.045),
        _ball("C", 2.55, 0.050),
    ]
    result = compute_gaps(catalog, set(), k=5)
    assert len(result) == 3
    for ball, _ in result:
        assert ball["ball_id"] in {"A", "B", "C"}


def test_arsenal_effective_rows_used_for_scoring():
    """When arsenal_effective_rows is passed, gap scores use those (rg, diff) positions."""
    catalog = [
        _ball("A", 2.50, 0.040),
        _ball("B", 2.52, 0.045),
        _ball("C", 2.55, 0.050),
        _ball("D", 2.60, 0.055),
    ]
    # Effective position for A (e.g. degraded) shifted from (2.50, 0.040)
    effective_a = _ball("A", 2.48, 0.038)
    result = compute_gaps(
        catalog,
        {"A"},
        k=3,
        arsenal_effective_rows=[effective_a],
    )
    assert len(result) == 3
    ids = [r[0]["ball_id"] for r in result]
    assert set(ids) == {"B", "C", "D"}
    scores = [r[1] for r in result]
    assert scores == sorted(scores, reverse=True)


# --- group_gaps_by_zone ---


def test_group_gaps_by_zone_empty_returns_empty():
    assert group_gaps_by_zone([]) == []
    assert group_gaps_by_zone([], threshold=0.05) == []


def test_group_gaps_by_zone_one_item_one_zone():
    gap_items = [(_ball("A", 2.51, 0.048), 0.09)]
    zones = group_gaps_by_zone(gap_items)
    assert len(zones) == 1
    assert zones[0]["center"] == [2.51, 0.048]
    assert len(zones[0]["balls"]) == 1
    assert zones[0]["balls"][0]["ball"]["ball_id"] == "A"
    assert zones[0]["balls"][0]["gap_score"] == 0.09


def test_group_gaps_by_zone_two_within_threshold_one_zone():
    gap_items = [
        (_ball("A", 2.51, 0.048), 0.09),
        (_ball("B", 2.52, 0.047), 0.07),
    ]
    zones = group_gaps_by_zone(gap_items, threshold=0.05)
    assert len(zones) == 1
    assert zones[0]["center"] == [2.51, 0.048]
    assert len(zones[0]["balls"]) == 2
    ids = [b["ball"]["ball_id"] for b in zones[0]["balls"]]
    assert set(ids) == {"A", "B"}


def test_group_gaps_by_zone_two_beyond_threshold_two_zones():
    gap_items = [
        (_ball("A", 2.51, 0.048), 0.09),
        (_ball("B", 2.60, 0.060), 0.07),
    ]
    zones = group_gaps_by_zone(gap_items, threshold=0.05)
    assert len(zones) == 2
    assert zones[0]["center"] == [2.51, 0.048]
    assert zones[1]["center"] == [2.60, 0.060]
    assert len(zones[0]["balls"]) == 1
    assert len(zones[1]["balls"]) == 1


def test_group_gaps_by_zone_threshold_boundary():
    gap_items = [
        (_ball("A", 2.50, 0.040), 0.09),
        (_ball("B", 2.50 + 0.03, 0.040 + 0.03), 0.07),
    ]
    zones_small = group_gaps_by_zone(gap_items, threshold=0.04)
    zones_large = group_gaps_by_zone(gap_items, threshold=0.05)
    assert len(zones_small) == 2
    assert len(zones_large) == 1


# --- label_zone ---


def test_label_zone_low_rg():
    assert "Low RG" in label_zone(2.49, 0.050)
    assert "Low RG" in label_zone(2.50 - 1e-6, 0.040)


def test_label_zone_mid_rg():
    assert "Mid RG" in label_zone(2.51, 0.050)
    assert "Mid RG" in label_zone(2.50, 0.040)
    assert "Mid RG" in label_zone(2.54 - 1e-6, 0.040)


def test_label_zone_high_rg():
    assert "High RG" in label_zone(2.54, 0.050)
    assert "High RG" in label_zone(2.56, 0.040)


def test_label_zone_low_mid_high_diff():
    assert "Low Differential" in label_zone(2.52, 0.039)
    assert "Mid Differential" in label_zone(2.52, 0.044)
    assert "High Differential" in label_zone(2.52, 0.051)


def test_label_zone_combos():
    assert label_zone(2.49, 0.055) == "Low RG / High Differential"
    assert label_zone(2.56, 0.038) == "High RG / Low Differential"
    assert label_zone(2.52, 0.045) == "Mid RG / Mid Differential"


# --- zone_description ---


def test_zone_description_non_empty_for_known_labels():
    combos = [
        (2.49, 0.055),
        (2.52, 0.045),
        (2.56, 0.038),
    ]
    for rg, diff in combos:
        desc = zone_description(rg, diff)
        assert isinstance(desc, str)
        assert len(desc) > 0


def test_zone_description_always_non_empty():
    desc = zone_description(2.50, 0.040)
    assert isinstance(desc, str) and len(desc) > 0
