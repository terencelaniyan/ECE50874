# ===========================================================================
# backend/app/synthetic_data.py
# ---------------------------------------------------------------------------
# Generates synthetic arsenal-ball interaction data for training the
# two-tower recommendation model.
#
# Uses the 6-ball slot system to create realistic arsenals:
#   Slot 1 — Strong Asymmetric  (heavy oil)
#   Slot 2 — Strong Symmetric   (medium-heavy oil)
#   Slot 3 — Medium / Benchmark (versatile)
#   Slot 4 — Light / Control    (medium-light)
#   Slot 5 — Spare              (dry lanes)
#   Slot 6 — Specialty          (optional)
#
# Each synthetic arsenal picks 3-6 balls from the catalog that match
# the slot spec ranges, producing (arsenal_features, ball) positive pairs.
# ===========================================================================

from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np


# Slot spec ranges: (rg_min, rg_max, diff_min, diff_max)
SLOT_RANGES = {
    1: (2.46, 2.50, 0.045, 0.065),  # Strong Asymmetric
    2: (2.47, 2.52, 0.035, 0.050),  # Strong Symmetric
    3: (2.50, 2.55, 0.030, 0.045),  # Medium / Benchmark
    4: (2.53, 2.58, 0.020, 0.035),  # Light / Control
    5: (2.55, 2.62, 0.008, 0.025),  # Spare
    6: (2.48, 2.56, 0.035, 0.055),  # Specialty
}

# Coverstock types typical for each slot
SLOT_COVERSTOCKS = {
    1: ["Solid Reactive"],
    2: ["Solid Reactive", "Hybrid Reactive"],
    3: ["Hybrid Reactive", "Pearl Reactive"],
    4: ["Pearl Reactive", "Hybrid Reactive"],
    5: ["Plastic", "Polyester", "Urethane"],
    6: ["Pearl Reactive", "Solid Reactive", "Urethane"],
}


def _ball_fits_slot(ball: Dict, slot: int) -> bool:
    """Check if a ball's specs fall within a slot's range."""
    rg_min, rg_max, diff_min, diff_max = SLOT_RANGES[slot]
    rg = float(ball.get("rg", 0))
    diff = float(ball.get("diff", 0))
    if not (rg_min <= rg <= rg_max and diff_min <= diff <= diff_max):
        return False
    # Optionally check coverstock type
    cover = (ball.get("coverstock_type") or "").strip()
    if cover:
        slot_covers = SLOT_COVERSTOCKS.get(slot, [])
        if slot_covers and not any(sc.lower() in cover.lower() for sc in slot_covers):
            return False
    return True


def _index_balls_by_slot(catalog: List[Dict]) -> Dict[int, List[Dict]]:
    """Group catalog balls by which slot(s) they fit."""
    slot_balls: Dict[int, List[Dict]] = {s: [] for s in range(1, 7)}
    for ball in catalog:
        for slot in range(1, 7):
            if _ball_fits_slot(ball, slot):
                slot_balls[slot].append(ball)
    return slot_balls


