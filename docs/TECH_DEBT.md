# Technical Debt Report — Bowling Ball Grid Generator

**Date:** 2026-03-14
**Authors:** Sajan Kumar, Fahd Laniyan
**Course:** ECE 595/50874 — Advanced Software Engineering, Purdue University Indianapolis

---

## 1. Project Goal (From Proposal)

The Bowling Ball Grid Generator is a unified web-based platform integrating three technical modules:

1. **Vision Engine (FR1):** MediaPipe BlazePose webcam pose estimation extracting ball speed, launch angle, and rev-rate proxy from 33 body landmarks in real-time (<50 ms).
2. **Physics Core (FR2):** Rapier3D rigid-body simulation with dual-state friction (μ_k ≈ 0.04 oil, μ_k ≈ 0.2 dry) rendered via Three.js in a 3D lane environment, modeling skid-hook-roll phases per USBC benchmarks.
3. **Strategy Engine (FR3–FR5):** PostgreSQL ball database (≥200 balls), weighted K-NN recommendation with Voronoi gap analysis, and degradation-aware scoring using logarithmic coverstock-dependent decay.

The proposal defined three implementation phases:
- **Phase 1:** Rapier3D physics + Three.js 3D rendering + manual parameter input
- **Phase 2:** MediaPipe BlazePose vision integration + calibration
- **Phase 3:** Recommendation engine + database + Voronoi gap analysis

The implementation was executed in reverse order (Phase 3 → Phase 1) to front-load the data layer and recommendation logic, which had no external hardware dependencies.

---

## 2. What Was Achieved

### Frontend UI Wiring (feat/v2-ui branch) — COMPLETE

All three new backend endpoints (`/recommendations/v2`, `/slots`, `/degradation/compare`) now have full UI:

| Feature | Status | Commit |
|---|---|---|
| V2 Recommendation toggle (KNN/V2/Hybrid) with method badges | **DONE** | `feat(frontend): add v2 recommendation method toggle` |
| Slot Assignment panel (6-ball system, silhouette score) | **DONE** | `feat(frontend): add slot assignment panel with 6-ball system` |
| V1/V2 degradation toggle in arsenal cards (log health, λ) | **DONE** | `feat(frontend): add v1/v2 degradation toggle in arsenal panel` |
| Degradation comparison chart (V1 linear vs V2 log curves) | **DONE** | `feat(frontend): add degradation comparison chart` |
| Extract simulation physics into testable modules | **DONE** | `refactor(frontend): extract simulation physics into testable module` |
| Wire phase bar to computed values + oil pattern display | **DONE** | `fix(frontend): wire phase bar to computed simulation values` |

**Frontend test count:** 45 tests passing (no regressions from UI additions)

### Phase 3: Strategy Engine — COMPLETE

| Proposed Requirement | Status | Implementation |
|---|---|---|
| **FR3: Database ≥200 balls, PostgreSQL, HTTP API** | **DONE** | 1,360 balls in `data/balls.csv`, PostgreSQL 16, FastAPI with 16+ endpoints |
| **FR4: Voronoi gap analysis in RG–Diff space** | **DONE** | `gap_engine.py` — SciPy Voronoi tessellation, zone clustering, labels. Frontend renders via d3-delaunay |
| **FR5: Degradation-aware recommendation** | **DONE** | Two models: V1 linear (legacy), V2 logarithmic coverstock-dependent (`1 - λ·log(1+N)`) |
| Weighted K-NN (proposal eq. 3) | **DONE** | L1 (Manhattan) and L2 (Euclidean) with min-max normalization. `recommendation_engine.py` |
| Two-Tower neural recommender | **DONE** | PyTorch model with synthetic training data from 6-ball slot system. `two_tower.py` |
| Silhouette-based slot assignment | **DONE** | K-Means + silhouette score for optimal k selection. `slot_assignment.py` |
| Arsenal CRUD | **DONE** | Full create/read/update/delete with custom ball support |
| Data pipeline | **DONE** | Playwright scraper (`scrape_btm.py`), CSV seeder, admin refresh endpoint |
| CI/CD | **DONE** | GitHub Actions (pytest + Vitest), Docker Compose (Postgres + FastAPI + Nginx + Caddy) |

