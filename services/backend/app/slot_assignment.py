# ===========================================================================
# backend/app/slot_assignment.py
# ---------------------------------------------------------------------------
# Silhouette-based slot assignment using K-Means clustering.
#
# Maps an arsenal of bowling balls into the 6-ball slot system:
#   Slot 1 — Strong Asymmetric  (heavy oil, low RG, high diff)
#   Slot 2 — Strong Symmetric   (medium-heavy oil, low RG, mid diff)
#   Slot 3 — Medium / Benchmark (versatile, mid RG, mid diff)
#   Slot 4 — Light / Control    (medium-light oil, mid-high RG, low-mid diff)
#   Slot 5 — Spare              (dry lanes, high RG, low diff)
#   Slot 6 — Specialty          (extra: pearl angular, heavy urethane, etc.)
#
# Uses K-Means on (RG, differential) with silhouette score to validate
# cluster quality and map clusters to canonical slot positions.
# ===========================================================================

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

import numpy as np

# Canonical slot centers in (RG, differential) space.
# These are "ideal" positions derived from the Storm 6-ball system
# and typical ball spec ranges (RG: 2.46–2.60, diff: 0.010–0.060).
SLOT_DEFINITIONS = [
    {"slot": 1, "name": "Strong Asymmetric", "rg": 2.48, "diff": 0.055,
     "description": "Heavy oil. Aggressive hook with strong backend."},
    {"slot": 2, "name": "Strong Symmetric", "rg": 2.49, "diff": 0.045,
     "description": "Medium-heavy oil. Smooth, strong arc."},
    {"slot": 3, "name": "Medium / Benchmark", "rg": 2.52, "diff": 0.040,
     "description": "Versatile benchmark reaction. House shot workhorse."},
    {"slot": 4, "name": "Light / Control", "rg": 2.55, "diff": 0.030,
     "description": "Medium-light oil. Clean through fronts, controlled backend."},
    {"slot": 5, "name": "Spare", "rg": 2.58, "diff": 0.015,
     "description": "Dry lanes and spare shooting. Minimal hook."},
    {"slot": 6, "name": "Specialty", "rg": 2.50, "diff": 0.050,
     "description": "Specialty slot: angular pearl, heavy urethane, or niche reaction."},
]

# Canonical slot centers as array (slots 1-6).
_SLOT_CENTERS = np.array([[s["rg"], s["diff"]] for s in SLOT_DEFINITIONS])


