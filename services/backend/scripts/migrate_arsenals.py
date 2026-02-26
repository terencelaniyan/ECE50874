"""
Create arsenals and arsenal_balls tables and spec-aligned data model.
Run from repo root: python services/backend/scripts/migrate_arsenals.py
"""
from __future__ import annotations

import os

import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Create .env at repo root with DATABASE_URL=postgresql://..."
    )

ARSENALS_TABLE = """
CREATE TABLE IF NOT EXISTS arsenals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
"""

ARSENAL_BALLS_TABLE = """
CREATE TABLE IF NOT EXISTS arsenal_balls (
  arsenal_id  UUID NOT NULL REFERENCES arsenals(id) ON DELETE CASCADE,
  ball_id     TEXT NOT NULL REFERENCES balls(ball_id) ON DELETE CASCADE,
  game_count  INTEGER NOT NULL DEFAULT 0 CHECK (game_count >= 0),
  PRIMARY KEY (arsenal_id, ball_id)
);
"""

def main() -> None:
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(ARSENALS_TABLE)
            cur.execute(ARSENAL_BALLS_TABLE)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_arsenal_balls_arsenal_id ON arsenal_balls(arsenal_id);"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_arsenal_balls_ball_id ON arsenal_balls(ball_id);"
            )
        conn.commit()
    print("Migrated: arsenals and arsenal_balls tables created.")


if __name__ == "__main__":
    main()