**Endpoints delivered (16):**
`/health`, `/balls`, `/balls/{id}`, `/arsenals` (CRUD × 5), `/recommendations` (v1 KNN), `/recommendations/v2` (two-tower/hybrid/enhanced KNN), `/gaps`, `/slots`, `/degradation/compare`, `/admin/refresh-catalog`, `/admin/train-model`

**Test coverage:**
- Backend: 108 unit tests passing (degradation, gap engine, recommendation engine, slot assignment, two-tower model, synthetic data, new endpoint API tests)
- Frontend: 103 tests passing (Vitest + Testing Library + MSW mocks + bowling kinematics)
- E2E: 11 Playwright tests passing (smoke, catalog, recommendations, slots, degradation, 2D sim, 3D sim, oil patterns API)
- Integration tests: 24 (require DATABASE_URL, skipped in CI)
- **Total: 246 tests**

### Phase 1: Physics Simulation — DONE (2D + 3D)

| Proposed Requirement | Status | What Exists |
|---|---|---|
| Lane simulation with trajectory | **DONE** | 2D SVG (parametric) + 3D Three.js (Rapier3D physics worker) |
| Delivery parameter input | **DONE** | Sliders for speed, rev rate, launch angle, board — shared across 2D and 3D views |
| Oil pattern selection | **DONE** | 6 patterns (House, Badger, Cheetah, Chameleon, Scorpion, Viper) from `oil_patterns` DB table |
| Skid/hook/roll phase visualization | **DONE** | Phase bar from `computePhaseRatios()` (2D), phase classification from velocity sync (3D) |
| Results display | **DONE** | Entry angle, breakpoint, skid/hook/roll lengths, total time, outcome, decision framework advice |
| **Rapier3D rigid-body physics** | **DONE** | `physics-worker.ts` — WASM-based rigid body with dual-state friction, falls back to kinematic |
| **Three.js 3D rendering** | **DONE** | `SimulationView3D.tsx` — 3D lane, pins, animated ball, trajectory trail, 3 camera modes |
| **Dual-state friction model (eq. 2)** | **DONE** | Zone-based μ lookup: oil zones (μ≈0.04), dry zones (μ≈0.18–0.22), rolling resistance (μ_r≈0.01) |
| **Euler's equations for asymmetric inertia** | **DONE** | Rapier3D handles asymmetric inertia tensor from RG + differential. Ball spec drives I_base and asymmetry factor |
| **`oil_patterns` DB table** | **DONE** | `oil_patterns` table with JSONB zones, `GET /oil-patterns` API endpoint, 6 seeded patterns |
| Decision Framework (sim → rec feedback) | **DONE** | `analyzeSimulation()` produces advice with recommended actions (both 2D and 3D views) |

### Phase 2: Vision Integration — DONE (video upload, kinematics extraction)

| Proposed Requirement | Status | What Exists |
|---|---|---|
| FR1: MediaPipe BlazePose (33 landmarks) | **DONE** | `vision-worker.ts` loads PoseLandmarker from CDN, processes video frames |
| Kinematic extraction (speed, angle, rev-rate proxy) | **DONE** | `bowling-kinematics.ts` — `extractKinematics()` with 16 unit tests |
| Calibration system (bowler height) | **DONE** | `calibration.ts` — pixel-to-feet using shoulder-to-ankle ratio |
| Release detection | **DONE** | `detectReleaseFrame()` — wrist velocity peak with 3-frame moving average |
| Vision Web Worker | **DONE** | `vision-worker.ts` with main-thread fallback |
| Video upload + analysis UI | **DONE** | `AnalysisView.tsx` with 6 sub-components: uploader, overlay, scrubber, results, baselines, form feedback |
| Baseline comparison (PBA/USBC) | **DONE** | Speed/rev/angle baselines from published data |
| Form evaluation | **DONE** | Arm verticality, knee bend, follow-through, balance at release |
| Simulation integration | **DONE** | "Simulate This Delivery" button passes extracted params to SimulationView |

