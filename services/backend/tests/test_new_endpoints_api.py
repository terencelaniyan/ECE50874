"""Integration tests for POST /recommendations/v2, POST /slots, POST /degradation/compare."""
import os
from dotenv import load_dotenv

load_dotenv()

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration




def _get_one_ball_id(client: TestClient) -> str:
    r = client.get("/balls?limit=1")
    assert r.status_code == 200
    data = r.json()
    assert data["count"] >= 1, "Need at least one ball in DB for tests"
    return data["items"][0]["ball_id"]


def _get_multiple_ball_ids(client: TestClient, n: int = 3) -> list[str]:
    r = client.get(f"/balls?limit={n}")
    assert r.status_code == 200
    data = r.json()
    assert data["count"] >= n, f"Need at least {n} balls in DB for tests"
    return [item["ball_id"] for item in data["items"]]


# ── POST /recommendations/v2 ─────────────────────────────────────────────


def test_recommendations_v2_neither_arsenal_id_nor_ball_ids_returns_400(client):
    response = client.post("/recommendations/v2", json={"k": 5})
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert "arsenal" in data["detail"].lower() or "ball" in data["detail"].lower()


def test_recommendations_v2_both_arsenal_id_and_ball_ids_returns_400(client):
    response = client.post(
        "/recommendations/v2",
        json={
            "arsenal_id": "550e8400-e29b-41d4-a716-446655440000",
            "arsenal_ball_ids": ["B001"],
            "k": 5,
        },
    )
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert "either" in data["detail"].lower() or "not both" in data["detail"].lower()


def test_recommendations_v2_invalid_k_returns_422(client):
    response = client.post(
        "/recommendations/v2",
        json={"arsenal_ball_ids": ["B001"], "k": 0},
    )
    assert response.status_code == 422


