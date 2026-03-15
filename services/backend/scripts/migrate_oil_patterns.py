#!/usr/bin/env python3
"""
Create and seed the oil_patterns table.

Usage:
    python scripts/migrate_oil_patterns.py

Requires DATABASE_URL env var.
"""
import json
import os
import sys

import psycopg

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://bbg:bbg@localhost:5432/bowlingdb")


PATTERNS = [
    {
        "name": "House Shot",
        "length_ft": 38,
        "description": "Standard recreational pattern. Heavy oil in center, dry outside boards.",
        "zones": json.dumps([
            {"startFt": 0, "endFt": 38, "mu": 0.04},
            {"startFt": 38, "endFt": 60, "mu": 0.20},
        ]),
    },
    {
        "name": "Sport Shot — Badger (52ft)",
        "length_ft": 52,
        "description": "PBA animal pattern. Long oil, very flat ratio. Requires precision.",
        "zones": json.dumps([
            {"startFt": 0, "endFt": 52, "mu": 0.04},
            {"startFt": 52, "endFt": 60, "mu": 0.22},
        ]),
    },
    {
        "name": "Sport Shot — Cheetah (33ft)",
        "length_ft": 33,
        "description": "PBA animal pattern. Short oil, early hook. Rewards accuracy.",
        "zones": json.dumps([
            {"startFt": 0, "endFt": 33, "mu": 0.04},
            {"startFt": 33, "endFt": 60, "mu": 0.18},
        ]),
    },
    {
        "name": "Sport Shot — Chameleon (41ft)",
        "length_ft": 41,
        "description": "PBA animal pattern. Medium length, tricky backend reaction.",
        "zones": json.dumps([
            {"startFt": 0, "endFt": 41, "mu": 0.04},
            {"startFt": 41, "endFt": 60, "mu": 0.20},
        ]),
    },
    {
        "name": "Sport Shot — Scorpion (43ft)",
        "length_ft": 43,
        "description": "PBA animal pattern. Medium-long, heavy volume. Power game.",
        "zones": json.dumps([
            {"startFt": 0, "endFt": 43, "mu": 0.035},
            {"startFt": 43, "endFt": 60, "mu": 0.20},
        ]),
    },
    {
        "name": "Sport Shot — Viper (37ft)",
        "length_ft": 37,
        "description": "PBA animal pattern. Short-medium, tight margins.",
        "zones": json.dumps([
            {"startFt": 0, "endFt": 37, "mu": 0.04},
            {"startFt": 37, "endFt": 60, "mu": 0.19},
        ]),
    },
]


def main():
    conn = psycopg.connect(DATABASE_URL, autocommit=False)
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS oil_patterns (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                length_ft INTEGER NOT NULL,
                description TEXT,
                zones JSONB NOT NULL DEFAULT '[]'
            );
        """)

        for p in PATTERNS:
            cur.execute("""
                INSERT INTO oil_patterns (name, length_ft, description, zones)
                VALUES (%(name)s, %(length_ft)s, %(description)s, %(zones)s)
                ON CONFLICT (name) DO UPDATE SET
                    length_ft = EXCLUDED.length_ft,
                    description = EXCLUDED.description,
                    zones = EXCLUDED.zones;
            """, p)

    conn.commit()
    conn.close()
    print(f"oil_patterns table created with {len(PATTERNS)} patterns.")


if __name__ == "__main__":
    main()
