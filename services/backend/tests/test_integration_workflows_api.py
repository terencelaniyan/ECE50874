"""Cross-endpoint integration workflows for arsenal lifecycle and contracts."""
import os

import pytest
from fastapi.testclient import TestClient



def _get_ball_ids(client: TestClient, limit: int = 3) -> list[str]:
    response = client.get(f"/balls?limit={limit}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] >= limit, f"Need at least {limit} seeded balls"
    return [item["ball_id"] for item in payload["items"]]


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason=(
        "DATABASE_URL not set; integration tests need Postgres "
        "with seeded balls"
    ),
)
def test_arsenal_lifecycle_drives_recs_gaps_and_slots(client):
    ball_ids = _get_ball_ids(client, limit=3)

    create_response = client.post(
        "/arsenals",
        json={
            "name": "Lifecycle chain",
            "balls": [
                {"custom": False, "ball_id": ball_ids[0], "game_count": 2},
                {"custom": False, "ball_id": ball_ids[1], "game_count": 8},
            ],
        },
    )
    assert create_response.status_code == 201
    arsenal_id = create_response.json()["id"]

    recs_response = client.post(
        "/recommendations", json={"arsenal_id": arsenal_id, "k": 5}
    )
    assert recs_response.status_code == 200
    assert isinstance(recs_response.json()["items"], list)

    gaps_response = client.post("/gaps", json={"arsenal_id": arsenal_id, "k": 5})
    assert gaps_response.status_code == 200
    assert isinstance(gaps_response.json()["zones"], list)

    slots_response = client.post("/slots", json={"arsenal_id": arsenal_id})
    assert slots_response.status_code == 200
    assignments = slots_response.json()["assignments"]
    assert len(assignments) == 2

    patch_response = client.patch(
        f"/arsenals/{arsenal_id}",
        json={
            "balls": [
                {"custom": False, "ball_id": ball_ids[0], "game_count": 2},
                {"custom": False, "ball_id": ball_ids[1], "game_count": 8},
                {"custom": False, "ball_id": ball_ids[2], "game_count": 0},
            ]
        },
    )
    assert patch_response.status_code == 200
    assert len(patch_response.json()["balls"]) == 3

    slots_after_patch = client.post("/slots", json={"arsenal_id": arsenal_id})
    assert slots_after_patch.status_code == 200
    assert len(slots_after_patch.json()["assignments"]) == 3

    delete_response = client.delete(f"/arsenals/{arsenal_id}")
    assert delete_response.status_code == 204
    not_found_response = client.get(f"/arsenals/{arsenal_id}")
    assert not_found_response.status_code == 404


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").strip(),
    reason=(
        "DATABASE_URL not set; integration tests need Postgres "
        "with seeded balls"
    ),
)
@pytest.mark.parametrize("method", ["knn", "two_tower", "hybrid"])
@pytest.mark.parametrize("degradation_model", ["v1", "v2"])
def test_recommendations_v2_method_matrix_returns_contract(
    client, method: str, degradation_model: str
):
    ball_ids = _get_ball_ids(client, limit=1)
    response = client.post(
        "/recommendations/v2",
        json={
            "arsenal_ball_ids": [ball_ids[0]],
            "k": 5,
            "method": method,
            "degradation_model": degradation_model,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] in {"knn", "two_tower", "hybrid"}
    assert payload["degradation_model"] in {"v1", "v2"}
    assert isinstance(payload["items"], list)
    if payload["items"]:
        first = payload["items"][0]
        assert "ball" in first
        assert "score" in first
        assert "method" in first


def _assert_detail_shape(detail):
    if isinstance(detail, str):
        assert len(detail) > 0
        return
    assert isinstance(detail, dict)
    assert "message" in detail


def test_error_contracts_are_consistent_across_endpoints(client):
    cases = [
        ("/recommendations", {"k": 5}),
        ("/recommendations/v2", {"k": 5}),
        ("/slots", {}),
        ("/gaps", {"arsenal_id": "id-1", "arsenal_ball_ids": ["B001"]}),
    ]

    for path, body in cases:
        response = client.post(path, json=body)
        assert response.status_code == 400
        _assert_detail_shape(response.json().get("detail"))
