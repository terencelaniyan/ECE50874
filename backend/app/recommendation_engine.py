# backend/app/recommendation_engine.py
from __future__ import annotations

from typing import Dict, List, Tuple


def dist(a: Dict, b: Dict, *, w_rg: float = 1.0, w_diff: float = 1.0, w_int: float = 1.0) -> float:
    """
    Weighted L1 distance on (rg, diff, int_diff).
    Assumes numeric fields exist and are floats.
    """
    return (
        w_rg * abs(float(a["rg"]) - float(b["rg"]))
        + w_diff * abs(float(a["diff"]) - float(b["diff"]))
        + w_int * abs(float(a["int_diff"]) - float(b["int_diff"]))
    )


def recommend(
    *,
    arsenal_rows: List[Dict],
    candidate_rows: List[Dict],
    k: int,
) -> List[Tuple[Dict, float]]:
    """
    For each candidate, find the closest arsenal ball and use that minimum distance as the score.
    Lower score = more similar.
    Returns top-k (ball_row, score).
    """
    if not arsenal_rows:
        return []

    scored: List[Tuple[Dict, float]] = []

    for cand in candidate_rows:
        best = None
        for a in arsenal_rows:
            d = dist(cand, a)
            if best is None or d < best:
                best = d
        scored.append((cand, float(best)))

    scored.sort(key=lambda t: t[1])
    return scored[:k]
