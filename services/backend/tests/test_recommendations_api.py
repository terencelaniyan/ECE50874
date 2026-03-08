"""Integration tests for POST /recommendations (require DATABASE_URL and seeded balls)."""
import os
from dotenv import load_dotenv

load_dotenv()

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


def test_recommendations_neither_arsenal_id_nor_ball_ids_returns_400(client):
    response = client.post("/recommendations", json={"k": 5})
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert "arsenal" in data["detail"].lower() or "ball" in data["detail"].lower()


def test_recommendations_both_arsenal_id_and_ball_ids_returns_400(client):
    response = client.post(
        "/recommendations",
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


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_recommendations_invalid_ball_id_returns_400_with_missing(client):
    response = client.post(
        "/recommendations",
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
def test_recommendations_valid_request_returns_200_and_items(client):
    r = client.get("/balls?limit=1")
    assert r.status_code == 200
    data = r.json()
    if data["count"] < 1:
        pytest.skip("Need at least one ball in DB")
    ball_id = data["items"][0]["ball_id"]
    response = client.post(
        "/recommendations",
        json={"arsenal_ball_ids": [ball_id], "k": 5},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)
    for item in data["items"]:
        assert "ball" in item
        assert "score" in item
        assert "ball_id" in item["ball"]
        assert "rg" in item["ball"]
        assert "diff" in item["ball"]
        assert "int_diff" in item["ball"]
        assert isinstance(item["score"], (int, float))
