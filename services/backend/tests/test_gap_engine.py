"""Unit tests for gap_engine.compute_gaps (no database)."""
import pytest

from app.gap_engine import compute_gaps


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
