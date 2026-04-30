"""Unit tests for degradation.apply_degradation (simulation module).

Covers:
  - V1 (linear) boundary conditions and spec compliance
  - V2 (logarithmic) lambda ordering, formula correctness, floor clamp
  - Cross-model ordering between V1 and V2 for different coverstocks
  - compare_models structure and value integrity
"""
import math
import pytest

from app.degradation import (
    apply_degradation,
    apply_degradation_v2,
    compare_models,
    _get_lambda,
    DEFAULT_LAMBDA,
    MIN_FACTOR,
    V1_DECAY_RATE,
    V1_MAX_GAMES,
    COVERSTOCK_LAMBDA,
)


# ── Helpers ───────────────────────────────────────────────────────────────

def _ball(rg: float, diff: float, int_diff: float = 0.015, coverstock_type: str = ""):
    return {"ball_id": "B1", "rg": rg, "diff": diff,
            "int_diff": int_diff, "coverstock_type": coverstock_type}


# ═══════════════════════════════════════════════════════════════════════════
# V1 LINEAR MODEL — boundary conditions
# ═══════════════════════════════════════════════════════════════════════════

def test_zero_games_no_change():
    row = _ball(2.50, 0.040, 0.015)
    out = apply_degradation(row, 0)
    assert out["rg"] == 2.50
    assert out["diff"] == 0.040
    assert out["int_diff"] == 0.015


def test_negative_games_no_change():
    row = _ball(2.50, 0.040)
    out = apply_degradation(row, -1)
    assert out["rg"] == 2.50
    assert out["diff"] == 0.040


def test_87_games_factor_078():
    """Spec: 22% wear at 87 games → factor 0.78."""
    row = _ball(2.50, 0.040, 0.020)
    out = apply_degradation(row, 87)
    expected_factor = 1.0 - V1_DECAY_RATE  # 0.78
    assert out["rg"] == pytest.approx(2.50 * expected_factor, rel=1e-5)
    assert out["diff"] == pytest.approx(0.040 * expected_factor, rel=1e-5)
    assert out["int_diff"] == pytest.approx(0.020 * expected_factor, rel=1e-5)


def test_more_than_max_games_caps_factor():
    """Beyond V1_MAX_GAMES the factor must not decrease further."""
    row = _ball(2.50, 0.040)
    out_87 = apply_degradation(row, V1_MAX_GAMES)
    out_200 = apply_degradation(row, 200)
    assert out_200["rg"] == pytest.approx(out_87["rg"], rel=1e-5)
    assert out_200["diff"] == pytest.approx(out_87["diff"], rel=1e-5)


def test_copy_unchanged_fields():
    row = {"ball_id": "X", "name": "Test", "rg": 2.5, "diff": 0.04, "int_diff": 0.01}
    out = apply_degradation(row, 50)
    assert out["ball_id"] == "X"
    assert out["name"] == "Test"
    assert out["rg"] != 2.5   # degraded
    assert out["diff"] != 0.04


def test_v1_factor_monotone_in_game_count():
    """V1 RG must be weakly decreasing as game count increases (to the cap)."""
    row = _ball(2.50, 0.040)
    prev_rg = 2.50
    for n in [0, 10, 30, 60, V1_MAX_GAMES, V1_MAX_GAMES + 50]:
        out = apply_degradation(row, n)
        assert out["rg"] <= prev_rg + 1e-9, f"RG increased at {n} games"
        prev_rg = out["rg"]


def test_v1_int_diff_none_becomes_zero():
    """int_diff=None in source row must produce 0.0 in output."""
    row = {"ball_id": "Y", "rg": 2.5, "diff": 0.04, "int_diff": None}
    out = apply_degradation(row, 50)
    assert out["int_diff"] == 0.0


# ═══════════════════════════════════════════════════════════════════════════
# V2 LAMBDA LOOKUP — ordering and correctness
# ═══════════════════════════════════════════════════════════════════════════

def test_get_lambda_known_coverstocks():
    assert _get_lambda("solid reactive") == 0.065
    assert _get_lambda("pearl reactive") == 0.055
    assert _get_lambda("hybrid reactive") == 0.050
    assert _get_lambda("urethane") == 0.035
    assert _get_lambda("plastic") == 0.020
    assert _get_lambda("polyester") == 0.020


def test_get_lambda_case_insensitive():
    assert _get_lambda("Solid Reactive") == 0.065
    assert _get_lambda("PEARL REACTIVE") == 0.055
    assert _get_lambda("Urethane") == 0.035


def test_get_lambda_none_and_empty_return_default():
    assert _get_lambda(None) == DEFAULT_LAMBDA
    assert _get_lambda("") == DEFAULT_LAMBDA
    assert _get_lambda("   ") == DEFAULT_LAMBDA


def test_get_lambda_unknown_returns_default():
    assert _get_lambda("mystery compound") == DEFAULT_LAMBDA


