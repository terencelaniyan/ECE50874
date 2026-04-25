# Project Status — Bowling Ball Grid Generator

**Last reconciled:** 2026-04-25  
**Authors:** Sajan Kumar, Fahd Laniyan  
**Course:** ECE 595/50874 — Advanced Software Engineering, Purdue University Indianapolis

**Related docs:** [TECH_DEBT.md](./TECH_DEBT.md) (open shortcuts and their cost only), [E2E_TEST_PLAN.md](./E2E_TEST_PLAN.md) (Playwright scope and backlog).

---

## 1. Project goal (from proposal)

Unified web platform with three modules:

1. **Vision (FR1):** MediaPipe BlazePose, kinematics (speed, launch angle, rev-rate proxy), client-side processing; proposal also cites sub-50 ms interactive latency (validate in report if graded).
2. **Physics (FR2):** Skid–hook–roll, dual friction, 2D parametric lane + 3D Three.js / Rapier3D worker, manual delivery parameters.
3. **Strategy (FR3–FR5):** PostgreSQL catalog (≥200 balls), weighted K-NN, Voronoi gap analysis, degradation-aware scoring (V1 linear + V2 log).

**Build order:** Phase 3 → Phase 1 → Phase 2 (reverse of proposal numbering) to reduce hardware risk.

---

## 2. What is implemented (current)

### UI and API (v2 feature set)

| Area | Status | Notes |
|------|--------|--------|
| `/recommendations/v2`, `/slots`, `/degradation/compare` | Done | Wired in UI: method toggle, slot panel, degradation compare chart |
| Phase bar + oil length display (2D) | Done | `computePhaseRatios()`, dynamic SVG |
| Physics modules | Done | `parametric-physics.ts`, `phase-detector.ts` (+ unit tests) |

### Phase 3 — Strategy engine

| Requirement | Status |
|-------------|--------|
| FR3 DB + API | Done — large `balls` catalog, FastAPI, CRUD arsenals |
| FR4 Voronoi gaps | Done — `gap_engine.py`, d3-delaunay frontend |
| FR5 Degradation | Done — V1/V2, compare endpoint |
| K-NN L1/L2, normalization | Done — v1 + v2 paths |
| Two-tower + hybrid | Done — PyTorch; requires trained checkpoint for non-KNN behavior |
| Slots (K-means + silhouette) | Done |
| Scraper / seed / admin refresh | Done |

### Phase 1 — Simulation

| Requirement | Status |
|-------------|--------|
| 2D lane + trajectory | Done — parametric `SimulationView` |
| 3D lane + Rapier worker | Done — `SimulationView3D.tsx`, `physics-worker.ts` |
| Oil patterns (backend) | Done — `oil_patterns` table, `GET /oil-patterns`, `migrate_oil_patterns.py` |
| Dual friction / phases | Done — worker + 2D phase ratios |
| Decision framework (local) | Done — `analyzeSimulation()` in 2D/3D |

### Phase 2 — Vision

| Requirement | Status |
|-------------|--------|
| MediaPipe PoseLandmarker | Done — `vision-worker.ts`, video frames |
| Kinematics + calibration + release heuristic | Done — see `bowling-kinematics.ts`, tests |
| Analysis UI + baselines + sim handoff | Done — `AnalysisView.tsx` |

**Note:** Proposal text emphasizes **live webcam**; the shipped path is primarily **uploaded video**. Call out in final report if instructors expect real-time capture.

---

## 3. Backlog (prioritized)

### High value for grading / reliability

1. **Playwright gaps** — Voronoi/grid interactions, save/load arsenal, Ball Database tab, optional API-only matrices. See [E2E_TEST_PLAN.md §5](./E2E_TEST_PLAN.md).
2. **HTTP integration tests** — `POST /recommendations/v2`, `POST /slots`, `POST /degradation/compare`, `POST /admin/train-model` (today mostly unit-tested engines + v1 rec integration).
3. **Two-tower reliability** — `setup_db.py` already runs `train_model.py`, but **PyTorch is not in** `services/backend/requirements.txt`, so a minimal `pip install -r requirements.txt` clone may skip successful training; Docker images also omit scripts/checkpoints by default. Ship or document `models/two_tower.pt`, add `torch` to deps, or surface a loud UI when two-tower is unavailable ([TECH_DEBT.md](./TECH_DEBT.md) §2).