---

## 3. What Is Remaining (Prioritized)

### 3.1 HIGH — Phase 1 Completion: 3D Physics Simulation

This is the critical gap between proposal and implementation. The proposal's Phase 1 deliverable is:

> "Rapier3D rigid-body simulation with a dual-friction model, Three.js rendering pipeline, and a manual parameter input interface."

**What must be built:**

| Task | Complexity | Dependencies | Files to Create/Modify |
|---|---|---|---|
| **Rapier3D WASM integration** — Load rapier3d-compat in a Web Worker, create world with gravity, lane collider, ball rigid body | High | `@dimforge/rapier3d-compat` npm package | `src/workers/physics-worker.ts` (new) |
| **Dual-state friction model** — Implement kinetic friction F_k = -μ_k·N·(v_p/\|v_p\|) with zone-dependent μ_k (0.04 oil, 0.18–0.22 dry) and rolling resistance (μ_r ≈ 0.01) | High | Rapier3D worker | Inside physics worker |
| **Three.js 3D scene** — Lane geometry (60ft × 42in), pin deck, ball mesh with texture, camera (overhead + chase), lighting | High | `three` npm package | `src/components/SimulationView3D.tsx` (new) |
| **Trajectory rendering** — Read position time-series from physics worker, render as trail/line in Three.js scene | Medium | Three.js scene + physics worker | Inside SimulationView3D |
| **Phase detection** — Classify skid→hook→roll transitions from velocity/angular-velocity data returned by physics worker | Medium | Physics worker output | `src/utils/phase-detector.ts` (new) |
| **`oil_patterns` DB table** — Schema: id, name, length_ft, board_data (JSON array of per-board oil units) | Low | Backend migration script | `scripts/migrate_oil_patterns.py` (new), `services.py` edit |
| **Oil pattern API endpoint** — `GET /oil-patterns` returning available patterns | Low | DB table | `main.py`, `api_models.py` edits |
| **Replace or supplement SimulationView** — Wire new 3D view into Layout tab, keep 2D as fallback | Medium | Three.js component ready | `Layout.tsx` edit |

**Success criterion (from proposal):** Trajectory exhibits three distinct phases (skid, hook, and roll) consistent with USBC qualitative descriptions.

**Risk mitigation (from proposal):** If rigid-body solver coupling proves unstable, fall back to simplified kinematic model with parabolic trajectory approximation — which is essentially what the current 2D parametric model already provides.

### 3.2 MEDIUM — Phase 2: Vision Integration

| Task | Complexity | Dependencies |
|---|---|---|
| MediaPipe JS SDK in Web Worker | Medium | `@mediapipe/tasks-vision` npm package |
| Ball speed extraction (wrist displacement over 100 ms) | Medium | Pose landmarks |
| Launch angle extraction (wrist-elbow vector vs lane axis) | Medium | Pose landmarks |
| Rev-rate proxy (forearm angular velocity regression) | High | Pose landmarks + calibration |
| Manual foul-line calibration UI | Medium | Canvas overlay |
| Release detection (slide-foot deceleration) | Medium | Hip/knee/ankle landmarks |

### 3.3 LOW — Polish and Proposal Gaps

| Task | Status | Notes |
|---|---|---|
| 4D feature space for KNN (RG, diff, mass bias, coverstock encoding) | **Partially done** — current uses 3D (rg, diff, int_diff) + L2 + normalization; coverstock encoding exists in `synthetic_data.py` but not wired to KNN | Wire coverstock ordinal encoding into KNN distance function |
| Decision Framework (simulation → recommendation feedback loop) | Not built | Requires physics engine; post-simulation triggers recommendation with "why" explanation |
| Database enrichment (hook_potential, length_rating, backend_reaction, core_name) | Not done | Would require scraping BTM reviews or manufacturer pages |
| `oil_patterns` table | Not done | Blocked by Phase 1 work |
| Feature normalization in v1 KNN | **Done in v2** | V2 endpoint supports `normalize: true` |

