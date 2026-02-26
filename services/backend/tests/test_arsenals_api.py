"""Integration tests for arsenals CRUD (require DATABASE_URL and seeded balls)."""
import os

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


def _get_one_ball_id(client: TestClient) -> str:
    r = client.get("/balls?limit=1")
    assert r.status_code == 200
    data = r.json()
    assert data["count"] >= 1, "Need at least one ball in DB for tests"
    return data["items"][0]["ball_id"]


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_create_arsenal_empty_returns_201_and_id(client):
    response = client.post("/arsenals", json={"name": "Empty", "balls": []})
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["name"] == "Empty"
    assert data["balls"] == []


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_create_arsenal_with_balls_and_get(client):
    ball_id = _get_one_ball_id(client)
    create = client.post(
        "/arsenals",
        json={"name": "One ball", "balls": [{"ball_id": ball_id, "game_count": 10}]},
    )
    assert create.status_code == 201
    aid = create.json()["id"]
    get_r = client.get(f"/arsenals/{aid}")
    assert get_r.status_code == 200
    data = get_r.json()
    assert data["id"] == aid
    assert data["name"] == "One ball"
    assert len(data["balls"]) == 1
    assert data["balls"][0]["ball_id"] == ball_id
    assert data["balls"][0]["game_count"] == 10


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_list_arsenals_includes_created(client):
    create = client.post("/arsenals", json={"name": "List test", "balls": []})
    assert create.status_code == 201
    aid = create.json()["id"]
    list_r = client.get("/arsenals?limit=10")
    assert list_r.status_code == 200
    items = list_r.json()
    ids = [a["id"] for a in items]
    assert aid in ids


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_update_arsenal_and_delete(client):
    ball_id = _get_one_ball_id(client)
    create = client.post("/arsenals", json={"name": "To update", "balls": []})
    assert create.status_code == 201
    aid = create.json()["id"]
    patch_r = client.patch(
        f"/arsenals/{aid}",
        json={"name": "Updated", "balls": [{"ball_id": ball_id, "game_count": 5}]},
    )
    assert patch_r.status_code == 200
    assert patch_r.json()["name"] == "Updated"
    assert len(patch_r.json()["balls"]) == 1
    del_r = client.delete(f"/arsenals/{aid}")
    assert del_r.status_code == 204
    get_r = client.get(f"/arsenals/{aid}")
    assert get_r.status_code == 404


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_create_arsenal_invalid_ball_id_returns_400(client):
    response = client.post(
        "/arsenals",
        json={"balls": [{"ball_id": "NONEXISTENT_BALL_XYZ", "game_count": 0}]},
    )
    assert response.status_code == 400
    assert "missing" in response.json()["detail"]