def test_recommendations_v2_invalid_method_value_returns_422_or_ok(client):
    """Method is a free-form string, but the service layer may reject unknown values."""
    response = client.post(
        "/recommendations/v2",
        json={"arsenal_ball_ids": ["B001"], "method": ""},
    )
    # Empty string may fall back to KNN (200) or be rejected (400/422)
    assert response.status_code in (200, 400, 422)


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_recommendations_v2_invalid_ball_id_returns_400(client):
    response = client.post(
        "/recommendations/v2",
        json={"arsenal_ball_ids": ["NONEXISTENT_BALL_XYZ"], "k": 5},
    )
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert "missing" in data["detail"]
    assert "NONEXISTENT_BALL_XYZ" in data["detail"]["missing"]


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_recommendations_v2_knn_method_returns_200(client):
    ball_id = _get_one_ball_id(client)
    response = client.post(
        "/recommendations/v2",
        json={
            "arsenal_ball_ids": [ball_id],
            "k": 5,
            "method": "knn",
            "metric": "l2",
            "normalize": True,
            "degradation_model": "v1",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)
    assert "method" in data
    assert "degradation_model" in data
    assert "normalized" in data
    for item in data["items"]:
        assert "ball" in item
        assert "score" in item
        assert "method" in item
        assert "ball_id" in item["ball"]
        assert "rg" in item["ball"]
        assert "diff" in item["ball"]
        assert isinstance(item["score"], (int, float))


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_recommendations_v2_two_tower_method_returns_200(client):
    ball_id = _get_one_ball_id(client)
    response = client.post(
        "/recommendations/v2",
        json={
            "arsenal_ball_ids": [ball_id],
            "k": 5,
            "method": "two_tower",
            "degradation_model": "v2",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)
    assert "method" in data


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_recommendations_v2_hybrid_method_returns_200(client):
    ball_id = _get_one_ball_id(client)
    response = client.post(
        "/recommendations/v2",
        json={
            "arsenal_ball_ids": [ball_id],
            "k": 5,
            "method": "hybrid",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "method" in data


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_recommendations_v2_l1_vs_l2_metric(client):
    ball_id = _get_one_ball_id(client)
    r_l1 = client.post(
        "/recommendations/v2",
        json={"arsenal_ball_ids": [ball_id], "k": 3, "method": "knn", "metric": "l1"},
    )
    r_l2 = client.post(
        "/recommendations/v2",
        json={"arsenal_ball_ids": [ball_id], "k": 3, "method": "knn", "metric": "l2"},
    )
    assert r_l1.status_code == 200
    assert r_l2.status_code == 200
    # Both should return valid results (scores may differ)
    assert len(r_l1.json()["items"]) > 0
    assert len(r_l2.json()["items"]) > 0


# ── POST /slots ──────────────────────────────────────────────────────────


def test_slots_neither_arsenal_id_nor_ball_ids_returns_400(client):
    response = client.post("/slots", json={})
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert "arsenal" in data["detail"].lower() or "ball" in data["detail"].lower()


def test_slots_both_arsenal_id_and_ball_ids_returns_400(client):
    response = client.post(
        "/slots",
        json={
            "arsenal_id": "550e8400-e29b-41d4-a716-446655440000",
            "arsenal_ball_ids": ["B001"],
        },
    )
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert "either" in data["detail"].lower() or "not both" in data["detail"].lower()


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_slots_invalid_ball_id_returns_400(client):
    """Unknown ball IDs should be rejected with validation details."""
    response = client.post(
        "/slots",
        json={"arsenal_ball_ids": ["NONEXISTENT_BALL_XYZ"]},
    )
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert "missing" in data["detail"]
    assert "NONEXISTENT_BALL_XYZ" in data["detail"]["missing"]


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_recommendations_v2_invalid_arsenal_id_returns_404(client):
    response = client.post(
        "/recommendations/v2",
        json={"arsenal_id": "550e8400-e29b-41d4-a716-446655440000", "k": 3},
    )
    assert response.status_code == 404
    data = response.json()
    assert data["detail"] == "Arsenal not found"


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_slots_invalid_arsenal_id_returns_404(client):
    response = client.post(
        "/slots",
        json={"arsenal_id": "550e8400-e29b-41d4-a716-446655440000"},
    )
    assert response.status_code == 404
    data = response.json()
    assert data["detail"] == "Arsenal not found"


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_slots_valid_request_returns_200(client):
    ball_ids = _get_multiple_ball_ids(client, n=3)
    response = client.post(
        "/slots",
        json={"arsenal_ball_ids": ball_ids},
    )
    assert response.status_code == 200
    data = response.json()
    assert "assignments" in data
    assert isinstance(data["assignments"], list)
    assert "best_k" in data
    assert "silhouette_score" in data
    assert "slot_coverage" in data
    assert isinstance(data["slot_coverage"], list)
    for assignment in data["assignments"]:
        assert "ball_id" in assignment
        assert "slot" in assignment
        assert "slot_name" in assignment
        assert "slot_description" in assignment
        assert "rg" in assignment
        assert "diff" in assignment
        assert 1 <= assignment["slot"] <= 6
    for coverage in data["slot_coverage"]:
        assert "slot" in coverage
        assert "name" in coverage
        assert "covered" in coverage
        assert isinstance(coverage["covered"], bool)


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_slots_with_game_counts(client):
    ball_ids = _get_multiple_ball_ids(client, n=3)
    game_counts = {bid: 50 for bid in ball_ids}
    response = client.post(
        "/slots",
        json={"arsenal_ball_ids": ball_ids, "game_counts": game_counts},
    )
    assert response.status_code == 200
    data = response.json()
    assert "assignments" in data
    assert len(data["assignments"]) == len(ball_ids)


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_slots_via_arsenal_id(client):
    ball_ids = _get_multiple_ball_ids(client, n=3)
    create = client.post(
        "/arsenals",
        json={
            "name": "Slots test",
            "balls": [{"custom": False, "ball_id": bid, "game_count": 0} for bid in ball_ids],
        },
    )
    assert create.status_code == 201
    aid = create.json()["id"]
    response = client.post("/slots", json={"arsenal_id": aid})
    assert response.status_code == 200
    data = response.json()
    assert "assignments" in data
    assert len(data["assignments"]) == len(ball_ids)
    # Clean up
    client.delete(f"/arsenals/{aid}")


# ── POST /degradation/compare ────────────────────────────────────────────


def test_degradation_compare_defaults_returns_200(client):
    """Degradation compare with all defaults (no ball_id, uses inline specs)."""
    response = client.post("/degradation/compare", json={})
    assert response.status_code == 200
    data = response.json()
    assert "original" in data
    assert "v1_linear" in data
    assert "v2_logarithmic" in data
    assert "game_count" in data
    assert "v2_lambda" in data
    # Original factor should always be 1.0
    assert data["original"]["factor"] == 1.0
    # Verify the degradation models return valid numeric results
    for model_key in ("original", "v1_linear", "v2_logarithmic"):
        result = data[model_key]
        assert "rg" in result
        assert "diff" in result
        assert "int_diff" in result
        assert "factor" in result
        assert isinstance(result["rg"], (int, float))
        assert isinstance(result["diff"], (int, float))
        assert isinstance(result["int_diff"], (int, float))
        assert isinstance(result["factor"], (int, float))


def test_degradation_compare_custom_specs_returns_200(client):
    response = client.post(
        "/degradation/compare",
        json={
            "rg": 2.48,
            "diff": 0.055,
            "int_diff": 0.020,
            "coverstock_type": "Solid Reactive",
            "game_count": 100,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["game_count"] == 100
    assert data["coverstock_type"] == "Solid Reactive"
    # With 100 games, degraded values should differ from original
    assert data["v1_linear"]["factor"] != 1.0
    assert data["v2_logarithmic"]["factor"] != 1.0


def test_degradation_compare_minimal_games_near_no_degradation(client):
    """game_count=1 should produce very little degradation (factor near 1.0).
    Note: game_count=0 currently causes an internal error (log(0) edge case)."""
    response = client.post(
        "/degradation/compare",
        json={"rg": 2.50, "diff": 0.040, "int_diff": 0.015, "game_count": 1},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["game_count"] == 1
    # With 1 game, V1 linear factor should be very close to 1.0
    assert data["v1_linear"]["factor"] > 0.98
    # V2 logarithmic factor should also be near 1.0
    assert data["v2_logarithmic"]["factor"] > 0.95


def test_degradation_compare_invalid_rg_returns_422(client):
    response = client.post(
        "/degradation/compare",
        json={"rg": 1.0, "diff": 0.04, "int_diff": 0.01, "game_count": 50},
    )
    assert response.status_code == 422


def test_degradation_compare_invalid_diff_returns_422(client):
    response = client.post(
        "/degradation/compare",
        json={"rg": 2.50, "diff": 0.5, "int_diff": 0.01, "game_count": 50},
    )
    assert response.status_code == 422


def test_degradation_compare_invalid_game_count_returns_422(client):
    response = client.post(
        "/degradation/compare",
        json={"rg": 2.50, "diff": 0.04, "int_diff": 0.01, "game_count": -1},
    )
    assert response.status_code == 422


def test_degradation_compare_game_count_exceeds_max_returns_422(client):
    response = client.post(
        "/degradation/compare",
        json={"rg": 2.50, "diff": 0.04, "int_diff": 0.01, "game_count": 999},
    )
    assert response.status_code == 422


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_degradation_compare_with_ball_id_returns_200(client):
    ball_id = _get_one_ball_id(client)
    response = client.post(
        "/degradation/compare",
        json={"ball_id": ball_id, "game_count": 75},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["game_count"] == 75
    assert "original" in data
    assert "v1_linear" in data
    assert "v2_logarithmic" in data


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_degradation_compare_nonexistent_ball_id_returns_404(client):
    response = client.post(
        "/degradation/compare",
        json={"ball_id": "NONEXISTENT_BALL_XYZ", "game_count": 50},
    )
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert "NONEXISTENT_BALL_XYZ" in data["detail"]
