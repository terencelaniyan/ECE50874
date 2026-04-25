# Technical Debt — Bowling Ball Grid Generator

**Purpose:** Track **ongoing shortcuts** and their **cost**. For feature status, backlog, and test overview, use [PROJECT_STATUS.md](./PROJECT_STATUS.md) and [E2E_TEST_PLAN.md](./E2E_TEST_PLAN.md).

---

## 1. Dual oil-pattern definitions

**What:** PostgreSQL `oil_patterns` + `GET /oil-patterns` coexist with **embedded** pattern lists in the frontend (e.g. `SimulationView` string/`includes` length hints, `SimulationView3D` `OIL_PATTERNS` constants).

**Cost:** Adding or correcting a pattern requires touching multiple places; risk of mismatch between API, 2D UI, and 3D physics.

**Direction:** Single source of truth — fetch zones from API everywhere, or generate TypeScript from seed data at build time.

---

## 2. Two-tower checkpoint and training assumptions

**What (layers):**

1. **Host `setup_db.py`** already runs `train_model.py` after seed + arsenals — but **`torch` is not listed in** `services/backend/requirements.txt`, so a developer who only `pip install -r requirements.txt` may get a failed or skipped training step unless PyTorch is installed separately.
2. **Checkpoint:** Full two-tower/hybrid behavior still needs a usable `services/backend/models/two_tower.pt` (from successful training or checked in). Without it, v2 routes **fall back toward KNN** without a loud user-facing warning on every path.
3. **Docker / production images** copy `app/` only; they do not bundle `scripts/` or a trained checkpoint by default ([deploy.md](deploy.md)), so container-only runs differ from a fully seeded host.

**Cost:** Demos and fresh installs behave differently; harder to grade or reproduce "neural" results.

**Direction:** Add `torch` to tracked deps or document it explicitly; commit a small baseline checkpoint or gate UI on missing model; keep `POST /admin/train-model` for retraining when `ADMIN_KEY` is set.

---

## 3. CI runtime and flake risk (after enabling integration + E2E)

**What:** CI now runs backend unit + integration tests and a dedicated Playwright E2E job with Postgres + seeded data. The debt moved from "not enforced" to "enforced but heavier": longer runtimes and higher sensitivity to environment/startup timing.

**Cost:** Slower feedback loops and occasional flaky failures can block merges even when core logic is unchanged.

**Direction:** Keep smoke coverage stable-first (deterministic selectors, explicit waits), monitor runtime trends, and split fast-vs-deep suites if queue time grows.

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
