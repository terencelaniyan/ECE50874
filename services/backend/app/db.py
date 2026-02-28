# ===========================================================================
# backend/app/db.py
# ---------------------------------------------------------------------------
# Database connection helper.
#
# Provides a context-manager that yields a psycopg connection configured
# with `dict_row` so every fetchone/fetchall returns Python dicts instead
# of tuples.  The connection is automatically closed when the context exits.
#
# Usage:
#     with get_conn() as conn:
#         with conn.cursor() as cur:
#             cur.execute("SELECT * FROM balls;")
#             rows = cur.fetchall()   # list[dict]
# ===========================================================================

from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row  # enables dict-based row access (row["col"])

from .config import DATABASE_URL   # resolved connection string from config module


@contextmanager
def get_conn():
    """Yield a psycopg connection; automatically close it on exit."""
    # Open a new connection using the project-wide DATABASE_URL
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    try:
        yield conn  # caller uses `with get_conn() as conn: ...`
    finally:
        conn.close()  # ensure the connection is released even if an error occurs