---

## 4. Testing Matrix

### 4.1 What Is Tested

| Module | Test File | # Tests | Type | What It Covers |
|---|---|---|---|---|
| Degradation V1 (linear) | `test_degradation.py` | 5 | Unit | Zero/negative games, 87-game cap, factor=0.78, field preservation |
| Degradation V2 (logarithmic) | `test_degradation.py` | 7 | Unit | Log decay shape, coverstock-dependent λ, metadata fields, formula verification, min-factor floor |
| Degradation comparison | `test_degradation.py` | 2 | Unit | V1 vs V2 structure and divergence |
| Lambda lookup | `test_degradation.py` | 3 | Unit | Exact match, case-insensitive, unknown→default |
| Gap engine (Voronoi) | `test_gap_engine.py` | 11 | Unit | Empty catalog, all-in-arsenal, sorted output, jitter determinism, zone grouping, zone labeling |
| Recommendation (L1 KNN) | `test_recommendation_engine.py` | 11 | Unit | Zero distance, positive distance, weights, empty arsenal/candidates, k-limit, min-distance, diversity, score=min |
| Recommendation (L2) | `test_recommendation_engine.py` | 4 | Unit | L2 zero, single-dim, multi-dim, L2-with-weights |
| Normalization | `test_recommendation_engine.py` | 4 | Unit | Empty, single-row, scale-to-01, recommend-with-normalization |
| Slot assignment (K-Means) | `test_slot_assignment.py` | 6 | Unit | Empty arsenal, single ball→slot 1, two-ball different slots, 6-ball coverage, metadata, coverage tracking |
| K-Means algorithm | `test_slot_assignment.py` | 3 | Unit | Single cluster, two clusters separation, fewer-than-k points |
| Silhouette score | `test_slot_assignment.py` | 3 | Unit | Single point, single cluster, well-separated clusters |
| Feature normalization | `test_slot_assignment.py` | 1 | Unit | Min-max to [0,1] |
| Feature encoding | `test_two_tower.py` | 7 | Unit | Ball→5 features, None handling, arsenal→15 features, coverstock encoding (known/case/unknown), brand encoding |
| Slot fitting | `test_two_tower.py` | 3 | Unit | Ball fits slot 1, doesn't fit wrong slot, fits slot 5 |
| Synthetic data | `test_two_tower.py` | 3 | Unit | Produces data, deterministic with seed, empty catalog |
| Two-tower inference | `test_two_tower.py` | 3 | Unit | No model→empty, empty arsenal→empty, empty candidates→empty |
| PyTorch model | `test_two_tower.py` | 3 | Unit (conditional) | Forward pass shape, embedding L2 norm=1, small training smoke test |
| Arsenal CRUD API | `test_arsenals_api.py` | 6 | Integration | Create empty/with-balls/with-custom, list, update+delete, invalid ball ID |
| Gaps API | `test_gaps_api.py` | 3 | Integration | Both params→400, empty arsenal→200, invalid→400 |
| Recommendations API | `test_recommendations_api.py` | 4 | Integration | Neither/both params→400, invalid ball→400, valid→200 |
| Frontend: BallCard | `BallCard.test.tsx` | 4 | Unit | Renders name/brand/specs, add-to-bag callback |
| Frontend: VirtualBag | `VirtualBag.test.tsx` | 3 | Unit | Empty state, renders entries, remove callback |
| Frontend: BallCatalog | `BallCatalog.test.tsx` | 5 | Unit | Loads on mount, search debounce, brand filter |
| Frontend: BagContext | `BagContext.test.tsx` | 4 | Unit | Add/remove/set game count, duplicate prevention |
| Frontend: API client | `client.test.tsx` | 5 | Unit | GET/POST success, error handling, network error |
| Frontend: API balls | `balls.test.ts` | 3 | Unit | listBalls params, getBall by ID |
| Frontend: API arsenals | `arsenals.test.ts` | 5 | Unit | CRUD operations |
| Frontend: API gaps | `gaps.test.ts` | 2 | Unit | getGaps request/response |
| Frontend: App integration | `App.integration.test.tsx` | 1 | Integration | App mounts and renders |

