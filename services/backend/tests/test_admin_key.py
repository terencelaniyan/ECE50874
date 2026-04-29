"""Tests for admin key authentication — no real DB or subprocess required."""
import hmac
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


def _make_client_with_mock_db():
    from app.main import app
    from app.db import get_db

    cur = MagicMock()
    cur.__enter__.return_value = cur
    cur.__exit__.return_value = None
    cur.fetchall.return_value = []
    cur.fetchone.return_value = None
    conn = MagicMock()
    conn.cursor.return_value = cur
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = None

    def _mock_db():
        yield conn

    app.dependency_overrides[get_db] = _mock_db
    client = TestClient(app, raise_server_exceptions=False)
    return client, app, get_db


# ── 403 when no key is set on the server side ─────────────────────────────────

def test_no_key_header_returns_403_when_admin_key_configured():
    client, app, get_db = _make_client_with_mock_db()
    try:
        with patch("app.main.ADMIN_KEY", "secret"):
            r = client.post("/admin/refresh-catalog")
        assert r.status_code == 403
        assert r.json()["detail"] == "Invalid or missing X-Admin-Key"
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_wrong_key_header_returns_403():
    client, app, get_db = _make_client_with_mock_db()
    try:
        with patch("app.main.ADMIN_KEY", "secret"):
            r = client.post(
                "/admin/refresh-catalog",
                headers={"X-Admin-Key": "wrong"},
            )
        assert r.status_code == 403
        assert r.json()["detail"] == "Invalid or missing X-Admin-Key"
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_empty_string_key_returns_403():
    client, app, get_db = _make_client_with_mock_db()
    try:
        with patch("app.main.ADMIN_KEY", "secret"):
            r = client.post(
                "/admin/refresh-catalog",
                headers={"X-Admin-Key": ""},
            )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)


# ── Admin key check is timing-safe ───────────────────────────────────────────

def test_require_admin_key_uses_compare_digest():
    """_require_admin_key must reach hmac.compare_digest (not plain string ==)."""
    from app.main import _require_admin_key
    from fastapi import HTTPException

    with patch("app.main.ADMIN_KEY", "my-secret"), \
         patch("app.main.hmac.compare_digest", wraps=hmac.compare_digest) as mock_digest:
        try:
            _require_admin_key(x_admin_key="my-secret")
        except HTTPException:
            pass
        mock_digest.assert_called_once()


def test_require_admin_key_passes_with_correct_key():
    """_require_admin_key must not raise when the correct key is provided."""
    from app.main import _require_admin_key

    with patch("app.main.ADMIN_KEY", "correct"):
        _require_admin_key(x_admin_key="correct")  # must not raise


def test_require_admin_key_raises_when_admin_key_env_unset():
    """When ADMIN_KEY is not configured, all requests are rejected."""
    from app.main import _require_admin_key
    from fastapi import HTTPException

    with patch("app.main.ADMIN_KEY", ""):
        with pytest.raises(HTTPException) as exc:
            _require_admin_key(x_admin_key="anything")
        assert exc.value.status_code == 403


def test_train_model_also_requires_admin_key():
    client, app, get_db = _make_client_with_mock_db()
    try:
        with patch("app.main.ADMIN_KEY", "secret"):
            r = client.post(
                "/admin/train-model",
                json={"n_arsenals": 10, "epochs": 1},
            )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)
