"""Integration tests for POST /gaps (require DATABASE_URL and seeded balls table)."""
import os
from dotenv import load_dotenv

load_dotenv()

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration




def test_gaps_both_arsenal_id_and_ball_ids_returns_400(client):
    """No DB required: API must reject requests that send both arsenal_id and arsenal_ball_ids."""
    response = client.post(
        "/gaps",
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
    reason="DATABASE_URL not set; integration tests need a running Postgres with seeded balls",
)
def test_gaps_empty_arsenal_returns_200_and_zones(client):
    response = client.post("/gaps", json={"arsenal_ball_ids": [], "k": 5})
    assert response.status_code == 200
    data = response.json()
    assert "zones" in data
    assert isinstance(data["zones"], list)
    for zone in data["zones"]:
        assert "center" in zone
        assert "label" in zone
        assert "description" in zone
        assert "balls" in zone
        assert len(zone["center"]) == 2
        assert isinstance(zone["balls"], list)


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