### Medium / polish

4. **Coverstock in classic KNN distance** — Proposal 4D-style features; partially covered by two-tower / v2 normalization, not necessarily in v1 KNN vector.
5. **Catalog enrichment** — Optional fields (hook potential, length rating, etc.) via extra scraping.
6. **NFR evidence** — If required: measure pose pipeline latency; document client-only video (NFR2).

### Stretch

7. **Live webcam** path at full frame rate (vs upload-only).
8. **Deeper sim → strategy loop** — e.g. automatic recommendation refresh from simulation outcome beyond local `analyzeSimulation()` / any existing `getRecommendationsV2` hooks (verify desired scope in proposal).

---

## 4. Testing

### 4.1 Layers

| Layer | Tool | Notes |
|-------|------|--------|
| Backend unit | pytest | Engine + API-focused unit tests under `services/backend/tests/` |
| Backend integration | pytest + httpx + Postgres | Requires `DATABASE_URL`; runs in CI backend job with Postgres service + seeded DB |
| Frontend unit | Vitest + RTL + MSW | Under `services/frontend/src/**/*.test.ts(x)` |
| E2E | Playwright | `services/frontend/tests/e2e/` — Chromium, Vite on 5173 + API on 8000; runs in dedicated CI `e2e` job |

**Counts:** Re-run after changes:

```bash
cd services/backend && python -m pytest tests/ -q --collect-only
cd services/frontend && npm run test:run
cd services/frontend && npm run test:e2e
```

As of last reconciliation: **121** backend tests collected; **11** Playwright tests across **8** spec files; frontend Vitest count — re-run `npm run test:run` for the current total (suites include `parametric-physics`, `phase-detector`, `decision-framework`, kinematics, etc.).

### 4.2 What still lacks coverage

| Gap | Severity |
|-----|----------|
| Full-stack flows in E2E (grid hover, arsenal persistence, DB tab) | Medium |
| v2 / slots / degradation / train-model **HTTP** integration | Medium |
| Visual regression, a11y, load/latency benchmarks | Low |

---

### 4.3 CI enforcement snapshot (2026-04-25)

- **Backend job:** starts Postgres service, exports `DATABASE_URL`, seeds balls + arsenal schema, runs unit (`-m "not integration"`) and integration (`-m "integration"`) pytest phases.
- **Frontend job:** runs Vitest coverage (`npm run test:coverage`).
- **E2E job:** starts Postgres + backend, installs Playwright Chromium, runs `npm run test:e2e`, uploads Playwright report artifact.

---

### 4.4 Validation evidence split (Simulation / Vision)

| Area | Implemented capability | Validation evidence available now | Validation gap / next step |
|------|------------------------|----------------------------------|----------------------------|
| Simulation (2D/3D) | Parametric lane model, phase detector, 3D Rapier worker, UI launch flow | Unit tests for physics helpers (`parametric-physics`, `phase-detector`), Playwright smoke/flow coverage for 2D + 3D tabs | Limited empirical validation against external ground truth trajectories or benchmark datasets |
| Vision / Pose | MediaPipe worker pipeline, kinematics extraction, release heuristic, analysis UI | Unit tests for kinematics/math helpers and app-level integration smoke paths | No formal latency benchmark evidence in this status file; no controlled user study validating coaching quality |

This split is intentional: implemented functionality is broader than currently proven performance/accuracy, especially for simulation realism and pose-analysis outcomes.

---

## 5. Resolved (historical fixes)

- **Simulation logic testability** — Pure helpers in `parametric-physics.ts` / `phase-detector.ts` (with tests).
- **Static phase bar** — Driven by computed skid/hook lengths.
- **Oil patterns only in frontend** — Backend table + API exist; remaining issue is **duplicate definitions** in some UI paths (see [TECH_DEBT.md](./TECH_DEBT.md)).

---

## 6. Proposal vs implementation (current)

