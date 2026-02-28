"""Unit tests for recommendation_engine (dist and recommend; no database)."""
import pytest

from app.recommendation_engine import dist, recommend


def _ball(ball_id: str, rg: float, diff: float, int_diff: float = 0.015):
    return {"ball_id": ball_id, "rg": rg, "diff": diff, "int_diff": int_diff}


def test_dist_same_ball_zero():
    b = _ball("A", 2.50, 0.040, 0.020)
    assert dist(b, b) == 0.0


def test_dist_different_balls_positive():
    a = _ball("A", 2.50, 0.040, 0.020)
    b = _ball("B", 2.52, 0.045, 0.018)
    d = dist(a, b)
    assert d > 0
    assert d == pytest.approx(0.02 + 0.005 + 0.002, rel=1e-5)


def test_dist_weights():
    a = _ball("A", 1.0, 0.0, 0.0)
    b = _ball("B", 2.0, 0.0, 0.0)
    assert dist(a, b, w_rg=1.0) == pytest.approx(1.0, rel=1e-5)
    assert dist(a, b, w_rg=2.0) == pytest.approx(2.0, rel=1e-5)


def test_recommend_empty_arsenal_returns_empty():
    candidates = [_ball("C", 2.55, 0.050)]
    assert recommend(arsenal_rows=[], candidate_rows=candidates, k=5) == []


def test_recommend_empty_candidates_returns_empty():
    arsenal = [_ball("A", 2.50, 0.040)]
    assert recommend(arsenal_rows=arsenal, candidate_rows=[], k=5) == []


def test_recommend_returns_sorted_by_score_ascending():
    arsenal = [_ball("A", 2.50, 0.040, 0.020)]
    candidates = [
        _ball("B", 2.52, 0.042, 0.019),
        _ball("C", 2.48, 0.038, 0.021),
        _ball("D", 2.60, 0.055, 0.025),
    ]
    result = recommend(arsenal_rows=arsenal, candidate_rows=candidates, k=3)
    assert len(result) == 3
    scores = [r[1] for r in result]
    assert scores == sorted(scores)
    ball_ids = [r[0]["ball_id"] for r in result]
    assert set(ball_ids) == {"B", "C", "D"}
    assert result[0][1] <= result[1][1] <= result[2][1]
    assert result[2][0]["ball_id"] == "D"


def test_recommend_k_respected():
    arsenal = [_ball("A", 2.50, 0.040)]
    candidates = [_ball(f"B{i}", 2.50 + i * 0.05, 0.040) for i in range(5)]
    result = recommend(arsenal_rows=arsenal, candidate_rows=candidates, k=2)
    assert len(result) == 2


def test_recommend_fewer_than_k_candidates_returns_all():
    arsenal = [_ball("A", 2.50, 0.040)]
    candidates = [_ball("B", 2.52, 0.042), _ball("C", 2.55, 0.045)]
    result = recommend(arsenal_rows=arsenal, candidate_rows=candidates, k=10)
    assert len(result) == 2
    assert result[0][0]["ball_id"] == "B"
    assert result[1][0]["ball_id"] == "C"


def test_recommend_score_is_min_distance_to_arsenal():
    arsenal = [
        _ball("A1", 2.50, 0.040),
        _ball("A2", 2.70, 0.060),
    ]
    candidate = _ball("C", 2.55, 0.050)
    result = recommend(arsenal_rows=arsenal, candidate_rows=[candidate], k=1)
    assert len(result) == 1
    ball, score = result[0]
    assert ball["ball_id"] == "C"
    d1 = dist(candidate, arsenal[0])
    d2 = dist(candidate, arsenal[1])
    assert score == pytest.approx(min(d1, d2), rel=1e-5)


def test_recommend_with_weights_changes_ordering():
    arsenal = [_ball("A", 2.50, 0.040, 0.020)]
    # B closer in rg (0.01), C closer in diff (0.001); equal weights favor B
    candidates = [
        _ball("B", 2.51, 0.050, 0.020),  # rg 0.01, diff 0.01
        _ball("C", 2.55, 0.041, 0.020),  # rg 0.05, diff 0.001
    ]
    result_default = recommend(arsenal_rows=arsenal, candidate_rows=candidates, k=2)
    result_favor_diff = recommend(
        arsenal_rows=arsenal, candidate_rows=candidates, k=2, w_rg=0.1, w_diff=10.0
    )
    assert result_default[0][0]["ball_id"] == "B"
    assert result_favor_diff[0][0]["ball_id"] == "C"


def test_recommend_diversity_excludes_very_similar():
    arsenal = [_ball("A", 2.50, 0.040)]
    # B1, B2 almost identical; B3 farther
    candidates = [
        _ball("B1", 2.501, 0.0401, 0.020),
        _ball("B2", 2.502, 0.0402, 0.020),
        _ball("B3", 2.55, 0.050, 0.025),
    ]
    without = recommend(arsenal_rows=arsenal, candidate_rows=candidates, k=3)
    with_diversity = recommend(
        arsenal_rows=arsenal,
        candidate_rows=candidates,
        k=3,
        diversity_min_distance=0.02,
    )
    assert len(without) == 3
    assert len(with_diversity) == 2  # B1 and B3; B2 too close to B1
    ids_diverse = [r[0]["ball_id"] for r in with_diversity]
    assert "B1" in ids_diverse
    assert "B3" in ids_diverse
    assert "B2" not in ids_diverse
