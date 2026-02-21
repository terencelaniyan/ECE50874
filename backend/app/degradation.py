"""
Discount effective performance rating of arsenal balls by game count.
Produces effective (rg, diff, int_diff) for recommendations and gap analysis.
"""
from __future__ import annotations

from typing import Dict

# Spec: "effective hook rating has degraded by 22% due to 87 games"
DECAY_RATE = 0.22
MAX_GAMES = 87
MIN_FACTOR = 0.01


def _degradation_factor(game_count: int) -> float:
    """Factor in [MIN_FACTOR, 1.0]. 0 games -> 1.0; MAX_GAMES -> 1 - DECAY_RATE."""
    if game_count <= 0:
        return 1.0
    ratio = min(game_count, MAX_GAMES) / MAX_GAMES
    factor = 1.0 - DECAY_RATE * ratio
    return max(MIN_FACTOR, min(1.0, factor))


def apply_degradation(ball_row: Dict, game_count: int) -> Dict:
    """
    Return copy of ball_row with rg, diff, int_diff scaled by degradation factor.
    game_count 0 -> no change. Higher game_count -> lower effective specs.
    """
    if game_count <= 0:
        out = dict(ball_row)
        return out
    factor = _degradation_factor(game_count)
    out = dict(ball_row)
    out["rg"] = float(ball_row["rg"]) * factor
    out["diff"] = float(ball_row["diff"]) * factor
    out["int_diff"] = float(ball_row["int_diff"]) * factor
    return out
