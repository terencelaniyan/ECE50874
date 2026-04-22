# End-to-End Test Plan — Bowling Ball Grid

**Date:** 2026-04-22  
**Status:** IMPLEMENTED (partial) — Playwright tests live under `services/frontend/tests/e2e/`. This document describes what runs today, how to run it, and what is still manual or backlog.

---

## 1. Why E2E still matters

Unit and integration tests remain essential, but they do not replace a real browser talking to a real API:

- Vitest + MSW tests **mock** HTTP; they do not prove the UI and FastAPI agree on payloads and timing.
- Backend integration tests exercise routes but **not** tab flows, canvas/SVG, or Rapier/Three.js startup.

The Playwright suite closes part of that gap. Flows such as **save/load arsenal**, **Voronoi hover**, and **full REST matrices** for `/recommendations/v2`, `/slots`, and `/degradation/compare` are still **backlog** (see §5).

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

1. **PostgreSQL** with a seeded `balls` table (typical clone: `data/balls.csv` + `python services/backend/scripts/setup_db.py` from repo root — runs **seed**, **migrate_arsenals**, then **train_model**; see [data-collection.md](data-collection.md)). Alternatively run `seed_from_csv.py` then `migrate_arsenals.py` per [README.md](../README.md). Optional: `python services/backend/scripts/migrate_oil_patterns.py` if you need DB-backed `oil_patterns` beyond API fallbacks. The smoke test waits for copy like `DB: N BALLS LOADED` on the UI.
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
| [simulation.spec.ts](../services/frontend/tests/e2e/simulation.spec.ts) | TC-06 | 2D lane simulation tab: launch flow, phase/result expectations per test |
| [degradation.spec.ts](../services/frontend/tests/e2e/degradation.spec.ts) | TC-07 | Arsenal degradation **V1 vs V2** toggle in the UI |
| [sim3d.spec.ts](../services/frontend/tests/e2e/sim3d.spec.ts) | TC-08 | 3D lane view (Rapier/Three) smoke: physics load, **LAUNCH BALL** |
| [oil-patterns.spec.ts](../services/frontend/tests/e2e/oil-patterns.spec.ts) | TC-09 | **API:** `GET http://localhost:8000/oil-patterns` — items, zones, `mu` ordering |

Shared helpers: [helpers.ts](../services/frontend/tests/e2e/helpers.ts) (`waitForAppLoad`, `addBallFromCatalog`, tab navigation).

---

## 5. Not yet automated (backlog)

These were in the original proposal but **do not** have dedicated Playwright files (or only partially overlap):

| Area | Suggested focus |
|------|-----------------|
| **Voronoi / grid** | Dots track arsenal count, axis labels, tooltips, cell updates when adding balls |
| **Save / load arsenal** | Save modal, named arsenal, clear bag, load modal repopulates |
| **Ball Database tab** | Table columns, coverstock filter, pagination |
| **REST matrices** | Scripted `POST /recommendations/v2` (normalize, metric, degradation_model, two_tower fallback), `POST /slots`, `POST /degradation/compare` — optional `request` fixtures or CI job hitting API only; request/response shapes: [docs/backend.md](backend.md) |

---

## 6. Test data and DB setup

- Expect a **non-empty** `balls` table so the UI shows `DB: … BALLS LOADED`.
- For arsenal-backed flows, ensure `arsenals` / `arsenal_balls` exist if tests create or load saved arsenals (migration: `migrate_arsenals.py` after balls).

**Recommended (from host, repo root):**

```bash
docker compose up -d postgres
# Point DATABASE_URL at the running instance (see README for port overrides).
python services/backend/scripts/setup_db.py
# Optional: DB oil_patterns rows (not part of setup_db.py)
# python services/backend/scripts/migrate_oil_patterns.py
```

`setup_db.py` runs **seed**, **migrate_arsenals**, and **train_model** (two-tower training expects **PyTorch** installed if training should succeed; see [TECH_DEBT.md](TECH_DEBT.md) §2).

The backend **Docker image** copies `app/` only ([services/backend/Dockerfile](../services/backend/Dockerfile)); it does **not** bundle `scripts/`. Seeding from **inside** the backend container using repo scripts is not supported unless you change the image. Prefer host-run `setup_db.py` / `seed_from_csv.py` as documented in the README.

---

## 7. CI integration (example)

This repository may or may not define a workflow; below is a **template** for a job that runs Playwright against Vite + API:

```yaml
e2e:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_PASSWORD: postgres
        POSTGRES_DB: bowlingdb
      ports:
        - 5432:5432
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
      with:
        python-version: "3.12"
    - uses: actions/setup-node@v4
      with:
        node-version: "20"
        cache: npm
        cache-dependency-path: services/frontend/package-lock.json
    - name: Install backend deps and seed DB
      run: |
        pip install -r services/backend/requirements.txt
        export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bowlingdb
        python services/backend/scripts/setup_db.py
    - name: Start FastAPI
      run: |
        cd services/backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 &
        sleep 3
    - name: Install frontend deps and Playwright
      run: |
        cd services/frontend && npm ci
        npx playwright install --with-deps chromium
    - name: Run E2E
      run: cd services/frontend && npm run test:e2e
      env:
        CI: true
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: services/frontend/playwright-report/
```

Adjust Postgres networking, `DATABASE_URL`, and artifact paths to match your pipeline.

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
