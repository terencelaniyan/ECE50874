# End-to-End Test Plan — Bowling Ball Grid Generator

**Date:** 2026-03-14
**Status:** PROPOSED — No E2E tests exist yet. This document defines what must be built.

---

## 1. Why E2E Testing Is Needed

The project has 139 automated tests (94 backend, 45 frontend), but **all frontend tests mock the API** using MSW, and **all backend unit tests use in-memory dicts** (no DB). The integration tests hit FastAPI with httpx but do not exercise the frontend.

**Result:** We have never automatically verified that a user can:
- Browse the catalog, add a ball, and see recommendations
- Save an arsenal and reload it
- Run a simulation and see results
- Switch between recommendation modes

Manual testing during development confirmed these flows work, but regressions are undetected.

---

## 2. Proposed E2E Framework

**Tool:** Playwright (chosen over Cypress for: multi-browser support, Python bindings if desired, faster execution, better Docker integration)

**Setup:** Docker Compose starts the full stack (Postgres + backend + frontend). Playwright runs against `http://localhost:3000`.

**Directory:** `ECE50874/tests/e2e/`

---

## 3. Test Cases

### TC-01: Application Loads

**Priority:** P0 (smoke test)

| Step | Action | Expected |
|---|---|---|
| 1 | Navigate to `http://localhost:3000` | Page loads without errors |
| 2 | Verify header | "BBG Grid" title visible, DB badge shows "DB: N BALLS LOADED" with N > 0 |
| 3 | Verify default tab | Grid View is active (tab aria-selected=true) |
| 4 | Verify arsenal panel | "MY ARSENAL" heading visible, "0/6" badge |

### TC-02: Browse Ball Catalog

**Priority:** P0

| Step | Action | Expected |
|---|---|---|
| 1 | Click "CATALOG" tab | Catalog view renders with search bar and ball cards |
| 2 | Wait for balls to load | At least 1 ball card visible |
| 3 | Type "Storm" in search | Ball cards filter to show only Storm brand balls |
| 4 | Click "Add to bag" on first ball | Toast/feedback shown, bag count increments to 1/6 |
| 5 | Switch to Grid View tab | Added ball appears in arsenal panel |

### TC-03: Recommendations Appear

**Priority:** P0

| Step | Action | Expected |
|---|---|---|
| 1 | Add 2 balls to bag (from catalog) | Bag shows 2/6 |
| 2 | Switch to Grid View | Recommendations panel on right shows "K-NN RANKED" |
| 3 | Wait for recommendations | At least 1 recommendation card appears with match % |
| 4 | Verify recommendation has data | Ball name, specs (RG/Diff), coverstock, and "Add to bag" button present |
| 5 | Click "Add to bag" on recommendation | Bag increments to 3/6, recommendation list refreshes |

### TC-04: Voronoi Grid Updates

**Priority:** P1

| Step | Action | Expected |
|---|---|---|
| 1 | Add 2 balls to bag | Grid View shows 2 dots on Voronoi chart |
| 2 | Verify axes | X-axis labeled "RG", Y-axis labeled "Diff" |
| 3 | Hover over a dot | Tooltip shows ball name and specs |
| 4 | Add a third ball | Third dot appears, Voronoi cells may update |

### TC-05: Save and Load Arsenal

**Priority:** P1

| Step | Action | Expected |
|---|---|---|
| 1 | Add 3 balls to bag | Bag shows 3/6 |
| 2 | Click "Save" in arsenal panel | Save modal appears, enter name "Test Arsenal" |
| 3 | Confirm save | Success feedback, savedArsenalId set |
| 4 | Remove all balls from bag | Bag shows 0/6 |
| 5 | Click "Load" in arsenal panel | Load modal shows "Test Arsenal" in list |
| 6 | Click "Test Arsenal" | Bag repopulates with 3 balls |

### TC-06: Lane Simulation

**Priority:** P1

