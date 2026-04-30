# ===========================================================================
# backend/app/db.py
# ---------------------------------------------------------------------------
# Database connection helper.
#
# - get_db(): FastAPI dependency; use with Depends(get_db) in routes. Yields
#   one connection per request and closes it after the response.
# - get_conn(): Context manager for non-request usage (e.g. scripts). Same
#   connection setup (dict_row, DATABASE_URL).
#
# Usage in routes:
#     def list_balls(db = Depends(get_db)): ...
# Usage in scripts:
#     with get_conn() as conn:
#         with conn.cursor() as cur: ...
# ===========================================================================

from contextlib import contextmanager
from typing import Generator, Any, Dict

import psycopg
from psycopg import Connection
from psycopg.rows import dict_row

from .config import DATABASE_URL


def _connect() -> Connection[Dict[str, Any]]:
    """Open psycopg connection with dict_row; single place for connection config."""
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def get_db() -> Generator[Connection[Dict[str, Any]], None, None]:
    """FastAPI dependency: yield one connection per request; closed after response."""
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def get_conn():
    """Yield a psycopg connection for use outside request scope (e.g. scripts)."""
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()
