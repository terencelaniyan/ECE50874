import os
import json
from unittest.mock import MagicMock, patch
from pathlib import Path
from time import time

import pytest
from fastapi.testclient import TestClient

DEBUG_LOG_PATH = Path("/Users/fahdlaniyan/Documents/ECE50874/.cursor/debug-e4a33a.log")
DEBUG_SESSION_ID = "e4a33a"


# region agent log
def _debug_log(hypothesis_id: str, location: str, message: str, data: dict) -> None:
    payload = {
        "sessionId": DEBUG_SESSION_ID,
        "runId": "initial",
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data,
        "timestamp": int(time() * 1000),
    }
    with DEBUG_LOG_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload) + "\n")


# endregion


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        (
            "integration: marks tests that require DATABASE_URL and a "
            "seeded balls table"
        ),
    )


def _needs_db():
    # Backward compat: skip when no db url (unused by current tests).
    return not os.getenv("DATABASE_URL", "").strip()


@pytest.fixture
def mock_cursor():
    """Mock a psycopg database cursor to return predefined rows."""
    cursor_mock = MagicMock()
    # By default, fetchall returns empty list, fetchone returns None
    cursor_mock.fetchall.return_value = []
    cursor_mock.fetchone.return_value = None
    # Support context manager
    cursor_mock.__enter__.return_value = cursor_mock
    cursor_mock.__exit__.return_value = None
    return cursor_mock


@pytest.fixture
def mock_conn(mock_cursor):
    """Mock a psycopg database connection."""
    conn_mock = MagicMock()
    conn_mock.cursor.return_value = mock_cursor
    # Support context manager
    conn_mock.__enter__.return_value = conn_mock
    conn_mock.__exit__.return_value = None
    return conn_mock


@pytest.fixture
def override_get_db(mock_conn):
    """Fixture that overrides `app.db.get_db` FastAPI dependency."""
    from app.main import app
    from app.db import get_db

    def _mock_get_db():
        yield mock_conn

    app.dependency_overrides[get_db] = _mock_get_db
    yield mock_conn
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def client():
    """TestClient with real Postgres if DATABASE_URL is set; else mocked DB."""
    from app.main import app
    from app.db import get_db

    db_url = os.getenv("DATABASE_URL", "").strip()
    # region agent log
    _debug_log(
        "H1",
        "tests/conftest.py:client",
        "client fixture db-url check",
        {"databaseUrlPresent": bool(db_url), "databaseUrlPrefix": db_url[:32]},
    )
    # endregion

    if db_url:
        # region agent log
        _debug_log(
            "H2",
            "tests/conftest.py:client",
            "client fixture selecting real DB test path",
            {"reason": "DATABASE_URL is non-empty"},
        )
        # endregion
        yield TestClient(app)
        return

    mock_cursor = MagicMock()
    mock_cursor.fetchall.return_value = []
    mock_cursor.fetchone.return_value = None
    mock_cursor.__enter__.return_value = mock_cursor
    mock_cursor.__exit__.return_value = None
    conn_mock = MagicMock()
    conn_mock.cursor.return_value = mock_cursor
    conn_mock.__enter__.return_value = conn_mock
    conn_mock.__exit__.return_value = None

    def _mock_get_db():
        yield conn_mock

    app.dependency_overrides[get_db] = _mock_get_db
    try:
        # region agent log
        _debug_log(
            "H3",
            "tests/conftest.py:client",
            "client fixture selecting mocked DB path",
            {"reason": "DATABASE_URL empty"},
        )
        # endregion
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def mock_connect(mock_conn):
    """Patch app.db._connect for tests that bypass FastAPI Depends."""
    with patch("app.db._connect", return_value=mock_conn) as p:
        yield p
