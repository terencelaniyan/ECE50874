# backend/scripts/seed_from_csv.py
from __future__ import annotations

import csv
import os
from datetime import date
from pathlib import Path
from typing import Optional

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Create .env at repo root with DATABASE_URL=postgresql://..."
    )

REPO_ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = REPO_ROOT / "data" / "balls.csv"

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS balls (
  ball_id            TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  brand              TEXT NOT NULL,

  rg                 DOUBLE PRECISION NOT NULL,
  diff               DOUBLE PRECISION NOT NULL,
  int_diff           DOUBLE PRECISION NOT NULL,

  symmetry           TEXT,
  coverstock_type    TEXT,

  surface_grit       TEXT,
  surface_finish     TEXT,

  release_date       DATE,
  status             TEXT
);
"""

COLUMNS = [
    "ball_id",
    "name",
    "brand",
    "rg",
    "diff",
    "int_diff",
    "symmetry",
    "coverstock_type",
    "surface_grit",
    "surface_finish",
    "release_date",
    "status",
]


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


def main() -> None:
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV not found: {CSV_PATH}")

    rows = []
    with CSV_PATH.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            row = {k: (r.get(k) or "").strip() for k in COLUMNS}

            row["rg"] = parse_float(row["rg"])
            row["diff"] = parse_float(row["diff"])
            row["int_diff"] = parse_float(row["int_diff"])

            row["release_date"] = parse_date(row["release_date"])

            for k in [
                "symmetry",
                "coverstock_type",
                "surface_grit",
                "surface_finish",
                "status",
            ]:
                if row[k] == "":
                    row[k] = None

            rows.append(row)

    upsert_sql = f"""
    INSERT INTO balls ({", ".join(COLUMNS)})
    VALUES ({", ".join([f"%({c})s" for c in COLUMNS])})
    ON CONFLICT (ball_id)
    DO UPDATE SET
      name = EXCLUDED.name,
      brand = EXCLUDED.brand,
      rg = EXCLUDED.rg,
      diff = EXCLUDED.diff,
      int_diff = EXCLUDED.int_diff,
      symmetry = EXCLUDED.symmetry,
      coverstock_type = EXCLUDED.coverstock_type,
      surface_grit = EXCLUDED.surface_grit,
      surface_finish = EXCLUDED.surface_finish,
      release_date = EXCLUDED.release_date,
      status = EXCLUDED.status
    ;
    """

    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_TABLE_SQL)

            batch_size = 200
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                cur.executemany(upsert_sql, batch)

        conn.commit()

    print(f"Seeded {len(rows)} rows into Postgres from {CSV_PATH}")


if __name__ == "__main__":
    main()
