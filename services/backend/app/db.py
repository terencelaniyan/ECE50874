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
import json
from typing import Generator, Any, Dict
from pathlib import Path
from time import time

import psycopg
from psycopg import Connection
from psycopg.rows import dict_row

from .config import DATABASE_URL

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
    try:
        with DEBUG_LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload) + "\n")
    except Exception:
        pass


# endregion


def _connect() -> Connection[Dict[str, Any]]:
    """Open psycopg connection with dict_row; single place for connection config."""
    # region agent log
    _debug_log(
        "H4",
        "app/db.py:_connect",
        "opening database connection",
        {
            "databaseUrlPresent": bool(DATABASE_URL),
            "databaseUrlPrefix": (DATABASE_URL or "")[:32],
        },
    )
    # endregion
    try:
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        # region agent log
        _debug_log(
            "H4",
            "app/db.py:_connect",
            "database connection opened",
            {"connected": True},
        )
        # endregion
        return conn
    except Exception as exc:
        # region agent log
        _debug_log(
            "H5",
            "app/db.py:_connect",
            "database connection failed",
            {"errorType": type(exc).__name__, "error": str(exc)[:240]},
        )
        # endregion
        raise


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
