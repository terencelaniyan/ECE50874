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


import math


# ── Coverstock ordinal encoding (proposal eq. 3) ────────────────────────
# Ordinal scale: Plastic=1, Urethane=3, Pearl=5, Hybrid=7, Solid=9
COVERSTOCK_ORDINAL: Dict[str, float] = {
    "plastic": 1.0,
    "polyester": 1.0,
    "urethane": 3.0,
    "pearl reactive": 5.0,
    "hybrid reactive": 7.0,
    "solid reactive": 9.0,
}
COVERSTOCK_DEFAULT = 5.0  # unknown → mid-range
COVERSTOCK_SCALE = 9.0    # max value for normalization


def _encode_coverstock(coverstock_type: str | None) -> float:
    """Ordinal-encode coverstock type to [0, 1] range."""
    if not coverstock_type:
        return COVERSTOCK_DEFAULT / COVERSTOCK_SCALE
    normalized = coverstock_type.strip().lower()
    if normalized in COVERSTOCK_ORDINAL:
        return COVERSTOCK_ORDINAL[normalized] / COVERSTOCK_SCALE
    # Substring match
    for key, val in COVERSTOCK_ORDINAL.items():
        if key in normalized or normalized in key:
            return val / COVERSTOCK_SCALE
    return COVERSTOCK_DEFAULT / COVERSTOCK_SCALE


def dist(
    a: Dict, b: Dict,
    *, w_rg: float = 1.0, w_diff: float = 1.0, w_int: float = 1.0,
    w_cover: float = 0.0,
    metric: str = "l1",
) -> float:
    """
    Weighted distance between two balls in spec space.

    Supports 3D (rg, diff, int_diff) or 4D (+ coverstock ordinal encoding)
    when w_cover > 0 (proposal eq. 3).
    """
    d_rg = w_rg * abs(float(a["rg"]) - float(b["rg"]))
    d_diff = w_diff * abs(float(a["diff"]) - float(b["diff"]))
    d_int = w_int * abs(float(a["int_diff"]) - float(b["int_diff"]))
    d_cover = 0.0
    if w_cover > 0:
        ca = _encode_coverstock(a.get("coverstock_type"))
        cb = _encode_coverstock(b.get("coverstock_type"))
        d_cover = w_cover * abs(ca - cb)
    if metric == "l2":
        return math.sqrt(d_rg ** 2 + d_diff ** 2 + d_int ** 2 + d_cover ** 2)
    return d_rg + d_diff + d_int + d_cover


def _normalize_rows(rows: List[Dict], keys=("rg", "diff", "int_diff")) -> List[Dict]:
    """Min-max normalize rows to [0, 1] per feature."""
    if not rows:
        return rows
    mins = {k: min(float(r[k]) for r in rows) for k in keys}
    maxs = {k: max(float(r[k]) for r in rows) for k in keys}
    result = []
    for r in rows:
        nr = dict(r)
        for k in keys:
            rng = maxs[k] - mins[k]
            nr[k] = (float(r[k]) - mins[k]) / rng if rng > 0 else 0.0
        result.append(nr)
    return result


def recommend(
    *,
    arsenal_rows: List[Dict],
    candidate_rows: List[Dict],
    k: int,
    w_rg: float = 1.0,
    w_diff: float = 1.0,
    w_int: float = 1.0,
    w_cover: float = 0.0,
    diversity_min_distance: float = 0.0,
    normalize: bool = False,
    metric: str = "l1",
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
    if not arsenal_rows:
        return []

    # Optionally normalize features
    work_arsenal = arsenal_rows
    work_candidates = candidate_rows
    if normalize:
        all_rows = arsenal_rows + candidate_rows
        normed = _normalize_rows(all_rows)
        work_arsenal = normed[:len(arsenal_rows)]
        work_candidates = normed[len(arsenal_rows):]

    scored: List[Tuple[Dict, float]] = []

    for i, cand in enumerate(work_candidates):
        best = float("inf")
        for a in work_arsenal:
            d = dist(cand, a, w_rg=w_rg, w_diff=w_diff, w_int=w_int, w_cover=w_cover, metric=metric)
            if d < best:
                best = d
        # Store original (un-normalized) candidate row
        scored.append((candidate_rows[i], float(best)))

    scored.sort(key=lambda t: t[1])
    return _apply_diversity(scored, k, w_rg, w_diff, w_int, w_cover, diversity_min_distance, metric=metric)


def _apply_diversity(
    scored: List[Tuple[Dict, float]],
    k: int,
    w_rg: float,
    w_diff: float,
    w_int: float,
    w_cover: float,
    min_distance: float,
    metric: str = "l1",
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
            dist(ball, s[0], w_rg=w_rg, w_diff=w_diff, w_int=w_int, w_cover=w_cover, metric=metric) < min_distance
            for s in selected
        )
        if not too_close:
            selected.append((ball, score))
    return selected
