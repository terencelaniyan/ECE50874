"""Unit tests for degradation.apply_degradation (FR5)."""
import pytest

from app.degradation import apply_degradation, apply_degradation_v2, compare_models, _get_lambda, DEFAULT_LAMBDA


def _ball(rg: float, diff: float, int_diff: float = 0.015, coverstock_type: str = ""):
    return {"ball_id": "B1", "rg": rg, "diff": diff, "int_diff": int_diff, "coverstock_type": coverstock_type}


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
    """Spec: effective hook rating degraded by 22% due to 87 games -> factor 0.78."""
    row = _ball(2.50, 0.040, 0.020)
    out = apply_degradation(row, 87)
    assert out["rg"] == pytest.approx(2.50 * 0.78, rel=1e-5)
    assert out["diff"] == pytest.approx(0.040 * 0.78, rel=1e-5)
    assert out["int_diff"] == pytest.approx(0.020 * 0.78, rel=1e-5)


def test_more_than_max_games_caps_factor():
    """Beyond MAX_GAMES the factor does not decrease further."""
    row = _ball(2.50, 0.040)
    out_87 = apply_degradation(row, 87)
    out_200 = apply_degradation(row, 200)
    assert out_200["rg"] == pytest.approx(out_87["rg"], rel=1e-5)
    assert out_200["diff"] == pytest.approx(out_87["diff"], rel=1e-5)


def test_copy_unchanged_fields():
    row = {"ball_id": "X", "name": "Test", "rg": 2.5, "diff": 0.04, "int_diff": 0.01}
    out = apply_degradation(row, 50)
    assert out["ball_id"] == "X"
    assert out["name"] == "Test"
    assert out["rg"] != 2.5
    assert out["diff"] != 0.04

def test_get_lambda():
    assert _get_lambda("Solid Reactive") == 0.065
    assert _get_lambda("pearl reactive (hybrid)") == 0.055
    assert _get_lambda(None) == DEFAULT_LAMBDA

def test_apply_degradation_v2_zero_games():
    row = _ball(2.50, 0.040, 0.015, "urethane")
    out = apply_degradation_v2(row, 0)
    assert out["_degradation_factor"] == 1.0
    assert out["_degradation_lambda"] == 0.035
    assert out["rg"] == 2.50

def test_apply_degradation_v2_active_games():
    row = _ball(2.50, 0.040, 0.015, "solid reactive")
    out = apply_degradation_v2(row, 100)
    assert out["_degradation_factor"] < 1.0
    assert out["rg"] < 2.50
    assert out["int_diff"] < 0.015

def test_compare_models():
    row = _ball(2.50, 0.040, 0.015, "plastic")
    res = compare_models(row, 50)
    assert "v1_linear" in res
    assert "v2_logarithmic" in res
    assert res["v2_logarithmic"]["coverstock_type"] == "plastic"