**Total: 108 backend + 103 frontend + 24 integration + 11 E2E = 246 tests**

### 4.2 How It Is Tested

| Layer | Framework | Strategy |
|---|---|---|
| Backend unit tests | pytest | Direct function calls with in-memory dicts (no DB). Covers all engine modules. |
| Backend integration tests | pytest + httpx TestClient | Full HTTP round-trip against FastAPI app with real PostgreSQL. Requires `DATABASE_URL` env var. Skipped in CI. |
| Frontend unit tests | Vitest + Testing Library | Component rendering + user interaction. MSW (Mock Service Worker) intercepts fetch calls with handler stubs from `test/handlers.ts`. |
| Frontend integration test | Vitest | Full App mount with BagProvider, verifies render without crash. |
| CI pipeline | GitHub Actions | Runs on push/PR to main. Backend: `pytest tests/ -v` (unit only). Frontend: `npm run test:run` (Vitest). |

### 4.3 What Is NOT Tested

| Gap | Impact | Reason |
|---|---|---|
| **End-to-end (frontend → backend → DB → frontend)** | HIGH | No Playwright/Cypress browser tests. We have never verified the full flow of: user adds ball → sees recommendation → adds to bag → saves arsenal. All frontend tests mock the API. All backend tests mock the DB (unit) or test endpoints in isolation (integration). |
| **V2 recommendation endpoint** | MEDIUM | No integration test for `POST /recommendations/v2` — only the v1 KNN endpoint has integration tests. The two-tower, hybrid, and enhanced KNN paths are only unit-tested at the engine level. |
| **Slot assignment endpoint** | MEDIUM | No integration test for `POST /slots`. The `assign_slots()` function is unit-tested but the HTTP→service→engine flow is not. |
| **Degradation comparison endpoint** | LOW | No integration test for `POST /degradation/compare`. The `compare_models()` function is unit-tested. |
| **Two-tower model training** | LOW | `POST /admin/train-model` has no integration test. The `train_model()` function has a smoke test (`test_train_model_small`). |
| **SimulationView physics** | LOW | Physics extracted to `src/utils/parametric-physics.ts` (pure functions, independently testable) but no unit tests written yet for these functions. |
| **Cross-browser rendering** | LOW | No visual regression tests. D3-delaunay Voronoi rendering and SVG trajectory are not screenshot-tested. |
| **Performance / load** | LOW | No benchmarks for recommendation engine with full 1,360-ball catalog. No latency tests for Voronoi computation. |

### 4.4 Did We Test End-to-End Using the Frontend?

**No.** This is the single largest testing gap.

The project has strong unit test coverage (139 tests) and partial integration coverage (backend HTTP tests), but there is **no automated end-to-end test** that:

1. Starts the full Docker stack (Postgres + FastAPI + Nginx)
2. Opens a browser (Playwright/Cypress)
3. Navigates the UI tabs
4. Adds balls to the bag from the catalog
5. Verifies recommendations appear in the sidebar
6. Verifies the Voronoi grid updates
7. Saves an arsenal and reloads it
8. Runs a simulation and checks results
9. Uses the v2 recommendation toggle

**Manual testing has been performed** during development (starting Docker Compose, clicking through the UI), but this is not captured in any automated test or documented test plan.

**Recommended fix:** Add a Playwright E2E test suite (`tests/e2e/`) that covers the critical user flows. See [E2E_TEST_PLAN.md](./E2E_TEST_PLAN.md) for the proposed test cases.

---

## 5. Architecture Debt

### 5.1 ~~Frontend Simulation Is Untestable~~ — RESOLVED

