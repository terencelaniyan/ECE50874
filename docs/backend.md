# Backend

FastAPI application that serves the ball catalog and recommendation endpoint. Uses Postgres for storage and reads configuration from the environment.

## Configuration

**Environment:** Loaded from a `.env` file at the repository root or `services/backend/`. Copy `.env.template` to `.env` and start Postgres with `docker compose up -d` for a clone-and-run setup.

| Variable     | Required | Description                                                                           |
| ------------ | -------- | ------------------------------------------------------------------------------------- |
| DATABASE_URL | yes      | Postgres connection string, e.g. `postgresql://postgres:postgres@localhost:5432/bowlingdb` |
| ADMIN_KEY    | no       | Required for `POST /admin/*` to succeed: the request must send header `X-Admin-Key` with this exact value. If unset or empty, admin routes return **403** (the dependency treats a missing key as invalid). |

The app fails to start if `DATABASE_URL` is missing or empty. `ADMIN_KEY` is for catalog/recommendation use; set it when you need catalog refresh or model training from the API.

**Code:** `services/backend/app/config.py` loads dotenv and sets `DATABASE_URL`; `services/backend/app/db.py` uses it to open connections with a dict row factory.

## Database

- **Driver:** `psycopg` (binary). Connections use a context manager in `db.get_conn()`.
- **Tables:** `balls` — see [Data collection](data-collection.md). Populated by `services/backend/scripts/seed_from_csv.py`. `arsenals` and `arsenal_balls` — user-owned ball sets with per-ball game count; create with `python services/backend/scripts/migrate_arsenals.py` (run after balls exist).
- **Schema setup order:** (1) Run `seed_from_csv.py` to create and fill `balls`. (2) Run `migrate_arsenals.py` to create `arsenals` and `arsenal_balls`. Running them in the wrong order causes the `arsenal_balls` foreign key to `balls(ball_id)` to fail.

## API endpoints

Base URL when running locally: `http://localhost:8000`. OpenAPI spec and interactive docs: `/docs`.

### GET /health

Checks that the app can execute a simple query against the database.

**Response:** `{"status": "ok", "db": 1}` (or error if DB is unreachable).

---

### GET /balls

List balls with filters and pagination.

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

- Body: `name`, `balls` (replaces existing). Validates `ball_id`s. Returns updated arsenal.

**DELETE /arsenals/{arsenal_id}** (204)

- Deletes the arsenal and its balls. 404 if not found.

---

### POST /recommendations

Compute top-k ball recommendations given an arsenal (by ID or by ball IDs). See [Recommendation engine](recommendation-engine.md). Supports **FR5 degradation**: when game counts are provided (via `arsenal_id` or `game_counts`), arsenal ball specs are discounted before similarity scoring. Similarity weights, candidate filters (brand, coverstock_type, status), and a diversity step are supported.

**Request body:**

```json
{
  "arsenal_ball_ids": ["B001", "B002"],
  "arsenal_id": null,
  "game_counts": { "B001": 50, "B002": 10 },
  "k": 5,
  "w_rg": 1.0,
  "w_diff": 1.0,
  "w_int": 1.0,
  "brand": null,
  "coverstock_type": null,
  "status": null,
  "diversity_min_distance": 0.0
}
```

| Field                    | Type            | Constraints | Description                                                                                        |
| ------------------------ | --------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| arsenal_ball_ids         | array of string | —           | Ball IDs (use when not using `arsenal_id`). Provide at least one unless `arsenal_id` is set.      |
| arsenal_id               | string (UUID)   |            | Use a stored arsenal; its balls and game counts are loaded. Mutually exclusive with using list.   |
| game_counts             | object          |            | Map `ball_id` → game count for degradation. Used with `arsenal_ball_ids` only.                    |
| k                        | int             | 1–50        | Number of recommendations. Default 5.                                                            |
| w_rg                     | float           | 0.1–10      | Weight for RG in similarity distance. Default 1.0.                                                |
| w_diff                   | float           | 0.1–10      | Weight for differential. Default 1.0.                                                             |
| w_int                    | float           | 0.1–10      | Weight for intermediate differential. Default 1.0.                                                |
| brand                    | string          |            | Filter candidates by brand (case-insensitive substring).                                          |
| coverstock_type         | string          |            | Filter candidates by coverstock type (case-insensitive substring).                                 |
| status                   | string          |            | Filter candidates by status (exact match).                                                       |
| diversity_min_distance  | float           | 0–1         | Min L1 distance in spec space between selected balls (0 = off). Default 0.0.                     |

