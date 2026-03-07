# ===========================================================================
# backend/app/degradation.py
# ---------------------------------------------------------------------------
# Surface degradation model for bowling balls.
#
# As a bowling ball is used over many games, its coverstock loses texture
# and hook potential.  This module models that wear as a linear decay
# applied to the three core specs (rg, diff, int_diff), producing
# "effective" specs that feed into the recommendation and gap engines.
#
# Key spec reference:
#   "effective hook rating has degraded by 22% due to 87 games"
#   → at 87 games the factor = 0.78 (i.e., 1 - 0.22).
# ===========================================================================

from __future__ import annotations

from typing import Dict

# ── Degradation constants ──────────────────────────────────────────────────
DECAY_RATE = 0.22   # max percentage of performance lost at MAX_GAMES
MAX_GAMES = 87      # game count at which full DECAY_RATE is reached
MIN_FACTOR = 0.01   # floor: don't let factor reach zero (avoids division issues downstream)


def _degradation_factor(game_count: int) -> float:
    """
    Compute the multiplicative degradation factor for a given game count.
    
    The factor represents the remaining performance percentage.
    - 0 games   → 1.0  (100% of original hook potential)
    - 87 games  → 0.78 (78% of original hook potential, 22% wear)
    - >87 games → Caps at 0.78.
    
    Args:
        game_count: Number of games bowled with the ball.
        
    Returns:
        float: Multiplier in the range [MIN_FACTOR, 1.0].
    """
    if game_count <= 0:
        return 1.0  # brand-new ball, no wear

    # Linearly interpolate: ratio goes from 0 → 1 over [0, MAX_GAMES]
    ratio = min(game_count, MAX_GAMES) / MAX_GAMES

    # factor decreases from 1.0 towards (1.0 - DECAY_RATE)
    factor = 1.0 - DECAY_RATE * ratio

    # Clamp to [MIN_FACTOR, 1.0] for safety
    return max(MIN_FACTOR, min(1.0, factor))


def apply_degradation(ball_row: Dict, game_count: int) -> Dict:
    """
    Apply surface wear degradation to a ball's specifications.
    
    Creates a copy of the ball data with "effective" (degraded) RG, 
    differential, and intermediate differential values.
    
    Args:
        ball_row: Dictionary containing original ball specifications.
        game_count: Number of games bowled with the ball.
        
    Returns:
        Dict: A new dictionary with updated (degraded) specifications.
    """
    if game_count <= 0:
        # No degradation; return shallow copy to avoid mutating caller's data
        out = dict(ball_row)
        return out

    factor = _degradation_factor(game_count)

    out = dict(ball_row)  # shallow copy preserves non-spec fields (name, brand, etc.)
    out["rg"] = float(ball_row["rg"]) * factor          # effective RG
    out["diff"] = float(ball_row["diff"]) * factor      # effective differential
    out["int_diff"] = float(ball_row["int_diff"]) * factor  # effective intermediate diff
    return out
