import os
from unittest.mock import MagicMock, patch

import pytest
import psycopg
from fastapi.testclient import TestClient

def _can_connect_to_db(database_url: str) -> bool:
    if not database_url:
        return False
    try:
        with psycopg.connect(database_url, connect_timeout=1):
            pass
        return True
    except Exception:
        return False


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


def pytest_collection_modifyitems(config, items):
    db_url = os.getenv("DATABASE_URL", "").strip()
    reachable = _can_connect_to_db(db_url)
    if reachable:
        return
    skip_integration = pytest.mark.skip(
        reason=(
            "integration tests require reachable Postgres; "
            "DATABASE_URL is unset or unreachable"
        )
    )
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_integration)


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

    if db_url and _can_connect_to_db(db_url):
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
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def mock_connect(mock_conn):
    """Patch app.db._connect for tests that bypass FastAPI Depends."""
    with patch("app.db._connect", return_value=mock_conn) as p:
        yield p