- Provide **either** `arsenal_id` **or** `arsenal_ball_ids` (not both). If `arsenal_id`, recommendations use that arsenal’s balls and game counts. If `arsenal_ball_ids`, `game_counts` apply degradation (effective = catalog × (1 − 0.22 × min(games, 87)/87)).
- Only balls not in the arsenal are candidates; `brand`, `coverstock_type`, and `status` further restrict the candidate set. Lower `score` = more similar (to effective arsenal). If `diversity_min_distance` > 0, selected balls are at least that far apart in (rg, diff, int_diff) space. Returns up to `k` items.

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
  "k": 10,
  "zone_threshold": 0.05
}
```

| Field             | Type            | Constraints | Description                                                              |
| ----------------- | --------------- | ----------- | ------------------------------------------------------------------------ |
| arsenal_ball_ids  | array of string |            | Ball IDs (use when not using `arsenal_id`). May be empty.                |
| arsenal_id        | string (UUID)   |            | Use a stored arsenal; its balls and game counts used (with degradation).  |
| game_counts       | object          |            | Map `ball_id` → game count; used with `arsenal_ball_ids` for degradation. |
| k                 | int             | 1–50        | Max number of gap suggestions. Default 10.                               |
| zone_threshold    | float           | —           | (rg, diff) distance to group gap balls into same zone. Default 0.05.     |

- Provide **either** `arsenal_id` **or** `arsenal_ball_ids` (not both). When game counts are present (via `arsenal_id` or `game_counts`), arsenal (rg, diff) positions are degradation-adjusted before gap scoring.
- Each item is a ball that “owns” a Voronoi cell not covered by the arsenal. Higher `gap_score` = larger coverage hole.
- Empty arsenal: all catalog balls are gaps; top-k by distance from global mean.

**Errors:** 400 if both provided or any ball ID not found. 404 if `arsenal_id` not found.

---

### POST /recommendations/v2

V2 recommendations with selectable backend: **KNN**, **two_tower**, or **hybrid** (`method`). Supports **coverstock weight** (`w_cover`), **distance metric** (`l1` or `l2`), **min–max normalization** before distance, and **degradation model** `v1` (linear) vs `v2` (logarithmic). See [Recommendation engine](recommendation-engine.md) for algorithm context.

**Request body:** Same mutual exclusion as `POST /recommendations`: provide **either** `arsenal_id` **or** `arsenal_ball_ids` (not both). You must provide at least one arsenal ball (via ID list or stored arsenal).

| Field                    | Type            | Constraints | Description                                                                 |
| ------------------------ | --------------- | ----------- | --------------------------------------------------------------------------- |
| arsenal_ball_ids         | array of string | —           | Ball IDs when not using `arsenal_id`.                                      |
| arsenal_id               | string (UUID)   |            | Stored arsenal; mutually exclusive with non-empty `arsenal_ball_ids`.       |
| game_counts              | object          |            | Map `ball_id` → game count (with `arsenal_ball_ids`).                       |
| k                        | int             | 1–50        | Number of recommendations. Default 5.                                     |
| w_rg, w_diff, w_int      | float           | 0.1–10      | Spec weights. Default 1.0 each.                                            |
| w_cover                  | float           | 0–10        | Coverstock ordinal weight. Default 0.3.                                     |
| method                   | string          | —           | `knn`, `two_tower`, or `hybrid`. Default `knn`.                             |
| metric                   | string          | —           | `l1` or `l2`. Default `l1`.                                                |
| normalize                | bool            | —           | Min–max normalize features before distance. Default false.                  |
| degradation_model        | string          | —           | `v1` or `v2`. Default `v1`.                                                |
| brand                    | string          |            | Candidate filter (substring).                                              |
| coverstock_type          | string          |            | Candidate filter (substring).                                              |
| status                   | string          |            | Candidate filter (exact).                                                  |
| diversity_min_distance   | float           | 0–1         | Min distance between picks in spec space; 0 = off. Default 0.                |

**Response:** `items` (each entry: `ball`, `score`, per-item `method`, `reason`); top-level `method`, `degradation_model`, `normalized`.

**Errors:** 400 for invalid arsenal combination or validation from the service. 404 if `arsenal_id` not found.

---

### POST /slots

Assigns arsenal balls to the **6-ball slot system** using K-Means clustering and reports **silhouette** quality and **per-slot coverage**.

**Request body:**

| Field             | Type            | Description                                                                 |
| ----------------- | --------------- | --------------------------------------------------------------------------- |
| arsenal_ball_ids  | array of string | Use when not using `arsenal_id`.                                            |
| arsenal_id        | string (UUID)   | Mutually exclusive with using both sources incorrectly.           |
| game_counts       | object          | Map `ball_id` → count for degradation-aware positions.             |

Provide **either** `arsenal_id` **or** at least one `arsenal_ball_ids` entry (same rules as recommendations v2).

**Response:** `assignments` (per ball: `ball_id`, `slot`, `slot_name`, `slot_description`, `rg`, `diff`); `best_k`; `silhouette_score`; `slot_coverage` (list of `slot`, `name`, `covered`).

**Errors:** 400/404 analogous to other arsenal endpoints.

---

### POST /degradation/compare

Compares **v1 linear** vs **v2 logarithmic** degradation on one ball at a given **game_count**.

**Request body:**

| Field             | Type   | Constraints | Description                                                                 |
| ----------------- | ------ | ----------- | --------------------------------------------------------------------------- |
| ball_id           | string |            | If set, loads RG/diff/int_diff/coverstock from catalog; overrides manual fields below when found. |
| rg, diff, int_diff | float | see API     | Used when `ball_id` omitted (defaults in schema).                            |
| coverstock_type   | string |            | Used for v2 λ when not loading from DB.                                    |
| game_count        | int    | 0–500       | Games for degradation curve. Default 50.                                   |

**Response:** `original` (rg, diff, int_diff, factor 1.0); `v1_linear` and `v2_logarithmic` (each rg, diff, int_diff, factor); `game_count`; `coverstock_type`; `v2_lambda`.

**Errors:** 404 if `ball_id` is set but not found in `balls`.

---

### GET /oil-patterns

Lists **oil patterns** for simulation / UI: each item has `id`, `name`, `length_ft`, `description`, and `zones` (friction segments with `startFt`, `endFt`, `mu`).

If the backing table is missing or query fails, the handler returns a **small hardcoded set** of house/sport patterns (same shape as DB rows).

**Response:** `{ "items": [ ... ] }`.

---

### Admin endpoints

Both require **`ADMIN_KEY`** to be set in the environment and header **`X-Admin-Key`** on the request with the same value. If `ADMIN_KEY` is unset or the header does not match, the server returns **403** (`Invalid or missing X-Admin-Key`).

#### POST /admin/refresh-catalog

Runs **`scripts/scrape_btm.py`** at the repository root, then **`services/backend/scripts/seed_from_csv.py`**. **Long-running** (scrape timeout 600s, seed 120s). On success returns `status`, `message`, and `seed_output` (stdout from seed). On failure returns JSON with `status: "error"`, `step` (`scrape` or `seed`), and `detail`.

#### POST /admin/train-model

Trains the **two-tower** recommendation model on synthetic arsenal data.

**Request body:**

| Field        | Type | Constraints | Description                    |
| ------------ | ---- | ----------- | ------------------------------ |
| n_arsenals   | int  | 10–10000    | Default 500.                 |
| epochs       | int  | 1–200       | Default 20.                  |
| batch_size   | int  | 8–512       | Default 64.                    |
| lr           | float| 0.0001–0.1  | Default 0.001.               |
| neg_ratio    | int  | 1–10        | Negatives per positive. Default 3. |

**Response:** `status: "ok"` plus training metrics from the service, or `500` with `status: "error"` and `detail` if training fails.

## Request/response models

Defined in `services/backend/app/api_models.py`:

- **Ball** — ball_id, name, brand, rg, diff, int_diff, symmetry, coverstock_type, surface_grit, surface_finish, release_date, status.
- **BallsResponse** — items (list of Ball), count.
- **ArsenalBallInput** — ball_id, game_count (default 0). **CreateArsenalRequest** — name, balls (list). **UpdateArsenalRequest** — name, balls. **ArsenalResponse** — id, name, balls (ball_id, game_count). **ArsenalSummary** — id, name, ball_count.
- **RecommendRequest** — arsenal_ball_ids, arsenal_id, game_counts, k; w_rg, w_diff, w_int (similarity weights); brand, coverstock_type, status (candidate filters); diversity_min_distance.
- **RecommendationItem** — ball, score. **RecommendResponse** — items.
- **RecommendV2Request** — extends v1-style fields with w_cover, method, metric, normalize, degradation_model (and same arsenal/k/filter/diversity fields).
- **RecommendV2Item** — ball, score, method, reason. **RecommendV2Response** — items, method, degradation_model, normalized.
- **GapRequest** — arsenal_ball_ids, arsenal_id, game_counts, k, zone_threshold.
- **GapItem** — ball, gap_score. **GapZone** — center, label, description, balls. **GapResponse** — zones.
- **SlotAssignRequest** — arsenal_ball_ids, arsenal_id, game_counts.
- **SlotAssignment** — ball_id, slot, slot_name, slot_description, rg, diff. **SlotCoverage** — slot, name, covered. **SlotAssignResponse** — assignments, best_k, silhouette_score, slot_coverage.
- **DegradationCompareRequest** — ball_id; rg, diff, int_diff, coverstock_type, game_count.
- **DegradationModelResult** — rg, diff, int_diff, factor. **DegradationCompareResponse** — original, v1_linear, v2_logarithmic, game_count, coverstock_type, v2_lambda.
- **FrictionZone** — startFt, endFt, mu. **OilPattern** — id, name, length_ft, description, zones. **OilPatternsResponse** — items.
- **TrainModelRequest** — n_arsenals, epochs, batch_size, lr, neg_ratio.

## Running the server

From repo root, with virtualenv activated and dependencies installed:

```bash
cd services/backend && uvicorn app.main:app --reload
```

- `--reload` enables auto-reload on code changes.
- Default host/port: `127.0.0.1:8000`. Override with `--host` and `--port` if needed.

**Dependencies:** See `services/backend/requirements.txt` (fastapi, uvicorn, psycopg[binary], pydantic, python-dotenv, scipy, pytest, httpx). **PyTorch** is not pinned there; two-tower training (`train_model.py`, `POST /admin/train-model`) and several `test_two_tower.py` cases expect `torch` to be installed in the environment when you want training or full neural inference. See [TECH_DEBT.md](TECH_DEBT.md) §2.

## Tests

From `services/backend/`: `python -m pytest tests/ -v`. Unit tests (gap_engine, degradation, etc.) need no database. Integration tests (gaps, recommendations, arsenals CRUD) are skipped when `DATABASE_URL` is unset; with Postgres and seeded `balls` (and `migrate_arsenals.py` run for arsenal tests) they run automatically. See `services/backend/tests/README.md` for details.
