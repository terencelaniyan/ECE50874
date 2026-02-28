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

    Returns a value in [MIN_FACTOR, 1.0]:
      - 0 games   → 1.0  (no degradation)
      - 87 games  → 0.78 (22% degradation)
      - >87 games → capped at 0.78 (no further decay)
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
    Return a *copy* of ball_row with rg, diff, int_diff scaled by
    the degradation factor.

    - game_count == 0  → returns unchanged copy (no wear).
    - game_count > 0   → lower effective specs (simulates surface wear).

    The original ball_row is never mutated.
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
