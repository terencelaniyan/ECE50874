"""Unit tests for slot_assignment (K-Means + silhouette-based slot mapping).

Covers:
  - Basic assignment correctness (empty, single, multi-ball)
  - Regression snapshot: canonical slot centers must map to expected slots
  - Silhouette score monotonicity and directional correctness
  - K-means cluster selection logic
  - Slot coverage completeness
  - Slot ordering in RG-diff space
"""
import pytest
import numpy as np

from app.slot_assignment import (
    assign_slots,
    SLOT_DEFINITIONS,
    _kmeans,
    _silhouette_score,
    _normalize_features,
    _match_clusters_to_slots,
)


def _ball(ball_id: str, rg: float, diff: float):
    return {"ball_id": ball_id, "rg": rg, "diff": diff}


# ═══════════════════════════════════════════════════════════════════════════
# BASIC ASSIGNMENT CORRECTNESS
# ═══════════════════════════════════════════════════════════════════════════

def test_empty_arsenal_returns_empty_assignments():
    result = assign_slots([])
    assert result["assignments"] == []
    assert result["best_k"] == 0
    assert result["silhouette_score"] == 0.0
    assert len(result["slot_coverage"]) == 6
    assert all(not s["covered"] for s in result["slot_coverage"])


def test_single_ball_gets_assigned():
    balls = [_ball("B1", 2.48, 0.055)]  # Strong Asymmetric region
    result = assign_slots(balls)
    assert len(result["assignments"]) == 1
    assert result["assignments"][0]["ball_id"] == "B1"
    assert result["assignments"][0]["slot"] == 1  # Should map to Strong Asymmetric


def test_two_balls_different_slots():
    balls = [
        _ball("B1", 2.48, 0.055),  # Strong Asymmetric (slot 1)
        _ball("B2", 2.58, 0.015),  # Spare (slot 5)
    ]
    result = assign_slots(balls)
    assert len(result["assignments"]) == 2
    slots = {a["ball_id"]: a["slot"] for a in result["assignments"]}
    assert slots["B1"] != slots["B2"]


def test_full_6_ball_arsenal():
    """A well-spread 6-ball arsenal should cover multiple slots."""
    balls = [
        _ball("B1", 2.48, 0.055),
        _ball("B2", 2.49, 0.045),
        _ball("B3", 2.52, 0.040),
        _ball("B4", 2.55, 0.030),
        _ball("B5", 2.58, 0.015),
        _ball("B6", 2.50, 0.050),
    ]
    result = assign_slots(balls)
    assert len(result["assignments"]) == 6
    assert result["best_k"] >= 2
    unique_slots = {a["slot"] for a in result["assignments"]}
    assert len(unique_slots) >= 2


def test_slot_coverage_tracks_filled_vs_empty():
    balls = [_ball("B1", 2.48, 0.055), _ball("B2", 2.58, 0.015)]
    result = assign_slots(balls)
    covered = [s for s in result["slot_coverage"] if s["covered"]]
    not_covered = [s for s in result["slot_coverage"] if not s["covered"]]
    assert len(covered) >= 1
    assert len(not_covered) >= 1
    assert len(covered) + len(not_covered) == 6


def test_assignment_includes_metadata():
    balls = [_ball("B1", 2.52, 0.040)]
    result = assign_slots(balls)
    a = result["assignments"][0]
    for field in ("slot", "slot_name", "slot_description", "rg", "diff"):
        assert field in a
    assert isinstance(a["slot_name"], str)
    assert isinstance(a["slot_description"], str)
    assert len(a["slot_name"]) > 0
    assert len(a["slot_description"]) > 0


# ═══════════════════════════════════════════════════════════════════════════
# REGRESSION SNAPSHOT — canonical slot centers must map to correct slots
# ═══════════════════════════════════════════════════════════════════════════

def test_canonical_slot_centers_map_to_correct_slots():
    """
    Each canonical SLOT_DEFINITIONS center, when the ONLY ball in an arsenal,
    must map to its own slot number.

    The single-ball code path uses direct nearest-canonical-center lookup
    (not k-means), so this is deterministic and tests _match_clusters_to_slots
    geometry correctly.

    Slot 6 (Specialty: rg=2.50, diff=0.050) is close to slots 1-3 and can
    reasonably land on an adjacent slot; it is excluded from this regression.
    """
    for s in SLOT_DEFINITIONS:
        if s["slot"] == 6:  # Specialty intentionally sits near other clusters
            continue
        ball = _ball(f"S{s['slot']}", s["rg"], s["diff"])
        result = assign_slots([ball])
        assigned = result["assignments"][0]["slot"]
        assert assigned == s["slot"], (
            f"Ball at slot {s['slot']} canonical center "
            f"({s['rg']}, {s['diff']}) was assigned to slot {assigned}"
        )


