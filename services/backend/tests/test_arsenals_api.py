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
        json={"name": "One ball", "balls": [{"custom": False, "ball_id": ball_id, "game_count": 10}]},
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
        json={"name": "Updated", "balls": [{"custom": False, "ball_id": ball_id, "game_count": 5}]},
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
        json={"balls": [{"custom": False, "ball_id": "NONEXISTENT_BALL_XYZ", "game_count": 0}]},
    )
    assert response.status_code == 400
    assert "missing" in response.json()["detail"]


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason="DATABASE_URL not set; integration tests need Postgres with seeded balls",
)
def test_create_arsenal_with_custom_ball_and_get(client):
    create = client.post(
        "/arsenals",
        json={
            "name": "With custom",
            "balls": [
                {
                    "custom": True,
                    "name": "My spare",
                    "rg": 2.55,
                    "diff": 0.02,
                    "int_diff": 0.0,
                    "surface_grit": "2000 Grit",
                    "game_count": 5,
                }
            ],
        },
    )
    assert create.status_code == 201
    data = create.json()
    assert data["name"] == "With custom"
    assert data["balls"] == []
    assert len(data["custom_balls"]) == 1
    cb = data["custom_balls"][0]
    assert cb["name"] == "My spare"
    assert cb["rg"] == 2.55
    assert cb["diff"] == 0.02
    assert cb["int_diff"] == 0.0
    assert cb["surface_grit"] == "2000 Grit"
    assert cb["game_count"] == 5
    assert "id" in cb
    aid = data["id"]
    get_r = client.get(f"/arsenals/{aid}")
    assert get_r.status_code == 200
    get_data = get_r.json()
    assert len(get_data["custom_balls"]) == 1
    assert get_data["custom_balls"][0]["name"] == "My spare"
