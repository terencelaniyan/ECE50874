# backend/scripts/seed_from_csv.py
"""
Seed balls table from data/balls.csv. CSV header is the source of truth for columns.
"""
from __future__ import annotations

import csv
import os
from datetime import date
from pathlib import Path
from typing import List, Optional

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Create .env at repo root with DATABASE_URL=postgresql://..."
    )

REPO_ROOT = Path(__file__).resolve().parents[3]
CSV_PATH = REPO_ROOT / "data" / "balls.csv"

REQUIRED_COLUMNS = {"ball_id", "name", "brand", "rg", "diff", "int_diff"}

FLOAT_COLUMNS = {"rg", "diff", "int_diff"}
DATE_COLUMNS = {"release_date"}
NULLABLE_TEXT_COLUMNS = {"symmetry", "coverstock_type", "surface_grit", "surface_finish", "status"}


def column_sql_type(name: str, is_first: bool) -> str:
    if name == "ball_id":
        return "TEXT PRIMARY KEY"
    if name in FLOAT_COLUMNS:
        return "DOUBLE PRECISION NOT NULL"
    if name in DATE_COLUMNS:
        return "DATE"
    if name in ("name", "brand"):
        return "TEXT NOT NULL"
    return "TEXT"


def build_create_table(columns: List[str]) -> str:
    parts = [f"  {c} {column_sql_type(c, i == 0)}" for i, c in enumerate(columns)]
    return "CREATE TABLE IF NOT EXISTS balls (\n" + ",\n".join(parts) + "\n);"


def parse_date(s: str) -> Optional[date]:
    s = (s or "").strip()
    if not s:
        return None
    return date.fromisoformat(s)


def parse_float(s: str) -> float:
    s = (s or "").strip()
    if s == "":
        raise ValueError("Missing float value")
    return float(s)


def read_header_and_rows(csv_path: Path) -> tuple[List[str], List[dict]]:
    with csv_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames or []
        missing = REQUIRED_COLUMNS - set(columns)
        if missing:
            raise ValueError(f"CSV missing required columns: {sorted(missing)}")
        rows = []
        for r in reader:
            row = {}
            for k in columns:
                val = (r.get(k) or "").strip()
                if k in FLOAT_COLUMNS:
                    row[k] = parse_float(val)
                elif k in DATE_COLUMNS:
                    row[k] = parse_date(val)
                elif k in NULLABLE_TEXT_COLUMNS and val == "":
                    row[k] = None
                else:
                    row[k] = val if val else None
            rows.append(row)
        return columns, rows


def ensure_columns_exist(cur, columns: List[str]) -> None:
    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'balls';
        """
    )
    existing = {r["column_name"] for r in cur.fetchall()}
    for col in columns:
        if col not in existing:
            cur.execute(
                sql.SQL("ALTER TABLE balls ADD COLUMN {} TEXT").format(
                    sql.Identifier(col)
                )
            )


def main() -> None:
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV not found: {CSV_PATH}")

    columns, rows = read_header_and_rows(CSV_PATH)
    create_sql = build_create_table(columns)

    update_cols = [c for c in columns if c != "ball_id"]
    set_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
    upsert_sql = f"""
    INSERT INTO balls ({", ".join(columns)})
    VALUES ({", ".join([f"%({c})s" for c in columns])})
    ON CONFLICT (ball_id)
    DO UPDATE SET {set_clause};
    """

    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(create_sql)
            ensure_columns_exist(cur, columns)

            batch_size = 200
            for i in range(0, len(rows), batch_size):
                batch = rows[i : i + batch_size]
                cur.executemany(upsert_sql, batch)

        conn.commit()

    print(f"Seeded {len(rows)} rows into Postgres from {CSV_PATH}")


if __name__ == "__main__":
    main()
