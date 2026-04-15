import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: marks tests that require DATABASE_URL and a seeded balls table",
    )


def _needs_db():
    # In some places we skip if no db url, we will keep this for backward compat
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
def client(override_get_db):
    """Yields a TestClient with the mocked database dependency applied."""
    from app.main import app
    return TestClient(app)

@pytest.fixture
def mock_connect(mock_conn):
    """Patches app.db._connect globally for tests that don't go through FastAPI Depends."""
    with patch("app.db._connect", return_value=mock_conn) as p:
        yield p