| Step | Action | Expected |
|---|---|---|
| 1 | Add 1 ball to bag | Ball available in simulation dropdown |
| 2 | Click "SIMULATION" tab | Lane SVG renders with board lines, oil/dry zones |
| 3 | Select ball from dropdown | Ball name shown in selector |
| 4 | Adjust speed slider to 20 mph | Slider value updates to "20 mph" |
| 5 | Click "LAUNCH BALL" | Phase label changes to "SIMULATING…" |
| 6 | Wait 2.5 seconds | Results card appears with entry angle, breakpoint, skid/hook lengths, outcome |
| 7 | Verify trajectory | SVG path element exists with animated stroke |

### TC-07: Ball Database View

**Priority:** P2

| Step | Action | Expected |
|---|---|---|
| 1 | Click "DATABASE" tab | Table view renders with column headers |
| 2 | Verify columns | Name, Brand, Cover Type, RG, Differential, Mass Bias, Year |
| 3 | Click "Solid" coverstock filter | Table filters to solid reactive balls only |
| 4 | Verify pagination | Page indicator shows total count, "Next" button works |

### TC-08: V2 Recommendations (API-level E2E)

**Priority:** P1
**Note:** This tests the backend API directly since the frontend doesn't yet have a UI toggle for v2.

| Step | Action | Expected |
|---|---|---|
| 1 | POST `/recommendations/v2` with `arsenal_ball_ids: ["B001", "B010"]`, `method: "knn"`, `k: 5` | 200 OK, items array with 5 balls, `method: "knn"` |
| 2 | POST `/recommendations/v2` with same IDs, `method: "two_tower"` | 200 OK. If model not trained: `method: "knn"` (fallback). If trained: `method: "two_tower"` |
| 3 | POST `/recommendations/v2` with `normalize: true`, `metric: "l2"` | 200 OK, `normalized: true` in response |
| 4 | POST `/recommendations/v2` with `degradation_model: "v2"`, `game_counts: {"B001": 50}` | 200 OK, `degradation_model: "v2"` |

### TC-09: Slot Assignment (API-level E2E)

**Priority:** P2

| Step | Action | Expected |
|---|---|---|
| 1 | POST `/slots` with `arsenal_ball_ids: ["B001", "B010", "B020"]` | 200 OK, `assignments` array with 3 entries, each has `slot` (1-6), `slot_name`, `slot_description` |
| 2 | Verify `slot_coverage` | 6 entries, at least 2 `covered: true` |
| 3 | Verify `silhouette_score` | Float between -1 and 1 |

### TC-10: Degradation Comparison (API-level E2E)

**Priority:** P2

| Step | Action | Expected |
|---|---|---|
| 1 | POST `/degradation/compare` with `ball_id: "B001"`, `game_count: 50` | 200 OK |
| 2 | Verify `original.factor == 1.0` | Original specs unchanged |
| 3 | Verify `v1_linear.factor < 1.0` | Linear degradation applied |
| 4 | Verify `v2_logarithmic.factor < 1.0` | Log degradation applied |
| 5 | Verify `v1_linear.factor != v2_logarithmic.factor` | Models give different results |

---

## 4. Test Data Requirements

E2E tests require:
- Seeded `balls` table with ≥1,360 rows (from `seed_from_csv.py`)
- `arsenals` and `arsenal_balls` tables created (from `migrate_arsenals.py`)
- No pre-existing arsenals (tests create their own)

**Setup script:** `docker compose up -d postgres && docker compose run backend python scripts/setup_db.py`

---

## 5. CI Integration

E2E tests should run in a separate GitHub Actions job:

```yaml
e2e:
  runs-on: ubuntu-latest
  needs: [backend, frontend]  # only if unit tests pass
  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_PASSWORD: test
        POSTGRES_DB: bowlingdb
  steps:
    - uses: actions/checkout@v4
    - run: docker compose up -d --build
    - run: npx playwright install --with-deps chromium
    - run: npx playwright test
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: playwright-report/
```

---

## 6. Coverage Gap After E2E

Even with E2E tests, these remain untested:
- **Visual regression** (screenshot comparison of Voronoi chart)
- **Performance** (page load time, API response time under load)
- **Accessibility** (screen reader navigation through tabs)
- **Cross-browser** (E2E typically runs Chromium only in CI)
- **Mobile responsiveness** (no viewport size tests)
