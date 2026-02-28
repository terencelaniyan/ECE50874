# ===========================================================================
# backend/app/recommendation_engine.py
# ---------------------------------------------------------------------------
# Nearest-neighbor bowling ball recommendation engine.
#
# Given the user's arsenal (possibly degradation-adjusted), this module
# scores every candidate ball by how close it is to the nearest arsenal
# ball in (rg, diff, int_diff) space.  Lower score = more similar to
# something the user already owns, which makes it a natural complement.
#
# The distance metric is weighted L1 (Manhattan distance) so that each
# dimension (rg, diff, int_diff) can be independently tuned if needed.
# ===========================================================================

from __future__ import annotations

from typing import Dict, List, Tuple


def dist(
    a: Dict, b: Dict,
    *, w_rg: float = 1.0, w_diff: float = 1.0, w_int: float = 1.0,
) -> float:
    """
    Weighted L1 (Manhattan) distance between two balls in spec space.

    Parameters
    ----------
    a, b : dict
        Ball rows with float-castable 'rg', 'diff', 'int_diff' keys.
    w_rg, w_diff, w_int : float
        Per-dimension weights (default 1.0 = equal weighting).

    Returns
    -------
    float
        Scalar distance; 0 means identical specs.
    """
    return (
        w_rg  * abs(float(a["rg"])       - float(b["rg"]))       # RG difference
        + w_diff * abs(float(a["diff"])   - float(b["diff"]))     # differential difference
        + w_int  * abs(float(a["int_diff"]) - float(b["int_diff"]))  # intermediate diff difference
    )


def recommend(
    *,
    arsenal_rows: List[Dict],
    candidate_rows: List[Dict],
    k: int,
    w_rg: float = 1.0,
    w_diff: float = 1.0,
    w_int: float = 1.0,
    diversity_min_distance: float = 0.0,
) -> List[Tuple[Dict, float]]:
    """
    Recommend the top-k candidate balls most similar to the user's arsenal.

    Algorithm
    ---------
    For each candidate ball, compute its minimum L1 distance to any
    arsenal ball.  Return the k candidates with the smallest minimum
    distance, sorted ascending (most similar first).

    Parameters
    ----------
    arsenal_rows : list[dict]
        User's arsenal balls (may be degradation-adjusted).
    candidate_rows : list[dict]
        All catalog balls NOT in the user's arsenal.
    k : int
        Number of recommendations to return.
    w_rg, w_diff, w_int : float
        Per-dimension weights for distance (default 1.0).
    diversity_min_distance : float
        If > 0, selected balls must be at least this far apart in spec space (default 0 = off).

    Returns
    -------
    list[(dict, float)]
        Top-k (ball_row, score) pairs sorted by score ascending.
    """
    # If the arsenal is empty, we can't compute distances
    if not arsenal_rows:
        return []

    scored: List[Tuple[Dict, float]] = []

    for cand in candidate_rows:
        # Find the smallest distance from this candidate to any arsenal ball
        best = None
        for a in arsenal_rows:
            d = dist(cand, a, w_rg=w_rg, w_diff=w_diff, w_int=w_int)
            if best is None or d < best:
                best = d
        scored.append((cand, float(best)))

    # Sort by distance ascending → closest (most similar) balls first
    scored.sort(key=lambda t: t[1])
    return _apply_diversity(scored, k, w_rg, w_diff, w_int, diversity_min_distance)


def _apply_diversity(
    scored: List[Tuple[Dict, float]],
    k: int,
    w_rg: float,
    w_diff: float,
    w_int: float,
    min_distance: float,
) -> List[Tuple[Dict, float]]:
    """
    From scored list (sorted by similarity), take up to k items so that no two
    selected balls are within min_distance of each other in spec space.
    If min_distance <= 0, returns first k (no diversity filter).
    """
    if min_distance <= 0 or not scored:
        return scored[:k]
    selected: List[Tuple[Dict, float]] = []
    for ball, score in scored:
        if len(selected) >= k:
            break
        too_close = any(
            dist(ball, s[0], w_rg=w_rg, w_diff=w_diff, w_int=w_int) < min_distance
            for s in selected
        )
        if not too_close:
            selected.append((ball, score))
    return selected