| Proposal | As built | Notes |
|----------|----------|--------|
| Weighted Euclidean | V1 often L1; L2 + normalize in v2 | Documented tradeoff |
| 4D KNN features | 3D KNN + richer two-tower | See backlog |
| Rapier3D + worker | Yes | + 2D fallback/parametric |
| Three.js 3D | Yes | `SimulationView3D` |
| MediaPipe vision | Yes | Video upload workflow primary |
| `oil_patterns` DB | Yes | Frontend still embeds parallel pattern data in places |
| Log degradation | V2 | Matches formula intent |
| Two-tower (professor) | Yes | Training/checkpoint is operational debt |

---

## 7. Archive

*Historical snapshots. Current code and test counts may differ; use §4 commands and git for truth.*

### 7.1 Sprint file inventory (≈2026-03)

**Added (representative):** `services/backend/app/two_tower.py`, `synthetic_data.py`, `slot_assignment.py`, `services/backend/tests/test_slot_assignment.py`, `test_two_tower.py`, `services/frontend/src/api/recommendations-v2.ts`, `slots.ts`, `degradation.ts`, `SlotAssignmentPanel.tsx`, `DegradationCompareView.tsx`, `parametric-physics.ts`, `phase-detector.ts`.

**Modified (representative):** `degradation.py`, `recommendation_engine.py`, `api_models.py`, `services.py`, `main.py`, `RecommendationsListCompact.tsx`, `Layout.tsx`, `ArsenalPanel.tsx`, `SimulationView.tsx`, tests for degradation and recommendation engine.

### 7.2 Full test matrix (legacy TECH_DEBT §4.1, ≈2026-03-14)

| Module | Test File | # Tests | Type | What It Covers |
|--------|-----------|---------|------|----------------|
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

*Legacy rollup from same report:* 108 backend + 103 frontend + 24 integration + 11 E2E = **246** tests. Frontend row counts predate added suites (e.g. `parametric-physics`, `phase-detector`, `decision-framework`, kinematics); see §4 for refresh commands.

### 7.3 How tests were layered (legacy TECH_DEBT §4.2)

| Layer | Framework | Strategy |
|-------|-----------|----------|
| Backend unit tests | pytest | Direct function calls with in-memory dicts (no DB). Covers engine modules. |
| Backend integration tests | pytest + httpx TestClient | HTTP round-trip against FastAPI with real PostgreSQL. Requires `DATABASE_URL`. Runs in current backend CI job (legacy table originally said skipped). |
| Frontend unit tests | Vitest + Testing Library | Components + MSW stubs from `test/handlers.ts`. |
| Frontend integration test | Vitest | App mount with `BagProvider`, smoke render. |
| CI pipeline | GitHub Actions | Current workflow has three jobs: backend (unit + integration), frontend (Vitest coverage), and e2e (Playwright). |

---

## 8. Detailed module → test map (reference)

| Module | Test file (backend) | Focus |
|--------|---------------------|--------|
| Degradation V1/V2, compare, λ | `test_degradation.py` | Factors, caps, V2 curve |
| Voronoi gaps | `test_gap_engine.py` | Tessellation, zones, edge cases |
| K-NN L1/L2, normalize | `test_recommendation_engine.py` | Distance, weights, empty inputs |
| Slots / K-means / silhouette | `test_slot_assignment.py` | Clustering, silhouette |
| Two-tower + synthetic data | `test_two_tower.py` | Encoding, inference, small train |
| Arsenals / gaps / recommendations API | `test_*_api.py` | Selected HTTP contracts |

Frontend tests span API clients, bag context, catalog, simulation helpers, decision framework, kinematics, and integration smoke.

---

## 9. Informal usability evidence (optional add-on)

No informal usability notes have been recorded in this document yet.

Suggested lightweight format before final submission:

1. **Participants:** count + profile (e.g., classmates familiar with bowling / not familiar).
2. **Tasks:** find recommendations, add/remove arsenal balls, run simulation, read analysis.
3. **Observations:** completion blockers, confusing labels, missing affordances.
4. **Actions taken:** concrete UI/doc tweaks resulting from observations.