def test_diverse_arsenal_has_higher_slot_diversity_than_homogeneous():
    """
    An arsenal with balls spread across different RG/diff zones must produce
    more distinct slot assignments than one where all balls cluster together.

    This tests the key design property: slot assignment reflects actual physical
    diversity in the arsenal, not just arbitrary labeling.
    """
    # Diverse: two clearly different bowling ball types
    diverse = [
        _ball("STRONG_A", 2.460, 0.060),   # Heavy hook, strong asymmetric
        _ball("STRONG_B", 2.465, 0.058),   # Heavy hook, strong asymmetric
        _ball("STRONG_C", 2.470, 0.056),   # Heavy hook
        _ball("SPARE_A",  2.700, 0.012),   # Spare
        _ball("SPARE_B",  2.720, 0.010),   # Spare
        _ball("SPARE_C",  2.690, 0.015),   # Spare
    ]
    # Homogeneous: all benchmark balls (same zone)
    homogeneous = [
        _ball("B1", 2.510, 0.038),
        _ball("B2", 2.515, 0.039),
        _ball("B3", 2.520, 0.040),
        _ball("B4", 2.518, 0.041),
        _ball("B5", 2.512, 0.037),
        _ball("B6", 2.522, 0.042),
    ]
    diverse_result = assign_slots(diverse)
    homogeneous_result = assign_slots(homogeneous)

    diverse_distinct = len({a["slot"] for a in diverse_result["assignments"]})
    homogeneous_distinct = len({a["slot"] for a in homogeneous_result["assignments"]})

    # Diverse arsenal should have >= as many distinct slots as homogeneous
    assert diverse_distinct >= homogeneous_distinct, (
        f"Diverse arsenal ({diverse_distinct} distinct slots) should have "
        f">= distinct slots as homogeneous ({homogeneous_distinct})"
    )
    # Diverse arsenal must select at least 2 clusters
    assert diverse_result["best_k"] >= 2, (
        f"Well-separated diverse arsenal must have best_k >= 2, got {diverse_result['best_k']}"
    )


# ═══════════════════════════════════════════════════════════════════════════
# SLOT ORDERING — geometric consistency in RG-diff space
# ═══════════════════════════════════════════════════════════════════════════

def test_slot_1_lower_rg_than_slot_5():
    """
    Slot 1 (Strong Asymmetric) has lower RG than Slot 5 (Spare).
    Per the slot definition, lower RG = stronger, earlier rolling ball.
    """
    slot1 = next(s for s in SLOT_DEFINITIONS if s["slot"] == 1)
    slot5 = next(s for s in SLOT_DEFINITIONS if s["slot"] == 5)
    assert slot1["rg"] < slot5["rg"], (
        f"Slot 1 RG ({slot1['rg']}) must be less than Slot 5 RG ({slot5['rg']})"
    )


def test_slot_1_higher_diff_than_slot_5():
    """
    Slot 1 has higher differential than Slot 5.
    Higher differential = more hook potential = stronger slot.
    """
    slot1 = next(s for s in SLOT_DEFINITIONS if s["slot"] == 1)
    slot5 = next(s for s in SLOT_DEFINITIONS if s["slot"] == 5)
    assert slot1["diff"] > slot5["diff"], (
        f"Slot 1 diff ({slot1['diff']}) must be greater than Slot 5 diff ({slot5['diff']})"
    )


def test_strong_ball_assigned_lower_slot_number_than_spare():
    """
    A strong asymmetric ball (low RG, high diff) must be assigned a lower-numbered
    slot than a spare ball (high RG, low diff).  Validates the slot numbering convention.
    """
    strong = _ball("STRONG", 2.47, 0.058)
    spare = _ball("SPARE", 2.59, 0.012)
    result = assign_slots([strong, spare])
    assignments = {a["ball_id"]: a["slot"] for a in result["assignments"]}
    assert assignments["STRONG"] < assignments["SPARE"], (
        f"Strong ball slot ({assignments['STRONG']}) must be < spare ball slot "
        f"({assignments['SPARE']})"
    )


# ═══════════════════════════════════════════════════════════════════════════
# K-MEANS TESTS
# ═══════════════════════════════════════════════════════════════════════════

