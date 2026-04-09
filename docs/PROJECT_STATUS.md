# Project Status — Bowling Ball Grid Generator

**Last reconciled:** 2026-04-08  
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
3. **Two-tower onboarding** — Train during `setup_db.py` or ship `models/two_tower.pt` so v2 is not silently KNN-only on fresh clones.

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
| Backend integration | pytest + httpx + Postgres | Needs `DATABASE_URL`; skipped in default CI |
| Frontend unit | Vitest + RTL + MSW | Under `services/frontend/src/**/*.test.ts(x)` |
| E2E | Playwright | `services/frontend/tests/e2e/` — Chromium, Vite on 5173 + API on 8000 |

**Counts:** Re-run after changes:

```bash
cd services/backend && python -m pytest tests/ -q --collect-only
cd services/frontend && npm run test:run
cd services/frontend && npm run test:e2e
```

As of last reconciliation: **108** backend tests collected; **11** Playwright tests across **8** spec files; frontend Vitest count is **110+** (includes `parametric-physics`, `phase-detector`, `decision-framework`, kinematics, etc.).

### 4.2 What still lacks coverage

| Gap | Severity |
|-----|----------|
| Full-stack flows in E2E (grid hover, arsenal persistence, DB tab) | Medium |
| v2 / slots / degradation / train-model **HTTP** integration | Medium |
| Visual regression, a11y, load/latency benchmarks | Low |

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

## 7. Archive — sprint file inventory (≈2026-03)

*Historical record of files touched when adding v2 recommendations, slots, degradation compare, and simulation refactors. Current code may have diverged; use git for truth.*

**Added (representative):** `app/two_tower.py`, `app/synthetic_data.py`, `app/slot_assignment.py`, `tests/test_slot_assignment.py`, `tests/test_two_tower.py`, `frontend/src/api/recommendations-v2.ts`, `slots.ts`, `degradation.ts`, `SlotAssignmentPanel.tsx`, `DegradationCompareView.tsx`, `parametric-physics.ts`, `phase-detector.ts`.

**Modified (representative):** `degradation.py`, `recommendation_engine.py`, `api_models.py`, `services.py`, `main.py`, `RecommendationsListCompact.tsx`, `Layout.tsx`, `ArsenalPanel.tsx`, `SimulationView.tsx`, tests for degradation and recommendation engine.

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
