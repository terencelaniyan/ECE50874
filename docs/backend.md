# Backend

FastAPI application that serves the ball catalog and recommendation endpoint. Uses Postgres for storage and reads configuration from the environment.

## Configuration

**Environment:** Loaded from a `.env` file at the repository root. Copy `.env.example` to `.env` and start Postgres with `docker compose up -d` for a clone-and-run setup.

| Variable     | Required | Description                                                                           |
| ------------ | -------- | ------------------------------------------------------------------------------------- |
| DATABASE_URL | yes      | Postgres connection string, e.g. `postgresql://postgres:postgres@localhost:5432/bowlingdb` |

The app fails to start if `DATABASE_URL` is missing or empty. No other env vars are required for basic run.

**Code:** `services/backend/app/config.py` loads dotenv and sets `DATABASE_URL`; `services/backend/app/db.py` uses it to open connections with a dict row factory.

## Database

- **Driver:** `psycopg` (binary). Connections use a context manager in `db.get_conn()`.
- **Tables:** `balls` — see [Data collection](data-collection.md). Populated by `services/backend/scripts/seed_from_csv.py`. `arsenals` and `arsenal_balls` — user-owned ball sets with per-ball game count; create with `python services/backend/scripts/migrate_arsenals.py` (run after balls exist).

## API endpoints

Base URL when running locally: `http://localhost:8000`. OpenAPI spec and interactive docs: `/docs`.

### GET /health

Checks that the app can execute a simple query against the database.

**Response:** `{"status": "ok", "db": 1}` (or error if DB is unreachable).

---

### GET /balls

List balls with optional filters and pagination.

**Query parameters:**

| Parameter       | Type   | Default      | Description                                                                 |
| --------------- | ------ | ------------ | --------------------------------------------------------------------------- |
| brand           | string | —            | Case-insensitive substring match on brand.                                  |
| coverstock_type | string | —            | Case-insensitive substring match on coverstock_type.                        |
| symmetry        | string | —            | Case-insensitive substring match on symmetry.                               |
| status          | string | —            | Exact match on status.                                                      |
| q               | string | —            | Case-insensitive substring match on name, brand, or coverstock_type.         |
| sort            | string | release_date | Sort by: name, brand, release_date, rg, diff, coverstock_type, symmetry, ball_id. |
| order           | string | desc         | Sort direction: asc or desc.                                                |
| limit           | int    | 50           | Page size (1–5000).                                                         |
| offset          | int    | 0            | Skip N rows.                                                                |

**Response:** `{"items": [<Ball>, ...], "count": <total matching count>}`

Results are ordered by the requested `sort` column and `order`, then by `ball_id ASC` as tiebreaker. `count` is the total number of rows matching the filters (ignoring limit/offset).

---

### GET /balls/{ball_id}

Fetch a single ball by ID.

**Response:** One ball object, or 404 if not found.

---

### Arsenals CRUD (FR5 / spec)

Persist arsenals (named ball sets with game count per ball) for degradation-aware recommendations and gap analysis.

**POST /arsenals** (201)

- Body: `{ "name": "My arsenal", "balls": [ { "ball_id": "B001", "game_count": 50 }, ... ] }`
- Creates an arsenal and its balls; each `ball_id` must exist in `balls`. Returns `{ "id": "<uuid>", "name": "...", "balls": [...] }`.

**GET /arsenals**

- Query: `limit` (default 50), `offset` (default 0). Returns list of `{ "id", "name", "ball_count" }`.

**GET /arsenals/{arsenal_id}**

- Returns one arsenal with full `balls` list (`ball_id`, `game_count`). 404 if not found.

**PATCH /arsenals/{arsenal_id}**

- Body: optional `name`, optional `balls` (replaces existing). Validates `ball_id`s. Returns updated arsenal.

**DELETE /arsenals/{arsenal_id}** (204)

- Deletes the arsenal and its balls. 404 if not found.

---

### POST /recommendations

Compute top-k ball recommendations given an arsenal (by ID or by ball IDs). See [Recommendation engine](recommendation-engine.md). Supports **FR5 degradation**: when game counts are provided (via `arsenal_id` or `game_counts`), arsenal ball specs are discounted before similarity scoring.

**Request body:**

```json
{
  "arsenal_ball_ids": ["B001", "B002"],
  "arsenal_id": null,
  "game_counts": { "B001": 50, "B002": 10 },
  "k": 5
}
```