**Fixed in `feat/v2-ui` branch.** Physics extracted into `src/utils/parametric-physics.ts` (`computeTrajectory()` and `computeTrajectoryPath()` pure functions) and phase detection into `src/utils/phase-detector.ts` (`computePhaseRatios()`). `SimulationView.tsx` now imports and calls these functions. The pure functions are independently testable and can be swapped for Rapier3D later.

### 5.2 Oil Patterns Hardcoded

The proposal specifies an `oil_patterns` table with per-board oil-unit distributions. Currently, oil patterns are 4 hardcoded strings in `SimulationView.tsx` with only the pattern length extracted via string matching:

```typescript
if (oilPattern.includes("Badger")) patternLength = 52;
```

**Fix:** Create `oil_patterns` table, seed with real pattern data, expose via `GET /oil-patterns`, and have the frontend fetch + display them.

### 5.3 Two-Tower Model Not Pre-Trained

The two-tower recommender requires explicit training via `POST /admin/train-model` before it produces results. If no model file exists at `models/two_tower.pt`, the v2 endpoint silently falls back to KNN.

**Fix:** Add a training step to `scripts/setup_db.py` (or a separate `scripts/train_model.py`) so the model is trained automatically after seeding. Alternatively, ship a pre-trained model checkpoint in the repo.

### 5.4 ~~Phase Bar Is Static~~ — RESOLVED

**Fixed in `feat/v2-ui` branch.** Phase bar flex ratios are now computed from `computePhaseRatios(skidFt, hookFt)` and update dynamically after each simulation launch. Oil pattern length is also displayed on the lane SVG (e.g., "OIL END 38ft") and in the results card, updating reactively when the pattern dropdown changes.

### 5.5 No Feedback Loop (Decision Framework)

The proposal describes a "Decision Framework" where poor simulation outcomes trigger the Strategy Engine to explain *why* a ball is underperforming and recommend either maintenance or a replacement. This requires:
- Physics engine output → recommendation input
- "Your ball's hook rating has degraded by 22% due to 87 games" type explanations

This is not implemented and requires Phase 1 completion first.

---

## 6. Deviation Log: Proposal vs. Implementation

| Proposal Specification | Implementation | Justification |
|---|---|---|
| Weighted Euclidean distance (eq. 3): `d(P,Q) = sqrt(Σ w_i(f_P,i - f_Q,i)²)` | V1 uses L1 (Manhattan); V2 supports both L1 and L2 | L1 was simpler to implement initially; L2 added in v2 as proposed |
| 4D feature space (RG, diff, mass bias, coverstock encoding) | 3D (RG, diff, int_diff) for KNN; 5D (+ coverstock + brand) for two-tower | int_diff is more standard than "mass bias" (same physical quantity). Two-tower uses richer features. |
| Min-max normalized features (proposal sec. IV-D-1) | V1 uses raw values; V2 supports `normalize: true` | Added as enhancement in v2 |
| Logarithmic degradation `H_eff = H_factory · max(0, 1-λ·log(1+N))` (eq. 4) | Implemented in V2 with coverstock-dependent λ | Matches proposal exactly |
| Rapier3D rigid-body physics in Web Worker | 2D parametric Bézier model in main thread | Phase 1 not yet reached; parametric model is the proposal's risk-mitigation fallback |
| Three.js 3D lane rendering | 2D SVG top-down view | Phase 1 not yet reached |
| MediaPipe BlazePose vision | Not implemented | Phase 2 not yet reached |
| `oil_patterns` table | Hardcoded in frontend | Phase 1 dependency |
| Professor's two-tower suggestion | Implemented with PyTorch | Added as v2 alongside KNN baseline per professor feedback |

---

## 7. File Inventory

### New Files Created (This Sprint)