def _normalize_features(points: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Min-max normalize features to [0, 1] range.

    Returns (normalized_points, mins, ranges).
    """
    mins = points.min(axis=0)
    maxs = points.max(axis=0)
    ranges = maxs - mins
    ranges[ranges == 0] = 1.0  # avoid division by zero
    normalized = (points - mins) / ranges
    return normalized, mins, ranges


def _kmeans(
    points: np.ndarray,
    k: int,
    max_iter: int = 100,
    seed: int = 42,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Simple K-Means implementation (no sklearn dependency for lightweight use).

    Returns (labels, centroids).
    """
    rng = np.random.RandomState(seed)
    n = len(points)
    if n <= k:
        return np.arange(n), points.copy()

    # K-Means++ initialization
    indices = [rng.randint(n)]
    for _ in range(1, k):
        dists = np.min([np.sum((points - points[idx]) ** 2, axis=1) for idx in indices], axis=0)
        probs = dists / dists.sum()
        indices.append(rng.choice(n, p=probs))
    centroids = points[indices].copy()

    labels = np.zeros(n, dtype=int)
    for _ in range(max_iter):
        # Assign
        dists = np.array([np.sum((points - c) ** 2, axis=1) for c in centroids])
        new_labels = np.argmin(dists, axis=0)
        if np.array_equal(new_labels, labels):
            break
        labels = new_labels
        # Update
        for j in range(k):
            mask = labels == j
            if mask.any():
                centroids[j] = points[mask].mean(axis=0)

    return labels, centroids


def _silhouette_score(points: np.ndarray, labels: np.ndarray) -> float:
    """
    Compute mean silhouette score for a clustering.

    Silhouette = (b - a) / max(a, b) per point, averaged.
    a = mean intra-cluster distance, b = mean nearest-cluster distance.
    """
    n = len(points)
    if n < 2:
        return 0.0

    unique_labels = np.unique(labels)
    if len(unique_labels) < 2:
        return 0.0

    scores = np.zeros(n)
    for i in range(n):
        same_mask = labels == labels[i]
        same_mask[i] = False  # exclude self
        if not same_mask.any():
            scores[i] = 0.0
            continue

        a_i = np.mean(np.sqrt(np.sum((points[same_mask] - points[i]) ** 2, axis=1)))

        b_i = float("inf")
        for label in unique_labels:
            if label == labels[i]:
                continue
            other_mask = labels == label
            if other_mask.any():
                mean_dist = np.mean(np.sqrt(np.sum((points[other_mask] - points[i]) ** 2, axis=1)))
                b_i = min(b_i, mean_dist)

        scores[i] = (b_i - a_i) / max(a_i, b_i) if max(a_i, b_i) > 0 else 0.0

    return float(np.mean(scores))


def _match_clusters_to_slots(
    centroids: np.ndarray,
    norm_mins: np.ndarray,
    norm_ranges: np.ndarray,
) -> List[int]:
    """
    Map K-Means cluster indices to canonical slot numbers (1-6) by
    finding the closest canonical slot center for each centroid.

    Returns list of slot numbers (1-indexed), one per centroid.
    """
    # Denormalize centroids back to original space
    denorm = centroids * norm_ranges + norm_mins

    # Normalize canonical centers the same way
    canon_norm = (_SLOT_CENTERS - norm_mins) / norm_ranges

    k = len(centroids)
    slot_map = []
    used_slots = set()

    # Greedy assignment: for each centroid, find nearest unused canonical slot
    dists = np.zeros((k, len(SLOT_DEFINITIONS)))
    for i in range(k):
        for j in range(len(SLOT_DEFINITIONS)):
            dists[i, j] = np.sqrt(np.sum((centroids[i] - canon_norm[j]) ** 2))

    # Hungarian-like greedy: assign closest pairs first
    flat_order = np.argsort(dists.ravel())
    assigned_clusters = set()
    for flat_idx in flat_order:
        ci = flat_idx // len(SLOT_DEFINITIONS)
        sj = flat_idx % len(SLOT_DEFINITIONS)
        if ci in assigned_clusters or sj in used_slots:
            continue
        slot_map.append((ci, SLOT_DEFINITIONS[sj]["slot"]))
        assigned_clusters.add(ci)
        used_slots.add(sj)
        if len(slot_map) == k:
            break

    # Sort by cluster index
    slot_map.sort(key=lambda x: x[0])
    return [s for _, s in slot_map]


def assign_slots(
    arsenal_balls: List[Dict],
    max_k: int = 6,
) -> Dict:
    """
    Assign slot numbers to arsenal balls using K-Means clustering
    with silhouette-based k selection.

    Parameters
    ----------
    arsenal_balls : list[dict]
        Ball dicts with at least 'ball_id', 'rg', 'diff' keys.
    max_k : int
        Maximum number of clusters to try (default 6 for 6-ball system).

    Returns
    -------
    dict with keys:
        assignments : list[dict]
            Each dict: {ball_id, slot, slot_name, slot_description, rg, diff}
        best_k : int
            Number of clusters selected
        silhouette_score : float
            Silhouette score for the selected clustering
        slot_coverage : list[dict]
            Which canonical slots are covered vs empty
    """
    if not arsenal_balls:
        return {
            "assignments": [],
            "best_k": 0,
            "silhouette_score": 0.0,
            "slot_coverage": [
                {"slot": s["slot"], "name": s["name"], "covered": False}
                for s in SLOT_DEFINITIONS
            ],
        }

    n = len(arsenal_balls)
    points = np.array([[float(b["rg"]), float(b["diff"])] for b in arsenal_balls])

    # Single ball: direct slot assignment
    if n == 1:
        norm_pts, mins, ranges = _normalize_features(points)
        canon_norm = (_SLOT_CENTERS - mins) / ranges
        dists = np.sqrt(np.sum((canon_norm - norm_pts[0]) ** 2, axis=1))
        best_slot_idx = int(np.argmin(dists))
        slot_def = SLOT_DEFINITIONS[best_slot_idx]
        assignments = [{
            "ball_id": arsenal_balls[0].get("ball_id", "unknown"),
            "slot": slot_def["slot"],
            "slot_name": slot_def["name"],
            "slot_description": slot_def["description"],
            "rg": float(points[0, 0]),
            "diff": float(points[0, 1]),
        }]
        covered_slots = {slot_def["slot"]}
        coverage = [
            {"slot": s["slot"], "name": s["name"], "covered": s["slot"] in covered_slots}
            for s in SLOT_DEFINITIONS
        ]
        return {
            "assignments": assignments,
            "best_k": 1,
            "silhouette_score": 0.0,
            "slot_coverage": coverage,
        }

    # Normalize features
    norm_pts, mins, ranges = _normalize_features(points)

    # Try different k values and pick best silhouette
    best_k = min(2, n)
    best_score = -1.0
    best_labels = None
    best_centroids = None

    for k in range(2, min(max_k + 1, n + 1)):
        labels, centroids = _kmeans(norm_pts, k)
        score = _silhouette_score(norm_pts, labels)
        if score > best_score:
            best_score = score
            best_k = k
            best_labels = labels
            best_centroids = centroids

    # Map clusters to slot numbers
    slot_numbers = _match_clusters_to_slots(best_centroids, mins, ranges)

    # Build assignments
    assignments = []
    covered_slots = set()
    for i, ball in enumerate(arsenal_balls):
        cluster_idx = best_labels[i]
        slot_num = slot_numbers[cluster_idx]
        slot_def = next(s for s in SLOT_DEFINITIONS if s["slot"] == slot_num)
        covered_slots.add(slot_num)
        assignments.append({
            "ball_id": ball.get("ball_id", "unknown"),
            "slot": slot_num,
            "slot_name": slot_def["name"],
            "slot_description": slot_def["description"],
            "rg": float(points[i, 0]),
            "diff": float(points[i, 1]),
        })

    coverage = [
        {"slot": s["slot"], "name": s["name"], "covered": s["slot"] in covered_slots}
        for s in SLOT_DEFINITIONS
    ]

    return {
        "assignments": assignments,
        "best_k": best_k,
        "silhouette_score": float(best_score),
        "slot_coverage": coverage,
    }
