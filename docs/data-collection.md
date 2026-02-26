# Data collection

This document describes the bowling ball dataset, its schema, and how it is loaded into the backend.

## Source

- **Primary dataset:** `data/balls.csv`
- **Origin:** Bowling This Month (BTM) ball comparison table.
- **Reference URL:** https://www.bowlingthismonth.com/bowling-ball-reviews/ball-comparison-table/
- **Optional:** `data/bowling_merged.csv` may be a source or derivative; the backend uses `data/balls.csv`.

Data collection (scraping or manual export from BTM / Excel) is done outside this repo. The repo consumes the resulting CSV.

## CSV format

**Path:** `data/balls.csv`

**Encoding:** UTF-8. Header row, comma-separated.

**Columns:**

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| ball_id | text | yes | Unique identifier (e.g. B001, B002). Primary key in DB. |
| name | text | yes | Ball name. |
| brand | text | yes | Manufacturer (e.g. Brunswick, Storm, Hammer). |
| rg | number | yes | Radius of gyration. |
| diff | number | yes | Differential. |
| int_diff | number | yes | Intermediate differential. |
| symmetry | text | no | Symmetric / Asymmetric. |
| coverstock_type | text | no | Solid Reactive, Pearl Reactive, Hybrid Reactive, Urethane, etc. |
| surface_grit | text | no | Surface grit description. |
| surface_finish | text | no | Surface finish description. |
| release_date | date | no | ISO date (YYYY-MM-DD). |
| status | text | no | e.g. Active. |

**Required numeric fields:** `rg`, `diff`, and `int_diff` must be present and parseable as floats; the seed script will raise if they are missing or invalid.

## Database schema

The seed script creates a single table, `balls`, matching the CSV columns:

```sql
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
```

## Loading data (seed script)

**Script:** `services/backend/scripts/seed_from_csv.py`

**Behavior:**

1. Reads `DATABASE_URL` from environment (`.env` at repo root).
2. Reads `data/balls.csv` (path relative to repo root).
3. Creates `balls` table if it does not exist.
4. For each row: parses `rg`, `diff`, `int_diff` as floats; `release_date` as date (or null); empty optional text fields as null.
5. Upserts into `balls` by `ball_id` (INSERT with ON CONFLICT DO UPDATE).

**Run from repo root:**

```bash
cd services/backend && python -m scripts.seed_from_csv
```

**Prerequisites:**

- `.env` with valid `DATABASE_URL`.
- Postgres running; target database created (e.g. `createdb bowlingdb`).
- `data/balls.csv` present and columns matching the schema above.

**Output:** `Seeded N rows into Postgres from <path>/data/balls.csv`

Re-running the script is safe: it upserts, so updated CSV rows overwrite existing rows by `ball_id`.
