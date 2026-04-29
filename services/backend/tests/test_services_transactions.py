"""Tests for transaction rollback behavior in create_arsenal and update_arsenal."""
import pytest
from unittest.mock import MagicMock, call
from app import services
from app.exceptions import NotFoundError


def _make_conn(fetchone_value=None, fetchall_value=None):
    """Build a minimal mock connection with a cursor."""
    cur = MagicMock()
    cur.__enter__.return_value = cur
    cur.__exit__.return_value = None
    cur.fetchone.return_value = fetchone_value
    cur.fetchall.return_value = fetchall_value or []
    conn = MagicMock()
    conn.cursor.return_value = cur
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = None
    return conn, cur


# ── create_arsenal ────────────────────────────────────────────────────────────

def test_create_arsenal_commits_on_success():
    conn, cur = _make_conn(fetchone_value={"id": "aaaa-bbbb", "name": "Test"})
    result = services.create_arsenal(conn, "Test", balls=[])
    conn.commit.assert_called_once()
    conn.rollback.assert_not_called()
    assert result["id"] == "aaaa-bbbb"
    assert result["name"] == "Test"
    assert result["balls"] == []


def test_create_arsenal_rollback_on_insert_error():
    conn, cur = _make_conn()
    cur.execute.side_effect = Exception("insert failed")

    with pytest.raises(Exception, match="insert failed"):
        services.create_arsenal(conn, "Fail", balls=[])

    conn.rollback.assert_called_once()
    conn.commit.assert_not_called()


def test_create_arsenal_rollback_on_ball_insert_error():
    """Rollback fires even when the arsenal row was created but a ball insert fails."""
    conn, cur = _make_conn(fetchone_value={"id": "aaaa-bbbb", "name": "Partial"})
    # validate_ball_ids SELECT must succeed → return the ball as found
    cur.fetchall.return_value = [{"ball_id": "b1"}]
    # execute[0]: validate query; execute[1]: INSERT arsenals; execute[2]: INSERT arsenal_balls → raises
    cur.execute.side_effect = [None, None, Exception("ball insert failed")]

    with pytest.raises(Exception, match="ball insert failed"):
        services.create_arsenal(conn, "Partial", balls=[{"ball_id": "b1", "game_count": 0}])

    conn.rollback.assert_called_once()
    conn.commit.assert_not_called()


def test_create_arsenal_validate_raises_triggers_rollback():
    """ValidationError from validate_ball_ids still triggers rollback."""
    from app.exceptions import ValidationError
    conn, cur = _make_conn()
    # validate_ball_ids queries balls table and finds nothing
    cur.fetchall.return_value = []  # no balls found → missing IDs

    with pytest.raises(ValidationError):
        services.create_arsenal(conn, "Bad IDs", balls=[{"ball_id": "FAKE", "game_count": 0}])

    conn.rollback.assert_called_once()
    conn.commit.assert_not_called()


# ── update_arsenal ────────────────────────────────────────────────────────────

def test_update_arsenal_commits_on_success():
    conn, cur = _make_conn(fetchone_value={"id": "aaaa-bbbb", "name": "Old"})
    services.update_arsenal(conn, "aaaa-bbbb", name="New")
    conn.commit.assert_called_once()
    conn.rollback.assert_not_called()


def test_update_arsenal_rollback_on_update_error():
    conn, cur = _make_conn(fetchone_value={"id": "aaaa-bbbb", "name": "Old"})
    # SELECT succeeds; UPDATE raises
    cur.execute.side_effect = [None, Exception("update failed")]

    with pytest.raises(Exception, match="update failed"):
        services.update_arsenal(conn, "aaaa-bbbb", name="New")

    conn.rollback.assert_called_once()
    conn.commit.assert_not_called()


def test_update_arsenal_not_found_raises_not_found_error():
    conn, cur = _make_conn(fetchone_value=None)

    with pytest.raises(NotFoundError):
        services.update_arsenal(conn, "missing-uuid", name="X")

    conn.commit.assert_not_called()


def test_update_arsenal_rollback_on_ball_replace_error():
    """Rollback fires when the ball-replace DELETE or INSERT fails."""
    conn, cur = _make_conn(fetchone_value={"id": "aaaa-bbbb", "name": "Old"})
    # SELECT ok, no name update, DELETE arsenal_balls raises
    cur.execute.side_effect = [None, Exception("delete failed")]

    with pytest.raises(Exception, match="delete failed"):
        services.update_arsenal(conn, "aaaa-bbbb", balls=[])

    conn.rollback.assert_called_once()
    conn.commit.assert_not_called()