def test_lambda_ordering():
    """
    Per the degradation model spec:
      solid > pearl > hybrid > urethane > plastic (> polyester)
    Higher λ means faster surface wear, per bowling industry research.
    """
    lam_solid  = _get_lambda("solid reactive")
    lam_pearl  = _get_lambda("pearl reactive")
    lam_hybrid = _get_lambda("hybrid reactive")
    lam_uret   = _get_lambda("urethane")
    lam_plast  = _get_lambda("plastic")

    assert lam_solid > lam_pearl,  "solid reactive must degrade faster than pearl"
    assert lam_pearl > lam_hybrid, "pearl must degrade faster than hybrid"
    assert lam_hybrid > lam_uret,  "hybrid must degrade faster than urethane"
    assert lam_uret > lam_plast,   "urethane must degrade faster than plastic"


# ═══════════════════════════════════════════════════════════════════════════
# V2 LOGARITHMIC FORMULA — correctness and floor clamp
# ═══════════════════════════════════════════════════════════════════════════

def test_apply_degradation_v2_zero_games():
    row = _ball(2.50, 0.040, 0.015, "urethane")
    out = apply_degradation_v2(row, 0)
    assert out["_degradation_factor"] == 1.0
    assert out["_degradation_lambda"] == pytest.approx(0.035)
    assert out["rg"] == pytest.approx(2.50)
    assert out["_degradation_model"] == "logarithmic"


def test_apply_degradation_v2_active_games():
    row = _ball(2.50, 0.040, 0.015, "solid reactive")
    out = apply_degradation_v2(row, 100)
    assert out["_degradation_factor"] < 1.0
    assert out["rg"] < 2.50
    assert out["diff"] < 0.040
    assert out["int_diff"] < 0.015


def test_apply_degradation_v2_formula_exact():
    """
    Verify H_eff = H_factory * max(MIN_FACTOR, 1 - λ·log(1+N))
    for solid reactive at N=50.  This pins the formula implementation.
    """
    lam = COVERSTOCK_LAMBDA["solid reactive"]  # 0.065
    n = 50
    expected_factor = max(MIN_FACTOR, 1.0 - lam * math.log(1 + n))

    row = _ball(2.50, 0.040, 0.015, "solid reactive")
    out = apply_degradation_v2(row, n)

    assert out["_degradation_factor"] == pytest.approx(expected_factor, rel=1e-6)
    assert out["rg"] == pytest.approx(2.50 * expected_factor, rel=1e-6)
    assert out["diff"] == pytest.approx(0.040 * expected_factor, rel=1e-6)


def test_floor_clamp_never_negative_extreme():
    """
    At sufficiently extreme game counts, the V2 factor must clamp to MIN_FACTOR.

    The clamp triggers when 1 - λ·log(1+N) < MIN_FACTOR, i.e.
    N > exp((1 - MIN_FACTOR) / λ) - 1.

    For solid reactive (λ=0.065):
      N_clamp ≈ exp((1 - 0.01) / 0.065) - 1 ≈ exp(15.23) - 1 ≈ 4.1 million

    We test at N = N_clamp + 1,000,000 to ensure clamping is active.
    """
    lam = COVERSTOCK_LAMBDA["solid reactive"]  # 0.065
    n_clamp = int(math.exp((1.0 - MIN_FACTOR) / lam) - 1)
    n_test = n_clamp + 1_000_000  # well past the clamping threshold

    row = _ball(2.50, 0.040, 0.015, "solid reactive")
    out = apply_degradation_v2(row, n_test)
    assert out["_degradation_factor"] == pytest.approx(MIN_FACTOR, rel=1e-6), (
        f"Factor at N={n_test} should be clamped to MIN_FACTOR={MIN_FACTOR}, "
        f"got {out['_degradation_factor']:.6f}"
    )
    assert out["rg"] > 0
    assert out["diff"] > 0


def test_floor_clamp_consistent_across_coverstocks():
    """
    Every coverstock must clamp to MIN_FACTOR at its own N_clamp threshold.
    Tests each coverstock at N > exp((1 - MIN_FACTOR) / λ) - 1.
    """
    for coverstock, lam in COVERSTOCK_LAMBDA.items():
        n_clamp = int(math.exp((1.0 - MIN_FACTOR) / lam) - 1)
        n_test = n_clamp + 1_000_000
        row = _ball(2.50, 0.040, 0.010, coverstock)
        out = apply_degradation_v2(row, n_test)
        assert out["_degradation_factor"] == pytest.approx(MIN_FACTOR, rel=1e-6), (
            f"Coverstock '{coverstock}' (λ={lam}) factor at N={n_test} should be "
            f"MIN_FACTOR={MIN_FACTOR}, got {out['_degradation_factor']:.6f}"
        )


