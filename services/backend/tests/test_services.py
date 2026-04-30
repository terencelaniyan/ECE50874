import pytest
from unittest.mock import MagicMock, call
from psycopg import sql

from app import services
from app.exceptions import NotFoundError, ValidationError

def test_validate_ball_ids_success():
    mock_cur = MagicMock()
    mock_cur.fetchall.return_value = [{"ball_id": "b1"}, {"ball_id": "b2"}]
    
    # Should not raise
    services.validate_ball_ids(mock_cur, ["b1", "b2"])
    
def test_validate_ball_ids_missing():
    mock_cur = MagicMock()
    mock_cur.fetchall.return_value = [{"ball_id": "b1"}]
    
    with pytest.raises(ValidationError) as exc:
        services.validate_ball_ids(mock_cur, ["b1", "b2"])
        
    assert "missing" in exc.value.detail
    assert exc.value.detail["missing"] == ["b2"]

def test_load_arsenal_balls_not_found():
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = None
    
    with pytest.raises(NotFoundError):
        services.load_arsenal_balls(mock_cur, "fake-uuid")

def test_load_arsenal_balls_success():
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = {"id": "fake-uuid", "name": "Fake"}
    mock_cur.fetchall.side_effect = [
        [{"ball_id": "b1", "game_count": 10}],
        [{"ball_id": "b1", "name": "Ball 1"}]
    ]
    
    result = services.load_arsenal_balls(mock_cur, "fake-uuid")
    assert len(result) == 1
    assert result[0] == ({"ball_id": "b1", "name": "Ball 1"}, 10)

def test_check_health():
    mock_conn = MagicMock()
    mock_cur = mock_conn.cursor.return_value.__enter__.return_value
    mock_cur.fetchone.return_value = {"ok": 1}
    
    assert services.check_health(mock_conn) == {"status": "ok", "db": 1}

def test_get_ball_found():
    mock_conn = MagicMock()
    mock_cur = mock_conn.cursor.return_value.__enter__.return_value
    mock_cur.fetchone.return_value = {"ball_id": "b1", "name": "Test"}
    
    res = services.get_ball(mock_conn, "b1")
    assert res == {"ball_id": "b1", "name": "Test"}
    
    mock_cur.execute.assert_called_once()
    args, kwargs = mock_cur.execute.call_args
    assert "WHERE ball_id = %s" in args[0]
    assert args[1] == ("b1",)

def test_delete_arsenal_not_found():
    mock_conn = MagicMock()
    mock_cur = mock_conn.cursor.return_value.__enter__.return_value
    mock_cur.fetchone.return_value = None
    
    with pytest.raises(NotFoundError):
        services.delete_arsenal(mock_conn, "fake")

def test_delete_arsenal_success():
    mock_conn = MagicMock()
    mock_cur = mock_conn.cursor.return_value.__enter__.return_value
    mock_cur.fetchone.return_value = {"id": "fake"}
    
    services.delete_arsenal(mock_conn, "fake")
    mock_conn.commit.assert_called_once()

def test_resolve_arsenal_rows_ad_hoc():
    mock_conn = MagicMock()
    mock_cur = mock_conn.cursor.return_value.__enter__.return_value
    mock_cur.fetchall.return_value = [
        {"ball_id": "b1", "rg": 2.50, "diff": 0.05, "surface_grit": "2000 Grit"}
    ]

    rows, ids = services.resolve_arsenal_rows(mock_conn, None, ["b1"], {"b1": 50})
    assert ids == ["b1"]
    assert len(rows) == 1
    # Check if degradation was applied
    assert rows[0]["rg"] != 2.50


# ── validate_ball_ids edge cases ─────────────────────────────────────────────

def test_validate_ball_ids_empty_list_is_noop():
    """validate_ball_ids with an empty list should not execute any SQL."""
    mock_cur = MagicMock()
    services.validate_ball_ids(mock_cur, [])
    mock_cur.execute.assert_not_called()


# ── get_ball ─────────────────────────────────────────────────────────────────

def test_get_ball_raises_not_found():
    """get_ball raises NotFoundError when the ball does not exist."""
    mock_conn = MagicMock()
    mock_cur = mock_conn.cursor.return_value.__enter__.return_value
    mock_cur.fetchone.return_value = None

    with pytest.raises(NotFoundError):
        services.get_ball(mock_conn, "NONEXISTENT")


# ── list_arsenals ─────────────────────────────────────────────────────────────

def test_list_arsenals_returns_formatted_list():
    """list_arsenals maps DB rows to dicts with id, name, and ball_count."""
    mock_conn = MagicMock()
    mock_cur = mock_conn.cursor.return_value.__enter__.return_value
    mock_cur.fetchall.return_value = [
        {"id": "uuid-1", "name": "My Arsenal", "ball_count": 3},
        {"id": "uuid-2", "name": "Spare Kit", "ball_count": 1},
    ]

    result = services.list_arsenals(mock_conn)

    assert len(result) == 2
    assert result[0] == {"id": "uuid-1", "name": "My Arsenal", "ball_count": 3}
    assert result[1] == {"id": "uuid-2", "name": "Spare Kit", "ball_count": 1}


def test_list_arsenals_empty_db_returns_empty_list():
    mock_conn = MagicMock()
    mock_cur = mock_conn.cursor.return_value.__enter__.return_value
    mock_cur.fetchall.return_value = []

    result = services.list_arsenals(mock_conn)
    assert result == []


# ── get_arsenal ───────────────────────────────────────────────────────────────

def test_get_arsenal_not_found():
    """get_arsenal raises NotFoundError when the arsenal does not exist."""
    mock_conn = MagicMock()
    mock_cur = mock_conn.cursor.return_value.__enter__.return_value
    mock_cur.fetchone.return_value = None

    with pytest.raises(NotFoundError):
        services.get_arsenal(mock_conn, "missing-uuid")


def test_get_arsenal_success_returns_balls():
    """get_arsenal returns id, name, balls, and custom_balls."""
    mock_conn = MagicMock()
    mock_cur = mock_conn.cursor.return_value.__enter__.return_value
    mock_cur.fetchone.return_value = {"id": "aa-bb", "name": "Test Arsenal"}
    # First fetchall → arsenal_balls rows; second → custom_balls (via _get_arsenal_custom_balls)
    mock_cur.fetchall.side_effect = [
        [{"ball_id": "b1", "game_count": 10}],
        [],
    ]

    result = services.get_arsenal(mock_conn, "aa-bb")

    assert result["id"] == "aa-bb"
    assert result["name"] == "Test Arsenal"
    assert len(result["balls"]) == 1
    assert result["balls"][0] == {"ball_id": "b1", "game_count": 10}
    assert result["custom_balls"] == []


def test_get_arsenal_success_with_no_balls():
    """get_arsenal works when arsenal has zero catalog or custom balls."""
    mock_conn = MagicMock()
    mock_cur = mock_conn.cursor.return_value.__enter__.return_value
    mock_cur.fetchone.return_value = {"id": "aa-bb", "name": "Empty"}
    mock_cur.fetchall.side_effect = [[], []]

    result = services.get_arsenal(mock_conn, "aa-bb")
    assert result["balls"] == []
    assert result["custom_balls"] == []

