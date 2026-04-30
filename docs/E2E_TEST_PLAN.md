# End-to-End Test Plan — Bowling Ball Grid

**Date:** 2026-04-26  
**Status:** IMPLEMENTED (expanded) — Playwright tests live under `services/frontend/tests/e2e/`. This document describes what runs today, how to run it, and what is still manual or backlog.

---

## 1. Why E2E still matters

Unit and integration tests remain essential, but they do not replace a real browser talking to a real API:

- Vitest + MSW tests **mock** HTTP; they do not prove the UI and FastAPI agree on payloads and timing.
- Backend integration tests exercise routes but **not** tab flows, canvas/SVG, or Rapier/Three.js startup.

The Playwright suite now covers app load, core catalog/grid/recommendation flows, slots, degradation, simulation (2D/3D), oil-patterns API, Ball Database behavior, arsenal save/load, grid Voronoi hover, and analysis-tab smoke. Remaining backlog is depth-oriented (see §5).

---

## 2. Framework and layout

| Item | Detail |
|------|--------|
| **Tool** | [Playwright](https://playwright.dev/) (`@playwright/test`) |
| **Config** | [services/frontend/playwright.config.ts](../services/frontend/playwright.config.ts) |
| **Test directory** | `services/frontend/tests/e2e/` |
| **Browser** | Chromium only (`projects` in config) |
| **Concurrency** | `fullyParallel: false`, `workers: 1` (ordered, stable runs) |
| **Frontend base URL** | `http://localhost:5173` — Vite dev server (`npm run dev`) |
| **Backend** | `http://localhost:8000` — FastAPI must be running; Playwright’s `webServer` **only** starts Vite, not Postgres or the API |

**Docker note:** `docker compose` serves the **production build** of the SPA on **localhost:3000** (nginx). The default Playwright config targets **5173**. Running E2E against port 3000 would require a separate Playwright project or env override for `baseURL` (not configured in-repo today).

---

## 3. How to run

### Prerequisites

1. **PostgreSQL** with a seeded `balls` table (typical clone: `data/balls.csv` + `python services/backend/scripts/setup_db.py` from repo root — runs **seed**, **migrate_arsenals**, then **train_model**; see [data-collection.md](data-collection.md)). Alternatively run `seed_from_csv.py` then `migrate_arsenals.py` per [README.md](../README.md). `python services/backend/scripts/migrate_oil_patterns.py` if you need DB-backed `oil_patterns` beyond API fallbacks. The smoke test waits for copy like `DB: N BALLS LOADED` on the UI.
2. **Backend** on port **8000** (e.g. `cd services/backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`, or start the `backend` service via Docker Compose and expose 8000).

### Commands

From `services/frontend/`:

```bash
npm run test:e2e
```

Other useful invocations:

```bash
npm run test:e2e:ui      # Playwright UI mode
npx playwright test --debug
npx playwright show-report   # after an HTML run
```

`playwright.config.ts` `webServer` starts **`npm run dev`** if nothing is listening on 5173 (reuses an existing dev server when not in CI).

---

## 4. Implemented specs (code ↔ coverage)

Spec files use `test.describe("TC-…")` titles. **TC numbers here match the repo**, not the older 2026-03-14 proposal.

| File | Suite title | What it covers |
|------|-------------|----------------|
| [smoke.spec.ts](../services/frontend/tests/e2e/smoke.spec.ts) | TC-01 | App load: header (`.logo` / BBG), DB badge, **Grid View** default tab, **My Arsenal**, **0 / 6 SLOTS**. The **product** header has **six** tabs (Grid, Catalog, Simulation, **3D Sim**, **Analysis**, Ball Database); this spec currently asserts **four** of them (**Catalog**, **Simulation**, **Ball Database** plus Grid) — extend smoke when you want full tab coverage. |
| [catalog-add-ball.spec.ts](../services/frontend/tests/e2e/catalog-add-ball.spec.ts) | TC-02 | Catalog: ball cards, search/filter, **Add to bag**, slot count on Grid View |
| [recommendations.spec.ts](../services/frontend/tests/e2e/recommendations.spec.ts) | TC-03 | Recommendations panel (Recs toggle, `.rec-list-compact`, KNN badge, `% MATCH`, **Add to bag**); **V2 / Hybrid method toggle** via UI |
| [slots.spec.ts](../services/frontend/tests/e2e/slots.spec.ts) | TC-05 | Slot assignment panel (6-ball system, silhouette, coverage) wired to the UI |
| [simulation.spec.ts](../services/frontend/tests/e2e/simulation.spec.ts) | TC-06 | 2D lane simulation tab: launch flow, phase/result expectations, launch-to-results latency bound |
| [degradation.spec.ts](../services/frontend/tests/e2e/degradation.spec.ts) | TC-07 | Arsenal degradation **V1 vs V2** toggle in the UI |
| [sim3d.spec.ts](../services/frontend/tests/e2e/sim3d.spec.ts) | TC-08 | 3D lane view (Rapier/Three) smoke: physics init latency, launch flow, launch-to-results latency bound |
| [oil-patterns.spec.ts](../services/frontend/tests/e2e/oil-patterns.spec.ts) | TC-09 | **API:** `GET http://localhost:8000/oil-patterns` — items, zones, `mu` ordering |
| [ball-database.spec.ts](../services/frontend/tests/e2e/ball-database.spec.ts) | TC-10 | Ball Database tab: table load, search, coverstock filter, pagination state |
| [arsenal-save-load.spec.ts](../services/frontend/tests/e2e/arsenal-save-load.spec.ts) | TC-11 | Arsenal lifecycle in UI: save named arsenal, clear bag, load arsenal, restore cards |
| [grid-voronoi.spec.ts](../services/frontend/tests/e2e/grid-voronoi.spec.ts) | TC-12 | Grid coverage map: Voronoi cell render, hover tooltip, gap/callout visibility |
| [analysis.spec.ts](../services/frontend/tests/e2e/analysis.spec.ts) | TC-13 | Analysis tab smoke: uploader render latency and invalid-file validation |

Shared helpers: [helpers.ts](../services/frontend/tests/e2e/helpers.ts) (`waitForAppLoad`, `addBallFromCatalog`, tab navigation).

---

## 5. Not yet automated (backlog)

These remain **partially covered** or not yet automated to full depth:

| Area | Suggested focus |
|------|-----------------|
| **REST matrix depth** | Broaden `POST /recommendations/v2` (normalize, metric, degradation_model, two_tower fallback), `POST /slots`, and `POST /degradation/compare` permutations beyond current happy-path contract checks; request/response shapes: [docs/backend.md](backend.md) |
| **Grid interaction depth** | Add deterministic add/remove-on-grid assertions when interacting with point/cell controls and keyboard activation paths |
| **Analysis processing flow** | Add fixture-based end-to-end processing completion checks (upload -> processing -> kinematics/form results) once a stable test video fixture is committed |

---

## 6. Test data and DB setup

- Expect a **non-empty** `balls` table so the UI shows `DB: … BALLS LOADED`.
- For arsenal-backed flows, ensure `arsenals` / `arsenal_balls` exist if tests create or load saved arsenals (migration: `migrate_arsenals.py` after balls).

**Recommended (from host, repo root):**

```bash
docker compose up -d postgres
# Point DATABASE_URL at the running instance (see README for port overrides).
python services/backend/scripts/setup_db.py
# DB oil_patterns rows (not part of setup_db.py)
# python services/backend/scripts/migrate_oil_patterns.py
```

`setup_db.py` runs **seed**, **migrate_arsenals**, and **train_model** (two-tower training expects **PyTorch** installed if training should succeed; see [TECH_DEBT.md](TECH_DEBT.md) §2).

The backend **Docker image** copies `app/` only ([services/backend/Dockerfile](../services/backend/Dockerfile)); it does **not** bundle `scripts/`. Seeding from **inside** the backend container using repo scripts is not supported unless you change the image. Prefer host-run `setup_db.py` / `seed_from_csv.py` as documented in the README.

---

## 7. CI integration (current workflow)

The repository already defines a dedicated `e2e` job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) and runs Playwright automatically on pushes/PRs to `main` and `master`.

As of 2026-04-26, the CI E2E path is:

1. Start Postgres service and export `DATABASE_URL`.
2. Install backend dependencies.
3. Seed DB (`seed_from_csv.py`) and apply arsenal migration (`migrate_arsenals.py`).
4. Start FastAPI on port `8000`.
5. Install frontend dependencies.
6. Install Chromium via Playwright.
7. Run `npm run test:e2e:smoke` for push/PR events, or `npm run test:e2e:full` for scheduled runs.
8. Upload Playwright HTML report artifact (`playwright-report`), with `if: always()` for post-failure debugging.

This means E2E is now CI-enforced; remaining E2E work is about expanding coverage depth (see §5), not pipeline wiring.

---

## 8. Remaining coverage gaps (even with Playwright)

- **Visual regression** (pixel diff on Voronoi or 3D view)
- **Performance** (LCP, API latency under load)
- **Accessibility** (axe, screen reader tab order)
- **Cross-browser** (Firefox/WebKit; CI uses Chromium only today)
- **Mobile viewports**

---

## 9. Further reading

- [docs/backend.md](backend.md) — HTTP API reference  
- [docs/frontend.md](frontend.md) — UI structure and env  
- [README.md](../README.md) — local backend/frontend setup  