def test_v2_factor_monotone_in_game_count():
    """V2 factor must be weakly decreasing as N increases (logarithmic decay)."""
    row = _ball(2.50, 0.040, 0.015, "pearl reactive")
    prev_factor = 1.0
    for n in [0, 5, 20, 50, 100, 500]:
        out = apply_degradation_v2(row, n)
        assert out["_degradation_factor"] <= prev_factor + 1e-9, (
            f"V2 factor increased from {prev_factor:.6f} to "
            f"{out['_degradation_factor']:.6f} at N={n}"
        )
        prev_factor = out["_degradation_factor"]


# ═══════════════════════════════════════════════════════════════════════════
# CROSS-MODEL ORDERING
# ═══════════════════════════════════════════════════════════════════════════

def test_solid_reactive_degrades_faster_than_plastic_v2():
    """
    Solid reactive (λ=0.065) must degrade more than plastic (λ=0.020) at same N.
    Validates that coverstock-dependent λ values produce the intended ordering.
    """
    n = 50
    solid = apply_degradation_v2(_ball(2.50, 0.040, 0.015, "solid reactive"), n)
    plastic = apply_degradation_v2(_ball(2.50, 0.040, 0.015, "plastic"), n)

    assert solid["_degradation_factor"] < plastic["_degradation_factor"], (
        "solid reactive must have lower factor (more wear) than plastic at N=50"
    )
    assert solid["rg"] < plastic["rg"]


def test_v2_solid_degrades_more_than_v1_at_moderate_games():
    """
    At N=50, V2 solid reactive degrades faster than V1 linear.
    Derivation: V1@50 ≈ 0.874; V2 solid@50 ≈ 1 - 0.065·ln(51) ≈ 0.747.
    """
    n = 50
    v1_out = apply_degradation(_ball(2.50, 0.040), n)
    v2_solid = apply_degradation_v2(_ball(2.50, 0.040, 0.015, "solid reactive"), n)

    assert v2_solid["rg"] < v1_out["rg"], (
        f"V2 solid RG ({v2_solid['rg']:.4f}) must be < V1 RG ({v1_out['rg']:.4f}) at N={n}"
    )


def test_v2_plastic_degrades_less_than_v1_cap():
    """
    Plastic (λ=0.020) at N=200 produces factor ≈ 0.894, above the V1 cap (0.78).
    Validates that V2 plastic is the gentlest degradation path.
    Derivation: 1 - 0.020·ln(201) ≈ 0.894 > 0.78.
    """
    n = 200
    v2_plastic = apply_degradation_v2(_ball(2.50, 0.040, 0.015, "plastic"), n)
    v1_cap = 1.0 - V1_DECAY_RATE  # 0.78

    assert v2_plastic["_degradation_factor"] > v1_cap, (
        f"V2 plastic factor ({v2_plastic['_degradation_factor']:.4f}) must be "
        f"> V1 cap ({v1_cap}) at N={n}"
    )


# ═══════════════════════════════════════════════════════════════════════════
# COMPARE_MODELS — structure and value integrity
# ═══════════════════════════════════════════════════════════════════════════

def test_compare_models_structure():
    row = _ball(2.50, 0.040, 0.015, "plastic")
    res = compare_models(row, 50)

    for key in ("original", "v1_linear", "v2_logarithmic", "game_count"):
        assert key in res, f"Missing top-level key: {key}"

    assert res["game_count"] == 50

    for section in ("original", "v1_linear", "v2_logarithmic"):
        for field in ("rg", "diff", "int_diff"):
            assert field in res[section], f"Missing '{field}' in '{section}'"
            assert isinstance(res[section][field], float)

    assert "factor" in res["v1_linear"]
    assert "factor" in res["v2_logarithmic"]
    assert "lambda" in res["v2_logarithmic"]
    assert "coverstock_type" in res["v2_logarithmic"]


def test_compare_models_original_matches_input():
    row = _ball(2.48, 0.055, 0.020, "solid reactive")
    res = compare_models(row, 100)
    assert res["original"]["rg"] == pytest.approx(2.48)
    assert res["original"]["diff"] == pytest.approx(0.055)
    assert res["original"]["int_diff"] == pytest.approx(0.020)


def test_compare_models_coverstock_preserved():
    row = _ball(2.50, 0.040, 0.015, "plastic")
    res = compare_models(row, 50)
    assert res["v2_logarithmic"]["coverstock_type"] == "plastic"


def test_compare_models_v1_le_original():
    row = _ball(2.50, 0.040, 0.015, "urethane")
    res = compare_models(row, 60)
    assert res["v1_linear"]["rg"] <= res["original"]["rg"]
    assert res["v1_linear"]["diff"] <= res["original"]["diff"]


def test_compare_models_zero_games_factors_one():
    row = _ball(2.50, 0.040, 0.015, "solid reactive")
    res = compare_models(row, 0)
    assert res["v1_linear"]["factor"] == pytest.approx(1.0)
    assert res["v2_logarithmic"]["factor"] == pytest.approx(1.0)