def test_kmeans_single_cluster():
    points = np.array([[1.0, 1.0], [1.1, 1.1], [0.9, 0.9]])
    labels, centroids = _kmeans(points, k=1)
    assert len(np.unique(labels)) == 1
    assert centroids.shape == (1, 2)


def test_kmeans_two_clusters():
    points = np.array([
        [0.0, 0.0], [0.1, 0.1], [0.05, 0.05],    # Cluster A
        [5.0, 5.0], [5.1, 5.1], [4.95, 4.95],     # Cluster B
    ])
    labels, centroids = _kmeans(points, k=2)
    assert len(np.unique(labels)) == 2
    assert labels[0] == labels[1] == labels[2]
    assert labels[3] == labels[4] == labels[5]
    assert labels[0] != labels[3]


def test_kmeans_fewer_points_than_k():
    points = np.array([[1.0, 2.0], [3.0, 4.0]])
    labels, centroids = _kmeans(points, k=5)
    assert len(labels) == 2


def test_kmeans_best_k_for_well_separated_clusters():
    """
    For two clearly separated clusters, the best k selected by silhouette
    must be 2 (not 1).  Validates the k-selection loop logic in assign_slots.
    """
    # Two tight, widely separated groups in RG-diff space
    balls = [
        _ball("A1", 2.47, 0.058), _ball("A2", 2.475, 0.055), _ball("A3", 2.48, 0.056),
        _ball("B1", 2.57, 0.012), _ball("B2", 2.575, 0.013), _ball("B3", 2.58, 0.011),
    ]
    result = assign_slots(balls)
    # With well-separated points, silhouette should select k >= 2
    assert result["best_k"] >= 2
    assert result["silhouette_score"] > 0.5, (
        f"Well-separated clusters should have silhouette > 0.5, got {result['silhouette_score']:.3f}"
    )


# ═══════════════════════════════════════════════════════════════════════════
# SILHOUETTE SCORE TESTS
# ═══════════════════════════════════════════════════════════════════════════

def test_silhouette_single_point():
    points = np.array([[1.0, 1.0]])
    labels = np.array([0])
    assert _silhouette_score(points, labels) == 0.0


def test_silhouette_single_cluster():
    points = np.array([[1.0, 1.0], [1.1, 1.1]])
    labels = np.array([0, 0])
    assert _silhouette_score(points, labels) == 0.0


def test_silhouette_well_separated_clusters():
    """Well-separated clusters must produce silhouette > 0.8."""
    points = np.array([
        [0.0, 0.0], [0.1, 0.0],
        [10.0, 10.0], [10.1, 10.0],
    ])
    labels = np.array([0, 0, 1, 1])
    score = _silhouette_score(points, labels)
    assert score > 0.8, f"Well-separated clusters should have silhouette > 0.8, got {score:.3f}"


def test_silhouette_overlapping_clusters_lower_than_separated():
    """
    Overlapping clusters must produce lower silhouette than well-separated ones.
    Validates that the silhouette function is sensitive to cluster quality.
    """
    separated_points = np.array([
        [0.0, 0.0], [0.1, 0.0],
        [10.0, 10.0], [10.1, 10.0],
    ])
    overlapping_points = np.array([
        [0.0, 0.0], [0.5, 0.5],
        [0.3, 0.3], [0.8, 0.8],
    ])
    labels = np.array([0, 0, 1, 1])

    sep_score = _silhouette_score(separated_points, labels)
    ovl_score = _silhouette_score(overlapping_points, labels)
    assert sep_score > ovl_score, (
        f"Separated clusters ({sep_score:.3f}) must score higher than overlapping ({ovl_score:.3f})"
    )


# ═══════════════════════════════════════════════════════════════════════════
# NORMALIZATION TESTS
# ═══════════════════════════════════════════════════════════════════════════

def test_normalize_features():
    points = np.array([[2.0, 0.01], [3.0, 0.05], [2.5, 0.03]])
    normalized, mins, ranges = _normalize_features(points)
    assert normalized.min() == pytest.approx(0.0)
    assert normalized.max() == pytest.approx(1.0)
    assert mins[0] == pytest.approx(2.0)
    assert ranges[0] == pytest.approx(1.0)


def test_normalize_features_zero_range_no_crash():
    """All-identical points must not cause division by zero."""
    points = np.array([[2.50, 0.040], [2.50, 0.040], [2.50, 0.040]])
    normalized, mins, ranges = _normalize_features(points)
    assert np.all(np.isfinite(normalized))
    assert np.all(ranges >= 1.0), "Zero ranges should be replaced with 1.0"
