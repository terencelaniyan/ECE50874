"""Unit tests for slot_assignment (K-Means + silhouette-based slot mapping)."""
import pytest

from app.slot_assignment import (
    assign_slots,
    SLOT_DEFINITIONS,
    _kmeans,
    _silhouette_score,
    _normalize_features,
)
import numpy as np


def _ball(ball_id: str, rg: float, diff: float):
    return {"ball_id": ball_id, "rg": rg, "diff": diff}


# ── Basic assignment tests ───────────────────────────────────────────────

def test_empty_arsenal_returns_empty_assignments():
    result = assign_slots([])
    assert result["assignments"] == []
    assert result["best_k"] == 0
    assert result["silhouette_score"] == 0.0
    assert len(result["slot_coverage"]) == 6
    assert all(not s["covered"] for s in result["slot_coverage"])


def test_single_ball_gets_assigned():
    balls = [_ball("B1", 2.48, 0.055)]  # Strong Asymmetric range
    result = assign_slots(balls)
    assert len(result["assignments"]) == 1
    assert result["assignments"][0]["ball_id"] == "B1"
    assert result["assignments"][0]["slot"] in range(1, 7)
    # A ball with low RG + high diff should map to slot 1 (Strong Asymmetric)
    assert result["assignments"][0]["slot"] == 1


def test_two_balls_different_slots():
    balls = [
        _ball("B1", 2.48, 0.055),  # Strong Asymmetric (slot 1)
        _ball("B2", 2.58, 0.015),  # Spare (slot 5)
    ]
    result = assign_slots(balls)
    assert len(result["assignments"]) == 2
    slots = {a["ball_id"]: a["slot"] for a in result["assignments"]}
    # These two balls are very different, should get different slots
    assert slots["B1"] != slots["B2"]


def test_full_6_ball_arsenal():
    """A well-spread 6-ball arsenal should cover multiple slots."""
    balls = [
        _ball("B1", 2.48, 0.055),  # Slot 1: Strong Asymmetric
        _ball("B2", 2.49, 0.045),  # Slot 2: Strong Symmetric
        _ball("B3", 2.52, 0.040),  # Slot 3: Benchmark
        _ball("B4", 2.55, 0.030),  # Slot 4: Light
        _ball("B5", 2.58, 0.015),  # Slot 5: Spare
        _ball("B6", 2.50, 0.050),  # Slot 6: Specialty
    ]
    result = assign_slots(balls)
    assert len(result["assignments"]) == 6
    assert result["best_k"] >= 2
    assert result["silhouette_score"] > -1.0
    # Should cover at least 2 different slots (k-means may merge nearby clusters)
    unique_slots = {a["slot"] for a in result["assignments"]}
    assert len(unique_slots) >= 2


def test_slot_coverage_tracks_filled_vs_empty():
    balls = [
        _ball("B1", 2.48, 0.055),
        _ball("B2", 2.58, 0.015),
    ]
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
    assert "slot" in a
    assert "slot_name" in a
    assert "slot_description" in a
    assert "rg" in a
    assert "diff" in a
    assert isinstance(a["slot_name"], str)
    assert isinstance(a["slot_description"], str)


# ── K-Means tests ────────────────────────────────────────────────────────

def test_kmeans_single_cluster():
    points = np.array([[1.0, 1.0], [1.1, 1.1], [0.9, 0.9]])
    labels, centroids = _kmeans(points, k=1)
    assert len(np.unique(labels)) == 1
    assert centroids.shape == (1, 2)


def test_kmeans_two_clusters():
    points = np.array([
        [0.0, 0.0], [0.1, 0.1], [0.05, 0.05],  # Cluster A
        [5.0, 5.0], [5.1, 5.1], [4.95, 4.95],   # Cluster B
    ])
    labels, centroids = _kmeans(points, k=2)
    assert len(np.unique(labels)) == 2
    # Points 0-2 should be in same cluster, points 3-5 in another
    assert labels[0] == labels[1] == labels[2]
    assert labels[3] == labels[4] == labels[5]
    assert labels[0] != labels[3]


def test_kmeans_fewer_points_than_k():
    points = np.array([[1.0, 2.0], [3.0, 4.0]])
    labels, centroids = _kmeans(points, k=5)
    assert len(labels) == 2


# ── Silhouette score tests ──────────────────────────────────────────────

def test_silhouette_single_point():
    points = np.array([[1.0, 1.0]])
    labels = np.array([0])
    assert _silhouette_score(points, labels) == 0.0


def test_silhouette_single_cluster():
    points = np.array([[1.0, 1.0], [1.1, 1.1]])
    labels = np.array([0, 0])
    assert _silhouette_score(points, labels) == 0.0


def test_silhouette_well_separated_clusters():
    points = np.array([
        [0.0, 0.0], [0.1, 0.0],   # Cluster 0
        [10.0, 10.0], [10.1, 10.0],  # Cluster 1
    ])
    labels = np.array([0, 0, 1, 1])
    score = _silhouette_score(points, labels)
    assert score > 0.8  # Well-separated clusters should have high silhouette


# ── Normalization tests ──────────────────────────────────────────────────

def test_normalize_features():
    points = np.array([[2.0, 0.01], [3.0, 0.05], [2.5, 0.03]])
    normalized, mins, ranges = _normalize_features(points)
    assert normalized.min() == pytest.approx(0.0)
    assert normalized.max() == pytest.approx(1.0)
    assert mins[0] == pytest.approx(2.0)
    assert ranges[0] == pytest.approx(1.0)