def generate_synthetic_arsenals(
    catalog: List[Dict],
    n_arsenals: int = 10000,
    seed: int = 42,
) -> List[Tuple[List[Dict], List[Dict]]]:
    """
    Generate synthetic arsenals for training.

    Each arsenal is a realistic 3-6 ball collection following the slot system.
    For each arsenal, we also identify "positive" balls (balls that would
    complement the arsenal — from unfilled slots).

    Parameters
    ----------
    catalog : list[dict]
        Full ball catalog with rg, diff, int_diff, coverstock_type, etc.
    n_arsenals : int
        Number of synthetic arsenals to generate.
    seed : int
        Random seed for reproducibility.

    Returns
    -------
    list[(arsenal_balls, positive_balls)]
        Each tuple: (list of balls in arsenal, list of complementary balls).
    """
    rng = np.random.RandomState(seed)
    slot_balls = _index_balls_by_slot(catalog)

    # Filter out empty slots
    available_slots = [s for s in range(1, 7) if len(slot_balls[s]) >= 1]
    if len(available_slots) < 2:
        return []

    arsenals = []
    for _ in range(n_arsenals):
        # Pick 3-6 slots to fill
        n_slots = rng.randint(3, min(7, len(available_slots) + 1))
        chosen_slots = rng.choice(available_slots, size=n_slots, replace=False).tolist()

        arsenal = []
        for slot in chosen_slots:
            ball = slot_balls[slot][rng.randint(len(slot_balls[slot]))]
            arsenal.append(ball)

        # Positive examples: balls from unfilled slots
        unfilled = [s for s in available_slots if s not in chosen_slots]
        positives = []
        for slot in unfilled:
            if slot_balls[slot]:
                ball = slot_balls[slot][rng.randint(len(slot_balls[slot]))]
                positives.append(ball)

        if arsenal and positives:
            arsenals.append((arsenal, positives))

    return arsenals


# ── Feature encoding helpers ─────────────────────────────────────────────

# Coverstock type encoding (ordinal for KNN, embedded for two-tower)
COVERSTOCK_ENCODING: Dict[str, int] = {
    "plastic": 0,
    "polyester": 0,
    "urethane": 1,
    "pearl reactive": 2,
    "hybrid reactive": 3,
    "solid reactive": 4,
}


def encode_coverstock(coverstock_type: str) -> int:
    """Encode coverstock type as integer for model input."""
    normalized = (coverstock_type or "").strip().lower()
    for key, val in COVERSTOCK_ENCODING.items():
        if key in normalized:
            return val
    return 2  # default to mid-range


# Brand encoding (top brands get indices, rest get 0)
TOP_BRANDS = [
    "storm", "roto grip", "900 global", "brunswick", "hammer",
    "motiv", "radical", "dv8", "track", "columbia 300",
    "ebonite", "global 900",
]


def encode_brand(brand: str) -> int:
    """Encode brand as integer. Top brands get 1-12, unknown gets 0."""
    normalized = (brand or "").strip().lower()
    if not normalized:
        return 0
    for i, b in enumerate(TOP_BRANDS):
        if b in normalized or normalized in b:
            return i + 1
    return 0


def ball_to_features(ball: Dict) -> List[float]:
    """
    Convert a ball dict to a feature vector for the two-tower model.

    Features: [rg, diff, int_diff, coverstock_enc, brand_enc]
    """
    rg = float(ball.get("rg", 2.50))
    diff = float(ball.get("diff", 0.040))
    int_diff = float(ball.get("int_diff") or 0.0)
    cover_enc = float(encode_coverstock(ball.get("coverstock_type", "")))
    brand_enc = float(encode_brand(ball.get("brand", "")))
    return [rg, diff, int_diff, cover_enc, brand_enc]


def arsenal_to_features(arsenal_balls: List[Dict]) -> List[float]:
    """
    Aggregate an arsenal into a fixed-size feature vector for the user tower.

    Features (15 total):
        [mean_rg, mean_diff, mean_int_diff, mean_cover, mean_brand,
         std_rg, std_diff, std_int_diff, std_cover, std_brand,
         min_rg, max_rg, min_diff, max_diff, n_balls]
    """
    if not arsenal_balls:
        return [0.0] * 15

    feats = np.array([ball_to_features(b) for b in arsenal_balls])
    means = feats.mean(axis=0).tolist()  # 5
    stds = feats.std(axis=0).tolist()    # 5
    min_rg = float(feats[:, 0].min())
    max_rg = float(feats[:, 0].max())
    min_diff = float(feats[:, 1].min())
    max_diff = float(feats[:, 1].max())
    n_balls = float(len(arsenal_balls))

    return means + stds + [min_rg, max_rg, min_diff, max_diff, n_balls]
