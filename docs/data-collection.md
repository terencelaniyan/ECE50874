# Data collection

This document describes the bowling ball dataset, its schema, and how it is loaded into the backend.

## Source

- **Primary dataset:** `data/balls.csv`
- **Origin:** Bowling This Month (BTM) ball comparison table.
- **Reference URL:** https://www.bowlingthismonth.com/bowling-ball-reviews/ball-comparison-table/
- `data/bowling_merged.csv` may be a source or derivative; the backend uses `data/balls.csv`.

Data collection (scraping or manual export from BTM / Excel) is done outside this repo. The repo consumes the resulting CSV.

## CSV format

**Path:** `data/balls.csv`

**Encoding:** UTF-8. Header row, comma-separated.

**Columns:** The CSV does not include `ball_id`. The seed script generates it (B001, B002, …) from row order when loading into the database.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
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

The seed script creates a single table, `balls`, with `ball_id` as primary key (generated from row order) plus the CSV columns:

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

1. Reads `DATABASE_URL` from environment (`.env` at repo root or in `services/backend/`).
2. Reads `data/balls.csv` (path relative to repo root).
3. Creates `balls` table if it does not exist.
4. For each row: assigns `ball_id` as B001, B002, … from row order; parses `rg`, `diff`, `int_diff` as floats; `release_date` as date (or null); empty text fields as null.
5. Upserts into `balls` by `ball_id` (INSERT with ON CONFLICT DO UPDATE).

**Run from repo root:**

```bash
python services/backend/scripts/seed_from_csv.py
```

**Prerequisites:**

- `.env` with valid `DATABASE_URL`.
- Postgres running; target database created (e.g. `createdb bowlingdb`).
- `data/balls.csv` present and columns matching the schema above.

**Output:** `Seeded N rows into Postgres from <path>/data/balls.csv`

Re-running the script is safe: it upserts by generated `ball_id` (row index), so CSV row order determines identity; reordering the CSV will change which DB row is updated.

## Scraping (automated collection)

**Script:** `scripts/scrape_btm.py`

**Source:** Bowling This Month ball comparison table (1,360+ entries).  
**robots.txt:** Only `/wp-admin/` is blocked — product/review pages are allowed.

**Dependencies:**

```bash
pip install playwright python-dateutil
playwright install chromium
```

**Usage:**

```bash
python scripts/scrape_btm.py            # scrape all balls → data/balls.csv
python scripts/scrape_btm.py --limit 300 # stop after 300 records
python scripts/scrape_btm.py --dry-run   # preview without writing
```

**Field mapping (BTM → CSV):**

| BTM Column | CSV Column | Notes |
|-----------|-----------|-------|
| Company | `brand` | Direct |
| Ball Name | `name` | Direct |
| Issue | `release_date` | "February 2026" → `2026-02-01` |
| Cover | `coverstock_type` | `R Sol` → `Solid Reactive`, etc. |
| Box Finish | `surface_grit`, `surface_finish` | Same value for both |
| RG | `rg` | Float |
| Diff | `diff` | Float |
| Int | `int_diff` | Float (0 if blank) |

`symmetry` is derived: `int_diff > 0` → Asymmetric, else Symmetric.

## Manual entry (fallback)

**Script:** `scripts/manual_entry.py`

Use when scraping is blocked or for balls not in BTM's database.

```bash
python scripts/manual_entry.py                        # interactive prompt
python scripts/manual_entry.py --from-json input.json  # batch import
```

JSON batch format: array of objects with `name`, `brand`, `rg`, `diff`, and `int_diff`, `coverstock_type`, `surface_grit`, `release_date`.

## User arsenals (migration)

**Script:** `services/backend/scripts/migrate_arsenals.py`

Run **after** `balls` exists (`seed_from_csv.py`), because `arsenal_balls.ball_id` references `balls(ball_id)`.

Creates persisted arsenals and membership:

- `arsenals` — id (UUID), name, timestamps
- `arsenal_balls` — arsenal_id, ball_id, game_count (for degradation-aware flows)
- `arsenal_custom_balls` — custom ball rows tied to an arsenal for user-defined specs (name/brand optional; rg/diff/int_diff required; includes `game_count`)

Arsenal API requests now support mixed lists by discriminating each entry with `custom`:
- Catalog item: `{ "custom": false, "ball_id": "B001", "game_count": 10 }`
- Custom item: `{ "custom": true, "name": "Practice Ball", "rg": 2.52, "diff": 0.03, "int_diff": 0.01, "game_count": 8 }`

```bash
python services/backend/scripts/migrate_arsenals.py
```

## Oil patterns (migration)

**Script:** `services/backend/scripts/migrate_oil_patterns.py`

Creates `oil_patterns` and seeds built-in house/sport-style rows (JSON friction **zones** per pattern). Used by `GET /oil-patterns` and simulation UIs. Requires `DATABASE_URL`.

**Not** run by `setup_db.py` — run explicitly when you want DB-backed patterns (API can still return a small hardcoded set if the table is missing; see backend handler).

```bash
python services/backend/scripts/migrate_oil_patterns.py
```

## One-shot database setup (`setup_db.py`)

**Script:** `services/backend/scripts/setup_db.py`

From repo root, runs **in order**:

1. `seed_from_csv.py` — `balls` table + CSV load  
2. `migrate_arsenals.py` — arsenal tables  
3. `train_model.py` — two-tower training (`models/two_tower.pt`); needs a working **PyTorch** install for training to succeed (`torch` is not listed in `services/backend/requirements.txt`; see [TECH_DEBT](TECH_DEBT.md))

Oil patterns remain a **separate** step (`migrate_oil_patterns.py`) after the above.
