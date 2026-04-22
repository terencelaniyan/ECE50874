# Recommendation engine

The backend recommends bowling balls by **similarity to the user’s current arsenal**. Given a list of arsenal ball IDs, it returns the top-k balls not in the arsenal that are closest in core specs.

## Idea

- **Input:** User’s arsenal (by **arsenal_id** for a stored arsenal, or by **arsenal_ball_ids**) and desired number of recommendations `k`. Optional **game_counts** per ball for degradation (FR5). Optional **w_rg**, **w_diff**, **w_int** to weight the similarity dimensions; optional **brand**, **coverstock_type**, **status** to filter candidates; optional **diversity_min_distance** to space out picks.
- **Output:** Up to `k` balls not in the arsenal, ordered by how similar they are (closest first).
- **Similarity:** Based only on the numeric core specs: **RG**, **differential**, and **intermediate differential**. When game counts are provided (via `arsenal_id` or `game_counts`), arsenal specs are degraded before scoring (effective = catalog × decay factor). No learning or user history; purely spec-based.

## Algorithm

**Location:** `services/backend/app/recommendation_engine.py`

1. **Distance between two balls**

   Weighted L1 (Manhattan) distance on `(rg, diff, int_diff)`:

   ```
   dist(a, b) = w_rg * |a.rg - b.rg| + w_diff * |a.diff - b.diff| + w_int * |a.int_diff - b.int_diff|
   ```

   Default weights are 1.0 for all three. The API accepts optional `w_rg`, `w_diff`, `w_int` (0.1–10) so callers can tune importance of each dimension.

2. **Score of a candidate ball**

   For each candidate (any ball not in the arsenal), compute its distance to **every** arsenal ball. The candidate’s **score** is the **minimum** of those distances (i.e. distance to the closest arsenal ball).

3. **Ranking**

   Sort candidates by this score ascending.

4. **Diversity (optional)**

   If `diversity_min_distance` > 0, a post-pass ensures no two selected balls are closer than that distance in (rg, diff, int_diff) space. Otherwise the first k from the ranked list are returned. Lower score means more similar to the arsenal.

**Edge cases:**

- Empty arsenal: returns an empty list.
- Candidate set: all balls in the DB except those in the arsenal list, optionally filtered by `brand`, `coverstock_type`, and `status`. If there are fewer than k candidates (after filtering and diversity), all are returned.

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

**Example with weights, filters, and diversity:**

```json
{
  "arsenal_ball_ids": ["B001", "B010"],
  "k": 5,
  "w_rg": 1.0,
  "w_diff": 2.0,
  "w_int": 1.0,
  "brand": "Storm",
  "diversity_min_distance": 0.02
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

- **Data flow (in `main.py` and `services.py`):** Resolve arsenal from `arsenal_id` (DB) or `arsenal_ball_ids` (+ optional `game_counts`). Apply FR5 degradation when game counts exist (`services/backend/app/degradation.py`). Load candidates from Postgres, optionally filtered by `brand`, `coverstock_type`, and `status`; then call `recommend(arsenal_rows, candidate_rows, k, w_rg, w_diff, w_int, diversity_min_distance)`; return the list of (ball, score).
- **Validation:** Either `arsenal_id` or at least one `arsenal_ball_id`; all referenced ball IDs must exist; otherwise 400 with missing IDs or 404 for unknown arsenal_id.
- **Performance:** In-memory comparison. Fine for hundreds of balls; for much larger catalogs, consider indexing or precomputation.

## Related: gap analysis (POST /gaps)

The backend also exposes **POST /gaps**, which implements Voronoi-based **gap analysis** in RG–Differential space: it partitions the catalog by (rg, diff), finds Voronoi cells not covered by the user’s arsenal, and recommends the “owner” balls of those cells as gap fillers. See [Backend](backend.md#post-gaps) for the API.

---

## V2 recommendations (`POST /recommendations/v2`)

**Orchestration:** `services/backend/app/services.py` (e.g. `recommend_v2`) — resolves arsenal rows, applies degradation (`degradation.py`, v1 vs v2 model), loads candidates, then dispatches by **`method`**.

**Endpoint:** `POST /recommendations/v2` — same arsenal mutual-exclusion rules as v1 (`arsenal_id` **or** `arsenal_ball_ids` + optional `game_counts`). Full fields and errors: [Backend – POST /recommendations/v2](backend.md#post-recommendationsv2).

| Method        | Behavior (summary) |
| ------------- | -------------------- |
| `knn` (default) | Weighted **L1** or **L2** on rg/diff/int_diff; optional **min–max normalization**. Optional **`w_cover`** adds coverstock-aware signal alongside the three spec weights. |
| `two_tower`   | Neural two-tower scorer (`two_tower.py`); needs **PyTorch** and checkpoint `services/backend/models/two_tower.pt`. If the model or Torch is unavailable, behavior falls back (see [TECH_DEBT](TECH_DEBT.md)). |
| `hybrid`      | Combines KNN and two-tower signals per service logic. |

**Degradation:** Request field **`degradation_model`**: `v1` (linear) vs `v2` (logarithmic).

**Frontend:** `src/api/recommendations-v2.ts` and compact list on the Grid tab (`RecommendationsListCompact`).

---

## Slots (`POST /slots`)

**Location:** `services/backend/app/slot_assignment.py` — K-means style assignment into the **6-ball slot system**, silhouette score, per-slot coverage. **HTTP:** [Backend – POST /slots](backend.md#post-slots). **Frontend:** `src/api/slots.ts`, `SlotAssignmentPanel.tsx`.

---

## Implemented options

- **Weights:** `w_rg`, `w_diff`, `w_int` are exposed in the request body (default 1.0, range 0.1–10).
- **Filtering:** Optional `brand`, `coverstock_type`, and `status` restrict the candidate set before scoring.
- **Diversity:** `diversity_min_distance` (0–1) ensures selected balls are at least that far apart in spec space (0 = off).
- **V2-only:** `method`, `metric` (`l1` / `l2`), `normalize`, `w_cover`, `degradation_model` on `/recommendations/v2`.

## Possible extensions

- **Scale:** For very large catalogs, precompute approximate nearest neighbors or use a vector index on (rg, diff, int_diff).
