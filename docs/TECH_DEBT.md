# Technical Debt — Bowling Ball Grid Generator

**Purpose:** Track **ongoing shortcuts** and their **cost**. For feature status, backlog, and test overview, use [PROJECT_STATUS.md](./PROJECT_STATUS.md) and [E2E_TEST_PLAN.md](./E2E_TEST_PLAN.md).

---

## 1. Dual oil-pattern definitions

**What:** PostgreSQL `oil_patterns` + `GET /oil-patterns` coexist with **embedded** pattern lists in the frontend (e.g. `SimulationView` string/`includes` length hints, `SimulationView3D` `OIL_PATTERNS` constants).

**Cost:** Adding or correcting a pattern requires touching multiple places; risk of mismatch between API, 2D UI, and 3D physics.

**Direction:** Single source of truth — fetch zones from API everywhere, or generate TypeScript from seed data at build time.

---

## 2. Two-tower checkpoint not part of default clone setup

**What:** `POST /admin/train-model` (or a shipped `models/two_tower.pt`) is required for full two-tower/hybrid behavior; otherwise v2 routes **fall back to KNN** without a loud user-facing warning in all paths.

**Cost:** Demos and fresh installs behave differently; harder to grade or reproduce "neural" results.

**Direction:** Train in `setup_db.py`, commit a small checkpoint, or surface explicit UI when the model file is missing.

---

## 3. Postgres integration tests off default CI

**What:** Integration tests that need `DATABASE_URL` are **skipped** in typical CI; only unit pytest + Vitest run automatically.

**Cost:** HTTP + DB regressions may only appear on developer machines or manual runs.

**Direction:** CI job with service container Postgres + seed (see template in [E2E_TEST_PLAN.md §7](./E2E_TEST_PLAN.md)).

---

## 4. End-to-end coverage is partial

**What:** Playwright covers smoke, catalog, recommendations, slots, degradation, 2D/3D sim, oil-patterns API check — but **not** full journeys (Voronoi interactions, arsenal save/load, Ball Database tab, exhaustive REST matrices).

**Cost:** UI/API contract drift and tab-specific bugs slip through.

**Direction:** Implement backlog cases in [E2E_TEST_PLAN.md §5](./E2E_TEST_PLAN.md).

---

## 5. Classic KNN vs proposal feature space

**What:** v1 KNN uses a **3D** physics vector (e.g. rg, diff, int_diff); proposal discussed **4D** with explicit coverstock in the distance. Coverstock appears strongly in **two-tower** / synthetic training, not necessarily in v1 KNN.

**Cost:** Written proposal vs code mismatch unless explained in the report.

**Direction:** Encode coverstock into KNN distance or document v2/two-tower as the intended "rich" matcher.

---

## 6. Vision path vs proposal wording

**What:** Implementation centers on **uploaded video** and worker-based inference; proposal highlights **live webcam** and sub-50 ms **interactive** pose latency (NFR1).

**Cost:** Rubric or oral defense may ask for latency evidence or real-time capture.

**Direction:** Measure and report latency on target hardware; add optional live camera path if required.

---

## 7. Decision framework scope

**What:** `analyzeSimulation()` gives **local** advice from sim outputs and ball context. A **full** "call strategy engine with sim outcome and show ranked replacements" loop may be narrower than some proposal language.

**Cost:** Ambiguity on whether "feedback loop" is satisfied.

**Direction:** Align report wording with actual behavior; extend to explicit recommendation API chaining if graders expect it.
