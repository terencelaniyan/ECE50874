"""Integration tests for POST /gaps (require DATABASE_URL and seeded balls table)."""
import os

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need a running Postgres with seeded balls",
)
def test_gaps_empty_arsenal_returns_200_and_items(client):
    response = client.post("/gaps", json={"arsenal_ball_ids": [], "k": 5})
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert isinstance(data["items"], list)


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need a running Postgres with seeded balls",
)
def test_gaps_invalid_arsenal_id_returns_400_with_missing(client):
    response = client.post(
        "/gaps",
        json={"arsenal_ball_ids": ["NONEXISTENT_ID_XYZ"], "k": 5},
    )
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
    assert "missing" in data["detail"]
    assert "NONEXISTENT_ID_XYZ" in data["detail"]["missing"]
