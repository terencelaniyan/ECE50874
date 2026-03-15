# ===========================================================================
# backend/app/degradation.py
# ---------------------------------------------------------------------------
# Surface degradation model for bowling balls.
#
# Two models are provided:
#   1. Legacy linear model (v1) — kept for backward compatibility.
#   2. Logarithmic model (v2) — per the proposal:
#        H_eff = H_factory · max(0, 1 - λ·log(1+N))
#      with coverstock-dependent λ (higher λ for reactive solids,
#      lower for urethane/plastic).
# ===========================================================================

from __future__ import annotations

import math
from typing import Dict, Optional


# ── Shared constants ─────────────────────────────────────────────────────
MIN_FACTOR = 0.01   # floor: don't let factor reach zero

# ── V1 (linear) constants ────────────────────────────────────────────────
V1_DECAY_RATE = 0.22   # max percentage of performance lost at V1_MAX_GAMES
V1_MAX_GAMES = 87      # game count at which full V1_DECAY_RATE is reached

# ── V2 (logarithmic) constants ──────────────────────────────────────────
# Coverstock-dependent decay rates (λ).
# Higher λ → faster degradation.  Ordered from most to least aggressive.
COVERSTOCK_LAMBDA: Dict[str, float] = {
    "solid reactive":   0.065,
    "pearl reactive":   0.055,
    "hybrid reactive":  0.050,
    "urethane":         0.035,
    "plastic":          0.020,
    "polyester":        0.020,
}
DEFAULT_LAMBDA = 0.050  # fallback when coverstock type is unknown


def _normalize_coverstock(coverstock_type: Optional[str]) -> str:
    """Normalize coverstock string for lookup."""
    if not coverstock_type:
        return ""
    return coverstock_type.strip().lower()


def _get_lambda(coverstock_type: Optional[str]) -> float:
    """Return the coverstock-dependent λ for the logarithmic model."""
    normalized = _normalize_coverstock(coverstock_type)
    if not normalized:
        return DEFAULT_LAMBDA
    # Try exact match first, then substring match
    if normalized in COVERSTOCK_LAMBDA:
        return COVERSTOCK_LAMBDA[normalized]
    for key, lam in COVERSTOCK_LAMBDA.items():
        if key in normalized or normalized in key:
            return lam
    return DEFAULT_LAMBDA


# ── V1: Linear degradation (legacy) ─────────────────────────────────────

def _degradation_factor_linear(game_count: int) -> float:
    """
    V1 linear degradation factor.

    - 0 games   → 1.0  (100% of original hook potential)
    - 87 games  → 0.78 (78% of original hook potential, 22% wear)
    - >87 games → caps at 0.78
    """
    if game_count <= 0:
        return 1.0
    ratio = min(game_count, V1_MAX_GAMES) / V1_MAX_GAMES
    factor = 1.0 - V1_DECAY_RATE * ratio
    return max(MIN_FACTOR, min(1.0, factor))


def _degradation_factor_log(game_count: int, lam: float) -> float:
    """
    V2 logarithmic degradation factor.

    H_eff = H_factory · max(MIN_FACTOR, 1 - λ·log(1+N))

    Logarithmic decay is steeper early (when coverstock texture degrades
    fastest) and flattens out as the surface stabilizes.
    """
    if game_count <= 0:
        return 1.0
    factor = 1.0 - lam * math.log(1 + game_count)
    return max(MIN_FACTOR, min(1.0, factor))


# ── Public API ───────────────────────────────────────────────────────────

# Keep the old name as an alias so existing code doesn't break.
_degradation_factor = _degradation_factor_linear


def apply_degradation(ball_row: Dict, game_count: int) -> Dict:
    """
    Apply V1 (linear) surface wear degradation to a ball's specifications.

    Creates a copy of the ball data with "effective" (degraded) RG,
    differential, and intermediate differential values.

    Kept for backward compatibility — existing endpoints use this.
    """
    if game_count <= 0:
        return dict(ball_row)

    factor = _degradation_factor_linear(game_count)
    out = dict(ball_row)
    out["rg"] = float(ball_row["rg"]) * factor
    out["diff"] = float(ball_row["diff"]) * factor
    idiff = ball_row.get("int_diff")
    out["int_diff"] = (float(idiff) * factor) if idiff is not None else 0.0
    return out


def apply_degradation_v2(ball_row: Dict, game_count: int) -> Dict:
    """
    Apply V2 (logarithmic, coverstock-dependent) degradation.

    Uses H_eff = H_factory · max(0, 1 - λ·log(1+N)) where λ depends
    on the coverstock material.  Solid reactive degrades faster than
    urethane or plastic.

    Returns a shallow copy with degraded rg, diff, int_diff.
    """
    coverstock = ball_row.get("coverstock_type")
    lam = _get_lambda(coverstock)

    if game_count <= 0:
        out = dict(ball_row)
        out["_degradation_factor"] = 1.0
        out["_degradation_lambda"] = lam
        out["_degradation_model"] = "logarithmic"
        return out

    factor = _degradation_factor_log(game_count, lam)

    out = dict(ball_row)
    out["rg"] = float(ball_row["rg"]) * factor
    out["diff"] = float(ball_row["diff"]) * factor
    idiff = ball_row.get("int_diff")
    out["int_diff"] = (float(idiff) * factor) if idiff is not None else 0.0
    out["_degradation_factor"] = factor
    out["_degradation_lambda"] = lam
    out["_degradation_model"] = "logarithmic"
    return out


def compare_models(ball_row: Dict, game_count: int) -> Dict:
    """
    Return side-by-side degradation results from both models.
    Useful for A/B evaluation in the final report.
    """
    v1 = apply_degradation(ball_row, game_count)
    v2 = apply_degradation_v2(ball_row, game_count)
    return {
        "original": {
            "rg": float(ball_row["rg"]),
            "diff": float(ball_row["diff"]),
            "int_diff": float(ball_row.get("int_diff") or 0),
        },
        "v1_linear": {
            "rg": v1["rg"],
            "diff": v1["diff"],
            "int_diff": v1["int_diff"],
            "factor": _degradation_factor_linear(game_count),
        },
        "v2_logarithmic": {
            "rg": v2["rg"],
            "diff": v2["diff"],
            "int_diff": v2["int_diff"],
            "factor": v2["_degradation_factor"],
            "lambda": v2["_degradation_lambda"],
            "coverstock_type": ball_row.get("coverstock_type"),
        },
        "game_count": game_count,
    }