| File | Purpose | Lines | Tests |
|---|---|---|---|
| `app/two_tower.py` | PyTorch two-tower model (user tower + item tower + training + inference) | ~280 | `test_two_tower.py` (16 tests) |
| `app/synthetic_data.py` | Synthetic arsenal generation + feature encoding for training | ~200 | `test_two_tower.py` (shared) |
| `app/slot_assignment.py` | K-Means + silhouette slot assignment | ~250 | `test_slot_assignment.py` (13 tests) |
| `tests/test_slot_assignment.py` | Slot assignment unit tests | ~130 | — |
| `tests/test_two_tower.py` | Two-tower + synthetic data unit tests | ~170 | — |
| `frontend/src/api/recommendations-v2.ts` | V2 recommendation API client | ~25 | Not yet tested |
| `frontend/src/api/slots.ts` | Slot assignment API client | ~15 | Not yet tested |
| `frontend/src/api/degradation.ts` | Degradation comparison API client | ~20 | Not yet tested |
| `frontend/src/components/SlotAssignmentPanel.tsx` | 6-slot assignment UI with silhouette score | ~120 | Not yet tested |
| `frontend/src/components/DegradationCompareView.tsx` | V1 vs V2 degradation curve chart (canvas) | ~190 | Not yet tested |
| `frontend/src/utils/parametric-physics.ts` | Extracted simulation physics (pure functions) | ~110 | Not yet tested (testable) |
| `frontend/src/utils/phase-detector.ts` | Phase bar ratio computation | ~20 | Not yet tested (testable) |

### Modified Files (This Sprint)

| File | Changes |
|---|---|
| `app/degradation.py` | Added V2 logarithmic model, coverstock-dependent λ, compare_models(), preserved V1 |
| `app/recommendation_engine.py` | Added L2 metric, min-max normalization, `metric` and `normalize` params |
| `app/api_models.py` | Added schemas: RecommendV2Request/Response, SlotAssign*, DegradationCompare*, TrainModel* |
| `app/services.py` | Added: get_recommendations_v2, get_slot_assignments, get_degradation_comparison, train_two_tower |
| `app/main.py` | Added 4 endpoints: `/recommendations/v2`, `/slots`, `/degradation/compare`, `/admin/train-model` |
| `requirements.txt` | Added: torch, numpy, scikit-learn |
| `frontend/src/types/ball.ts` | Added: RecommendV2*, SlotAssign*, DegradationCompare* TypeScript types |
| `frontend/src/components/RecommendationsListCompact.tsx` | Added KNN/V2/Hybrid method toggle, method badges, fallback indicator |
| `frontend/src/components/Layout.tsx` | Added Recs/Slots right-panel toggle, SlotAssignmentPanel import |
| `frontend/src/components/ArsenalPanel.tsx` | Added V1/V2 degradation toggle, compare link, DegradationCompareView integration |
| `frontend/src/components/SimulationView.tsx` | Refactored to use extracted physics modules, dynamic phase bar, dynamic oil zone display |
| `frontend/src/index.css` | Added styles for method toggle, slot panel, degradation toggle/chart, right-panel toggle |
| `tests/test_degradation.py` | Expanded from 5 to 17 tests (V2 + comparison + lambda) |
| `tests/test_recommendation_engine.py` | Expanded from 11 to 19 tests (L2 + normalization) |

---

## 8. Recommended Next Steps

### Immediate (Before Final Report)

1. **Add Playwright E2E tests** — See [E2E_TEST_PLAN.md](./E2E_TEST_PLAN.md)
2. ~~**Extract SimulationView physics** into testable pure function~~ — **DONE** (`parametric-physics.ts`, `phase-detector.ts`)
3. ~~**Wire phase bar to computed values**~~ — **DONE** (dynamic from `computePhaseRatios()`)
4. **Pre-train two-tower model** as part of setup script
5. **Add integration tests** for v2/slots/degradation endpoints
6. **Add unit tests** for `parametric-physics.ts` and `phase-detector.ts` (now extractable, ~30 min effort)

### Phase 1 Completion (If Time Permits)

6. **Rapier3D Web Worker** with dual-friction zone model
7. **Three.js 3D scene** replacing 2D SVG
8. **`oil_patterns` table** with real pattern data
9. **Phase detection** from physics output

### Phase 2 (Stretch)

10. **MediaPipe BlazePose** in Vision Worker
11. **Calibration system**
12. **Decision Framework** feedback loop
