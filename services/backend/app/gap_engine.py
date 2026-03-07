# backend/app/gap_engine.py
"""
Voronoi-based gap analysis in RG–Differential space.
Identifies catalog balls that occupy regions not covered by the user's arsenal.
"""
from __future__ import annotations

import numpy as np
from scipy.spatial import Voronoi
from scipy.spatial import QhullError
from typing import List, Optional, Set, Tuple

# Tiny jitter to avoid degenerate Voronoi when two balls share (rg, diff).
JITTER_EPS = 1e-9

# Zone labeling breakpoints (rg, diff) for label_zone / zone_description.
RG_LOW_MID = 2.50
RG_MID_HIGH = 2.54
DIFF_LOW_MID = 0.040
DIFF_MID_HIGH = 0.050


def _points_with_jitter(catalog_rows: List[dict]) -> Tuple[np.ndarray, List[dict]]:
    """
    Extract (RG, differential) points from catalog rows and apply a tiny 
    jitter to handle duplicate specifications.
    
    Duplicates can cause issues with Voronoi tessellation. This function 
    ensures each ball has a unique point in the 2D space.
    
    Args:
        catalog_rows: List of bowling ball data dictionaries.
        
    Returns:
        Tuple[np.ndarray, List[dict]]: A NumPy array of (rg, diff) points 
                                     and the corresponding list of ball dictionaries.
    """
    seen = set()
    points_list = []
    balls_list = []
    for row in catalog_rows:
        rg = float(row["rg"])
        diff = float(row["diff"])
        key = (rg, diff)
        if key in seen:
            i = len(balls_list)
            rg += (i % 17) * JITTER_EPS * 0.1
            diff += (i // 17) * JITTER_EPS * 0.1
        else:
            seen.add(key)
        points_list.append([rg, diff])
        balls_list.append(row)
    return np.array(points_list), balls_list


def _dist_2d(a: np.ndarray, b: np.ndarray) -> float:
    """
    Calculate the L2 (Euclidean) distance between two 2D points.
    
    Used for measuring proximity in the (RG, differential) spec space.
    
    Args:
        a: First 2D point [rg, diff].
        b: Second 2D point [rg, diff].
        
    Returns:
        float: Euclidean distance between the points.
    """
    return float(np.linalg.norm(a - b))


def compute_gaps(
    catalog_rows: List[dict],
    arsenal_ball_ids: Set[str],
    k: int = 10,
    arsenal_effective_rows: Optional[List[dict]] = None,
) -> List[Tuple[dict, float]]:
    """
    Voronoi-based gap analysis in RG–Differential space.

    A "gap" is a Voronoi cell whose owner ball is not in the arsenal.
    Gap score = distance from that ball's (rg, diff) to the nearest arsenal
    point; higher score means a larger coverage hole.

    When arsenal_effective_rows is provided (e.g. degradation-adjusted), its
    (rg, diff) and ball_ids define arsenal points and membership; otherwise
    catalog_rows + arsenal_ball_ids are used.

    Returns top-k (ball_row, gap_score) sorted by gap_score descending.
    """
    if not catalog_rows:
        return []

    if arsenal_effective_rows is not None:
        arsenal_ball_ids = {r["ball_id"] for r in arsenal_effective_rows}
        arsenal_points_arr = np.array(
            [[float(r["rg"]), float(r["diff"])] for r in arsenal_effective_rows]
        )
        has_arsenal = len(arsenal_points_arr) > 0
    else:
        arsenal_points_arr = None
        has_arsenal = False

    points, balls = _points_with_jitter(catalog_rows)
    n = len(points)

    # Need at least 3 points for Voronoi in 2D to be meaningful.
    if n < 3:
        gap_candidates = [
            (b, 0.0) for b in balls if b["ball_id"] not in arsenal_ball_ids
        ]
        gap_candidates.sort(key=lambda t: (t[1], t[0]["ball_id"]), reverse=True)
        return gap_candidates[:k]

    try:
        Voronoi(points)
    except QhullError:
        # Fallback when Voronoi fails (e.g. degenerate geometry).
        if arsenal_effective_rows is not None:
            ap_arr = arsenal_points_arr
        else:
            in_arsenal = [r for r in catalog_rows if r["ball_id"] in arsenal_ball_ids]
            ap_arr = np.array(
                [[float(r["rg"]), float(r["diff"])] for r in in_arsenal]
            )
        if len(ap_arr) == 0:
            return [(b, 0.0) for b in balls[:k]]
        scored = []
        for i in range(n):
            ball = balls[i]
            if ball["ball_id"] in arsenal_ball_ids:
                continue
            pt = points[i]
            d = min(_dist_2d(pt, ap) for ap in ap_arr)
            scored.append((ball, d))
        scored.sort(key=lambda t: (t[1], t[0]["ball_id"]), reverse=True)
        return scored[:k]

    # Main path: build arsenal points from catalog when not using effective rows.
    if arsenal_effective_rows is None:
        in_arsenal = [r for r in catalog_rows if r["ball_id"] in arsenal_ball_ids]
        arsenal_points_arr = np.array(
            [[float(r["rg"]), float(r["diff"])] for r in in_arsenal]
        )
        has_arsenal = len(arsenal_points_arr) > 0

    gap_scores: List[Tuple[dict, float]] = []
    for site_idx in range(n):
        ball = balls[site_idx]
        if ball["ball_id"] in arsenal_ball_ids:
            continue
        pt = points[site_idx]
        if has_arsenal:
            score = min(_dist_2d(pt, ap) for ap in arsenal_points_arr)
        else:
            mean_pt = np.mean(points, axis=0)
            score = _dist_2d(pt, mean_pt)
        gap_scores.append((ball, score))

    gap_scores.sort(key=lambda t: (t[1], t[0]["ball_id"]), reverse=True)
    return gap_scores[:k]


def group_gaps_by_zone(
    gap_items: List[Tuple[dict, float]],
    threshold: float = 0.05,
) -> List[dict]:
    """
    Cluster gap items in (rg, diff) space by distance threshold.
    Zone center is the first point that created the zone (no centroid update).
    Returns list of {"center": [rg, diff], "balls": [{"ball": ..., "gap_score": ...}, ...]}.
    """
    zones: List[dict] = []

    for ball, score in gap_items:
        pt = np.array([float(ball["rg"]), float(ball["diff"])])
        placed = False

        for zone in zones:
            zone_center = np.array(zone["center"])
            dist = float(np.linalg.norm(pt - zone_center))
            if dist < threshold:
                zone["balls"].append({"ball": ball, "gap_score": score})
                placed = True
                break

        if not placed:
            zones.append({
                "center": [float(ball["rg"]), float(ball["diff"])],
                "balls": [{"ball": ball, "gap_score": score}],
            })

    return zones


def label_zone(center_rg: float, center_diff: float) -> str:
    """Return human-readable label for a zone from its center (rg, diff)."""
    if center_rg < RG_LOW_MID:
        rg_label = "Low RG"
    elif center_rg < RG_MID_HIGH:
        rg_label = "Mid RG"
    else:
        rg_label = "High RG"

    if center_diff < DIFF_LOW_MID:
        diff_label = "Low Differential"
    elif center_diff < DIFF_MID_HIGH:
        diff_label = "Mid Differential"
    else:
        diff_label = "High Differential"

    return f"{rg_label} / {diff_label}"


def zone_description(center_rg: float, center_diff: float) -> str:
    """Return short bowling description for a zone from its center (rg, diff)."""
    label = label_zone(center_rg, center_diff)
    descriptions = {
        "Low RG / High Differential": "Strong asymmetrical, heavy oil.",
        "Low RG / Mid Differential": "Strong hook, early roll.",
        "Low RG / Low Differential": "Smooth symmetrical, medium-heavy oil.",
        "Mid RG / High Differential": "Angular backend, medium oil.",
        "Mid RG / Mid Differential": "Benchmark, versatile.",
        "Mid RG / Low Differential": "Controlled mid-lane.",
        "High RG / High Differential": "Angular backend, medium oil.",
        "High RG / Mid Differential": "Length with backend.",
        "High RG / Low Differential": "Control ball, light oil or dry lanes.",
    }
    return descriptions.get(label, "Covers a gap in your arsenal.")
