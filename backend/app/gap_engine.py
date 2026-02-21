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


def _points_with_jitter(catalog_rows: List[dict]) -> Tuple[np.ndarray, List[dict]]:
    """
    Build 2D (rg, diff) and dedupe by jitter so each row maps 1:1 to a ball.
    Returns (points array, list of ball dicts in same order as rows).
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
    """L2 distance between two 2D points (rg, diff)."""
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