| Field             | Type            | Constraints | Description                                                                                        |
| ----------------- | --------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| arsenal_ball_ids  | array of string | —           | Ball IDs (use when not using `arsenal_id`). Provide at least one unless `arsenal_id` is set.      |
| arsenal_id        | string (UUID)   | optional    | Use a stored arsenal; its balls and game counts are loaded. Mutually exclusive with using list.   |
| game_counts       | object          | optional    | Map `ball_id` → game count for degradation. Used with `arsenal_ball_ids` only.                    |
| k                 | int             | 1–50        | Number of recommendations. Default 5.                                                            |

- Provide **either** `arsenal_id` **or** `arsenal_ball_ids` (not both). If `arsenal_id`, recommendations use that arsenal’s balls and game counts. If `arsenal_ball_ids`, optional `game_counts` apply degradation (effective = catalog × (1 − 0.22 × min(games, 87)/87)).
- Only balls not in the arsenal are candidates. Lower `score` = more similar (to effective arsenal). Returns up to `k` items.

**Errors:** 400 if both/neither of `arsenal_id` and `arsenal_ball_ids` provided, or if any ball ID not found (`"missing": [<ids>]`). 404 if `arsenal_id` not found.

---

### POST /gaps

Voronoi-based gap analysis in RG–Differential space (per project spec). Identifies catalog balls that occupy regions not covered by the user’s arsenal and returns them as “gap filler” suggestions.

**Request body:**

```json
{
  "arsenal_ball_ids": [],
  "arsenal_id": null,
  "game_counts": null,
  "k": 10
}
```

| Field             | Type            | Constraints | Description                                                              |
| ----------------- | --------------- | ----------- | ------------------------------------------------------------------------ |
| arsenal_ball_ids  | array of string | optional    | Ball IDs (use when not using `arsenal_id`). May be empty.                |
| arsenal_id        | string (UUID)   | optional    | Use a stored arsenal; its balls and game counts used (with degradation).  |
| game_counts       | object          | optional    | Map `ball_id` → game count; used with `arsenal_ball_ids` for degradation. |
| k                 | int             | 1–50        | Max number of gap suggestions. Default 10.                               |

- Provide **either** `arsenal_id` **or** `arsenal_ball_ids` (not both). When game counts are present (via `arsenal_id` or `game_counts`), arsenal (rg, diff) positions are degradation-adjusted before gap scoring.
- Each item is a ball that “owns” a Voronoi cell not covered by the arsenal. Higher `gap_score` = larger coverage hole.
- Empty arsenal: all catalog balls are gaps; top-k by distance from global mean.

**Errors:** 400 if both provided or any ball ID not found. 404 if `arsenal_id` not found.

## Request/response models

Defined in `services/backend/app/api_models.py`:

- **Ball** — ball_id, name, brand, rg, diff, int_diff, symmetry, coverstock_type, surface_grit, surface_finish, release_date, status.
- **BallsResponse** — items (list of Ball), count.
- **ArsenalBallInput** — ball_id, game_count (optional, default 0). **CreateArsenalRequest** — name (optional), balls (list). **UpdateArsenalRequest** — name (optional), balls (optional). **ArsenalResponse** — id, name, balls (ball_id, game_count). **ArsenalSummary** — id, name, ball_count.
- **RecommendRequest** — arsenal_ball_ids, optional arsenal_id, optional game_counts, k.
- **RecommendationItem** — ball, score. **RecommendResponse** — items.
- **GapRequest** — arsenal_ball_ids, optional arsenal_id, optional game_counts, k.
- **GapItem** — ball, gap_score. **GapResponse** — items.

## Running the server

From repo root, with virtualenv activated and dependencies installed:

```bash
cd services/backend && uvicorn app.main:app --reload
```

- `--reload` enables auto-reload on code changes.
- Default host/port: `127.0.0.1:8000`. Override with `--host` and `--port` if needed.

**Dependencies:** See `services/backend/requirements.txt` (fastapi, uvicorn, psycopg[binary], pydantic, python-dotenv, scipy, pytest).

## Tests

From `services/backend/`: `python -m pytest tests/ -v`. Unit tests (gap_engine, degradation, etc.) need no database. Integration tests (gaps, recommendations, arsenals CRUD) are skipped when `DATABASE_URL` is unset; with Postgres and seeded `balls` (and `migrate_arsenals.py` run for arsenal tests) they run automatically. See `services/backend/tests/README.md` for details.
