# Recommendation engine

The backend recommends bowling balls by **similarity to the user’s current arsenal**. Given a list of arsenal ball IDs, it returns the top-k balls not in the arsenal that are closest in core specs.

## Idea

- **Input:** User’s arsenal (by **arsenal_id** for a stored arsenal, or by **arsenal_ball_ids**) and desired number of recommendations `k`. Optional **game_counts** per ball for degradation (FR5).
- **Output:** Up to `k` balls not in the arsenal, ordered by how similar they are (closest first).
- **Similarity:** Based only on the numeric core specs: **RG**, **differential**, and **intermediate differential**. When game counts are provided (via `arsenal_id` or `game_counts`), arsenal specs are degraded before scoring (effective = catalog × decay factor). No learning or user history; purely spec-based.

## Algorithm

**Location:** `backend/app/recommendation_engine.py`

1. **Distance between two balls**

   Weighted L1 (Manhattan) distance on `(rg, diff, int_diff)`:

   ```
   dist(a, b) = w_rg * |a.rg - b.rg| + w_diff * |a.diff - b.diff| + w_int * |a.int_diff - b.int_diff|
   ```

   Default weights are 1.0 for all three. The function allows different weights for future tuning.

2. **Score of a candidate ball**

   For each candidate (any ball not in the arsenal), compute its distance to **every** arsenal ball. The candidate’s **score** is the **minimum** of those distances (i.e. distance to the closest arsenal ball).

3. **Ranking**

   Sort candidates by this score ascending and return the top-k. Lower score means more similar to the arsenal.

**Edge cases:**

- Empty arsenal: returns an empty list.
- Candidate set: all balls in the DB except those in the arsenal list. If there are fewer than k candidates, all are returned.

## API usage

**Endpoint:** `POST /recommendations`

**Example request (by ball IDs, no degradation):**

```json
{
  "arsenal_ball_ids": ["B001", "B010"],
  "k": 5
}
```

**Example with stored arsenal (uses stored game counts for degradation):**

```json
{
  "arsenal_id": "550e8400-e29b-41d4-a716-446655440000",
  "k": 5
}
```

**Example with inline game counts (degradation applied):**

```json
{
  "arsenal_ball_ids": ["B001", "B010"],
  "game_counts": { "B001": 50, "B010": 10 },
  "k": 5
}
```

Provide **either** `arsenal_id` **or** `arsenal_ball_ids` (not both). Full request/response details and errors: [Backend – POST /recommendations](backend.md#post-recommendations).

**Example response:**

```json
{
  "items": [
    { "ball": { "ball_id": "B042", "name": "...", "brand": "...", "rg": 2.48, ... }, "score": 0.012 },
    { "ball": { ... }, "score": 0.019 },
    ...
  ]
}
```

Interpretation: first ball has the smallest distance to your arsenal (most similar in rg/diff/int_diff); subsequent items are less similar.

## Implementation details

- **Data flow (in `main.py`):** Resolve arsenal from `arsenal_id` (DB) or `arsenal_ball_ids` (+ optional `game_counts`). Apply FR5 degradation when game counts exist (`backend/app/degradation.py`); then load candidates from Postgres and call `recommend(arsenal_rows, candidate_rows, k)`; return the list of (ball, score).
- **Validation:** Either `arsenal_id` or at least one `arsenal_ball_id`; all referenced ball IDs must exist; otherwise 400 with missing IDs or 404 for unknown arsenal_id.
- **Performance:** In-memory comparison. Fine for hundreds of balls; for much larger catalogs, consider indexing or precomputation.

## Related: gap analysis (POST /gaps)

The backend also exposes **POST /gaps**, which implements Voronoi-based **gap analysis** in RG–Differential space: it partitions the catalog by (rg, diff), finds Voronoi cells not covered by the user’s arsenal, and recommends the “owner” balls of those cells as gap fillers. See [Backend](backend.md#post-gaps) for the API.

## Possible extensions

- **Weights:** Expose or tune `w_rg`, `w_diff`, `w_int` (e.g. favor matching differential over RG).
- **Filtering:** Restrict candidates by brand, coverstock_type, or status before scoring.
- **Diversity:** Avoid returning several very similar balls; add a simple diversity step after ranking.
- **Scale:** For very large catalogs, precompute approximate nearest neighbors or use a vector index on (rg, diff, int_diff).
